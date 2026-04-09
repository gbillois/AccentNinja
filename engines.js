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
    throw new Error('Azure Speech SDK not loaded. Check your internet connection.');
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
const COUNTDOWN_STEP_MS = 700;

/**
 * Run a 3-2-1 countdown, emitting status events for the UI to display.
 * Used by both assessment engines to give the mic time to initialise before
 * the user is expected to speak.
 */
async function runCountdown(onStatus) {
  onStatus('countdown-3');
  await sleep(COUNTDOWN_STEP_MS);
  onStatus('countdown-2');
  await sleep(COUNTDOWN_STEP_MS);
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
  let pollTimer = null;
  let maxRms = 0;
  let speechMs = 0;
  let lastSampleAt = 0;
  const chunks = [];

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
      source   = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      // Small FFT — we only need time-domain RMS, not frequency bins.
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      sampleBuf = new Uint8Array(analyser.fftSize);
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
    if (source) { try { source.disconnect(); } catch { /* ignore */ } }
    if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    if (audioCtx) { try { audioCtx.close(); } catch { /* ignore */ } }
    audioCtx = null;
    analyser = null;
    source = null;
    stream = null;
    sampleBuf = null;
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
  };
}

/**
 * Shared error codes used between engines and the UI to classify assessment
 * failures. These MUST match the strings the UI checks in app.js.
 */
export const ASSESSMENT_ERROR = {
  SILENT_AUDIO: 'SilentAudio',
  NO_MATCH:     'NoMatch',
  NO_MIC:       'NoMic',
  TIMEOUT:      'Timeout',
  ABORTED:      'Aborted',
  NETWORK:      'Network',
  UNKNOWN:      'Unknown',
};

/**
 * Build the shared `{ raw: { error } }` tag for a zero-score result based on
 * the recorder's silence telemetry.
 */
function tagFailureFromRecorder(result, recorder, recognizedText = '') {
  if (result.pronScore > 0) return;
  const code = recorder.isSilent()
    ? ASSESSMENT_ERROR.SILENT_AUDIO
    : recognizedText
      ? (result.raw?.error || ASSESSMENT_ERROR.NO_MATCH)
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
   * @param {string} referenceText
   * @param {(status: string) => void} onStatus - Called with status keys:
   *   'connecting' | 'countdown-3' | 'countdown-2' | 'countdown-1' | 'recording'
   * @returns {Promise<AssessmentResult>}
   */
  async assess(referenceText, onStatus = () => {}) {
    const SpeechSDK = getSpeechSDK();

    if (!this.settings.azureApiKey) {
      throw new Error('Azure API key required');
    }

    onStatus('connecting');

    // Open the mic early so it's fully initialised by the time the countdown
    // ends — Azure's fromDefaultMicrophoneInput() will open its own handle
    // but hardware warm-up happens on the first getUserMedia() call.
    const recorder = await startParallelRecorder();

    let recognizer;
    try {
      recorder.start();
      await runCountdown(onStatus);

      const speechConfig = this._buildSpeechConfig();
      const pronConfig = this._buildPronConfig(referenceText);
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
      pronConfig.applyTo(recognizer);
    } catch (err) {
      try { recorder.releaseStream(); } catch { /* ignore */ }
      throw err;
    }

    return new Promise((resolve, reject) => {
      const TIMEOUT_MS = 30000;
      let timeoutId = null;
      let settled = false;

      const finish = async (result, error) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        try { recognizer.close(); } catch { /* ignore */ }
        const recordingBlob = await recorder.stop();
        if (error) { reject(error); return; }
        const parsed = parseAzureResult(result, SpeechSDK);
        tagFailureFromRecorder(parsed, recorder, parsed.recognizedText);
        resolve({ ...parsed, recordingBlob });
      };

      recognizer.sessionStarted = () => onStatus('recording');

      timeoutId = setTimeout(() => {
        finish(null, makeAssessmentError(ASSESSMENT_ERROR.TIMEOUT, 'Assessment timed out after 30s'));
      }, TIMEOUT_MS);

      recognizer.recognizeOnceAsync(
        result => finish(result, null),
        err  => finish(null, makeAssessmentError(ASSESSMENT_ERROR.UNKNOWN, `Azure recognition failed: ${err}`))
      );
    });
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

    let recognition;
    try {
      recorder.start();
      await runCountdown(onStatus);

      recognition = new SpeechRecognition();
      const locale = this.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
      recognition.lang = locale;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      this._recognition = recognition;
    } catch (err) {
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
    if (this._recognition) {
      try { this._recognition.stop(); } catch { /* ignore */ }
      this._recognition = null;
    }
  }
}

// ===========================================================================
// Azure result parser
// ===========================================================================

function parseAzureResult(result, SpeechSDK) {
  if (result.reason === SpeechSDK.ResultReason.NoMatch) {
    return {
      engine: 'azure',
      pronScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0, prosodyScore: null,
      recognizedText: '',
      words: [],
      raw: { error: 'NoMatch' },
    };
  }

  if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
    return {
      engine: 'azure',
      pronScore: 0, accuracyScore: 0, fluencyScore: 0, completenessScore: 0, prosodyScore: null,
      recognizedText: '',
      words: [],
      raw: { error: `Reason: ${result.reason}` },
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
