/* AccentNinja — Core Application
 * Routing, state, IndexedDB, and screen rendering.
 * Screens: splash → setup (first launch) or home → settings / practice / results
 */

import { createTTSEngine, createAssessmentEngine, AZURE_VOICES, AZURE_REGIONS, webVoicePriority } from './engines.js';
import { t, setLanguage } from './i18n.js';
import { CORPUS, MULTIPLAYER_PHRASES } from './corpus.js';
import { playNinjaAnimation } from './ninja.js';

// ===========================================================================
// Constants
// ===========================================================================

const DB_NAME    = 'accentninja-db';
const DB_VERSION = 1;

const DEFAULT_SETTINGS = {
  ttsEngine:        'web',
  assessmentEngine: 'web',
  azureApiKey:      '',
  azureRegion:      'westeurope',
  accentTarget:     'us',
  ttsVoice:         '',
  language:         'fr',
  theme:            'dark',
  firstLaunch:      true,
  resultsDisplay:   'ninja',   // 'ninja' | 'classic'
};

// ===========================================================================
// Application state
// ===========================================================================

const state = {
  settings: { ...DEFAULT_SETTINGS },
  engines:  { tts: null, assessment: null },
  screen:   'splash',
  db:       null,
  audioCtx: null,   // shared Web Audio context for Ninja Mode
};

// Transient "pending" settings in the Settings UI (not yet saved to DB).
let pendingSettings = {};

// Practice session state (Level 0 sandbox)
const practiceState = {
  phrase:       'The quick brown fox jumps over the lazy dog.',
  status:       'idle',   // 'idle' | 'speaking' | 'recording' | 'processing' | 'done'
  result:       null,
  recordingBlob: null,
};

// Multiplayer state
const multiState = {
  phase:        'setup',  // 'setup' | 'playing' | 'results'
  playerCount:  2,
  roundCount:   5,        // phrases per player
  players:      [],       // { name, scores: number[], details: object[] }
  currentPlayer: 0,
  currentRound:  0,
  phrases:      [],       // selected phrases for the game
  status:       'idle',   // 'idle' | 'recording' | 'processing' | 'done'
  lastResult:   null,
};

