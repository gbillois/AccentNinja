/* AccentNinja Engines
 * Abstraction layer for TTS and pronunciation assessment.
 *
 * Two TTS engines:    WebSpeechTTS | AzureTTS
 * Two assessment engines: AzureAssessmentEngine | WebSpeechAssessmentEngine
 *
 * CRITICAL: Azure assessment uses AudioConfig.fromDefaultMicrophoneInput()
 * (not MediaRecorder) to avoid PCM format issues. A parallel MediaRecorder
 * on a separate getUserMedia() stream captures audio for playback only.
 */

// ---------------------------------------------------------------------------
// Azure SDK accessor — loaded as a global <script> in index.html
// ---------------------------------------------------------------------------

function getSpeechSDK() {
  const sdk = window.SpeechSDK;
  if (!sdk) {
    throw makeAssessmentError(
      ASSESSMENT_ERROR.SDK_NOT_LOADED,
      'Azure Speech SDK not loaded. Check your internet connection.',
    );
  }
  return sdk;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a priority number for sorting Web Speech voices (lower = better). */
export function webVoicePriority(voice) {
  if (voice.name.includes('Google')) return 0;
  // Apple voices: identified by voiceURI or known names
  const appleNames = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Victoria', 'Nicky', 'Ava', 'Zoe'];
  if (appleNames.some(n => voice.name.includes(n)) || voice.voiceURI?.includes('com.apple')) return 1;
  if (voice.name.includes('Microsoft')) return 2;
  return 3;
}

/** Simple Levenshtein-based string similarity (0–1). */
function stringSimilarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

/** Normalise text for word-level comparison. */
function normalizeWords(text) {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Parallel MediaRecorder setup (used by both assessment engines)
//
// Also runs an AnalyserNode in parallel to monitor audio levels so we can
// detect silent recordings (mic muted, hardware failure, user didn't speak).
// ---------------------------------------------------------------------------

/** RMS threshold below which audio is considered silent. Empirical. */
const SILENCE_RMS_THRESHOLD = 0.012;

/** Minimum duration of "speech-level" audio (ms) to consider a recording valid. */
const MIN_SPEECH_DURATION_MS = 250;

/** Per-step duration of the 3-2-1 warm-up countdown (ms). */
const COUNTDOWN_STEP_MS = 400;

// ---------------------------------------------------------------------------
// Retry configuration
//
// Azure pronunciation assessment is reliable on the happy path but the
// underlying WebSocket can drop, the service can hiccup (5xx), or the free
// tier can rate-limit (429). Without retry we fail outright in 20–30 % of
// real-world recordings. With buffered PCM replay (see
// AzureAssessmentEngine.assess) we can retry the same audio without forcing
// the user to record again.
// ---------------------------------------------------------------------------

/** Per-attempt backoff delays (ms). Length = number of retries we attempt. */
const RETRY_BACKOFFS_MS = [1000, 2500];

/** Minimum backoff used when Azure tells us we're rate-limited (HTTP 429). */
const RATE_LIMIT_BACKOFF_MS = 5000;

/** Timeout for the live (first) recognition pass. */
const RECOGNIZE_TIMEOUT_MS = 30000;

/** Timeout for retries. Buffered PCM is processed faster than live audio. */
const RETRY_TIMEOUT_MS = 25000;

/** Empty AssessmentResult shape used for early-aborts and total failures. */
function emptyAzureResult() {
  return {
    engine: 'azure',
    pronScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0,
    prosodyScore: null,
    recognizedText: '',
    words: [],
    raw: {},
  };
}

/**
 * Run a 3-2-1 countdown, emitting status events for the UI to display.
 * Used by both assessment engines to give the mic time to initialise before
 * the user is expected to speak.
 */
async function runCountdown(onStatus, shouldAbort = () => false) {
  onStatus('countdown-3');
  await sleep(COUNTDOWN_STEP_MS);
  if (shouldAbort()) return;
  onStatus('countdown-2');
  await sleep(COUNTDOWN_STEP_MS);
  if (shouldAbort()) return;
  onStatus('countdown-1');
  await sleep(COUNTDOWN_STEP_MS);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startParallelRecorder() {
  let stream = null;
  let mediaRecorder = null;
  let audioCtx = null;
  let analyser = null;
  let source = null;
  let sampleBuf = null;
  let scriptNode = null;
  let muteGain  = null;
  let pollTimer = null;
  let maxRms = 0;
  let speechMs = 0;
  let lastSampleAt = 0;
  let inputSampleRate = 0;
  const chunks = [];
  // Float32 PCM buffer collected from the AudioContext, used to retry Azure
  // recognition without forcing the user to record again.
  const pcmChunks = [];

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        channelCount:     1,
      },
    });

    // Some devices grant permission but hand back a dead/muted track when
    // a different input is physically selected — fail fast so the user sees
    // a real error instead of a silent recording.
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') {
      throw new Error('Microphone track is not live');
    }
    if (track.muted) {
      console.warn('[AccentNinja] Microphone track reports muted=true');
    }

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch { /* ignore */ }
      }
      inputSampleRate = audioCtx.sampleRate || 0;
      source   = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      // Small FFT — we only need time-domain RMS, not frequency bins.
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      sampleBuf = new Uint8Array(analyser.fftSize);

      // PCM capture for retries.
      // ScriptProcessorNode is deprecated but works everywhere we support and
      // doesn't require the AudioWorklet ceremony (Blob URL + addModule).
      // We connect through a muted gain node so the user doesn't hear themselves.
      try {
        scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (event) => {
          const ch = event.inputBuffer.getChannelData(0);
          // Copy: the underlying buffer is reused across callbacks.
          pcmChunks.push(new Float32Array(ch));
        };
        muteGain = audioCtx.createGain();
        muteGain.gain.value = 0;
        source.connect(scriptNode);
        scriptNode.connect(muteGain);
        muteGain.connect(audioCtx.destination);
      } catch (err) {
        console.warn('[AccentNinja] PCM capture unavailable; retries will be limited:', err);
        scriptNode = null;
        muteGain = null;
      }
    }
  } catch (err) {
    if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    if (audioCtx) { try { audioCtx.close(); } catch { /* ignore */ } }
    throw new Error(`Microphone access denied: ${err.message}`);
  }

  function sampleLevel() {
    if (!analyser || !sampleBuf) return;
    analyser.getByteTimeDomainData(sampleBuf);
    let sum = 0;
    for (let i = 0; i < sampleBuf.length; i++) {
      const v = (sampleBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / sampleBuf.length);
    if (rms > maxRms) maxRms = rms;
    const now = performance.now();
    if (lastSampleAt && rms > SILENCE_RMS_THRESHOLD) {
      speechMs += now - lastSampleAt;
    }
    lastSampleAt = now;
  }

  function stopMonitoring() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    lastSampleAt = 0;
  }

  function releaseAll() {
    stopMonitoring();
    // Explicitly disconnect the source graph before closing the context — this
    // releases the MediaStreamSourceNode's reference to the stopped stream
    // without waiting on GC.
    if (scriptNode) {
      try { scriptNode.disconnect(); } catch { /* ignore */ }
      scriptNode.onaudioprocess = null;
    }
    if (muteGain) { try { muteGain.disconnect(); } catch { /* ignore */ } }
    if (source) { try { source.disconnect(); } catch { /* ignore */ } }
    if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    if (audioCtx) { try { audioCtx.close(); } catch { /* ignore */ } }
    audioCtx = null;
    analyser = null;
    source = null;
    stream = null;
    sampleBuf = null;
    scriptNode = null;
    muteGain   = null;
    // pcmChunks intentionally retained — callers may need to replay the
    // captured audio after stop() (e.g. to retry a failed recognition).
  }

  return {
    start() {
      try { mediaRecorder.start(); } catch { /* ignore */ }
      // Poll the analyser at 20Hz — fine-grained enough for RMS silence
      // detection, cheap, and keeps working when the tab loses focus
      // (requestAnimationFrame pauses in background tabs).
      if (analyser && pollTimer === null) {
        lastSampleAt = performance.now();
        pollTimer = setInterval(sampleLevel, 50);
      }
    },
    stop() {
      return new Promise(resolve => {
        stopMonitoring();
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          releaseAll();
          resolve(null);
          return;
        }
        mediaRecorder.onstop = () => {
          const blob = chunks.length
            ? new Blob(chunks, { type: mediaRecorder.mimeType })
            : null;
          releaseAll();
          resolve(blob);
        };
        try { mediaRecorder.stop(); } catch {
          releaseAll();
          resolve(null);
        }
      });
    },
    releaseStream() { releaseAll(); },
    /** Peak RMS observed while recording (0..1). */
    getMaxLevel() { return maxRms; },
    /** Accumulated milliseconds with level above the silence threshold. */
    getSpeechMs() { return speechMs; },
    /** True if the recording contained no meaningful sound. */
    isSilent() {
      return maxRms < SILENCE_RMS_THRESHOLD || speechMs < MIN_SPEECH_DURATION_MS;
    },
    /**
     * Return the captured audio as a 16 kHz / 16-bit / mono Int16Array suitable
     * for feeding into Azure's PushAudioInputStream, or null if PCM capture
     * was unavailable or no audio was captured.
     */
    getPCMBuffer16k() {
      if (pcmChunks.length === 0 || !inputSampleRate) return null;
      const totalIn = pcmChunks.reduce((s, c) => s + c.length, 0);
      if (totalIn === 0) return null;
      const concat = new Float32Array(totalIn);
      let off = 0;
      for (const c of pcmChunks) { concat.set(c, off); off += c.length; }
      return downsampleToInt16PCM(concat, inputSampleRate, 16000);
    },
  };
}

