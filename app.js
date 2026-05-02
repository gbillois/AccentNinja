/* AccentNinja — Core Application
 * Routing, state, IndexedDB, and screen rendering.
 * Screens: splash → setup (first launch) or home → settings / practice / results
 */

import { createTTSEngine, createAssessmentEngine, AZURE_VOICES, AZURE_REGIONS, webVoicePriority } from './engines.js';
import { t, setLanguage } from './i18n.js';
import { CORPUS, MULTIPLAYER_PHRASES, MULTIPLAYER_FUN_PHRASES } from './corpus.js';
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
  // Per-level stats keyed by level number:
  //   { [num]: { completions: int, bestScore: int, lastScore: int } }
  levelStats:       {},
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

// Level practice session state (Levels 1–10)
const levelState = {
  levelNum:     null,   // which level (1–10)
  itemIndex:    0,      // current item index within level
  results:      [],     // { item, result } per completed item
  status:       'idle', // 'idle' | 'recording' | 'done'
  recordingBlob: null,
  lastResult:    null,
  completionRecorded: false,  // guard so the completion counter ticks once per run
};

// Multiplayer state
const multiState = {
  phase:        'setup',  // 'setup' | 'playing' | 'results'
  playerCount:  2,
  roundCount:   5,        // phrases per player
  funMode:      false,    // tongue-twister / fun phrases instead of pedagogical ones
  players:      [],       // { name, scores: number[], details: object[] }
  currentPlayer: 0,
  currentRound:  0,
  phrases:      [],       // selected phrases for the game
  status:       'idle',   // 'idle' | 'recording' | 'processing' | 'done'
  lastResult:   null,
  recordingBlob: null,
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
    case 'level':       renderLevelScreen();       break;
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

        <div>
          <p class="home-section-title">${t('home.title')}</p>
        </div>

        <div class="level-grid" id="level-grid">
          ${levels.map(([num, level]) => {
            const hasItems    = level.items?.length > 0;
            const locked      = !hasItems;
            const name        = state.settings.language === 'en'
              ? (level.nameEn || level.name)
              : level.name;
            const stats       = state.settings.levelStats?.[num];
            const completions = stats?.completions || 0;
            const bestScore   = stats?.bestScore   || 0;
            return `
              <button
                class="level-card ${locked ? 'level-card--locked' : ''} ${completions > 0 ? 'level-card--complete' : ''}"
                data-level="${num}"
                ${locked ? 'aria-disabled="true"' : ''}
                title="${esc(name)}"
              >
                ${completions > 0 ? `<span class="level-badge" title="${completions} ${t('home.level.timesCompleted')}">${completions}×</span>` : ''}
                <span class="level-number">${num}</span>
                <span class="level-icon">${locked ? '🔒' : '⚡'}</span>
                <span class="level-name">${esc(name)}</span>
                ${completions > 0 ? `<span class="level-best">${bestScore}%</span>` : ''}
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

        <!-- Sandbox button -->
        <button class="level0-card" id="level0-btn">
          <span class="level0-icon">🎯</span>
          <div class="level0-text">
            <span class="level0-title">Bac à sable</span>
            <span class="level0-sub">Testez n'importe quelle phrase</span>
          </div>
          <span class="level0-arrow">→</span>
        </button>

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
    btn.addEventListener('click', () => {
      const num = parseInt(btn.dataset.level, 10);
      levelState.levelNum    = num;
      levelState.itemIndex   = 0;
      levelState.results     = [];
      levelState.status      = 'idle';
      levelState.lastResult  = null;
      levelState.recordingBlob = null;
      levelState.completionRecorded = false;
      navigate('level');
    });
  });
}

// ---------------------------------------------------------------------------
// Level stats — persistent counter of completions / best score per level
// ---------------------------------------------------------------------------

function recordLevelCompletion(levelNum, avgScore) {
  const stats   = { ...(state.settings.levelStats || {}) };
  const current = { ...(stats[levelNum] || { completions: 0, bestScore: 0, lastScore: 0 }) };
  current.completions = (current.completions || 0) + 1;
  current.bestScore   = Math.max(current.bestScore || 0, avgScore);
  current.lastScore   = avgScore;
  stats[levelNum]     = current;
  // Fire-and-forget: in-memory state.settings is updated synchronously inside
  // persistSettings, so the home screen sees the new value on next render.
  persistSettings({ levelStats: stats }).catch(() => {});
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

        <!-- Recording playback (shown after any recording attempt) -->
        <button class="btn btn-ghost btn-sm" id="p-playback-btn" style="display:${practiceState.recordingBlob ? '' : 'none'}">
          &#x25B6; Écouter mon enregistrement
        </button>

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

  document.getElementById('p-playback-btn').addEventListener('click', () => {
    if (!practiceState.recordingBlob) return;
    const url = URL.createObjectURL(practiceState.recordingBlob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  });

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
  if (practiceState.status === 'recording') {
    state.engines.assessment.stop?.();
    setRecordUI('processing');
    practiceState.status = 'processing';
    setStatus('');
    return;
  }
  if (practiceState.status === 'processing') return;

  const phrase = document.getElementById('phrase-input')?.value?.trim();
  if (!phrase) {
    setStatus(t('error.emptyPhrase'), 'warn');
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
      applyAssessmentStatus(setStatus, status);
    });

    if (!isValidAssessment(result)) {
      practiceState.status = 'idle';
      practiceState.result = null;
      practiceState.recordingBlob = result.recordingBlob ?? null;
      setRecordUI('idle');
      if (isAbortedAssessment(result)) {
        setStatus('');
      } else {
        setStatus(describeAssessmentFailure(result), 'error');
      }
      return;
    }

    practiceState.status        = 'done';
    practiceState.result        = result;
    practiceState.recordingBlob = result.recordingBlob ?? null;

    setRecordUI('done');
    setStatus('');
    showResults(result);
  } catch (err) {
    practiceState.status = 'idle';
    setRecordUI('idle');
    setStatus(describeAssessmentError(err), 'error');
  }
}

/** True if the assessment produced a usable score. */
function isValidAssessment(result) {
  if (!result) return false;
  const score = Number(result.pronScore);
  return Number.isFinite(score) && score > 0;
}

/** True if the assessment was deliberately stopped by the user (no error to display). */
function isAbortedAssessment(result) {
  return result?.raw?.error === 'Aborted';
}

/** Map an error code (from the engine or a raw.error tag) to a user message. */
function messageForErrorCode(code) {
  switch (code) {
    case 'SilentAudio':  return t('error.silentAudio');
    case 'NoMatch':      return t('error.noMatch');
    case 'NoMic':        return t('error.noMic');
    case 'Timeout':      return t('error.timeout');
    case 'Network':      return t('error.networkError');
    case 'Aborted':      return t('error.recordFailed');
    case 'Auth':         return t('error.auth');
    case 'RateLimited':  return t('error.rateLimited');
    case 'Service':      return t('error.service');
    case 'SdkNotLoaded': return t('error.sdkNotLoaded');
    case 'Unknown':      return t('error.unknown');
    default:             return t('error.recordFailed');
  }
}

/**
 * Append a short technical detail (errorDetails from the SDK / message from
 * a thrown Error) to a user-facing error message. Helps the user (and us)
 * diagnose recurring failures instead of always seeing the generic toast.
 */
function appendErrorDetail(baseMessage, code, detail) {
  if (!detail) return baseMessage;
  // Don't expose details for benign/self-explanatory codes.
  if (code === 'SilentAudio' || code === 'NoMic' || code === 'NoMatch') {
    return baseMessage;
  }
  // Truncate verbose Azure errors that include the entire URL/headers.
  const trimmed = String(detail).replace(/\s+/g, ' ').trim();
  const short = trimmed.length > 140 ? trimmed.slice(0, 137) + '…' : trimmed;
  return `${baseMessage} (${t('error.detail')}: ${short})`;
}

function describeAssessmentFailure(result) {
  const code   = result?.raw?.error;
  const detail = result?.raw?.errorDetail;
  if (code && code !== 'SilentAudio' && code !== 'NoMatch' && code !== 'NoMic') {
    console.warn('[AccentNinja] Assessment failure:', { code, detail, result });
  }
  return appendErrorDetail(messageForErrorCode(code), code, detail);
}

function describeAssessmentError(err) {
  if (err?.code) {
    console.warn('[AccentNinja] Assessment error:', { code: err.code, message: err.message });
    return appendErrorDetail(messageForErrorCode(err.code), err.code, err.message);
  }
  // getUserMedia rejections from startParallelRecorder are plain Errors
  // without a code field — detect them by message.
  if (/access denied|permission|NotAllowed/i.test(err?.message || '')) {
    return t('error.noMic');
  }
  console.warn('[AccentNinja] Assessment error (uncoded):', err);
  return `${t('error.unknown')} (${t('error.detail')}: ${err?.message || err})`;
}

/**
 * Apply an engine status event to a status-setter callback.
 * Handles the shared 'connecting' / 'countdown-N' / 'recording' status keys.
 */
function applyAssessmentStatus(setter, status) {
  switch (status) {
    case 'connecting':
      setter(t('engine.connecting'));
      break;
    case 'countdown-3':
      setter(t('engine.countdown3'), 'countdown');
      break;
    case 'countdown-2':
      setter(t('engine.countdown2'), 'countdown');
      break;
    case 'countdown-1':
      setter(t('engine.countdown1'), 'countdown');
      break;
    case 'recording':
      setter(t('engine.recording'));
      break;
    default: {
      // Retry status: 'retrying-1' / 'retrying-2'
      const m = typeof status === 'string' && status.match(/^retrying-(\d+)$/);
      if (m) {
        const attempt = m[1];
        // Total = number of retry attempts configured in engines.js (currently 2).
        const total = '2';
        const msg = t('engine.retrying')
          .replace('{attempt}', attempt)
          .replace('{total}', total);
        setter(msg, 'retrying');
      }
      break;
    }
  }
}

function setStatus(text, type = '') {
  setStatusEl(document.getElementById('p-status'), text, type);
}

function setStatusEl(el, text, type = '') {
  if (!el) return;
  el.textContent = text;
  el.className   = `p-status${type ? ` p-status--${type}` : ''}`;
  if (type === 'countdown') {
    // Force a reflow so the pulse animation restarts on each countdown tick,
    // since only the text content (not the class) changes between 3/2/1.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
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

  const playbackBtn = document.getElementById('p-playback-btn');

  if (status === 'recording') {
    label.textContent = t('practice.stop');
    btn.disabled = false;
    listenBtn.disabled = true;
    if (playbackBtn) playbackBtn.style.display = 'none';
  } else if (status === 'processing') {
    label.textContent = 'Analyse…';
    btn.disabled = true;
    listenBtn.disabled = true;
    if (playbackBtn) playbackBtn.style.display = 'none';
  } else {
    label.textContent = 'Appuyer pour enregistrer';
    btn.disabled = false;
    listenBtn.disabled = false;
    if (playbackBtn) playbackBtn.style.display = practiceState.recordingBlob ? '' : 'none';
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

  // Zero-score results are rejected in handleRecord before reaching here,
  // so the error banner element is always hidden.
  document.getElementById('p-error-banner')?.classList.add('hidden');

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
// Level practice screen — Levels 1–10
// ===========================================================================

function renderLevelScreen() {
  const level = CORPUS[levelState.levelNum];
  if (!level) { navigate('home'); return; }

  // If all items done, show summary
  if (levelState.itemIndex >= level.items.length) {
    renderLevelSummary();
    return;
  }

  const item        = level.items[levelState.itemIndex];
  const total       = level.items.length;
  const current     = levelState.itemIndex + 1;
  const levelName   = state.settings.language === 'en'
    ? (level.nameEn || level.name)
    : level.name;
  const engineLabel = state.settings.assessmentEngine === 'azure'
    ? `<span class="badge badge-primary">Azure</span>`
    : `<span class="badge badge-muted">Web Speech</span>`;

  const isLast = levelState.itemIndex === total - 1;

  const screen = document.getElementById('screen-level');
  screen.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" id="level-back-btn" aria-label="${t('nav.back')}">
        ${ICON_BACK}
      </button>
      <h1 class="header-title">${t('home.level')} ${levelState.levelNum}</h1>
      <div class="header-actions">${engineLabel}</div>
    </header>

    <div class="screen-body">
      <div class="practice-level">

        <!-- Progress bar -->
        <div class="lv-progress">
          <div class="lv-progress-bar">
            <div class="lv-progress-fill" style="width:${Math.round((levelState.itemIndex / total) * 100)}%"></div>
          </div>
          <span class="lv-progress-label">${t('level.item')} ${current} ${t('level.of')} ${total}</span>
        </div>

        <!-- Item card -->
        <div class="lv-item-card">
          <p class="lv-item-type">${esc(item.type)}</p>
          <p class="lv-item-text">${esc(item.text)}</p>
          <p class="lv-item-ipa">${esc(item.ipa)}</p>
          <p class="lv-item-translation">${esc(item.translation)}</p>

          ${item.focusPhonemes?.length ? `
            <div class="lv-phonemes">
              ${item.focusPhonemes.map(p => `<span class="lv-phoneme-badge">/${esc(p)}/</span>`).join('')}
            </div>
          ` : ''}
        </div>

        ${item.tips?.length ? `
          <details class="lv-tips">
            <summary class="lv-tips-summary">💡 ${t('level.tips')}</summary>
            <ul class="lv-tips-list">
              ${item.tips.map(tip => `<li>${esc(tip)}</li>`).join('')}
            </ul>
          </details>
        ` : ''}

        <!-- Listen button -->
        <button class="btn btn-secondary p-listen-btn" id="lv-listen-btn">
          <span id="lv-listen-icon">🔊</span> ${t('level.listen')}
        </button>

        <div class="p-divider">puis répétez</div>

        <!-- Record button -->
        <div class="p-record-wrap">
          <button class="p-record-btn" id="lv-record-btn" aria-label="${t('level.record')}">
            <span class="p-record-ring" id="lv-record-ring"></span>
            <span class="p-record-dot" id="lv-record-dot"></span>
          </button>
          <span class="p-record-label" id="lv-record-label">${t('level.record')}</span>
        </div>

        <!-- Status -->
        <div class="p-status" id="lv-status" aria-live="polite"></div>

        <!-- Results (hidden until done) -->
        <div class="p-results hidden" id="lv-results">
          <div class="p-scores" id="lv-scores"></div>

          <div class="p-words-wrap">
            <p class="p-label">${t('level.wordAnalysis')}</p>
            <div class="p-words" id="lv-words"></div>
          </div>

          <div class="p-actions">
            <button class="btn btn-ghost btn-sm" id="lv-replay-btn" style="display:none">
              ▶ Réécouter mon enregistrement
            </button>
            <button class="btn btn-secondary" id="lv-retry-btn">🔄 ${t('level.retry')}</button>
            <button class="btn btn-primary" id="lv-next-btn">
              ${isLast ? t('level.finish') : t('level.next')} →
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  // Back button
  document.getElementById('level-back-btn').addEventListener('click', () => {
    state.engines.tts?.stop?.();
    state.engines.assessment?.stop?.();
    levelState.status = 'idle';
    navigate('home');
  });

  // Listen
  document.getElementById('lv-listen-btn').addEventListener('click', () => handleLvListen(item.text));

  // Record
  document.getElementById('lv-record-btn').addEventListener('click', () => handleLvRecord(item));

  // Retry
  document.getElementById('lv-retry-btn').addEventListener('click', resetLvPractice);

  // Next / Finish
  document.getElementById('lv-next-btn').addEventListener('click', advanceLevelItem);

  // Restore result if navigating back to a completed item
  if (levelState.status === 'done' && levelState.lastResult) {
    showLvResults(levelState.lastResult);
  }
}

async function handleLvListen(text) {
  const btn    = document.getElementById('lv-listen-btn');
  const iconEl = document.getElementById('lv-listen-icon');
  if (!btn) return;
  btn.disabled    = true;
  iconEl.textContent = '⏳';
  try {
    await state.engines.tts.speak(text);
  } catch (err) {
    showToast(`Erreur TTS : ${err.message}`, 'error');
  } finally {
    btn.disabled       = false;
    iconEl.textContent = '🔊';
  }
}

async function handleLvRecord(item) {
  if (levelState.status === 'recording') {
    state.engines.assessment.stop?.();
    return;
  }

  state.engines.tts?.stop?.();
  document.getElementById('lv-results')?.classList.add('hidden');

  setLvRecordUI('recording');
  levelState.status = 'recording';

  const statusEl = document.getElementById('lv-status');

  try {
    const result = await state.engines.assessment.assess(item.text, status => {
      applyAssessmentStatus(
        (text, type) => setStatusEl(statusEl, text, type),
        status
      );
    });

    if (!isValidAssessment(result)) {
      levelState.status = 'idle';
      levelState.lastResult = null;
      setLvRecordUI('idle');
      if (isAbortedAssessment(result)) {
        setStatusEl(statusEl, '');
      } else {
        setStatusEl(statusEl, describeAssessmentFailure(result), 'error');
      }
      return;
    }

    levelState.status        = 'done';
    levelState.lastResult    = result;
    levelState.recordingBlob = result.recordingBlob ?? null;

    setLvRecordUI('done');
    setStatusEl(statusEl, '');
    showLvResults(result);
  } catch (err) {
    levelState.status = 'idle';
    setLvRecordUI('idle');
    setStatusEl(statusEl, describeAssessmentError(err), 'error');
  }
}

function setLvRecordUI(status) {
  const btn       = document.getElementById('lv-record-btn');
  const ring      = document.getElementById('lv-record-ring');
  const label     = document.getElementById('lv-record-label');
  const listenBtn = document.getElementById('lv-listen-btn');
  if (!btn) return;

  btn.classList.toggle('p-record-btn--recording',  status === 'recording');
  btn.classList.toggle('p-record-btn--processing', status === 'processing');
  ring?.classList.toggle('p-record-ring--active',  status === 'recording');

  if (status === 'recording') {
    label.textContent  = t('practice.stop');
    btn.disabled       = false;
    if (listenBtn) listenBtn.disabled = true;
  } else if (status === 'processing') {
    label.textContent  = t('engine.processing');
    btn.disabled       = true;
    if (listenBtn) listenBtn.disabled = true;
  } else {
    label.textContent  = t('level.record');
    btn.disabled       = false;
    if (listenBtn) listenBtn.disabled = false;
  }
}

function resetLvPractice() {
  levelState.status        = 'idle';
  levelState.lastResult    = null;
  levelState.recordingBlob = null;
  setLvRecordUI('idle');
  const statusEl = document.getElementById('lv-status');
  if (statusEl) setStatusEl(statusEl, '');
  document.getElementById('lv-results')?.classList.add('hidden');
}

function showLvResults(result) {
  if (state.settings.resultsDisplay === 'ninja') {
    showLvNinjaResults(result);
    return;
  }
  showLvClassicResults(result);
}

function showLvNinjaResults(result) {
  if (!state.audioCtx) {
    try { state.audioCtx = new AudioContext(); } catch (_) {}
  }
  if (state.audioCtx?.state === 'suspended') state.audioCtx.resume().catch(() => {});

  const level   = CORPUS[levelState.levelNum];
  const item    = level.items[levelState.itemIndex];
  const isLast  = levelState.itemIndex === level.items.length - 1;
  const container = document.getElementById('screen-level');

  function onListen() {
    state.engines.tts?.speak(item.text).catch(err => showToast(`Erreur TTS : ${err.message}`, 'error'));
  }
  function onListenSlow() {
    if (window.speechSynthesis && state.settings.ttsEngine === 'web') {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
      const doSlow = () => {
        const utt   = new SpeechSynthesisUtterance(item.text);
        const lang  = state.settings.accentTarget === 'uk' ? 'en-GB' : 'en-US';
        const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(lang));
        if (voices.length) utt.voice = voices[0];
        utt.lang = lang;
        utt.rate = 0.7;
        window.speechSynthesis.speak(utt);
      };
      setTimeout(doSlow, 50);
    } else {
      state.engines.tts?.speak(item.text).catch(err => showToast(`Erreur TTS : ${err.message}`, 'error'));
    }
  }

  // Store result before ninja animation consumes the screen
  levelState.results.push({ item, result });

  playNinjaAnimation(container, result, {
    audioCtx:      state.audioCtx,
    phrase:        item.text,
    recordingBlob: levelState.recordingBlob,
    onListen,
    onListenSlow,
    onRetry: () => {
      // Remove the result we just pushed so it isn't double-counted on retry
      levelState.results.pop();
      levelState.status        = 'idle';
      levelState.lastResult    = null;
      levelState.recordingBlob = null;
      renderLevelScreen();
    },
    onNext: () => {
      // result already pushed above
      levelState.itemIndex++;
      levelState.status        = 'idle';
      levelState.lastResult    = null;
      levelState.recordingBlob = null;
      renderLevelScreen();
    },
    onComplete: () => {},
  });
}

function showLvClassicResults(result) {
  const resultsEl = document.getElementById('lv-results');
  if (!resultsEl) return;
  resultsEl.classList.remove('hidden');

  // Score items
  const scoresEl   = document.getElementById('lv-scores');
  const scoreItems = [
    { label: t('results.globalScore'), value: result.pronScore,         icon: '🏆' },
    { label: t('results.accuracy'),    value: result.accuracyScore,     icon: '🎯' },
    { label: t('results.fluency'),     value: result.fluencyScore,      icon: '🌊' },
    { label: t('results.completeness'),value: result.completenessScore, icon: '✅' },
  ];
  if (result.prosodyScore != null) {
    scoreItems.push({ label: t('results.prosody'), value: result.prosodyScore, icon: '🎵' });
  }

  scoresEl.innerHTML = scoreItems.map(item => {
    const v   = Math.round(item.value ?? 0);
    const cls = scoreClass(v);
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
  const wordsEl = document.getElementById('lv-words');
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

  // Replay button
  const replayBtn = document.getElementById('lv-replay-btn');
  if (replayBtn && levelState.recordingBlob) {
    replayBtn.style.display = 'inline-flex';
    replayBtn.onclick = () => {
      const url   = URL.createObjectURL(levelState.recordingBlob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    };
  }
}

function advanceLevelItem() {
  const level  = CORPUS[levelState.levelNum];
  const result = levelState.lastResult;

  // Record result for this item (classic mode; ninja mode already pushed)
  if (result && state.settings.resultsDisplay !== 'ninja') {
    levelState.results.push({ item: level.items[levelState.itemIndex], result });
  }

  levelState.itemIndex++;
  levelState.status        = 'idle';
  levelState.lastResult    = null;
  levelState.recordingBlob = null;

  renderLevelScreen(); // will call renderLevelSummary() when itemIndex >= items.length
}

// ---------------------------------------------------------------------------
// Level summary — shown after the last item is completed
// ---------------------------------------------------------------------------

function renderLevelSummary() {
  const level     = CORPUS[levelState.levelNum];
  const levelName = state.settings.language === 'en'
    ? (level.nameEn || level.name)
    : level.name;

  // Coerce defensively: an undefined/NaN pronScore would otherwise poison the
  // sum and turn the average into NaN, which renders as empty in the UI.
  const scores   = levelState.results
    .map(r => Number(r.result?.pronScore))
    .filter(n => Number.isFinite(n));
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  const avgCls   = scoreClass(avgScore);

  // Bump the persistent completion counter exactly once per level run.
  if (!levelState.completionRecorded) {
    levelState.completionRecorded = true;
    recordLevelCompletion(levelState.levelNum, avgScore);
  }

  const stats         = state.settings.levelStats?.[levelState.levelNum] || {};
  const completions   = stats.completions || 0;
  const bestScore     = stats.bestScore   || 0;

  const screen = document.getElementById('screen-level');
  screen.innerHTML = `
    <header class="app-header">
      <h1 class="header-title">${t('home.level')} ${levelState.levelNum} — ${esc(levelName)}</h1>
    </header>

    <div class="screen-body">
      <div class="lv-summary">

        <div class="lv-summary-hero">
          <div class="lv-summary-trophy">🎯</div>
          <h2 class="lv-summary-title">${t('level.complete.title')}</h2>
          <div class="lv-summary-avg">
            <span class="lv-summary-avg-label">${t('level.complete.score')}</span>
            <span class="lv-summary-avg-value p-score-value--${avgCls}">${avgScore}</span>
          </div>
          <div class="p-score-bar" style="max-width:200px;margin:0 auto">
            <div class="p-score-fill p-score-fill--${avgCls}" style="width:${avgScore}%"></div>
          </div>
          <div class="lv-summary-stats">
            <span class="lv-summary-stat">🏅 ${t('level.complete.completions')} <strong>${completions}</strong></span>
            <span class="lv-summary-stat">⭐ ${t('level.complete.bestScore')} <strong>${bestScore}</strong></span>
          </div>
        </div>

        <!-- Per-item scores -->
        ${levelState.results.length ? `
          <div class="lv-summary-items">
            ${levelState.results.map(({ item, result }, i) => {
              const s   = Math.round(result?.pronScore ?? 0);
              const cls = scoreClass(s);
              return `
                <div class="lv-summary-row">
                  <span class="lv-summary-row-num">${i + 1}</span>
                  <span class="lv-summary-row-text">${esc(item.text)}</span>
                  <span class="lv-summary-row-score p-score-value--${cls}">${s}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="lv-summary-actions">
          <button class="btn btn-secondary" id="lv-retry-level-btn">
            🔄 ${t('level.complete.retryLevel')}
          </button>
          <button class="btn btn-primary btn-lg" id="lv-home-btn">
            ${t('level.complete.home')}
          </button>
        </div>

      </div>
    </div>
  `;

  document.getElementById('lv-retry-level-btn').addEventListener('click', () => {
    levelState.itemIndex   = 0;
    levelState.results     = [];
    levelState.status      = 'idle';
    levelState.lastResult  = null;
    levelState.recordingBlob = null;
    levelState.completionRecorded = false;
    renderLevelScreen();
  });

  document.getElementById('lv-home-btn').addEventListener('click', () => navigate('home'));
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

        <!-- Fun mode toggle -->
        <section class="multi-field">
          <label class="p-label">${t('multi.funMode')}</label>
          <button class="btn btn-sm ${multiState.funMode ? 'btn-primary' : 'btn-ghost'}" id="fun-mode-toggle" type="button">
            ${multiState.funMode ? t('multi.funMode.on') : t('multi.funMode.off')}
          </button>
        </section>

        <!-- Player names -->
        <section class="multi-field">
          <label class="p-label">${t('multi.playerName')}s</label>
          <div class="multi-names" id="multi-names">
            ${buildPlayerNameInputs(multiState.playerCount)}
          </div>
        </section>

        <p class="text-muted text-sm text-center" id="mode-hint">${multiState.funMode ? t('multi.funMode.hint') : t('multi.difficulty')}</p>

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

  // Fun mode toggle
  document.getElementById('fun-mode-toggle').addEventListener('click', () => {
    multiState.funMode = !multiState.funMode;
    const btn = document.getElementById('fun-mode-toggle');
    btn.className = `btn btn-sm ${multiState.funMode ? 'btn-primary' : 'btn-ghost'}`;
    btn.textContent = multiState.funMode ? t('multi.funMode.on') : t('multi.funMode.off');
    document.getElementById('mode-hint').textContent = multiState.funMode ? t('multi.funMode.hint') : t('multi.difficulty');
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
    const pool = multiState.funMode ? MULTIPLAYER_FUN_PHRASES : MULTIPLAYER_PHRASES;
    multiState.phrases       = pickMultiPhrases(multiState.roundCount, pool);
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

/** Pick `count` phrases with smoothly ascending difficulty (easy → hard). */
function pickMultiPhrases(count, pool = MULTIPLAYER_PHRASES) {
  const sorted = [...pool].sort((a, b) => a.difficulty - b.difficulty);
  const n = sorted.length;
  const picks = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * n) / count);
    const end = Math.floor(((i + 1) * n) / count);
    const segment = sorted.slice(start, end);
    picks.push(segment[Math.floor(Math.random() * segment.length)]);
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

        <!-- Recording playback (shown after any recording attempt) -->
        <button class="btn btn-ghost btn-sm" id="multi-playback-btn" style="display:${multiState.recordingBlob ? '' : 'none'}">
          &#x25B6; Écouter mon enregistrement
        </button>

        <!-- Score reveal (hidden until done) -->
        <div class="multi-score-reveal hidden" id="multi-score-reveal">
          <div class="p-scores" id="multi-scores"></div>
          <div class="p-words-wrap">
            <p class="p-label">${t('level.wordAnalysis')}</p>
            <div class="p-words" id="multi-words"></div>
          </div>
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

  document.getElementById('multi-playback-btn').addEventListener('click', () => {
    if (!multiState.recordingBlob) return;
    const url = URL.createObjectURL(multiState.recordingBlob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
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
  const ringEl    = document.getElementById('multi-record-ring');
  const btnEl     = document.getElementById('multi-record-btn');
  const labelEl   = document.getElementById('multi-record-label');
  const statusEl  = document.getElementById('multi-status');
  const listenBtn = document.getElementById('multi-listen-btn');
  const playBtn   = document.getElementById('multi-playback-btn');

  if (multiState.status === 'recording') {
    state.engines.assessment.stop?.();
    multiState.status = 'processing';
    btnEl.classList.remove('p-record-btn--recording');
    btnEl.classList.add('p-record-btn--processing');
    ringEl?.classList.remove('p-record-ring--active');
    labelEl.textContent = t('engine.processing');
    btnEl.disabled = true;
    listenBtn.disabled = true;
    setStatusEl(statusEl, '');
    return;
  }
  if (multiState.status === 'processing') return;

  state.engines.tts?.stop?.();

  // Hide the play button from any previous recording.
  if (playBtn) playBtn.style.display = 'none';
  multiState.recordingBlob = null;

  // Clear any retry hint from a previous failed attempt.
  setStatusEl(statusEl, '');

  multiState.status = 'recording';
  btnEl.classList.add('p-record-btn--recording');
  ringEl?.classList.add('p-record-ring--active');
  labelEl.textContent = t('practice.stop');
  btnEl.disabled = false;
  listenBtn.disabled = true;

  // Helper to put the turn back in a "ready to re-record" state without
  // advancing the player or storing a score.
  const resetForRetry = (message) => {
    multiState.status = 'idle';
    btnEl.classList.remove('p-record-btn--recording');
    btnEl.classList.remove('p-record-btn--processing');
    ringEl?.classList.remove('p-record-ring--active');
    labelEl.textContent = t('multi.record');
    btnEl.disabled = false;
    listenBtn.disabled = false;
    setStatusEl(statusEl, message ?? '', message ? 'error' : '');
    // Keep the phrase card fully visible so the player can try again.
    document.getElementById('multi-phrase-card')?.classList.remove('multi-phrase-card--small');
    document.getElementById('multi-score-reveal')?.classList.add('hidden');
    if (playBtn) playBtn.style.display = multiState.recordingBlob ? '' : 'none';
  };

  try {
    const result = await state.engines.assessment.assess(text, status => {
      applyAssessmentStatus(
        (text, type) => setStatusEl(statusEl, text, type),
        status
      );
    });

    if (!isValidAssessment(result)) {
      multiState.recordingBlob = result.recordingBlob ?? null;
      resetForRetry(isAbortedAssessment(result) ? null : describeAssessmentFailure(result));
      return;
    }

    multiState.status = 'done';
    multiState.lastResult = result;
    multiState.recordingBlob = result.recordingBlob ?? null;

    // Store score + detailed breakdown
    const score = Math.round(result.pronScore ?? 0);
    multiState.players[multiState.currentPlayer].scores.push(score);
    multiState.players[multiState.currentPlayer].details.push({
      pronScore:         Math.round(result.pronScore ?? 0),
      accuracyScore:     result.accuracyScore != null ? Math.round(result.accuracyScore) : null,
      fluencyScore:      result.fluencyScore != null ? Math.round(result.fluencyScore) : null,
      completenessScore: result.completenessScore != null ? Math.round(result.completenessScore) : null,
      prosodyScore:      result.prosodyScore != null ? Math.round(result.prosodyScore) : null,
    });

    // Update UI
    btnEl.classList.remove('p-record-btn--recording');
    ringEl?.classList.remove('p-record-ring--active');
    labelEl.textContent = '';
    setStatusEl(statusEl, '');

    // Show score
    const revealEl = document.getElementById('multi-score-reveal');
    const scoresEl = document.getElementById('multi-scores');
    const wordsEl  = document.getElementById('multi-words');

    const scoreItems = [
      { label: t('results.globalScore'), value: result.pronScore,         icon: '🏆' },
      { label: t('results.accuracy'),    value: result.accuracyScore,     icon: '🎯' },
      { label: t('results.fluency'),     value: result.fluencyScore,      icon: '🌊' },
      { label: t('results.completeness'),value: result.completenessScore, icon: '✅' },
    ];
    if (result.prosodyScore != null) {
      scoreItems.push({ label: t('results.prosody'), value: result.prosodyScore, icon: '🎵' });
    }

    scoresEl.innerHTML = scoreItems.map(item => {
      const v   = Math.round(item.value ?? 0);
      const cls = scoreClass(v);
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

    if (result.words?.length) {
      wordsEl.innerHTML = result.words.map(w => {
        const type = (w.errorType ?? 'None').toLowerCase();
        const tip  = phonemeDetail(w);
        return `<span class="p-word p-word--${type}" title="${esc(tip)}">${esc(w.word)}</span>`;
      }).join(' ');
    } else if (result.recognizedText) {
      wordsEl.innerHTML = `<span class="text-muted text-sm">"${esc(result.recognizedText)}"</span>`;
    } else {
      wordsEl.innerHTML = '';
    }

    revealEl.classList.remove('hidden');
    if (playBtn) playBtn.style.display = multiState.recordingBlob ? '' : 'none';

    // Hide phrase card to make room
    document.getElementById('multi-phrase-card')?.classList.add('multi-phrase-card--small');

    // Change button text for last turn
    const isLastTurn = isMultiGameOver();
    if (isLastTurn) {
      document.getElementById('multi-next-btn').textContent = t('multi.results');
    }
  } catch (err) {
    resetForRetry(describeAssessmentError(err));
  }
}

function isMultiGameOver() {
  // Game is over when the last player has completed the last round
  const lastPlayer = multiState.currentPlayer === multiState.players.length - 1;
  const lastRound  = multiState.currentRound === multiState.roundCount - 1;
  return lastPlayer && lastRound;
}

function advanceMultiTurn() {
  multiState.recordingBlob = null;

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
    const validScreens = ['home', 'settings', 'practice', 'level', 'results', 'multiplayer'];
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
