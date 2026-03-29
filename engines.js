// engines.js — AccentNinja Speech Engine Abstraction Layer
// Provides TTS, pronunciation assessment, recording, and audio utilities.
// Azure Speech SDK is expected as window.SpeechSDK (loaded via script tag).

// ─── Constants ───────────────────────────────────────────────────────────────

export const AZURE_REGIONS = [
  'eastus', 'eastus2', 'westus', 'westus2', 'westus3',
  'centralus', 'northcentralus', 'southcentralus',
  'canadacentral', 'brazilsouth',
  'northeurope', 'westeurope', 'uksouth', 'ukwest',
  'francecentral', 'germanywestcentral', 'switzerlandnorth',
  'norwayeast', 'swedencentral',
  'eastasia', 'southeastasia', 'japaneast', 'japanwest',
  'koreacentral', 'australiaeast', 'centralindia'
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check whether the Azure Speech SDK is available globally. */
function hasAzureSDK() {
  return typeof SpeechSDK !== 'undefined';
}

/** Shared AudioContext for sound effects, created lazily. */
let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

// ═════════════════════════════════════════════════════════════════════════════
// TTS ENGINE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Return Web Speech API voices filtered for the given accent.
 * Priority order: Google > Apple > Microsoft > other.
 */
export function getWebSpeechVoices(accent = 'en-US') {
  const voices = speechSynthesis.getVoices();
  const matching = voices.filter(v => v.lang === accent || v.lang.replace('_', '-') === accent);

  const priority = (v) => {
    const n = v.name.toLowerCase();
    if (n.includes('google'))    return 0;
    if (n.includes('apple'))     return 1;
    if (n.includes('microsoft')) return 2;
    return 3;
  };

  matching.sort((a, b) => priority(a) - priority(b));
  return matching;
}

/**
 * Speak text aloud.
 *
 * @param {string} text
 * @param {Object} opts
 * @param {boolean}  opts.slow       - Use 0.7x rate (default false)
 * @param {string}   opts.voice      - Preferred voice name
 * @param {string}   opts.accent     - 'en-US' | 'en-GB' (default 'en-US')
 * @param {string}   opts.engine     - 'webspeech' | 'azure' (default 'webspeech')
 * @param {string}   opts.azureKey   - Azure subscription key
 * @param {string}   opts.azureRegion - Azure region
 * @returns {Promise<void>} Resolves when speech ends.
 */
export function speak(text, opts = {}) {
  const {
    slow = false,
    voice = null,
    accent = 'en-US',
    engine = 'webspeech',
    azureKey,
    azureRegion
  } = opts;

  if (engine === 'azure' && hasAzureSDK() && azureKey && azureRegion) {
    return _speakAzure(text, { slow, accent, azureKey, azureRegion });
  }
  return _speakWebSpeech(text, { slow, voice, accent });
}

/** Web Speech API implementation. */
function _speakWebSpeech(text, { slow, voice, accent }) {
  return new Promise((resolve, reject) => {
    speechSynthesis.cancel(); // stop any current utterance
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = accent;
    utter.rate = slow ? 0.7 : 1;

    // Select voice by name or pick best available for accent
    const voices = getWebSpeechVoices(accent);
    if (voice) {
      const match = voices.find(v => v.name === voice);
      if (match) utter.voice = match;
    } else if (voices.length) {
      utter.voice = voices[0];
    }

    utter.onend = () => resolve();
    utter.onerror = (e) => reject(new Error(`Web Speech TTS error: ${e.error}`));
    speechSynthesis.speak(utter);
  });
}

/** Azure TTS implementation using SpeechSDK.SpeechSynthesizer. */
function _speakAzure(text, { slow, accent, azureKey, azureRegion }) {
  return new Promise((resolve, reject) => {
    try {
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(azureKey, azureRegion);
      // Pick a default neural voice per accent
      speechConfig.speechSynthesisVoiceName =
        accent === 'en-GB' ? 'en-GB-RyanNeural' : 'en-US-JennyNeural';

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);

      // Wrap text in SSML for rate control
      const rate = slow ? 'slow' : 'medium';
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${accent}">
        <voice name="${speechConfig.speechSynthesisVoiceName}">
          <prosody rate="${rate}">${text}</prosody>
        </voice>
      </speak>`;

      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          synthesizer.close();
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve();
          } else {
            reject(new Error(`Azure TTS failed: ${result.errorDetails || 'unknown'}`));
          }
        },
        (err) => {
          synthesizer.close();
          reject(new Error(`Azure TTS error: ${err}`));
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ASSESSMENT ENGINE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Run pronunciation assessment on microphone input.
 *
 * @param {string} referenceText - The phrase the user is expected to say.
 * @param {Object} opts
 * @param {string}  opts.engine      - 'azure' | 'webspeech' (default 'azure')
 * @param {string}  opts.azureKey    - Azure subscription key
 * @param {string}  opts.azureRegion - Azure region
 * @param {string}  opts.accent      - 'en-US' | 'en-GB'
 * @returns {Promise<AssessmentResult>}
 */
export function assess(referenceText, opts = {}) {
  const {
    engine = 'azure',
    azureKey,
    azureRegion,
    accent = 'en-US'
  } = opts;

  if (engine === 'azure' && hasAzureSDK() && azureKey && azureRegion) {
    return _assessAzure(referenceText, { azureKey, azureRegion, accent });
  }
  return _assessWebSpeech(referenceText, { accent });
}

/** Azure Pronunciation Assessment implementation. */
function _assessAzure(referenceText, { azureKey, azureRegion, accent }) {
  return new Promise((resolve, reject) => {
    try {
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(azureKey, azureRegion);
      speechConfig.speechRecognitionLanguage = accent;

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      // Pronunciation assessment configuration
      const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
        referenceText,
        SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
        SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
        true // enableMiscue
      );
      pronConfig.phonemeAlphabet = 'IPA';

      // Prosody assessment is supported for en-US
      if (accent === 'en-US') {
        pronConfig.enableProsodyAssessment = true;
      }

      pronConfig.applyTo(recognizer);

      const startTime = performance.now();

      recognizer.recognizeOnceAsync(
        (result) => {
          const duration = (performance.now() - startTime) / 1000;
          recognizer.close();

          if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            resolve(_parseAzureResult(result, accent, duration));
          } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
            reject(new Error('No speech detected. Please try again.'));
          } else {
            reject(new Error(`Recognition failed: ${result.errorDetails || 'unknown'}`));
          }
        },
        (err) => {
          recognizer.close();
          reject(new Error(`Azure assessment error: ${err}`));
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

/** Parse the detailed JSON from Azure Pronunciation Assessment. */
function _parseAzureResult(result, accent, duration) {
  const json = result.properties.getProperty(
    SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult
  );
  const parsed = JSON.parse(json);
  const nBest = parsed.NBest && parsed.NBest[0];

  if (!nBest || !nBest.PronunciationAssessment) {
    return {
      engine: 'azure',
      overall: 0,
      accuracy: 0,
      fluency: 0,
      completeness: 0,
      prosody: null,
      words: [],
      transcript: result.text || '',
      duration
    };
  }

  const pa = nBest.PronunciationAssessment;

  const words = (nBest.Words || []).map(w => ({
    word: w.Word,
    accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
    errorType: w.PronunciationAssessment?.ErrorType ?? 'None',
    phonemes: (w.Phonemes || []).map(p => ({
      phoneme: p.Phoneme,
      accuracyScore: p.PronunciationAssessment?.AccuracyScore ?? 0
    }))
  }));

  return {
    engine: 'azure',
    overall: pa.PronScore ?? 0,
    accuracy: pa.AccuracyScore ?? 0,
    fluency: pa.FluencyScore ?? 0,
    completeness: pa.CompletenessScore ?? 0,
    prosody: accent === 'en-US' ? (pa.ProsodyScore ?? null) : null,
    words,
    transcript: result.text || '',
    duration
  };
}

/** Web Speech API fallback assessment (limited data). */
function _assessWebSpeech(referenceText, { accent }) {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return reject(new Error('Speech recognition not supported in this browser.'));
    }

    const recognition = new SpeechRecognition();
    recognition.lang = accent;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const startTime = performance.now();

    recognition.onresult = (event) => {
      const duration = (performance.now() - startTime) / 1000;
      const res = event.results[0][0];
      const transcript = res.transcript;
      const confidence = res.confidence; // 0-1

      // Map confidence to a 0-100 score
      const score = Math.round(confidence * 100);

      // Build simple word list (no phoneme data available)
      const words = transcript.split(/\s+/).filter(Boolean).map(w => ({
        word: w,
        accuracyScore: score,
        errorType: 'None',
        phonemes: []
      }));

      resolve({
        engine: 'webspeech',
        overall: score,
        accuracy: score,
        fluency: score,
        completeness: _computeCompleteness(referenceText, transcript),
        prosody: null,
        words,
        transcript,
        duration
      });
    };

    recognition.onerror = (e) => {
      reject(new Error(`Speech recognition error: ${e.error}`));
    };

    recognition.onnomatch = () => {
      reject(new Error('No speech detected. Please try again.'));
    };

    recognition.start();
  });
}

/** Rough completeness estimate: ratio of matched reference words. */
function _computeCompleteness(reference, transcript) {
  const refWords = reference.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const spokenWords = new Set(
    transcript.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean)
  );
  if (refWords.length === 0) return 100;
  const matched = refWords.filter(w => spokenWords.has(w)).length;
  return Math.round((matched / refWords.length) * 100);
}

// ═════════════════════════════════════════════════════════════════════════════
// PARALLEL RECORDING (for replay)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Start a parallel MediaRecorder for capturing user audio.
 * The resulting blob is for local replay only (not sent to Azure).
 *
 * @returns {Promise<{ stop: () => Promise<Blob> }>}
 */
export async function startParallelRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  return {
    /** Stop recording and return the audio blob. */
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          // Release microphone
          stream.getTracks().forEach(t => t.stop());
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.stop();
      });
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIO PLAYBACK
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Play an audio Blob through an Audio element.
 * @param {Blob} blob
 * @returns {Promise<void>} Resolves when playback ends.
 */
export function playBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Audio playback error: ${e.message || 'unknown'}`));
    };
    audio.play().catch(reject);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SOUND EFFECTS (Web Audio API)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Slash / swoosh sound for ninja mode.
 * Sawtooth wave sweeping 800 Hz -> 200 Hz over 100 ms.
 */
export function playSwoosh() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.linearRampToValueAtTime(200, now + 0.1);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.1);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