/**
 * Shared error codes used between engines and the UI to classify assessment
 * failures. These MUST match the strings the UI checks in app.js.
 */
export const ASSESSMENT_ERROR = {
  SILENT_AUDIO:   'SilentAudio',
  NO_MATCH:       'NoMatch',
  NO_MIC:         'NoMic',
  TIMEOUT:        'Timeout',
  ABORTED:        'Aborted',
  NETWORK:        'Network',
  AUTH:           'Auth',
  RATE_LIMITED:   'RateLimited',
  SERVICE:        'Service',
  SDK_NOT_LOADED: 'SdkNotLoaded',
  UNKNOWN:        'Unknown',
};

/**
 * Decide whether a given Azure failure (parsed result + sdk-level error)
 * should trigger an automatic retry, and with what backoff strategy.
 * Returns null on success, or { code, retryable, longBackoff, detail }.
 */
function classifyAzureFailure(parsed, error) {
  // SDK-level errors (very rare — usually thrown before a result is returned)
  if (error) {
    const code = error.code || ASSESSMENT_ERROR.UNKNOWN;
    const retryable = code !== ASSESSMENT_ERROR.AUTH
                   && code !== ASSESSMENT_ERROR.SDK_NOT_LOADED
                   && code !== ASSESSMENT_ERROR.NO_MIC;
    return { code, retryable, longBackoff: false, detail: error.message || '' };
  }
  if (!parsed) {
    return { code: ASSESSMENT_ERROR.UNKNOWN, retryable: true, longBackoff: false, detail: '' };
  }
  // Successful score → no failure to classify
  if (Number(parsed.pronScore) > 0) return null;

  const rawErr = parsed.raw?.error;
  const detail = parsed.raw?.errorDetail || '';
  switch (rawErr) {
    case ASSESSMENT_ERROR.AUTH:
    case ASSESSMENT_ERROR.SDK_NOT_LOADED:
    case ASSESSMENT_ERROR.NO_MIC:
    case ASSESSMENT_ERROR.SILENT_AUDIO:
    case ASSESSMENT_ERROR.NO_MATCH:
    case ASSESSMENT_ERROR.ABORTED:
      // Audio/auth/setup issues — replay won't help.
      return { code: rawErr, retryable: false, longBackoff: false, detail };
    case ASSESSMENT_ERROR.RATE_LIMITED:
      return { code: rawErr, retryable: true, longBackoff: true, detail };
    case ASSESSMENT_ERROR.NETWORK:
    case ASSESSMENT_ERROR.SERVICE:
    case ASSESSMENT_ERROR.TIMEOUT:
      return { code: rawErr, retryable: true, longBackoff: false, detail };
    default:
      return { code: rawErr || ASSESSMENT_ERROR.UNKNOWN, retryable: true, longBackoff: false, detail };
  }
}

