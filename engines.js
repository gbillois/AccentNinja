// engines.js - AccentNinja Speech Engine Abstraction Layer

// ─────────────────────────────────────────────────────────────────────────────
// TTS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class TTSEngine {
  constructor(settings) {
    this.settings = settings;
    this.voices = [];
    this.currentUtterance = null;
    this._azurePlayer = null;
  }

  async init() {
    if (this.settings.ttsEngine === 'webspeech' || !window.SpeechSynthesisUtterance) {
      await this._loadWebSpeechVoices();
    }
  }

  async _loadWebSpeechVoices() {
    return new Promise(resolve => {
      const load = () => {
        this.voices = window.speechSynthesis.getVoices();
        resolve(this.voices);
      };
      if (window.speechSynthesis.getVoices().length > 0) {
        load();
      } else {
        window.speechSynthesis.onvoiceschanged = load;
        setTimeout(load, 1000); // Fallback for browsers that don't fire onvoiceschanged
      }
    });
  }

  getAvailableVoices(accent = 'us') {
    const langPrefix = accent === 'uk' ? 'en-GB' : 'en-US';
    const allEnVoices = this.voices.filter(v =>
      v.lang.startsWith('en-US') || v.lang.startsWith('en-GB') ||
      v.lang.startsWith('en-AU') || v.lang.startsWith('en')
    );
    // Sort by preference: target accent first, then by name quality
    return allEnVoices.sort((a, b) => {
      const aMatch = a.lang.startsWith(langPrefix) ? 1 : 0;
      const bMatch = b.lang.startsWith(langPrefix) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      // Prefer Google > Apple > Microsoft
      const priority = ['Google', 'Apple', 'Microsoft'];
      const aPri = priority.findIndex(p => a.name.includes(p));
      const bPri = priority.findIndex(p => b.name.includes(p));
      if (aPri !== bPri) {
        if (aPri === -1) return 1;
        if (bPri === -1) return -1;
        return aPri - bPri;
      }
      return a.name.localeCompare(b.name);
    });
  }

  getBestVoice(accent = 'us') {
    const available = this.getAvailableVoices(accent);
    if (this.settings.ttsVoice) {
      const saved = available.find(v => v.name === this.settings.ttsVoice);
      if (saved) return saved;
    }
    return available[0] || null;
  }

  stop() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }

  async speak(text, options = {}) {
    const { rate = 1.0, onstart, onend, onerror } = options;

    this.stop();

    if (this.settings.ttsEngine === 'azure' && this.settings.azureKey) {
      return this._speakAzure(text, rate, { onstart, onend, onerror });
    } else {
      return this._speakWebSpeech(text, rate, { onstart, onend, onerror });
    }
  }

  _speakWebSpeech(text, rate, { onstart, onend, onerror }) {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Web Speech API not available'));
        return;
      }
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = rate;
      utt.lang = this.settings.accent === 'uk' ? 'en-GB' : 'en-US';

      const voice = this.getBestVoice(this.settings.accent);
      if (voice) utt.voice = voice;

      utt.onstart = () => { onstart && onstart(); };
      utt.onend = () => { onend && onend(); resolve(); };
      utt.onerror = (e) => { onerror && onerror(e); reject(e); };

      this.currentUtterance = utt;
      window.speechSynthesis.speak(utt);

      // iOS Safari workaround: resume if paused
      setTimeout(() => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 100);
    });
  }

  async _speakAzure(text, rate, { onstart, onend, onerror }) {
    try {
      const SpeechSDK = window.SpeechSDK;
      if (!SpeechSDK) throw new Error('Azure Speech SDK not loaded');

      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
        this.settings.azureKey,
        this.settings.azureRegion || 'eastus'
      );

      const voiceName = this._getAzureVoice();
      speechConfig.speechSynthesisVoiceName = voiceName;

      const ssmlRate = rate === 1.0 ? 'medium' : 'slow';
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${this.settings.accent === 'uk' ? 'en-GB' : 'en-US'}">
        <voice name="${voiceName}">
          <prosody rate="${ssmlRate}">${this._escapeXml(text)}</prosody>
        </voice>
      </speak>`;

      const player = new SpeechSDK.SpeakerAudioDestination();
      const audioConfig = SpeechSDK.AudioConfig.fromSpeakerOutput(player);
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);

      return new Promise((resolve, reject) => {
        onstart && onstart();
        synthesizer.speakSsmlAsync(ssml,
          result => {
            synthesizer.close();
            if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
              onend && onend();
              resolve();
            } else {
              const err = new Error('Azure TTS failed: ' + result.errorDetails);
              onerror && onerror(err);
              reject(err);
            }
          },
          err => {
            synthesizer.close();
            onerror && onerror(err);
            reject(err);
          }
        );
      });
    } catch (e) {
      // Fallback to Web Speech
      console.warn('Azure TTS failed, falling back to Web Speech:', e);
      return this._speakWebSpeech(text, rate, { onstart, onend, onerror });
    }
  }

  _getAzureVoice() {
    if (this.settings.accent === 'uk') {
      return this.settings.azureTTSVoice || 'en-GB-SoniaNeural';
    }
    return this.settings.azureTTSVoice || 'en-US-JennyNeural';
  }

  _escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESSMENT ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class AssessmentEngine {
  constructor(settings) {
    this.settings = settings;
    this.isRecording = false;
    this._mediaRecorder = null;
    this._audioChunks = [];
    this._stream = null;
    this._recognizer = null;
  }

  get engineType() {
    if (this.settings.assessmentEngine === 'azure' && this.settings.azureKey) {
      return 'azure';
    }
    return 'webspeech';
  }

  async requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Keep stream alive briefly then close
      stream.getTracks().forEach(t => t.stop());
      return { granted: true };
    } catch (e) {
      return { granted: false, error: e };
    }
  }

  /**
   * Assess pronunciation.
   * Returns a normalized result object regardless of engine used.
   */
  async assess(referenceText, options = {}) {
    const { onRecordingStart, onRecordingStop, onProcessing } = options;

    if (this.engineType === 'azure') {
      return this._assessAzure(referenceText, { onRecordingStart, onRecordingStop, onProcessing });
    } else {
      return this._assessWebSpeech(referenceText, { onRecordingStart, onRecordingStop, onProcessing });
    }
  }

  async _assessAzure(referenceText, { onRecordingStart, onRecordingStop, onProcessing }) {
    const SpeechSDK = window.SpeechSDK;
    if (!SpeechSDK) throw new Error('Azure Speech SDK not loaded');

    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
      this.settings.azureKey,
      this.settings.azureRegion || 'eastus'
    );
    speechConfig.speechRecognitionLanguage = this.settings.accent === 'uk' ? 'en-GB' : 'en-US';

    const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
      referenceText,
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
      true // enableMiscue
    );
    pronConfig.phonemeAlphabet = 'IPA';
    if (this.settings.accent !== 'uk') {
      pronConfig.enableProsodyAssessment = true;
    }

    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    pronConfig.applyTo(recognizer);
    this._recognizer = recognizer;

    // Parallel MediaRecorder for playback
    let userBlob = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._stream = stream;
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        userBlob = new Blob(chunks, { type: recorder.mimeType });
        stream.getTracks().forEach(t => t.stop());
      };
      this._mediaRecorder = recorder;
      recorder.start(100);
    } catch (e) {
      console.warn('Could not set up parallel recording:', e);
    }

    onRecordingStart && onRecordingStart();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { recognizer.stopContinuousRecognitionAsync(); } catch(e) {}
        reject(new Error('Recording timeout (30s)'));
      }, 30000);

      recognizer.recognizeOnceAsync(
        result => {
          clearTimeout(timeout);
          if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
            this._mediaRecorder.stop();
          }
          onRecordingStop && onRecordingStop();
          onProcessing && onProcessing();

          if (result.reason === SpeechSDK.ResultReason.NoMatch) {
            recognizer.close();
            reject(new Error('no_speech'));
            return;
          }

          if (result.reason === SpeechSDK.ResultReason.Canceled) {
            const cancellation = SpeechSDK.CancellationDetails.fromResult(result);
            recognizer.close();
            if (cancellation.ErrorCode === SpeechSDK.CancellationErrorCode.AuthenticationFailure) {
              reject(new Error('auth_failed'));
            } else if (cancellation.ErrorCode === SpeechSDK.CancellationErrorCode.ServiceUnavailable ||
                       String(cancellation.errorDetails || '').includes('429')) {
              reject(new Error('quota_exceeded'));
            } else {
              reject(new Error('azure_error: ' + (cancellation.errorDetails || '')));
            }
            return;
          }

          try {
            const pronResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
            recognizer.close();

            // Parse duration from result for quota tracking
            let durationSeconds = 0;
            try {
              const dur = result.duration; // in ticks (100ns each)
              if (dur) durationSeconds = dur / 10000000;
            } catch(e) {}

            resolve(this._normalizeAzureResult(pronResult, result, userBlob, durationSeconds));
          } catch (e) {
            recognizer.close();
            reject(e);
          }
        },
        err => {
          clearTimeout(timeout);
          if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
            this._mediaRecorder.stop();
          }
          recognizer.close();
          reject(new Error(String(err)));
        }
      );
    });
  }

  _normalizeAzureResult(pronResult, rawResult, userBlob, durationSeconds) {
    const detail = pronResult.detailResult || {};
    const words = (detail.Words || []).map(w => ({
      word: w.Word,
      accuracyScore: w.AccuracyScore || 0,
      errorType: w.ErrorType || 'None',
      phonemes: (w.Phonemes || []).map(p => ({
        phoneme: p.Phoneme,
        accuracyScore: p.AccuracyScore || 0
      })),
      syllables: (w.Syllables || []).map(s => ({
        syllable: s.Syllable,
        accuracyScore: s.AccuracyScore || 0
      }))
    }));

    return {
      engine: 'azure',
      pronunciationScore: pronResult.pronunciationScore || 0,
      accuracyScore: pronResult.accuracyScore || 0,
      fluencyScore: pronResult.fluencyScore || 0,
      completenessScore: pronResult.completenessScore || 0,
      prosodyScore: pronResult.prosodyScore || null,
      words,
      transcript: rawResult.text || '',
      userBlob,
      durationSeconds
    };
  }

  async _assessWebSpeech(referenceText, { onRecordingStart, onRecordingStop, onProcessing }) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) throw new Error('Web Speech API not available');

    // Parallel MediaRecorder
    let userBlob = null;
    let mediaRecorder = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._stream = stream;
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        userBlob = new Blob(chunks, { type: recorder.mimeType });
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder = recorder;
      this._mediaRecorder = recorder;
      recorder.start(100);
    } catch (e) {
      console.warn('Parallel recording failed:', e);
    }

    return new Promise((resolve, reject) => {
      const recognition = new SpeechRecognition();
      recognition.lang = this.settings.accent === 'uk' ? 'en-GB' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      onRecordingStart && onRecordingStart();

      recognition.onresult = (event) => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        onRecordingStop && onRecordingStop();
        onProcessing && onProcessing();

        const result = event.results[0];
        const transcript = result[0].transcript.toLowerCase().trim();
        const confidence = result[0].confidence || 0;

        resolve(this._normalizeWebSpeechResult(transcript, confidence, referenceText, userBlob));
      };

      recognition.onerror = (event) => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (event.error === 'no-speech') reject(new Error('no_speech'));
        else reject(new Error(event.error));
      };

      recognition.onend = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      };

      recognition.start();
    });
  }

  _normalizeWebSpeechResult(transcript, confidence, referenceText, userBlob) {
    // Word-level comparison
    const refWords = referenceText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const transWords = transcript.replace(/[^\w\s]/g, '').split(/\s+/);

    const words = refWords.map((refWord, i) => {
      const transWord = transWords[i] || '';
      const match = refWord === transWord;
      return {
        word: refWord,
        accuracyScore: match ? Math.round(confidence * 100) : Math.max(0, Math.round((confidence * 100) - 30)),
        errorType: transWord === '' ? 'Omission' : (match ? 'None' : 'Mispronunciation'),
        phonemes: [],
        syllables: []
      };
    });

    // Score: map confidence to 0-100, apply word match bonus
    const wordMatchRate = words.filter(w => w.errorType === 'None').length / Math.max(1, refWords.length);
    const baseScore = Math.round(confidence * 100);
    const overallScore = Math.round(baseScore * 0.6 + wordMatchRate * 100 * 0.4);

    return {
      engine: 'webspeech',
      pronunciationScore: overallScore,
      accuracyScore: overallScore,
      fluencyScore: Math.round(confidence * 100),
      completenessScore: Math.round(wordMatchRate * 100),
      prosodyScore: null,
      words,
      transcript,
      userBlob,
      durationSeconds: 0
    };
  }

  stop() {
    try {
      if (this._recognizer) {
        this._recognizer.close();
        this._recognizer = null;
      }
      if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
        this._mediaRecorder.stop();
      }
      if (this._stream) {
        this._stream.getTracks().forEach(t => t.stop());
        this._stream = null;
      }
    } catch (e) {
      console.warn('Error stopping assessment engine:', e);
    }
  }

  // Validate Azure key by making a test request
  static async validateAzureKey(key, region) {
    try {
      const SpeechSDK = window.SpeechSDK;
      if (!SpeechSDK) return { valid: false, error: 'SDK not loaded' };

      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          synthesizer.close();
          resolve({ valid: false, error: 'Timeout' });
        }, 8000);

        synthesizer.speakTextAsync(
          'test',
          result => {
            clearTimeout(timeout);
            synthesizer.close();
            if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
              resolve({ valid: true });
            } else {
              resolve({ valid: false, error: result.errorDetails });
            }
          },
          err => {
            clearTimeout(timeout);
            synthesizer.close();
            resolve({ valid: false, error: String(err) });
          }
        );
      });
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export function createAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

export function playSwoosh() {
  try {
    const ctx = createAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    setTimeout(() => ctx.close(), 500);
  } catch (e) { /* Non-critical */ }
}

export function playThud() {
  try {
    const ctx = createAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 500);
  } catch (e) { /* Non-critical */ }
}

export function playBeep(frequency = 600, duration = 0.1, volume = 0.2) {
  try {
    const ctx = createAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), 1000);
  } catch (e) { /* Non-critical */ }
}

// Waveform analyzer for recording visualization
export class WaveformAnalyzer {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
    this.animFrame = null;
  }

  async start(stream) {
    try {
      this.ctx = createAudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      this.source = this.ctx.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) {
      console.warn('Waveform analyzer failed:', e);
    }
  }

  getFrequencyData(bands = 8) {
    if (!this.analyser || !this.dataArray) return new Array(bands).fill(0);
    this.analyser.getByteFrequencyData(this.dataArray);
    const result = [];
    const step = Math.floor(this.dataArray.length / bands);
    for (let i = 0; i < bands; i++) {
      const slice = this.dataArray.slice(i * step, (i + 1) * step);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      result.push(avg / 255); // Normalize 0-1
    }
    return result;
  }

  stop() {
    try {
      if (this.source) this.source.disconnect();
      if (this.ctx) this.ctx.close();
    } catch (e) {}
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }
}