// ===========================================================================
// IndexedDB helpers
// ===========================================================================

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date',  'date',  { unique: false });
        store.createIndex('level', 'level', { unique: false });
      }
    };

    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx  = state.db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbSet(storeName, key, value) {
  return new Promise((resolve, reject) => {
    const tx  = state.db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

async function loadSettings() {
  const saved = await dbGet('settings', 'current');
  if (saved) {
    state.settings = { ...DEFAULT_SETTINGS, ...saved };
  }
}

async function persistSettings(updates) {
  state.settings = { ...state.settings, ...updates };
  await dbSet('settings', 'current', state.settings);
  reinitEngines();
}

function reinitEngines() {
  state.engines.tts        = createTTSEngine(state.settings);
  state.engines.assessment = createAssessmentEngine(state.settings);
}

// ===========================================================================
// Navigation / routing
// ===========================================================================

function navigate(screen) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(`screen-${screen}`);
  if (el) el.classList.add('active');
  state.screen = screen;

  // Render content for this screen
  switch (screen) {
    case 'home':        renderHomeScreen();        break;
    case 'settings':    renderSettingsScreen();    break;
    case 'setup':       renderSetupScreen();       break;
    case 'practice':    renderPracticeScreen();    break;
    case 'results':     renderResultsScreen();     break;
    case 'multiplayer': renderMultiplayerScreen(); break;
  }

  // Update hash (don't push 'home' or 'splash' to avoid spurious back entries)
  const hash = (screen === 'home' || screen === 'splash') ? '' : screen;
  if (window.location.hash.slice(1) !== hash) {
    history.pushState({ screen }, '', hash ? `#${hash}` : window.location.pathname);
  }
}

window.addEventListener('popstate', e => {
  const target = e.state?.screen ?? 'home';
  if (target !== state.screen) navigate(target);
});

// ===========================================================================
// Toast notifications
// ===========================================================================

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===========================================================================
// HTML escape helper
// ===========================================================================

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===========================================================================
// SVG icon helpers
// ===========================================================================

const ICON_BACK = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_SETTINGS = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.5"/>
  <path d="M17.66 10.44a1.7 1.7 0 000-1.88l-1.13-1.58a1.7 1.7 0 00-.71-.59l-1.8-.74a1.7 1.7 0 00-1.87.47l-.42.49a1.7 1.7 0 01-2.66 0l-.42-.49a1.7 1.7 0 00-1.88-.47l-1.8.74c-.28.12-.52.31-.7.59L2.34 8.56a1.7 1.7 0 000 1.88l1.13 1.58c.18.27.43.47.7.59l1.8.74c.68.28 1.46.09 1.88-.47l.42-.49a1.7 1.7 0 012.66 0l.42.49c.42.56 1.2.75 1.87.47l1.8-.74c.28-.12.53-.32.71-.59l1.13-1.58z" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

const ICON_SHURIKEN = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <rect x="-2" y="-10" width="4" height="20" rx="1.5" fill="#6366f1" transform="translate(14,14) rotate(0)"/>
  <rect x="-2" y="-10" width="4" height="20" rx="1.5" fill="#6366f1" transform="translate(14,14) rotate(45)"/>
  <rect x="-2" y="-10" width="4" height="20" rx="1.5" fill="#818cf8" transform="translate(14,14) rotate(90)"/>
  <rect x="-2" y="-10" width="4" height="20" rx="1.5" fill="#818cf8" transform="translate(14,14) rotate(135)"/>
  <circle cx="14" cy="14" r="3.5" fill="#c7d2fe"/>
  <circle cx="14" cy="14" r="1.5" fill="#0f172a"/>
</svg>`;

// ===========================================================================
// Splash screen (static HTML — always present)
// ===========================================================================

function showSplash() {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('screen-splash').classList.add('active');
}

// ===========================================================================
// Setup screen (first launch)
// ===========================================================================

function renderSetupScreen() {
  const screen = document.getElementById('screen-setup');
  screen.innerHTML = `
    <main class="setup-main">
      <div class="setup-hero">
        <div class="setup-logo-large">${ICON_SHURIKEN}</div>
        <h1 class="setup-title">${t('app.title')}</h1>
        <p class="setup-subtitle">${t('setup.subtitle')}</p>
      </div>

      <div class="setup-card">
        <h2 class="setup-card-title">${t('setup.azureTitle')}</h2>
        <p class="setup-info">${t('setup.azureInfo')}</p>

        <div class="form-group">
          <label class="form-label" for="setup-api-key">${t('settings.azureApiKey.label')}</label>
          <input class="form-input" type="password" id="setup-api-key"
                 placeholder="${t('settings.azureApiKey.placeholder')}"
                 autocomplete="off" autocorrect="off" spellcheck="false">
        </div>

        <div class="form-group">
          <label class="form-label" for="setup-region">${t('settings.azureRegion.label')}</label>
          <select class="form-select" id="setup-region">
            ${AZURE_REGIONS.map(r =>
              `<option value="${esc(r.value)}" ${r.value === 'westeurope' ? 'selected' : ''}>${esc(r.label)}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div class="setup-actions">
        <button class="btn btn-primary btn-full btn-lg" id="setup-start-btn">
          ${t('setup.start')}
        </button>
        <button class="btn btn-text" id="setup-skip-btn">
          ${t('setup.skip')}
        </button>
      </div>
    </main>
  `;

  document.getElementById('setup-start-btn').addEventListener('click', async () => {
    const key    = document.getElementById('setup-api-key').value.trim();
    const region = document.getElementById('setup-region').value;

    const updates = { firstLaunch: false };
    if (key) {
      updates.azureApiKey       = key;
      updates.azureRegion       = region;
      updates.assessmentEngine  = 'azure';
      updates.ttsEngine         = 'azure';
    }

    await persistSettings(updates);
    navigate('home');
  });

  document.getElementById('setup-skip-btn').addEventListener('click', async () => {
    await persistSettings({ firstLaunch: false });
    navigate('home');
  });
}

// ===========================================================================
// Home screen
// ===========================================================================

function renderHomeScreen() {
  const screen = document.getElementById('screen-home');
  const levels = Object.entries(CORPUS);

  screen.innerHTML = `
    <header class="app-header">
      <div class="header-title-group">
        ${ICON_SHURIKEN}
        <h1 class="header-title">${t('app.title')}</h1>
      </div>
      <div class="header-actions">
        <button class="btn-icon" id="home-settings-btn" aria-label="${t('nav.settings')}">
          ${ICON_SETTINGS}
        </button>
      </div>
    </header>

    <div class="screen-body">
      <main class="home-main">

        <!-- Level 0 — sandbox -->
        <button class="level0-card" id="level0-btn">
          <span class="level0-icon">🎯</span>
          <div class="level0-text">
            <span class="level0-title">Niveau 0 — Bac à sable</span>
            <span class="level0-sub">Testez n'importe quelle phrase</span>
          </div>
          <span class="level0-arrow">→</span>
        </button>

        <div>
          <p class="home-section-title">${t('home.title')}</p>
        </div>

        <div class="level-grid" id="level-grid">
          ${levels.map(([num, level]) => {
            const hasItems = level.items?.length > 0;
            const locked   = !hasItems;
            return `
              <button
                class="level-card ${locked ? 'level-card--locked' : ''}"
                data-level="${num}"
                ${locked ? 'aria-disabled="true"' : ''}
                title="${esc(level.nameEn || level.name)}"
              >
                <span class="level-number">${num}</span>
                <span class="level-icon">${locked ? '🔒' : '⚡'}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Multiplayer button -->
        <button class="multi-home-btn" id="multi-btn">
          <span class="multi-home-icon">&#x1F3AE;</span>
          <div class="multi-home-text">
            <span class="multi-home-title">${t('multi.btn')}</span>
            <span class="multi-home-sub">${t('multi.btn.sub')}</span>
          </div>
          <span class="level0-arrow">&rarr;</span>
        </button>

        <div class="card" style="opacity:0.5">
          <p class="text-muted text-sm text-center">${t('home.levels.coming')}</p>
        </div>
      </main>
    </div>
  `;

  document.getElementById('home-settings-btn').addEventListener('click', () => navigate('settings'));
  document.getElementById('level0-btn').addEventListener('click', () => navigate('practice'));
  document.getElementById('multi-btn').addEventListener('click', () => {
    multiState.phase = 'setup';
    navigate('multiplayer');
  });

  document.querySelectorAll('.level-card:not(.level-card--locked)').forEach(btn => {
    btn.addEventListener('click', () => navigate('practice'));
  });
}

// ===========================================================================
// Practice screen — Level 0 sandbox
// ===========================================================================

function renderPracticeScreen() {
  const screen = document.getElementById('screen-practice');
  const engineLabel = state.settings.assessmentEngine === 'azure'
    ? `<span class="badge badge-primary">Azure</span>`
    : `<span class="badge badge-muted">Web Speech</span>`;

  screen.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" id="practice-back-btn" aria-label="${t('nav.back')}">
        ${ICON_BACK}
      </button>
      <h1 class="header-title">Niveau 0</h1>
      <div class="header-actions">${engineLabel}</div>
    </header>

    <div class="screen-body">
      <div class="practice-l0">

        <!-- Phrase input -->
        <section class="p-section">
          <label class="p-label" for="phrase-input">Phrase à prononcer</label>
          <textarea class="p-textarea" id="phrase-input" rows="3"
                    placeholder="Tapez ou collez une phrase en anglais…"
                    spellcheck="false">${esc(practiceState.phrase)}</textarea>
        </section>

        <!-- Listen button -->
        <button class="btn btn-secondary p-listen-btn" id="listen-btn">
          <span id="listen-icon">🔊</span> Écouter le modèle
        </button>

        <div class="p-divider">puis répétez</div>

        <!-- Record button -->
        <div class="p-record-wrap">
          <button class="p-record-btn" id="record-btn" aria-label="Enregistrer">
            <span class="p-record-ring" id="record-ring"></span>
            <span class="p-record-dot" id="record-dot"></span>
          </button>
          <span class="p-record-label" id="record-label">Appuyer pour enregistrer</span>
        </div>

        <!-- Status -->
        <div class="p-status" id="p-status" aria-live="polite"></div>

        <!-- Results -->
        <div class="p-results hidden" id="p-results">

          <!-- Scores -->
          <div class="p-scores" id="p-scores"></div>

          <!-- Word pills -->
          <div class="p-words-wrap">
            <p class="p-label">Analyse mot par mot</p>
            <div class="p-words" id="p-words"></div>
          </div>

          <!-- API error banner -->
          <div class="p-error-banner hidden" id="p-error-banner"></div>

          <!-- Playback -->
          <div class="p-actions">
            <button class="btn btn-ghost btn-sm" id="replay-btn" style="display:none">
              ▶ Réécouter mon enregistrement
            </button>
            <button class="btn btn-secondary" id="retry-btn">🔄 Réessayer</button>
          </div>
        </div>

      </div>
    </div>
  `;

  document.getElementById('practice-back-btn').addEventListener('click', () => {
    state.engines.tts?.stop?.();
    state.engines.assessment?.stop?.();
    practiceState.status = 'idle';
    navigate('home');
  });

  document.getElementById('phrase-input').addEventListener('input', e => {
    practiceState.phrase = e.target.value;
  });

  document.getElementById('listen-btn').addEventListener('click', handleListen);
  document.getElementById('record-btn').addEventListener('click', handleRecord);
  document.getElementById('retry-btn').addEventListener('click', resetPractice);

  // Restore previous result if navigating back
  if (practiceState.status === 'done' && practiceState.result) {
    showResults(practiceState.result);
  }
}

// ---------------------------------------------------------------------------
// Practice screen helpers
// ---------------------------------------------------------------------------

async function handleListen() {
  const phrase = document.getElementById('phrase-input')?.value?.trim();
  if (!phrase) return;
  practiceState.phrase = phrase;

  const btn      = document.getElementById('listen-btn');
  const iconEl   = document.getElementById('listen-icon');
  const statusEl = document.getElementById('p-status');

  btn.disabled = true;
  iconEl.textContent = '⏳';
  statusEl.textContent = 'Lecture…';

  try {
    await state.engines.tts.speak(phrase);
    statusEl.textContent = '';
  } catch (err) {
    statusEl.textContent = `Erreur TTS : ${err.message}`;
  } finally {
    btn.disabled = false;
    iconEl.textContent = '🔊';
  }
}

async function handleRecord() {
  if (practiceState.status === 'recording') return; // guard double-tap

  const phrase = document.getElementById('phrase-input')?.value?.trim();
  if (!phrase) {
    setStatus('Tapez une phrase avant d\'enregistrer.', 'warn');
    return;
  }
  practiceState.phrase = phrase;

  // Stop any ongoing TTS
  state.engines.tts?.stop?.();

  // Hide previous results
  document.getElementById('p-results')?.classList.add('hidden');

  setRecordUI('recording');
  practiceState.status = 'recording';

  try {
    const result = await state.engines.assessment.assess(phrase, status => {
      if (status === 'connecting') setStatus('Connexion du microphone…');
      if (status === 'recording')  setStatus('Enregistrement… Parlez maintenant');
    });

    practiceState.status      = 'done';
    practiceState.result      = result;
    practiceState.recordingBlob = result.recordingBlob ?? null;

    setRecordUI('done');
    setStatus('');
    showResults(result);
  } catch (err) {
    practiceState.status = 'idle';
    setRecordUI('idle');
    setStatus(`Erreur : ${err.message}`, 'error');
  }
}

function setStatus(text, type = '') {
  const el = document.getElementById('p-status');
  if (!el) return;
  el.textContent  = text;
  el.className    = `p-status${type ? ` p-status--${type}` : ''}`;
}

function setRecordUI(status) {
  const btn    = document.getElementById('record-btn');
  const ring   = document.getElementById('record-ring');
  const dot    = document.getElementById('record-dot');
  const label  = document.getElementById('record-label');
  const listenBtn = document.getElementById('listen-btn');
  if (!btn) return;

  btn.classList.toggle('p-record-btn--recording', status === 'recording');
  btn.classList.toggle('p-record-btn--processing', status === 'processing');
  ring?.classList.toggle('p-record-ring--active', status === 'recording');

  if (status === 'recording') {
    label.textContent = 'Enregistrement…';
    btn.disabled = true;
    listenBtn.disabled = true;
  } else if (status === 'processing') {
    label.textContent = 'Analyse…';
    btn.disabled = true;
    listenBtn.disabled = true;
  } else {
    label.textContent = 'Appuyer pour enregistrer';
    btn.disabled = false;
    listenBtn.disabled = false;
  }
}

function resetPractice() {
  practiceState.status = 'idle';
  practiceState.result = null;
  practiceState.recordingBlob = null;
  setRecordUI('idle');
  setStatus('');
  document.getElementById('p-results')?.classList.add('hidden');
}

function showResults(result) {
  // Dispatch to Ninja Mode if enabled
  if (state.settings.resultsDisplay === 'ninja') {
    showNinjaResults(result);
    return;
  }
  showClassicResults(result);
}

function showNinjaResults(result) {
  // Lazily create / resume a shared AudioContext (requires user gesture — already satisfied by record tap)
  if (!state.audioCtx) {
    try { state.audioCtx = new AudioContext(); } catch (_) {}
  }
  if (state.audioCtx?.state === 'suspended') state.audioCtx.resume().catch(() => {});

  const container = document.getElementById('screen-practice');
  const phrase    = document.getElementById('phrase-input')?.value?.trim() ?? practiceState.phrase;

  // Build TTS callbacks
  function onListen() {
    state.engines.tts?.speak(phrase).catch(err => {
      console.error('[AccentNinja] TTS listen error:', err);
      showToast(`Erreur TTS : ${err.message}`, 'error');
    });
  }
  function onListenSlow() {
    // Use Web Speech API directly at 0.7x if available, else fall back to normal
    if (window.speechSynthesis && state.settings.ttsEngine === 'web') {
      // Chrome workaround: resume frozen engine, always cancel to clear stuck queue
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } else {
        window.speechSynthesis.cancel();
      }
      const doSlow = () => {
        const utt  = new SpeechSynthesisUtterance(phrase);
        const lang = state.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
        const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(lang));
        if (voices.length) utt.voice = voices[0];
        utt.lang  = lang;
        utt.rate  = 0.7;
        window.speechSynthesis.speak(utt);
      };
      if (isIOS) { doSlow(); } else { setTimeout(doSlow, 50); }
    } else {
      state.engines.tts?.speak(phrase).catch(err => {
        console.error('[AccentNinja] TTS slow error:', err);
        showToast(`Erreur TTS : ${err.message}`, 'error');
      });
    }
  }

  playNinjaAnimation(container, result, {
    audioCtx:      state.audioCtx,
    phrase,
    recordingBlob: practiceState.recordingBlob,
    onListen,
    onListenSlow,
    onRetry:       resetPractice,
    onNext:        () => navigate('home'),
    onComplete:    () => {},
  });
}

function showClassicResults(result) {
  const resultsEl = document.getElementById('p-results');
  if (!resultsEl) return;
  resultsEl.classList.remove('hidden');

  // Scores
  const scoresEl = document.getElementById('p-scores');
  const scoreItems = [
    { label: 'Score global',  value: result.pronScore,         icon: '🏆' },
    { label: 'Précision',     value: result.accuracyScore,     icon: '🎯' },
    { label: 'Fluidité',      value: result.fluencyScore,      icon: '🌊' },
    { label: 'Complétude',    value: result.completenessScore, icon: '✅' },
  ];
  if (result.prosodyScore != null) {
    scoreItems.push({ label: 'Prosodie', value: result.prosodyScore, icon: '🎵' });
  }

  scoresEl.innerHTML = scoreItems.map(item => {
    const v    = Math.round(item.value ?? 0);
    const cls  = scoreClass(v);
    return `
      <div class="p-score-item">
        <div class="p-score-top">
          <span class="p-score-label">${item.icon} ${item.label}</span>
          <span class="p-score-value p-score-value--${cls}">${v}</span>
        </div>
        <div class="p-score-bar">
          <div class="p-score-fill p-score-fill--${cls}" style="width:${v}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Word pills
  const wordsEl = document.getElementById('p-words');
  if (result.words?.length) {
    wordsEl.innerHTML = result.words.map(w => {
      const type = (w.errorType ?? 'None').toLowerCase();
      const tip  = phonemeDetail(w);
      return `<span class="p-word p-word--${type}" title="${esc(tip)}">${esc(w.word)}</span>`;
    }).join(' ');
  } else if (result.recognizedText) {
    wordsEl.innerHTML = `<span class="text-muted text-sm">"${esc(result.recognizedText)}"</span>`;
  } else {
    wordsEl.innerHTML = `<span class="text-muted text-sm">Aucun mot reconnu</span>`;
  }

  // API error banner (shown when score is 0 and an error code is available)
  const errorBannerEl = document.getElementById('p-error-banner');
  if (errorBannerEl) {
    const errorCode = result.raw?.error;
    if (result.pronScore === 0 && errorCode) {
      const lang = state.settings?.language ?? 'fr';
      let suggestion = '';
      if (errorCode === 'NoMatch') {
        suggestion = lang === 'en'
          ? 'Speak louder and closer to the microphone, then try again.'
          : 'Parlez plus fort et plus près du microphone, puis réessayez.';
      } else {
        suggestion = lang === 'en'
          ? 'Check your microphone and API settings, then try again.'
          : 'Vérifiez votre microphone et les paramètres API, puis réessayez.';
      }
      errorBannerEl.innerHTML = `
        <span class="p-error-code">Code : ${esc(errorCode)}</span>
        <span class="p-error-suggestion">${esc(suggestion)}</span>
      `;
      errorBannerEl.classList.remove('hidden');
    } else {
      errorBannerEl.classList.add('hidden');
    }
  }

  // Replay button
  const replayBtn = document.getElementById('replay-btn');
  if (replayBtn && practiceState.recordingBlob) {
    replayBtn.style.display = 'inline-flex';
    replayBtn.onclick = () => {
      const url    = URL.createObjectURL(practiceState.recordingBlob);
      const audio  = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    };
  }
}

function scoreClass(v) {
  if (v >= 80) return 'excellent';
  if (v >= 60) return 'good';
  if (v >= 40) return 'fair';
  return 'poor';
}

function phonemeDetail(word) {
  if (!word.phonemes?.length) return word.errorType ?? '';
  const worst = [...word.phonemes].sort((a, b) => a.accuracyScore - b.accuracyScore)[0];
  return worst ? `/${worst.phoneme}/ — ${Math.round(worst.accuracyScore)}%` : '';
}

// ===========================================================================
// Multiplayer screen
// ===========================================================================

function renderMultiplayerScreen() {
  switch (multiState.phase) {
    case 'setup':   renderMultiSetup();   break;
    case 'playing':  renderMultiPlaying(); break;
    case 'results':  renderMultiResults(); break;
  }
}

// --- Multiplayer: Setup phase ---

function renderMultiSetup() {
  const screen = document.getElementById('screen-multiplayer');
  screen.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" id="multi-back-btn" aria-label="${t('nav.back')}">
        ${ICON_BACK}
      </button>
      <h1 class="header-title">${t('multi.title')}</h1>
    </header>

    <div class="screen-body">
      <div class="multi-setup">

        <div class="multi-setup-icon">&#x1F3AE;</div>

        <!-- Player count -->
        <section class="multi-field">
          <label class="p-label">${t('multi.players')}</label>
          <div class="multi-stepper">
            <button class="btn btn-ghost btn-sm" id="players-minus" type="button">&minus;</button>
            <span class="multi-stepper-value" id="players-value">${multiState.playerCount}</span>
            <button class="btn btn-ghost btn-sm" id="players-plus" type="button">+</button>
          </div>
        </section>

        <!-- Rounds count -->
        <section class="multi-field">
          <label class="p-label">${t('multi.rounds')}</label>
          <div class="multi-stepper">
            <button class="btn btn-ghost btn-sm" id="rounds-minus" type="button">&minus;</button>
            <span class="multi-stepper-value" id="rounds-value">${multiState.roundCount}</span>
            <button class="btn btn-ghost btn-sm" id="rounds-plus" type="button">+</button>
          </div>
        </section>

        <!-- Player names -->
        <section class="multi-field">
          <label class="p-label">${t('multi.playerName')}s</label>
          <div class="multi-names" id="multi-names">
            ${buildPlayerNameInputs(multiState.playerCount)}
          </div>
        </section>

        <p class="text-muted text-sm text-center">${t('multi.difficulty')}</p>

        <button class="btn btn-primary btn-full btn-lg" id="multi-start-btn" type="button">
          ${t('multi.start')}
        </button>
      </div>
    </div>
  `;

  document.getElementById('multi-back-btn').addEventListener('click', () => navigate('home'));

  // Steppers
  const playersVal = document.getElementById('players-value');
  document.getElementById('players-minus').addEventListener('click', () => {
    if (multiState.playerCount > 2) {
      multiState.playerCount--;
      playersVal.textContent = multiState.playerCount;
      document.getElementById('multi-names').innerHTML = buildPlayerNameInputs(multiState.playerCount);
    }
  });
  document.getElementById('players-plus').addEventListener('click', () => {
    if (multiState.playerCount < 8) {
      multiState.playerCount++;
      playersVal.textContent = multiState.playerCount;
      document.getElementById('multi-names').innerHTML = buildPlayerNameInputs(multiState.playerCount);
    }
  });

  const roundsVal = document.getElementById('rounds-value');
  document.getElementById('rounds-minus').addEventListener('click', () => {
    if (multiState.roundCount > 1) {
      multiState.roundCount--;
      roundsVal.textContent = multiState.roundCount;
    }
  });
  document.getElementById('rounds-plus').addEventListener('click', () => {
    if (multiState.roundCount < 15) {
      multiState.roundCount++;
      roundsVal.textContent = multiState.roundCount;
    }
  });

  // Start game
  document.getElementById('multi-start-btn').addEventListener('click', () => {
    // Collect player names
    const names = [];
    for (let i = 0; i < multiState.playerCount; i++) {
      const input = document.getElementById(`player-name-${i}`);
      const name = input?.value?.trim() || `${t('multi.playerName')} ${i + 1}`;
      names.push(name);
    }

    // Initialize game state
    multiState.players = names.map(n => ({ name: n, scores: [], details: [] }));
    multiState.currentPlayer = 0;
    multiState.currentRound  = 0;
    multiState.status        = 'idle';
    multiState.lastResult    = null;
    multiState.phrases       = pickMultiPhrases(multiState.roundCount);
    multiState.phase         = 'playing';
    renderMultiplayerScreen();
  });
}

function buildPlayerNameInputs(count) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<input class="form-input multi-name-input" id="player-name-${i}"
              placeholder="${t('multi.playerName')} ${i + 1}" maxlength="20"
              autocomplete="off" spellcheck="false">`;
  }
  return html;
}

/** Pick `count` phrases with increasing difficulty. */
function pickMultiPhrases(count) {
  // Sort by difficulty, then pick evenly across the range
  const sorted = [...MULTIPLAYER_PHRASES].sort((a, b) => a.difficulty - b.difficulty);
  const step = Math.max(1, Math.floor(sorted.length / count));
  const picks = [];
  const used = new Set();

  for (let i = 0; i < count; i++) {
    // Target index: spread evenly across difficulty range
    let targetIdx = Math.min(Math.floor(i * step), sorted.length - 1);

    // Avoid duplicates — search nearby
    while (used.has(targetIdx) && targetIdx < sorted.length - 1) targetIdx++;
    if (used.has(targetIdx)) {
      // Fallback: find any unused
      for (let j = 0; j < sorted.length; j++) {
        if (!used.has(j)) { targetIdx = j; break; }
      }
    }

    used.add(targetIdx);
    picks.push(sorted[targetIdx]);
  }

  return picks;
}

// --- Multiplayer: Playing phase ---

function renderMultiPlaying() {
  const screen = document.getElementById('screen-multiplayer');
  const player = multiState.players[multiState.currentPlayer];
  const phrase = multiState.phrases[multiState.currentRound];
  const totalPhrases = multiState.roundCount;
  const engineLabel = state.settings.assessmentEngine === 'azure'
    ? `<span class="badge badge-primary">Azure</span>`
    : `<span class="badge badge-muted">Web Speech</span>`;

  screen.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" id="multi-quit-btn" aria-label="${t('nav.back')}">
        ${ICON_BACK}
      </button>
      <h1 class="header-title">${t('multi.title')}</h1>
      <div class="header-actions">${engineLabel}</div>
    </header>

    <div class="screen-body">
      <div class="multi-playing">

        <!-- Turn info -->
        <div class="multi-turn-bar">
          <div class="multi-turn-player">
            <span class="multi-turn-label">${t('multi.turn')}</span>
            <span class="multi-turn-name">${esc(player.name)}</span>
          </div>
          <div class="multi-turn-progress">
            ${t('multi.phraseCount')} ${multiState.currentRound + 1} ${t('multi.of')} ${totalPhrases}
          </div>
        </div>

        <!-- Progress dots -->
        <div class="multi-dots">
          ${multiState.players.map((p, i) => `
            <span class="multi-dot ${i === multiState.currentPlayer ? 'multi-dot--active' : ''}"
                  title="${esc(p.name)}">
              ${esc(p.name.charAt(0).toUpperCase())}
            </span>
          `).join('')}
        </div>

        <!-- Phrase card -->
        <div class="multi-phrase-card" id="multi-phrase-card">
          <p class="multi-phrase-text">${esc(phrase.text)}</p>
          <span class="multi-phrase-diff">&#x2B50; ${phrase.difficulty}/10</span>
        </div>

        <!-- Listen button -->
        <button class="btn btn-secondary" id="multi-listen-btn">
          <span id="multi-listen-icon">&#x1F50A;</span> ${t('practice.listen')}
        </button>

        <!-- Record button -->
        <div class="p-record-wrap">
          <button class="p-record-btn" id="multi-record-btn" aria-label="${t('multi.record')}">
            <span class="p-record-ring" id="multi-record-ring"></span>
            <span class="p-record-dot" id="multi-record-dot"></span>
          </button>
          <span class="p-record-label" id="multi-record-label">${t('multi.record')}</span>
        </div>

        <!-- Status -->
        <div class="p-status" id="multi-status" aria-live="polite"></div>

        <!-- Score reveal (hidden until done) -->
        <div class="multi-score-reveal hidden" id="multi-score-reveal">
          <div class="multi-score-big" id="multi-score-value"></div>
          <div class="multi-score-detail" id="multi-score-detail"></div>
          <button class="btn btn-primary btn-lg" id="multi-next-btn">${t('multi.next')}</button>
        </div>

      </div>
    </div>
  `;

  document.getElementById('multi-quit-btn').addEventListener('click', () => {
    multiState.phase = 'setup';
    navigate('home');
  });

  document.getElementById('multi-listen-btn').addEventListener('click', () => {
    handleMultiListen(phrase.text);
  });

  document.getElementById('multi-record-btn').addEventListener('click', () => {
    handleMultiRecord(phrase.text);
  });

  document.getElementById('multi-next-btn').addEventListener('click', advanceMultiTurn);
}

async function handleMultiListen(text) {
  const btn = document.getElementById('multi-listen-btn');
  const icon = document.getElementById('multi-listen-icon');
  if (!btn) return;
  btn.disabled = true;
  icon.innerHTML = '&#x23F3;';
  try {
    await state.engines.tts.speak(text);
  } catch (_) {}
  btn.disabled = false;
  icon.innerHTML = '&#x1F50A;';
}

async function handleMultiRecord(text) {
  if (multiState.status === 'recording') return;

  state.engines.tts?.stop?.();

  const ringEl   = document.getElementById('multi-record-ring');
  const btnEl    = document.getElementById('multi-record-btn');
  const labelEl  = document.getElementById('multi-record-label');
  const statusEl = document.getElementById('multi-status');
  const listenBtn = document.getElementById('multi-listen-btn');

  multiState.status = 'recording';
  btnEl.classList.add('p-record-btn--recording');
  ringEl?.classList.add('p-record-ring--active');
  labelEl.textContent = t('multi.recording');
  btnEl.disabled = true;
  listenBtn.disabled = true;

  try {
    const result = await state.engines.assessment.assess(text, status => {
      if (status === 'connecting') statusEl.textContent = t('engine.connecting');
      if (status === 'recording')  statusEl.textContent = t('multi.recording');
    });

    multiState.status = 'done';
    multiState.lastResult = result;

    // Store score + detailed breakdown
    const score = Math.round(result.pronScore ?? 0);
    multiState.players[multiState.currentPlayer].scores.push(score);
    multiState.players[multiState.currentPlayer].details.push({
      pronScore:        Math.round(result.pronScore ?? 0),
      accuracyScore:    result.accuracyScore != null ? Math.round(result.accuracyScore) : null,
      fluencyScore:     result.fluencyScore != null ? Math.round(result.fluencyScore) : null,
      completenessScore: result.completenessScore != null ? Math.round(result.completenessScore) : null,
      prosodyScore:     result.prosodyScore != null ? Math.round(result.prosodyScore) : null,
    });

    // Update UI
    btnEl.classList.remove('p-record-btn--recording');
    ringEl?.classList.remove('p-record-ring--active');
    labelEl.textContent = '';
    statusEl.textContent = '';

    // Show score
    const revealEl = document.getElementById('multi-score-reveal');
    const valueEl  = document.getElementById('multi-score-value');
    const detailEl = document.getElementById('multi-score-detail');

    const cls = scoreClass(score);
    valueEl.innerHTML = `<span class="p-score-value--${cls}">${score}</span><span class="multi-score-label"> / 100</span>`;

    const details = [];
    if (result.accuracyScore != null) details.push(`${t('results.accuracy')}: ${Math.round(result.accuracyScore)}`);
    if (result.fluencyScore != null)  details.push(`${t('results.fluency')}: ${Math.round(result.fluencyScore)}`);
    detailEl.textContent = details.join(' · ');

    revealEl.classList.remove('hidden');

    // Hide phrase card to make room
    document.getElementById('multi-phrase-card')?.classList.add('multi-phrase-card--small');

    // Change button text for last turn
    const isLastTurn = isMultiGameOver();
    if (isLastTurn) {
      document.getElementById('multi-next-btn').textContent = t('multi.results');
    }
  } catch (err) {
    multiState.status = 'idle';
    btnEl.classList.remove('p-record-btn--recording');
    ringEl?.classList.remove('p-record-ring--active');
    labelEl.textContent = t('multi.record');
    btnEl.disabled = false;
    listenBtn.disabled = false;
    statusEl.textContent = `Erreur : ${err.message}`;
  }
}

function isMultiGameOver() {
  // Game is over when the last player has completed the last round
  const lastPlayer = multiState.currentPlayer === multiState.players.length - 1;
  const lastRound  = multiState.currentRound === multiState.roundCount - 1;
  return lastPlayer && lastRound;
}

function advanceMultiTurn() {
  if (isMultiGameOver()) {
    // Show final results
    multiState.phase = 'results';
    renderMultiplayerScreen();
    return;
  }

  // Next player
  multiState.currentPlayer++;
  if (multiState.currentPlayer >= multiState.players.length) {
    // Next round
    multiState.currentPlayer = 0;
    multiState.currentRound++;
  }

  multiState.status     = 'idle';
  multiState.lastResult = null;
  renderMultiPlaying();
}

// --- Multiplayer: Results phase ---

function renderMultiResults() {
  const screen = document.getElementById('screen-multiplayer');

  // Compute averages per criterion and rank
  const criteriaKeys = ['pronScore', 'accuracyScore', 'fluencyScore', 'completenessScore', 'prosodyScore'];
  const criteriaLabels = {
    pronScore:         { icon: '🏆', label: t('results.globalScore') || 'Score global' },
    accuracyScore:     { icon: '🎯', label: t('results.accuracy') },
    fluencyScore:      { icon: '🌊', label: t('results.fluency') },
    completenessScore: { icon: '✅', label: t('results.completeness') },
    prosodyScore:      { icon: '🎵', label: t('results.prosody') },
  };

  function avgForCriterion(details, key) {
    const vals = details.map(d => d[key]).filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }

  const ranked = multiState.players
    .map((p, i) => {
      const total = p.scores.reduce((a, b) => a + b, 0);
      const avg   = p.scores.length ? total / p.scores.length : 0;
      const criteriaAvgs = {};
      for (const key of criteriaKeys) {
        criteriaAvgs[key] = avgForCriterion(p.details || [], key);
      }
      return { ...p, avg: Math.round(avg), total, index: i, criteriaAvgs };
    })
    .sort((a, b) => b.avg - a.avg);

  // Determine which criteria are available (at least one player has data)
  const availableCriteria = criteriaKeys.filter(key =>
    ranked.some(p => p.criteriaAvgs[key] != null)
  );

  const winner = ranked[0];
  const isTie  = ranked.length > 1 && ranked[0].avg === ranked[1].avg;

  screen.innerHTML = `
    <header class="app-header">
      <h1 class="header-title">${t('multi.results')}</h1>
    </header>

    <div class="screen-body">
      <div class="multi-results">

        <!-- Winner announcement -->
        <div class="multi-winner-card">
          <div class="multi-trophy">&#x1F3C6;</div>
          <div class="multi-winner-name">${isTie ? t('multi.tie') : esc(winner.name)}</div>
          <div class="multi-winner-score">${winner.avg} / 100</div>
        </div>

        <!-- Full ranking with detailed scores -->
        <div class="multi-ranking">
          <p class="p-label">${t('multi.rank')}</p>
          <div class="multi-ranking-list">
            ${ranked.map((p, i) => {
              const medal = i === 0 ? '&#x1F947;' : i === 1 ? '&#x1F948;' : i === 2 ? '&#x1F949;' : `${i + 1}.`;
              const cls   = scoreClass(p.avg);
              return `
                <div class="multi-rank-card">
                  <div class="multi-rank-header">
                    <span class="multi-rank-medal">${medal}</span>
                    <span class="multi-rank-name">${esc(p.name)}</span>
                    <span class="multi-rank-avg p-score-value--${cls}">${p.avg}</span>
                  </div>
                  <div class="multi-rank-details">
                    ${availableCriteria.map(key => {
                      const v = p.criteriaAvgs[key];
                      if (v == null) return '';
                      const c = scoreClass(v);
                      const meta = criteriaLabels[key];
                      return `
                        <div class="multi-detail-row">
                          <span class="multi-detail-label">${meta.icon} ${meta.label}</span>
                          <div class="multi-detail-bar-track">
                            <div class="multi-detail-bar-fill p-score-fill--${c}" style="width:${v}%"></div>
                          </div>
                          <span class="multi-detail-value p-score-value--${c}">${v}</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                  <div class="multi-rank-rounds">
                    ${p.scores.map((s, ri) => `<span class="multi-round-chip p-score-value--${scoreClass(s)}" title="Round ${ri + 1}">${s}</span>`).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Actions -->
        <div class="multi-result-actions">
          <button class="btn btn-primary btn-lg" id="multi-replay-btn">${t('multi.playAgain')}</button>
          <button class="btn btn-secondary" id="multi-home-btn">${t('multi.backHome')}</button>
        </div>

      </div>
    </div>
  `;

  document.getElementById('multi-replay-btn').addEventListener('click', () => {
    multiState.phase = 'setup';
    renderMultiplayerScreen();
  });

  document.getElementById('multi-home-btn').addEventListener('click', () => {
    multiState.phase = 'setup';
    navigate('home');
  });
}

// ===========================================================================
// Results screen (stub — expanded in Part 2)
// ===========================================================================

function renderResultsScreen() {
  const screen = document.getElementById('screen-results');
  screen.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" id="results-back-btn" aria-label="${t('nav.back')}">
        ${ICON_BACK}
      </button>
      <h1 class="header-title">${t('results.title')}</h1>
    </header>

    <div class="screen-body">
      <div class="results-main">
        <div class="coming-soon-icon">📊</div>
        <h2 class="coming-soon-title">${t('results.title')}</h2>
        <p class="coming-soon-text">${t('results.coming')}</p>
        <button class="btn btn-secondary" id="results-back-btn2">${t('nav.back')}</button>
      </div>
    </div>
  `;

  document.getElementById('results-back-btn').addEventListener('click', () => navigate('home'));
  document.getElementById('results-back-btn2').addEventListener('click', () => navigate('home'));
}

// ===========================================================================
// Settings screen
// ===========================================================================

function renderSettingsScreen() {
  const screen = document.getElementById('screen-settings');
  pendingSettings = { ...state.settings };

  const s          = pendingSettings;
  const azureVisible = s.ttsEngine === 'azure' || s.assessmentEngine === 'azure';

  screen.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" id="settings-back-btn" aria-label="${t('nav.back')}">
        ${ICON_BACK}
      </button>
      <h1 class="header-title">${t('settings.title')}</h1>
    </header>

    <div class="screen-body">
      <div class="settings-main">
        <div class="settings-body">

          <!-- TTS Engine -->
          <section class="settings-section">
            <p class="settings-section-title">${t('settings.ttsEngine.label')}</p>
            <div class="toggle-group" id="tts-engine-toggle" role="group" aria-label="${t('settings.ttsEngine.label')}">
              <button class="toggle-option ${s.ttsEngine === 'web' ? 'active' : ''}"
                      data-value="web" type="button">
                ${t('settings.ttsEngine.web')}
              </button>
              <button class="toggle-option ${s.ttsEngine === 'azure' ? 'active' : ''}"
                      data-value="azure" type="button">
                ${t('settings.ttsEngine.azure')}
              </button>
            </div>
          </section>

          <!-- Assessment Engine -->
          <section class="settings-section">
            <p class="settings-section-title">${t('settings.assessmentEngine.label')}</p>
            <div class="toggle-group" id="assessment-engine-toggle" role="group" aria-label="${t('settings.assessmentEngine.label')}">
              <button class="toggle-option ${s.assessmentEngine === 'azure' ? 'active' : ''}"
                      data-value="azure" type="button">
                ${t('settings.assessmentEngine.azure')}
              </button>
              <button class="toggle-option ${s.assessmentEngine === 'web' ? 'active' : ''}"
                      data-value="web" type="button">
                ${t('settings.assessmentEngine.web')}
              </button>
            </div>
          </section>

          <!-- Azure Credentials (conditional) -->
          <section class="settings-section azure-settings-section ${azureVisible ? '' : 'hidden'}"
                   id="azure-settings-section"
                   style="max-height: ${azureVisible ? '1000px' : '0'}">
            <p class="settings-section-title">${t('settings.azureSection')}</p>

            <div class="form-group">
              <label class="form-label" for="azure-api-key">${t('settings.azureApiKey.label')}</label>
              <input class="form-input" type="password" id="azure-api-key"
                     value="${esc(s.azureApiKey)}"
                     placeholder="${t('settings.azureApiKey.placeholder')}"
                     autocomplete="off" autocorrect="off" spellcheck="false">
            </div>

            <div class="form-group">
              <label class="form-label" for="azure-region">${t('settings.azureRegion.label')}</label>
              <select class="form-select" id="azure-region">
                ${AZURE_REGIONS.map(r =>
                  `<option value="${esc(r.value)}" ${s.azureRegion === r.value ? 'selected' : ''}>${esc(r.label)}</option>`
                ).join('')}
              </select>
            </div>

            <div>
              <button class="btn btn-secondary btn-sm" id="test-connection-btn" type="button">
                ${t('settings.testConnection')}
              </button>
              <div class="connection-status" id="connection-status"></div>
            </div>
          </section>

          <!-- Accent Target -->
          <section class="settings-section">
            <p class="settings-section-title">${t('settings.accentTarget.label')}</p>
            <div class="toggle-group" id="accent-toggle" role="group" aria-label="${t('settings.accentTarget.label')}">
              <button class="toggle-option ${s.accentTarget === 'us' ? 'active' : ''}"
                      data-value="us" type="button">
                🇺🇸 ${t('settings.accentTarget.us')}
              </button>
              <button class="toggle-option ${s.accentTarget === 'uk' ? 'active' : ''}"
                      data-value="uk" type="button">
                🇬🇧 ${t('settings.accentTarget.uk')}
              </button>
            </div>
          </section>

          <!-- TTS Voice -->
          <section class="settings-section">
            <p class="settings-section-title">${t('settings.ttsVoice.label')}</p>
            <select class="form-select" id="tts-voice-select">
              <option value="">${t('settings.ttsVoice.loading')}</option>
            </select>
          </section>

          <!-- UI Preferences -->
          <section class="settings-section">
            <p class="settings-section-title">${t('settings.preferences')}</p>

            <div class="form-group">
              <label class="form-label" for="ui-language">${t('settings.language.label')}</label>
              <select class="form-select" id="ui-language">
                <option value="fr" ${s.language === 'fr' ? 'selected' : ''}>🇫🇷 Français</option>
                <option value="en" ${s.language === 'en' ? 'selected' : ''}>🇬🇧 English</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="ui-theme">${t('settings.theme.label')}</label>
              <select class="form-select" id="ui-theme">
                <option value="dark"  ${s.theme === 'dark'  ? 'selected' : ''}>${t('settings.theme.dark')}</option>
                <option value="light" ${s.theme === 'light' ? 'selected' : ''}>${t('settings.theme.light')}</option>
                <option value="japan" ${s.theme === 'japan' ? 'selected' : ''}>${t('settings.theme.japan')}</option>
              </select>
            </div>
          </section>

          <!-- Results Display -->
          <section class="settings-section">
            <p class="settings-section-title">Affichage des résultats / Results Animation</p>
            <div class="toggle-group" id="results-display-toggle" role="group" aria-label="Results Animation">
              <button class="toggle-option ${s.resultsDisplay === 'classic' ? 'active' : ''}"
                      data-value="classic" type="button">
                Classic
              </button>
              <button class="toggle-option ${s.resultsDisplay !== 'classic' ? 'active' : ''}"
                      data-value="ninja" type="button">
                Ninja
              </button>
            </div>
          </section>

          <!-- Save button -->
          <div style="padding: var(--space-6) 0 var(--space-4)">
            <button class="btn btn-primary btn-full" id="save-settings-btn" type="button">
              ${t('settings.save')}
            </button>
          </div>

        </div>
      </div>
    </div>
  `;

  attachSettingsEvents();
  populateVoiceList();
}

// ---------------------------------------------------------------------------
// Settings screen event wiring
// ---------------------------------------------------------------------------

function attachSettingsEvents() {
  // Back button
  document.getElementById('settings-back-btn').addEventListener('click', () => navigate('home'));

  // TTS engine toggle
  wireToggleGroup('tts-engine-toggle', value => {
    pendingSettings.ttsEngine = value;
    updateAzureVisibility();
    populateVoiceList();
  });

  // Assessment engine toggle
  wireToggleGroup('assessment-engine-toggle', value => {
    pendingSettings.assessmentEngine = value;
    updateAzureVisibility();
  });

  // Accent toggle
  wireToggleGroup('accent-toggle', value => {
    pendingSettings.accentTarget = value;
    populateVoiceList();
  });

  // Results display toggle
  wireToggleGroup('results-display-toggle', value => {
    pendingSettings.resultsDisplay = value;
  });

  // Live-update pending settings from text inputs / selects
  const liveFields = ['azure-api-key', 'azure-region', 'ui-language', 'ui-theme', 'tts-voice-select'];
  liveFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (id === 'azure-api-key')    pendingSettings.azureApiKey    = el.value;
      if (id === 'azure-region')     pendingSettings.azureRegion    = el.value;
      if (id === 'ui-language')      pendingSettings.language       = el.value;
      if (id === 'ui-theme')         pendingSettings.theme          = el.value;
      if (id === 'tts-voice-select') pendingSettings.ttsVoice       = el.value;

      // Live theme preview
      if (id === 'ui-theme') {
        document.documentElement.dataset.theme = el.value;
      }
    });
  });

  // Test Azure connection
  const testBtn = document.getElementById('test-connection-btn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('connection-status');
      statusEl.textContent = t('settings.testing');
      statusEl.className   = 'connection-status';
      testBtn.disabled = true;

      // Temporarily build an engine with pending settings to test
      const { AzureAssessmentEngine } = await import('./engines.js');
      const engine = new AzureAssessmentEngine(pendingSettings);
      try {
        await engine.testConnection();
        statusEl.textContent = t('settings.connectionOk');
        statusEl.className   = 'connection-status connection-status--ok';
      } catch (err) {
        statusEl.textContent = `${t('settings.connectionFail')}: ${err.message}`;
        statusEl.className   = 'connection-status connection-status--fail';
      } finally {
        testBtn.disabled = false;
      }
    });
  }

  // Save button
  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    btn.textContent = '…';
    try {
      await persistSettings(pendingSettings);
      setLanguage(state.settings.language);
      document.documentElement.dataset.theme = state.settings.theme;
      showToast(t('settings.saved'), 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('settings.save');
    }
  });
}