/**
 * Thud / fall sound for ninja mode.
 * Sine wave dropping 80 Hz -> 40 Hz over 150 ms.
 */
export function playThud() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.linearRampToValueAtTime(40, now + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.15);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

/**
 * Ascending tone for excellent scores.
 * Three quick sine notes: C5 -> E5 -> G5.
 */
export function playSuccess() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  const step = 0.12;

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const t = now + i * step;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.linearRampToValueAtTime(0, t + step);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + step);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// AZURE QUOTA TRACKING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Record usage for the current month.
 * Stores in localStorage under key `accentninja_usage_YYYY-MM`.
 *
 * @param {number} durationSeconds - Seconds of audio processed.
 */
export function trackUsage(durationSeconds) {
  const key = _usageKey();
  const current = parseFloat(localStorage.getItem(key) || '0');
  localStorage.setItem(key, String(current + durationSeconds));
}

/**
 * Estimate total seconds of Azure usage this month.
 *
 * @param {number} [sessions] - If provided, projects remaining usage.
 *   Returns { used, projected } where projected = used + sessions * avgDuration.
 * @returns {{ used: number, projected: number }}
 */
export function getEstimatedUsage(sessions = 0) {
  const key = _usageKey();
  const used = parseFloat(localStorage.getItem(key) || '0');
  // Assume average session ~10 seconds of audio
  const avgDuration = 10;
  return {
    used: Math.round(used),
    projected: Math.round(used + sessions * avgDuration)
  };
}

/** Build a localStorage key scoped to the current month. */
function _usageKey() {
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `accentninja_usage_${month}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Quick connectivity test for an Azure Speech key + region.
 * Creates a recognizer and immediately cancels — success means the key is valid.
 *
 * @param {string} key    - Azure subscription key.
 * @param {string} region - Azure region string.
 * @returns {Promise<boolean>} true if the connection succeeds.
 */
export async function testAzureConnection(key, region) {
  if (!hasAzureSDK()) return false;

  return new Promise((resolve) => {
    try {
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechRecognitionLanguage = 'en-US';

      // Use a short silent audio push stream to avoid microphone prompt
      const pushStream = SpeechSDK.AudioInputStream.createPushStream();
      pushStream.close(); // send empty / EOF immediately
      const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);

      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      // If the key is invalid the SDK fires the canceled event with an auth error.
      // If valid, it will report NoMatch (no audio) — both are fine for a connectivity test.
      recognizer.recognizeOnceAsync(
        () => { recognizer.close(); resolve(true); },
        () => { recognizer.close(); resolve(false); }
      );

      // Safety timeout
      setTimeout(() => { recognizer.close(); resolve(false); }, 8000);
    } catch {
      resolve(false);
    }
  });
}