/**
 * Convert a Float32 mono buffer at `inRate` Hz to 16-bit PCM at `outRate` Hz.
 * Used to feed the Azure SDK's PushAudioInputStream during retries.
 */
function downsampleToInt16PCM(input, inRate, outRate) {
  let resampled;
  if (inRate === outRate) {
    resampled = input;
  } else {
    const ratio = inRate / outRate;
    const outLen = Math.floor(input.length / ratio);
    resampled = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(idx0 + 1, input.length - 1);
      const frac = srcIdx - idx0;
      resampled[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
    }
  }
  const out = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}

/**
 * Build the shared `{ raw: { error } }` tag for a zero-score result based on
 * the recorder's silence telemetry. Specific error codes already set by
 * parseAzureResult (AUTH, NETWORK, SERVICE, etc.) are more informative than
 * the silence heuristic and are kept as-is.
 */
function tagFailureFromRecorder(result, recorder, recognizedText = '') {
  if (result.pronScore > 0) return;
  const existing = result.raw?.error;
  const isSpecificError = existing && existing !== ASSESSMENT_ERROR.NO_MATCH;
  if (isSpecificError) return;
  const code = recorder.isSilent()
    ? ASSESSMENT_ERROR.SILENT_AUDIO
    : recognizedText
      ? (existing || ASSESSMENT_ERROR.NO_MATCH)
      : ASSESSMENT_ERROR.NO_MATCH;
  result.raw = { ...(result.raw || {}), error: code };
}

/** Throw an assessment error with a structured code field. */
function makeAssessmentError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ===========================================================================
// TTS Engines
// ===========================================================================

export class WebSpeechTTS {
  constructor(settings) {
    this.settings = settings;
    this._voicesReady = false;

    // Preload voices — Chrome loads them asynchronously and speechSynthesis.speak()
    // can silently fail if called before voices are available.
    if (window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        this._voicesReady = true;
      }
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this._voicesReady = true;
      });
    }
  }

  /**
   * Return available voices for the current accent target, sorted by priority.
   */
  getAvailableVoices() {
    const lang = this.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
    return window.speechSynthesis
      .getVoices()
      .filter(v => v.lang.startsWith(lang))
      .sort((a, b) => webVoicePriority(a) - webVoicePriority(b));
  }

  speak(text) {
    if (!window.speechSynthesis) {
      return Promise.reject(new Error('Speech synthesis not supported in this browser'));
    }

    // Chrome workaround: resume() unfreezes an engine that went idle.
    // This is safe to call even if the engine is not paused.
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Cancel any in-progress speech.
    // On iOS Safari, calling cancel() when nothing is speaking causes subsequent
    // speak() calls to be silently ignored (WebKit bug), so we guard it.
    // On Chrome, we must cancel even when not visibly speaking because the internal
    // queue can get stuck ("poisoned") after errors or page inactivity.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } else {
      // Non-iOS: always cancel to clear any stuck queue
      window.speechSynthesis.cancel();
    }

    return new Promise((resolve, reject) => {
      const doSpeak = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        const lang = this.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
        const voices = this.getAvailableVoices();

        if (this.settings.ttsVoice) {
          const match = window.speechSynthesis.getVoices().find(v => v.name === this.settings.ttsVoice);
          if (match) utterance.voice = match;
        } else if (voices.length > 0) {
          utterance.voice = voices[0];
        }

        utterance.lang = lang;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Safety timeout: some browsers never fire onend/onerror
        const SAFETY_TIMEOUT_MS = 30000;
        const safetyTimer = setTimeout(() => {
          this._utterance = null;
          resolve();
        }, SAFETY_TIMEOUT_MS);

        utterance.onend = () => {
          clearTimeout(safetyTimer);
          resolve();
        };
        utterance.onerror = e => {
          clearTimeout(safetyTimer);
          // iOS Safari fires 'interrupted' when cancel() is called — not a real error.
          // Chrome fires 'canceled' after cancel() — also not a real error.
          if (e.error === 'interrupted' || e.error === 'canceled') { resolve(); return; }
          reject(new Error(`TTS error: ${e.error}`));
        };

        this._utterance = utterance;
        window.speechSynthesis.speak(utterance);
      };

      if (isIOS) {
        // iOS: speak synchronously to preserve user gesture context
        doSpeak();
      } else {
        // Chrome: small delay after cancel() to avoid dropped utterance
        setTimeout(doSpeak, 50);
      }
    });
  }

  stop() {
    window.speechSynthesis.cancel();
    this._utterance = null;
  }
}