/** Wire a toggle group — marks active button and calls onChange(value). */
function wireToggleGroup(groupId, onChange) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.toggle-option').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.toggle-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
    });
  });
}

/** Show or hide the Azure credentials section based on pending engine selections. */
function updateAzureVisibility() {
  const section = document.getElementById('azure-settings-section');
  if (!section) return;
  const show = pendingSettings.ttsEngine === 'azure' || pendingSettings.assessmentEngine === 'azure';
  if (show) {
    section.classList.remove('hidden');
    section.style.maxHeight = '1000px';
  } else {
    section.classList.add('hidden');
    section.style.maxHeight = '0';
  }
}

/** Populate the TTS voice dropdown based on pendingSettings.ttsEngine and accentTarget. */
function populateVoiceList() {
  const select = document.getElementById('tts-voice-select');
  if (!select) return;

  const { ttsEngine, accentTarget, ttsVoice } = pendingSettings;

  if (ttsEngine === 'azure') {
    const voices = AZURE_VOICES[accentTarget] ?? AZURE_VOICES.us;
    select.innerHTML = voices.map(v =>
      `<option value="${esc(v.name)}" ${ttsVoice === v.name ? 'selected' : ''}>${esc(v.label)}</option>`
    ).join('');
    return;
  }

  // Web Speech API
  const lang = accentTarget === 'uk' ? 'en-GB' : 'en-US';

  function renderWebVoices() {
    const all = window.speechSynthesis?.getVoices() ?? [];
    const filtered = all
      .filter(v => v.lang.startsWith(lang))
      .sort((a, b) => webVoicePriority(a) - webVoicePriority(b));

    if (filtered.length === 0) {
      select.innerHTML = `<option value="">${t('settings.ttsVoice.none')}</option>`;
      return;
    }

    select.innerHTML =
      `<option value="">${t('settings.ttsVoice.default')}</option>` +
      filtered.map(v =>
        `<option value="${esc(v.name)}" ${ttsVoice === v.name ? 'selected' : ''}>${esc(v.name)}</option>`
      ).join('');
  }

  if (window.speechSynthesis?.getVoices().length > 0) {
    renderWebVoices();
  } else {
    select.innerHTML = `<option value="">${t('settings.ttsVoice.loading')}</option>`;
    window.speechSynthesis?.addEventListener('voiceschanged', renderWebVoices, { once: true });
  }
}

// ===========================================================================
// Service Worker registration
// ===========================================================================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('[AccentNinja] SW registration failed:', err);
      });
    });
  }
}

// ===========================================================================
// App initialisation
// ===========================================================================

async function init() {
  showSplash();

  try {
    state.db = await openDB();
    await loadSettings();
  } catch (err) {
    console.error('[AccentNinja] DB init failed, using defaults:', err);
  }

  // Apply language + theme from saved settings
  setLanguage(state.settings.language);
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.lang = state.settings.language;

  // Initialise engines
  reinitEngines();

  // Determine initial screen
  if (state.settings.firstLaunch) {
    navigate('setup');
  } else {
    // Honour hash if present
    const hash = window.location.hash.slice(1);
    const validScreens = ['home', 'settings', 'practice', 'results', 'multiplayer'];
    navigate(validScreens.includes(hash) ? hash : 'home');
  }

  registerServiceWorker();
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