// ---------------------------------------------------------------------------

export class AzureTTS {
  constructor(settings) {
    this.settings = settings;
    this._synthesizer = null;
  }

  getAvailableVoices() {
    return AZURE_VOICES[this.settings.accentTarget] ?? AZURE_VOICES.us;
  }

  _resolveVoiceName() {
    const voices = this.getAvailableVoices();
    const stored = this.settings.ttsVoice;
    if (stored && voices.find(v => v.name === stored)) return stored;
    return voices[0].name;
  }

  async speak(text) {
    const SpeechSDK = getSpeechSDK();
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
      this.settings.azureApiKey,
      this.settings.azureRegion
    );
    speechConfig.speechSynthesisVoiceName = this._resolveVoiceName();

    return new Promise((resolve, reject) => {
      // Use default speaker output — passing null would suppress audio playback
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);
      this._synthesizer = synthesizer;

      synthesizer.speakTextAsync(
        text,
        result => {
          synthesizer.close();
          this._synthesizer = null;
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve(result);
          } else {
            reject(new Error(`Azure TTS failed: ${result.errorDetails}`));
          }
        },
        err => {
          synthesizer.close();
          this._synthesizer = null;
          reject(new Error(`Azure TTS error: ${err}`));
        }
      );
    });
  }

  stop() {
    if (this._synthesizer) {
      try { this._synthesizer.close(); } catch { /* ignore */ }
      this._synthesizer = null;
    }
  }
}

// ===========================================================================
// Assessment Engines
//
// Both engines return a normalised AssessmentResult object:
// {
//   engine: 'azure' | 'web',
//   pronScore, accuracyScore, fluencyScore, completenessScore,
//   prosodyScore,      // null for WebSpeech and en-GB Azure
//   recognizedText,
//   words: [{ word, accuracyScore, errorType, phonemes: [{ phoneme, accuracyScore }] }],
//   recordingBlob,     // Blob for playback, not persisted
//   raw,               // Raw engine result
// }
// ===========================================================================

export class AzureAssessmentEngine {
  constructor(settings) {
    this.settings = settings;
    this._stopFn = null;
    this._activeRecognizer = null;
  }

  stop() {
    const fn = this._stopFn;
    if (fn) {
      this._stopFn = null;
      fn();
    }
  }

  _buildSpeechConfig() {
    const SpeechSDK = getSpeechSDK();
    const locale = this.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
    const config = SpeechSDK.SpeechConfig.fromSubscription(
      this.settings.azureApiKey,
      this.settings.azureRegion
    );
    config.speechRecognitionLanguage = locale;
    // Give users more breathing room: longer tail silence before cutting off,
    // and longer initial silence before giving up (default is 5s which is harsh
    // when the user needs a moment to prepare).
    config.setProperty(
      SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
      '2500'
    );
    config.setProperty(
      SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
      '8000'
    );
    return config;
  }

  _buildPronConfig(referenceText) {
    const SpeechSDK = getSpeechSDK();
    const locale = this.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
    const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
      referenceText,
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
      true // enableMiscue
    );
    pronConfig.phonemeAlphabet = 'IPA';
    // Prosody assessment is only available for en-US
    if (locale === 'en-US') {
      pronConfig.enableProsodyAssessment = true;
    }
    return pronConfig;
  }

  /**
   * Assess a single utterance against a reference text.
   *
   * Reliability strategy:
   *   1. First attempt: live mic streaming via fromDefaultMicrophoneInput()
   *      (low latency, lets Azure handle end-of-speech detection itself).
   *   2. If the first attempt fails with a transient error (network drop,
   *      service timeout, 5xx, throttling), automatically retry up to twice
   *      using a PushAudioInputStream fed with the PCM that was captured in
   *      parallel — so the user does NOT have to record again.
   *   3. Stop on terminal errors (auth failure, no mic, silent audio, etc.)
   *      since replaying won't help.
   *
   * @param {string} referenceText
   * @param {(status: string, info?: object) => void} onStatus - Called with
   *   status keys: 'connecting' | 'countdown-3' | 'countdown-2' | 'countdown-1'
   *   | 'recording' | 'retrying-1' | 'retrying-2'
   * @returns {Promise<AssessmentResult>}
   */
  async assess(referenceText, onStatus = () => {}) {
    if (!this.settings.azureApiKey) {
      throw makeAssessmentError(
        ASSESSMENT_ERROR.AUTH,
        'Azure API key required.',
      );
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw makeAssessmentError(
        ASSESSMENT_ERROR.NETWORK,
        'You appear to be offline. Azure pronunciation assessment requires an internet connection.',
      );
    }
    const SpeechSDK = getSpeechSDK();

    onStatus('connecting');

    // Open the mic early so it's fully initialised by the time the countdown
    // ends — Azure's fromDefaultMicrophoneInput() will open its own handle
    // but hardware warm-up happens on the first getUserMedia() call.
    const recorder = await startParallelRecorder();

    let earlyAbort = false;
    this._stopFn = () => {
      earlyAbort = true;
      const rec = this._activeRecognizer;
      if (rec) {
        try { rec.close(); } catch { /* ignore */ }
        this._activeRecognizer = null;
      }
      try { recorder.releaseStream(); } catch { /* ignore */ }
    };

    let recordingBlob = null;
    try {
      recorder.start();
      await runCountdown(onStatus, () => earlyAbort);

      if (earlyAbort) {
        recordingBlob = await recorder.stop();
        return { ...emptyAzureResult(), recordingBlob };
      }

      // Attempt 0: live mic streaming.
      let liveAudioConfig;
      try {
        liveAudioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      } catch (err) {
        recordingBlob = await recorder.stop();
        throw makeAssessmentError(
          ASSESSMENT_ERROR.NO_MIC,
          `Failed to open microphone for Azure SDK: ${err?.message || err}`,
        );
      }
      let { parsed, error } = await this._recognizeOnce(
        referenceText, liveAudioConfig, RECOGNIZE_TIMEOUT_MS,
        { onStart: () => onStatus('recording') },
      );

      // Stop the parallel recorder NOW so the PCM buffer + replay blob are
      // finalised before we decide whether to retry.
      recordingBlob = await recorder.stop();

      if (earlyAbort) {
        return { ...emptyAzureResult(), recordingBlob };
      }

      // Happy path
      if (parsed && Number(parsed.pronScore) > 0) {
        return { ...parsed, recordingBlob };
      }

      // Decide whether to retry
      let info = classifyAzureFailure(parsed, error);
      const pcm = recorder.getPCMBuffer16k();
      const haveReplayableAudio = pcm && pcm.length >= 16000 * 0.3; // ≥0.3s

      if (info?.retryable && haveReplayableAudio) {
        for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length; attempt++) {
          if (earlyAbort) break;
          const baseDelay = RETRY_BACKOFFS_MS[attempt];
          const delay = info?.longBackoff
            ? Math.max(baseDelay, RATE_LIMIT_BACKOFF_MS)
            : baseDelay;

          onStatus(`retrying-${attempt + 1}`, {
            attempt: attempt + 1,
            total:   RETRY_BACKOFFS_MS.length,
            reason:  info?.code,
            detail:  info?.detail,
          });
          console.warn(
            `[AccentNinja] Azure assessment failed (code=${info?.code}, detail=${info?.detail || 'n/a'}). ` +
            `Retrying with buffered PCM in ${delay}ms (attempt ${attempt + 1}/${RETRY_BACKOFFS_MS.length}).`
          );
          await sleep(delay);
          if (earlyAbort) break;

          const r = await this._tryBufferedRecognition(referenceText, pcm);
          if (r.parsed && Number(r.parsed.pronScore) > 0) {
            return { ...r.parsed, recordingBlob };
          }
          // Update the rolling "best/last" parsed + error for the final fallback path.
          if (r.parsed) parsed = r.parsed;
          if (r.error)  error  = r.error;
          info = classifyAzureFailure(parsed, error);
          if (!info?.retryable) break;
        }
      } else if (info?.retryable && !haveReplayableAudio) {
        console.warn(
          '[AccentNinja] Azure failed with a retryable error but the PCM buffer is empty/too short — skipping retry.'
        );
      }

      // All attempts exhausted — return the most informative failure we have.
      const finalParsed = parsed || emptyAzureResult();
      tagFailureFromRecorder(finalParsed, recorder, finalParsed.recognizedText);
      // Promote the SDK-level error code into raw.error if no reason is set yet.
      if (error?.code && !finalParsed.raw?.error) {
        finalParsed.raw = {
          ...(finalParsed.raw || {}),
          error: error.code,
          errorDetail: error.message || finalParsed.raw?.errorDetail || '',
        };
      }
      return { ...finalParsed, recordingBlob };
    } catch (err) {
      // Make sure the recorder is released even on hard failure.
      if (recordingBlob === null) {
        try { recordingBlob = await recorder.stop(); } catch { /* ignore */ }
      }
      throw err;
    } finally {
      this._stopFn = null;
      this._activeRecognizer = null;
    }
  }

  /**
   * Run a single recognition pass with a given AudioConfig + timeout.
   * Returns { parsed, error }: `parsed` is the normalised AssessmentResult
   * (may have pronScore=0 with raw.error), `error` is set only for SDK-level
   * failures that prevented us from getting any result at all.
   */
  async _recognizeOnce(referenceText, audioConfig, timeoutMs, opts = {}) {
    const SpeechSDK = getSpeechSDK();
    let speechConfig;
    let pronConfig;
    let recognizer;
    try {
      speechConfig = this._buildSpeechConfig();
      pronConfig   = this._buildPronConfig(referenceText);
      recognizer   = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
      pronConfig.applyTo(recognizer);
    } catch (err) {
      return {
        parsed: null,
        error: makeAssessmentError(
          ASSESSMENT_ERROR.UNKNOWN,
          `Failed to build Azure recognizer: ${err?.message || err}`,
        ),
      };
    }
    this._activeRecognizer = recognizer;

    if (opts.onStart) recognizer.sessionStarted = opts.onStart;

    try {
      return await new Promise(resolve => {
        let settled = false;
        const finish = (parsed, error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ parsed, error });
        };
        const timer = setTimeout(() => {
          finish(null, makeAssessmentError(
            ASSESSMENT_ERROR.TIMEOUT,
            `Azure recognition timed out after ${Math.round(timeoutMs / 1000)}s.`,
          ));
        }, timeoutMs);
        try {
          recognizer.recognizeOnceAsync(
            result => finish(parseAzureResult(result, SpeechSDK), null),
            err    => finish(null, makeAssessmentError(
              ASSESSMENT_ERROR.UNKNOWN,
              `Azure SDK recognition error: ${err}`,
            )),
          );
        } catch (e) {
          finish(null, makeAssessmentError(
            ASSESSMENT_ERROR.UNKNOWN,
            `Azure recognizer threw: ${e?.message || e}`,
          ));
        }
      });
    } finally {
      try { recognizer.close(); } catch { /* ignore */ }
      if (this._activeRecognizer === recognizer) {
        this._activeRecognizer = null;
      }
    }
  }

  /**
   * Retry a recognition by feeding pre-recorded PCM via PushAudioInputStream.
   * Used after a transient live-mic failure so the user doesn't have to
   * speak again.
   */
  async _tryBufferedRecognition(referenceText, pcm) {
    const SpeechSDK = getSpeechSDK();
    let pushStream;
    let audioConfig;
    try {
      const format = SpeechSDK.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
      pushStream = SpeechSDK.AudioInputStream.createPushStream(format);
      const ab = pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength
        ? pcm.buffer
        : pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
      pushStream.write(ab);
      pushStream.close();
      audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
    } catch (err) {
      return {
        parsed: null,
        error: makeAssessmentError(
          ASSESSMENT_ERROR.UNKNOWN,
          `Failed to build PushStream for retry: ${err?.message || err}`,
        ),
      };
    }
    return this._recognizeOnce(referenceText, audioConfig, RETRY_TIMEOUT_MS);
  }

  /**
   * Test Azure connectivity by requesting an auth token.
   * Throws on failure.
   */
  async testConnection() {
    if (!this.settings.azureApiKey || !this.settings.azureRegion) {
      throw new Error('API key and region are required');
    }
    const url = `https://${this.settings.azureRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': this.settings.azureApiKey },
    });
    if (!resp.ok) {
      throw new Error(`Azure returned HTTP ${resp.status}: ${resp.statusText}`);
    }
    return true;
  }
}

// ---------------------------------------------------------------------------

export class WebSpeechAssessmentEngine {
  constructor(settings) {
    this.settings = settings;
    this._recognition = null;
    this._stopFn = null;
  }

  /**
   * Assess a single utterance using the Web Speech API.
   * Returns a normalised result with word-level diff (no phoneme detail).
   * @param {string} referenceText
   * @param {(status: string) => void} onStatus - Emits:
   *   'connecting' | 'countdown-3' | 'countdown-2' | 'countdown-1' | 'recording'
   * @returns {Promise<AssessmentResult>}
   */
  async assess(referenceText, onStatus = () => {}) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Web Speech API not supported in this browser. Use Chrome, Edge or Safari.');
    }

    onStatus('connecting');

    const recorder = await startParallelRecorder();

    let earlyAbort = false;
    this._stopFn = () => {
      earlyAbort = true;
      try { recorder.releaseStream(); } catch { /* ignore */ }
    };

    let recognition;
    try {
      recorder.start();
      await runCountdown(onStatus, () => earlyAbort);

      if (earlyAbort) {
        this._stopFn = null;
        return { engine: 'web', pronScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0, prosodyScore: null, recognizedText: '', words: [], raw: {}, recordingBlob: null };
      }

      recognition = new SpeechRecognition();
      const locale = this.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
      recognition.lang = locale;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      this._recognition = recognition;
      this._stopFn = null;
    } catch (err) {
      this._stopFn = null;
      try { recorder.releaseStream(); } catch { /* ignore */ }
      throw err;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let endTimer = null;

      const finish = async (recognizedText, confidence, error) => {
        if (settled) return;
        settled = true;
        this._recognition = null;
        if (endTimer) clearTimeout(endTimer);
        const recordingBlob = await recorder.stop();
        if (error) {
          reject(error);
          return;
        }
        const result = computeWebSpeechResult(referenceText, recognizedText, confidence);
        tagFailureFromRecorder(result, recorder, recognizedText);
        resolve({ ...result, recordingBlob });
      };

      recognition.onstart = () => { onStatus('recording'); };

      recognition.onresult = event => {
        const r = event.results[0][0];
        finish(r.transcript, r.confidence ?? 0.5, null);
      };

      recognition.onerror = event => {
        if (event.error === 'no-speech') {
          finish('', 0, null);
        } else if (event.error === 'aborted') {
          finish('', 0, null);
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          finish('', 0, makeAssessmentError(ASSESSMENT_ERROR.NO_MIC, `Speech recognition error: ${event.error}`));
        } else if (event.error === 'network') {
          finish('', 0, makeAssessmentError(ASSESSMENT_ERROR.NETWORK, `Speech recognition error: ${event.error}`));
        } else {
          finish('', 0, makeAssessmentError(ASSESSMENT_ERROR.UNKNOWN, `Speech recognition error: ${event.error}`));
        }
      };

      recognition.onend = () => {
        // If neither onresult nor onerror fired (e.g. browser ended early),
        // fall through to a soft failure — the level monitor will decide
        // whether to tag it SilentAudio or NoMatch.
        if (!settled) finish('', 0, null);
      };

      // Safety net: Web Speech has no native timeout, so force one if the
      // browser never emits onstart/onend/onerror.
      endTimer = setTimeout(() => {
        if (!settled) finish('', 0, makeAssessmentError(ASSESSMENT_ERROR.TIMEOUT, 'Recognition timed out'));
      }, 20000);

      try {
        recognition.start();
      } catch (e) {
        finish('', 0, makeAssessmentError(ASSESSMENT_ERROR.UNKNOWN, `Failed to start recognition: ${e.message}`));
      }
    });
  }

  stop() {
    const fn = this._stopFn;
    if (fn) {
      this._stopFn = null;
      fn();
      return;
    }
    if (this._recognition) {
      try { this._recognition.stop(); } catch { /* ignore */ }
      this._recognition = null;
    }
  }
}

// ===========================================================================
// Azure result parser
// ===========================================================================

/**
 * Map a CancellationErrorCode (numeric enum) coming from the Azure SDK to a
 * user-facing ASSESSMENT_ERROR code. Returning a specific code lets the UI
 * show "auth failed" / "service down" / "rate limited" instead of a generic
 * "recording not valid" message.
 */
function mapCancellationErrorCode(errorCode, SpeechSDK) {
  const EC = SpeechSDK.CancellationErrorCode;
  if (!EC) return ASSESSMENT_ERROR.UNKNOWN;
  switch (errorCode) {
    case EC.NoError:                   return ASSESSMENT_ERROR.UNKNOWN;
    case EC.AuthenticationFailure:
    case EC.Forbidden:                 return ASSESSMENT_ERROR.AUTH;
    case EC.ConnectionFailure:         return ASSESSMENT_ERROR.NETWORK;
    case EC.TooManyRequests:           return ASSESSMENT_ERROR.RATE_LIMITED;
    case EC.ServiceTimeout:            return ASSESSMENT_ERROR.TIMEOUT;
    case EC.ServiceError:
    case EC.ServiceUnavailable:
    case EC.RuntimeError:              return ASSESSMENT_ERROR.SERVICE;
    case EC.BadRequestParameters:      return ASSESSMENT_ERROR.UNKNOWN;
    default:                           return ASSESSMENT_ERROR.UNKNOWN;
  }
}

/**
 * Parse a Canceled result into our normalised AssessmentResult shape.
 * Reads CancellationDetails for a specific error code + human-readable detail.
 */
function parseAzureCanceledResult(result, SpeechSDK) {
  let code = ASSESSMENT_ERROR.UNKNOWN;
  let detail = '';
  try {
    const cd = SpeechSDK.CancellationDetails.fromResult(result);
    detail = cd.errorDetails || '';
    if (cd.reason === SpeechSDK.CancellationReason.EndOfStream) {
      // EndOfStream with no recognised speech = effectively NoMatch for our UX.
      code = ASSESSMENT_ERROR.NO_MATCH;
    } else {
      code = mapCancellationErrorCode(cd.errorCode, SpeechSDK);
    }
  } catch (e) {
    detail = `CancellationDetails parse failed: ${e?.message || e}`;
  }
  return {
    engine: 'azure',
    pronScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0, prosodyScore: null,
    recognizedText: '',
    words: [],
    raw: { error: code, errorDetail: detail },
  };
}

function parseAzureResult(result, SpeechSDK) {
  const ResultReason = SpeechSDK.ResultReason;

  if (result.reason === ResultReason.NoMatch) {
    let detail = '';
    try {
      const nmd = SpeechSDK.NoMatchDetails?.fromResult?.(result);
      if (nmd) detail = `NoMatchReason=${nmd.reason}`;
    } catch { /* ignore */ }
    return {
      engine: 'azure',
      pronScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0, prosodyScore: null,
      recognizedText: '',
      words: [],
      raw: { error: ASSESSMENT_ERROR.NO_MATCH, errorDetail: detail },
    };
  }

  if (result.reason === ResultReason.Canceled) {
    return parseAzureCanceledResult(result, SpeechSDK);
  }

  if (result.reason !== ResultReason.RecognizedSpeech) {
    return {
      engine: 'azure',
      pronScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0, prosodyScore: null,
      recognizedText: '',
      words: [],
      raw: {
        error: ASSESSMENT_ERROR.UNKNOWN,
        errorDetail: `Unexpected ResultReason=${result.reason}`,
      },
    };
  }

  const recognizedText = result.text ?? '';
  const jsonStr = result.properties?.getProperty(
    SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult
  ) ?? '';

  let pron = null;
  let words = [];
  let raw = {};

  try {
    raw = JSON.parse(jsonStr);
    const nbest = raw?.NBest?.[0];
    if (nbest) {
      pron = nbest.PronunciationAssessment;
      words = (nbest.Words ?? []).map(w => ({
        word: w.Word,
        accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
        errorType: w.PronunciationAssessment?.ErrorType ?? 'None',
        phonemes: (w.Phonemes ?? []).map(p => ({
          phoneme: p.Phoneme,
          accuracyScore: p.PronunciationAssessment?.AccuracyScore ?? 0,
        })),
      }));
    }
  } catch (e) {
    console.warn('[AccentNinja] Failed to parse Azure JSON result:', e);
  }

  return {
    engine: 'azure',
    pronScore:         pron?.PronScore          ?? 0,
    accuracyScore:     pron?.AccuracyScore       ?? 0,
    fluencyScore:      pron?.FluencyScore        ?? 0,
    completenessScore: pron?.CompletenessScore   ?? 0,
    prosodyScore:      pron?.ProsodyScore        ?? null,
    recognizedText,
    words,
    raw,
  };
}

// ===========================================================================
// Web Speech result computation
// ===========================================================================

function computeWebSpeechResult(referenceText, recognizedText, confidence) {
  const refWords = normalizeWords(referenceText);
  const gotWords = normalizeWords(recognizedText ?? '');
  const conf = Math.max(0, Math.min(1, confidence ?? 0.5));

  const words = [];

  for (let i = 0; i < refWords.length; i++) {
    const ref = refWords[i];
    const got = gotWords[i];
    if (got === undefined) {
      words.push({ word: ref, accuracyScore: 0, errorType: 'Omission', phonemes: [] });
    } else if (ref === got) {
      // Exact text match — cap at confidence level (not a guaranteed 100)
      words.push({ word: ref, accuracyScore: Math.min(95, conf * 100), errorType: 'None', phonemes: [] });
    } else {
      const sim = stringSimilarity(ref, got);
      // Apply quadratic penalty: similarity² makes partial matches score much lower
      const penalizedSim = sim * sim;
      words.push({
        word: ref,
        accuracyScore: penalizedSim * conf * 100,
        errorType: sim > 0.5 ? 'Mispronunciation' : 'Omission',
        phonemes: [],
      });
    }
  }

  // Extra words in recognised text = insertions
  for (let i = refWords.length; i < gotWords.length; i++) {
    words.push({ word: gotWords[i], accuracyScore: 0, errorType: 'Insertion', phonemes: [] });
  }

  // Average word-level accuracy (accounts for mispronunciations, not just perfect matches)
  const avgWordAccuracy = refWords.length > 0
    ? words.filter(w => w.errorType !== 'Insertion').reduce((sum, w) => sum + w.accuracyScore, 0) / refWords.length
    : 0;
  const completeness = refWords.length > 0
    ? Math.min(100, (gotWords.length / refWords.length) * 100)
    : 0;

  // Map confidence to score bands (stricter than before):
  //   > 0.9 → 80-100, > 0.7 → 55-80, > 0.5 → 30-55, ≤ 0.5 → 0-30
  let confScore;
  if (conf > 0.9)      confScore = 80 + (conf - 0.9) * 200;
  else if (conf > 0.7) confScore = 55 + (conf - 0.7) * 125;
  else if (conf > 0.5) confScore = 30 + (conf - 0.5) * 125;
  else                 confScore = conf * 60;
  confScore = Math.min(100, Math.max(0, confScore));

  // Blend confidence score with word-level accuracy so mispronunciations
  // that the speech-to-text engine "forgives" still lower the overall score
  const pronScore = Math.min(100, Math.max(0, confScore * 0.4 + avgWordAccuracy * 0.6));

  return {
    engine: 'web',
    pronScore,
    accuracyScore:     Math.min(100, Math.max(0, avgWordAccuracy)),
    fluencyScore:      Math.min(100, Math.max(0, pronScore * 0.9)),
    completenessScore: Math.min(100, Math.max(0, completeness)),
    prosodyScore: null,
    recognizedText: recognizedText ?? '',
    words,
    raw: { confidence: conf, referenceText, recognizedText },
  };
}

// ===========================================================================
// Factory functions
// ===========================================================================

export function createTTSEngine(settings) {
  if (settings.ttsEngine === 'azure' && settings.azureApiKey) {
    return new AzureTTS(settings);
  }
  return new WebSpeechTTS(settings);
}

export function createAssessmentEngine(settings) {
  if (settings.assessmentEngine === 'azure' && settings.azureApiKey) {
    return new AzureAssessmentEngine(settings);
  }
  return new WebSpeechAssessmentEngine(settings);
}

// ===========================================================================
// Static voice lists
// ===========================================================================

export const AZURE_VOICES = {
  us: [
    { name: 'en-US-JennyNeural',  label: 'Jenny (US, Female)' },
    { name: 'en-US-GuyNeural',    label: 'Guy (US, Male)' },
    { name: 'en-US-AriaNeural',   label: 'Aria (US, Female)' },
    { name: 'en-US-DavisNeural',  label: 'Davis (US, Male)' },
  ],
  uk: [
    { name: 'en-GB-SoniaNeural',  label: 'Sonia (UK, Female)' },
    { name: 'en-GB-RyanNeural',   label: 'Ryan (UK, Male)' },
    { name: 'en-GB-LibbyNeural',  label: 'Libby (UK, Female)' },
    { name: 'en-GB-OliverNeural', label: 'Oliver (UK, Male)' },
  ],
};

export const AZURE_REGIONS = [
  { value: 'eastus',        label: 'East US' },
  { value: 'eastus2',       label: 'East US 2' },
  { value: 'westus2',       label: 'West US 2' },
  { value: 'westus3',       label: 'West US 3' },
  { value: 'westeurope',    label: 'West Europe' },
  { value: 'northeurope',   label: 'North Europe' },
  { value: 'francecentral', label: 'France Central' },
  { value: 'uksouth',       label: 'UK South' },
  { value: 'australiaeast', label: 'Australia East' },
  { value: 'japaneast',     label: 'Japan East' },
  { value: 'southeastasia', label: 'Southeast Asia' },
];
