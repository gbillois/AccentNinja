/* AccentNinja — Ninja Mode Animation
 * Implements the full sword-slash word assessment animation sequence.
 * Export: playNinjaAnimation(container, result, options)
 */

// ===========================================================================
// Color palette (theme-aware)
// ===========================================================================
const COLOR_THEMES = {
  default: {
    bg:         '#0a0a0f',
    text:       '#e8e4dc',
    muted:      '#5c5850',
    chain:      '#8a8478',
    gold:       '#c4a44a',
    goldBright: '#e0c060',
    jade:       '#4a9e6e',
    red:        '#c23a22',
    amber:      '#c47a2a',
  },
  japan: {
    bg:         '#0d0508',
    text:       '#ffedf2',
    muted:      '#7a3848',
    chain:      '#b06070',
    gold:       '#e8274f',   /* torii red for "good" score */
    goldBright: '#ff7096',   /* sakura pink for top combos */
    jade:       '#22c55e',   /* bamboo green for excellent */
    red:        '#c0392b',   /* dark red for poor */
    amber:      '#e67e22',   /* mango orange for fair */
  },
};

let C = { ...COLOR_THEMES.default };

// ===========================================================================
// Sound helpers
// ===========================================================================

function playSetupTone(audioCtx) {
  try {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type      = 'sine';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.2);
  } catch (_) {}
}

function playSwoosh(audioCtx) {
  try {
    // Sharp, fast sweep — like a blade cutting air
    const osc    = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain   = audioCtx.createGain();
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.07);
    filter.type            = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value         = 0.7;
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.07);
  } catch (_) {}
}

// Crispy high-frequency slice impact
function playSliceImpact(audioCtx) {
  try {
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.05);
    const buffer     = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data       = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }
    const src    = audioCtx.createBufferSource();
    src.buffer   = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type            = 'highpass';
    filter.frequency.value = 4000;
    const gain   = audioCtx.createGain();
    gain.gain.setValueAtTime(0.45, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();
  } catch (_) {}
}


function playThud(audioCtx) {
  try {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (_) {}
}

// Brief full-screen color flash for impact feedback
function flashScreen(color, maxOpacity, duration) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed;
    inset: 0;
    background: ${color};
    z-index: 250;
    pointer-events: none;
    opacity: ${maxOpacity};
  `;
  document.body.appendChild(flash);
  flash.animate([
    { opacity: maxOpacity },
    { opacity: 0 },
  ], { duration, easing: 'ease-out', fill: 'forwards' }).onfinish = () => flash.remove();
}

// ===========================================================================
// Utility helpers
// ===========================================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function scoreColor(score) {
  if (score >= 85) return C.jade;
  if (score >= 65) return C.gold;
  if (score >= 40) return C.amber;
  return C.red;
}

function scoreVerdict(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Incorrect';
}

// Spawn fixed-position particles at (cx, cy).
// Pass `color` to tint the burst (optional — defaults to mixed palette).
function spawnParticles(count, cx, cy, color) {
  const colors   = color ? [color, C.goldBright, C.text] : [C.red, C.gold, C.text];
  const elements = [];
  for (let i = 0; i < count; i++) {
    const el         = document.createElement('div');
    const elongated  = Math.random() > 0.55;
    const sz         = 3 + Math.random() * 5;
    const w          = elongated ? sz * 0.5 : sz;
    const h          = elongated ? sz * 2.5 : sz;
    el.style.cssText = `
      position: fixed;
      width: ${w}px;
      height: ${h}px;
      border-radius: 50%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${cx}px;
      top: ${cy}px;
      pointer-events: none;
      z-index: 210;
    `;
    document.body.appendChild(el);
    elements.push(el);

    const angle = Math.random() * Math.PI * 2;
    const dist  = 45 + Math.random() * 95;
    const dx    = Math.cos(angle) * dist;
    // Add downward gravity bias to the y component
    const dy    = Math.sin(angle) * dist + dist * 0.35;
    const rot   = (Math.random() - 0.5) * 1080;

    const anim = el.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(0)`, opacity: 0 },
    ], { duration: 450 + Math.random() * 180, easing: 'ease-out', fill: 'forwards' });

    anim.onfinish = () => el.remove();
  }
  return elements;
}


// Expanding ring "juice splatter" at impact point
function spawnJuiceSplatter(cx, cy, color) {
  for (let i = 0; i < 2; i++) {
    const ring = document.createElement('div');
    const base = 18 + i * 10;
    ring.style.cssText = `
      position: fixed;
      left: ${cx - base / 2}px;
      top:  ${cy - base / 2}px;
      width: ${base}px;
      height: ${base}px;
      border-radius: 50%;
      border: ${2.5 - i * 0.5}px solid ${color};
      box-shadow: 0 0 10px ${color};
      pointer-events: none;
      z-index: 211;
    `;
    document.body.appendChild(ring);
    const anim = ring.animate([
      { transform: 'scale(1)', opacity: 0.85 },
      { transform: `scale(${3.5 + i})`, opacity: 0 },
    ], { duration: 320 + i * 60, easing: 'ease-out', delay: i * 40, fill: 'forwards' });
    anim.onfinish = () => ring.remove();
  }
}

// Particles that fall from a given y (for FLAWLESS combo)
function spawnFallingParticles(count, fromY) {
  const colors = [C.gold, C.goldBright, C.text];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const sz = 4 + Math.random() * 5;
    const cx = Math.random() * window.innerWidth;
    el.style.cssText = `
      position: fixed;
      width: ${sz}px;
      height: ${sz}px;
      border-radius: 50%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${cx}px;
      top: ${fromY}px;
      pointer-events: none;
      z-index: 210;
    `;
    document.body.appendChild(el);
    const dy  = 100 + Math.random() * 200;
    const rot = (Math.random() - 0.5) * 360;
    const anim = el.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${(Math.random()-0.5)*80}px,${dy}px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 800 + Math.random() * 400, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = () => el.remove();
  }
}

// ===========================================================================
// Main export
// ===========================================================================

export function playNinjaAnimation(container, result, options = {}) {
  const {
    onComplete,
    audioCtx: _audioCtx,
    phrase      = '',
    recordingBlob,
    onRetry,
    onNext,
    onListen,
    onListenSlow,
  } = options;

  // Apply color palette for the current theme
  const _theme = document.documentElement.dataset.theme;
  Object.assign(C, COLOR_THEMES[_theme] || COLOR_THEMES.default);

  // Resolve or create AudioContext (guard against browsers without Web Audio)
  let audioCtx = _audioCtx;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  const words     = result.words || [];
  const isSingle  = words.length === 1;
  const fontSize  = isSingle ? '36px' : '28px';

  // Overall pronScore (0-100). Fall back to average of word accuracies.
  let overallScore = typeof result.pronScore === 'number'
    ? result.pronScore
    : Math.round(words.reduce((s, w) => s + (w.accuracyScore || 0), 0) / Math.max(words.length, 1));

  // -----------------------------------------------------------------------
  // Build overlay
  // -----------------------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 200;
    background: ${C.bg};
    overflow: hidden;
  `;
  document.body.appendChild(overlay);

  // -----------------------------------------------------------------------
  // Phase 1 — Fade out practice screen content
  // -----------------------------------------------------------------------
  const practiceSelectors = [
    '.p-section', '.p-listen-btn', '#listen-btn',
    '.p-divider', '.p-record-wrap', '.p-status', '.p-results',
  ];
  const practiceEls = practiceSelectors.flatMap(sel => [...container.querySelectorAll(sel)]);
  // Use inline styles so we can cleanly restore on Retry
  practiceEls.forEach(el => {
    el.style.transition    = 'opacity 0.3s ease';
    el.style.opacity       = '0';
    el.style.pointerEvents = 'none';
  });

  // Reference text (top)
  const refText = document.createElement('div');
  refText.textContent = phrase;
  refText.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    color: ${C.muted};
    font-family: 'Noto Sans', sans-serif;
    font-weight: 600;
    text-align: center;
    max-width: 80vw;
    z-index: 201;
    pointer-events: none;
  `;
  overlay.appendChild(refText);

  // Chain counter (top-right)
  let chainCount        = 0;
  let consecutiveCorrect = 0;

  const chainEl = document.createElement('div');
  chainEl.style.cssText = `
    position: fixed;
    top: 16px;
    right: 20px;
    font-family: 'Dela Gothic One', cursive;
    font-size: 20px;
    color: ${C.chain};
    z-index: 202;
    pointer-events: none;
    transition: color 0.3s;
  `;
  chainEl.textContent = '×0';
  overlay.appendChild(chainEl);

  function updateChainDisplay(increment) {
    chainEl.textContent = `×${chainCount}`;
    if (increment) {
      chainEl.animate([
        { transform: 'scale(1.3)' },
        { transform: 'scale(1)' },
      ], { duration: 200, easing: 'ease-out' });
    }
  }

  function flashChainRed() {
    chainEl.style.color = C.red;
    setTimeout(() => { chainEl.style.color = C.chain; }, 400);
  }

  // Failed words zone (bottom of screen)
  const failedZone = document.createElement('div');
  failedZone.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    z-index: 205;
    pointer-events: none;
  `;
  overlay.appendChild(failedZone);

  // Play setup tone
  playSetupTone(audioCtx);

  // Slash variant alternation
  let slashVariant = 0;

  // -----------------------------------------------------------------------
  // Show combo label
  // -----------------------------------------------------------------------
  function showComboLabel(text, color, size, isGradient) {
    const label = document.createElement('div');
    label.textContent = text;
    label.style.cssText = `
      position: fixed;
      top: 40%;
      left: 50%;
      transform: translateX(-50%) translateY(-50%);
      font-family: 'Dela Gothic One', cursive;
      font-size: ${size};
      color: ${isGradient ? 'transparent' : color};
      ${isGradient ? `background: linear-gradient(135deg, ${C.gold}, ${C.goldBright}); -webkit-background-clip: text; background-clip: text;` : ''}
      z-index: 215;
      pointer-events: none;
      white-space: nowrap;
    `;
    overlay.appendChild(label);

    label.animate([
      { opacity: 0, transform: 'translateX(-50%) translateY(-50%) scale(0.8)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(-50%) scale(1)', offset: 0.3 },
      { opacity: 1, transform: 'translateX(-50%) translateY(-50%) scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'translateX(-50%) translateY(-50%) scale(1.1)' },
    ], { duration: 800, easing: 'ease-in-out', fill: 'forwards' });

    setTimeout(() => label.remove(), 900);
  }

  // Screen shake — magnitude scales the displacement in px
  function shakeScreen(mag = 4) {
    overlay.animate([
      { transform: 'translate(0,0)' },
      { transform: `translate(${mag}px,${-mag * 0.5}px)` },
      { transform: `translate(${-mag}px,${mag * 0.5}px)` },
      { transform: `translate(${mag * 0.7}px,${mag * 0.3}px)` },
      { transform: `translate(${-mag * 0.5}px,${-mag * 0.4}px)` },
      { transform: `translate(${mag * 0.3}px,0)` },
      { transform: 'translate(0,0)' },
    ], { duration: 220, easing: 'linear' });
  }

  // -----------------------------------------------------------------------
  // Animate a single word element  (Fruit Ninja style)
  // -----------------------------------------------------------------------
  async function animateWord(wordData, index) {
    const accuracy   = wordData.accuracyScore || 0;
    const isCorrect  = accuracy >= 70;

    // Parabolic arc parameters
    const hw         = window.innerWidth / 2;
    const startXOff  = (Math.random() - 0.5) * 180;
    const endXOff    = (Math.random() - 0.5) * 130;
    const midXOff    = (startXOff + endXOff) / 2 + (Math.random() - 0.5) * 30;
    const startRot   = (Math.random() - 0.5) * 22;
    const slashZoneY = window.innerHeight * 0.45;

    const wordEl = document.createElement('div');
    wordEl.textContent = wordData.word || '';
    wordEl.style.cssText = `
      position: fixed;
      left: ${hw + startXOff}px;
      top: 0;
      transform: translateY(${window.innerHeight + 80}px) translateX(-50%) rotate(${startRot}deg);
      font-family: 'Dela Gothic One', cursive;
      font-size: ${fontSize};
      color: ${C.text};
      z-index: 203;
      pointer-events: none;
      white-space: nowrap;
    `;
    overlay.appendChild(wordEl);

    // Parabolic rise: arc laterally while climbing, slight overshoot at top
    const riseAnim = wordEl.animate([
      {
        left:      `${hw + startXOff}px`,
        transform: `translateY(${window.innerHeight + 80}px) translateX(-50%) rotate(${startRot}deg)`,
      },
      {
        left:      `${hw + midXOff}px`,
        transform: `translateY(${slashZoneY - 16}px) translateX(-50%) rotate(${startRot * 0.15}deg)`,
        offset: 0.87,
      },
      {
        left:      `${hw + endXOff}px`,
        transform: `translateY(${slashZoneY}px) translateX(-50%) rotate(0deg)`,
      },
    ], { duration: 900, easing: 'cubic-bezier(0.15, 0.85, 0.45, 1)', fill: 'forwards' });

    await riseAnim.finished;

    if (isCorrect) {
      // -------- CORRECT --------
      playSwoosh(audioCtx);
      playSliceImpact(audioCtx);

      const rect = wordEl.getBoundingClientRect();
      const cx   = rect.left + rect.width / 2;
      const cy   = rect.top  + rect.height / 2;

      // Immediate screen flash on impact
      flashScreen(C.gold, 0.2, 90);

      // Double-line SVG slash (gold main + white core)
      const svgNS = 'http://www.w3.org/2000/svg';
      const svgEl = document.createElementNS(svgNS, 'svg');
      const sw    = rect.width + 28;
      const sh    = rect.height + 16;
      svgEl.setAttribute('width',  sw);
      svgEl.setAttribute('height', sh);
      svgEl.style.cssText = `
        position: fixed;
        left: ${rect.left - 14}px;
        top:  ${rect.top  - 8}px;
        z-index: 204;
        pointer-events: none;
        filter: drop-shadow(0 0 18px ${C.gold}) drop-shadow(0 0 6px #fff8);
      `;

      const variant = slashVariant % 2;
      slashVariant++;
      const getD = (v) => v === 0
        ? `M 0,5 Q ${sw * 0.4},${sh * 0.5} ${sw},${sh - 5}`
        : `M ${sw},5 Q ${sw * 0.6},${sh * 0.5} 0,${sh - 5}`;

      const mainPath = document.createElementNS(svgNS, 'path');
      mainPath.setAttribute('d', getD(variant));
      mainPath.setAttribute('fill', 'none');
      mainPath.setAttribute('stroke', C.gold);
      mainPath.setAttribute('stroke-width', '4.5');
      mainPath.setAttribute('stroke-linecap', 'round');

      const corePath = document.createElementNS(svgNS, 'path');
      corePath.setAttribute('d', getD(variant));
      corePath.setAttribute('fill', 'none');
      corePath.setAttribute('stroke', '#ffffff');
      corePath.setAttribute('stroke-width', '1.5');
      corePath.setAttribute('stroke-linecap', 'round');

      svgEl.appendChild(mainPath);
      svgEl.appendChild(corePath);
      overlay.appendChild(svgEl);

      const pathLen = mainPath.getTotalLength ? mainPath.getTotalLength() : 130;
      [mainPath, corePath].forEach(p => {
        p.style.strokeDasharray  = pathLen;
        p.style.strokeDashoffset = pathLen;
      });

      const slashDuration = isSingle ? 170 : 120;
      mainPath.animate([
        { strokeDashoffset: pathLen },
        { strokeDashoffset: 0 },
      ], { duration: slashDuration, easing: 'ease-out', fill: 'forwards' });
      corePath.animate([
        { strokeDashoffset: pathLen },
        { strokeDashoffset: 0 },
      ], { duration: Math.round(slashDuration * 0.8), easing: 'ease-out', fill: 'forwards' });

      await delay(slashDuration);

      // Juice splatter ring at impact point
      spawnJuiceSplatter(cx, cy, C.gold);

      // Hide original, spawn halves that arc out then fall with gravity
      wordEl.style.visibility = 'hidden';

      const halfL = document.createElement('div');
      const halfR = document.createElement('div');
      [halfL, halfR].forEach(h => {
        h.textContent = wordData.word || '';
        h.style.cssText = `
          position: fixed;
          left: ${rect.left}px;
          top: ${rect.top}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          font-family: 'Dela Gothic One', cursive;
          font-size: ${fontSize};
          color: ${C.text};
          z-index: 203;
          pointer-events: none;
          white-space: nowrap;
          overflow: hidden;
        `;
        overlay.appendChild(h);
      });
      halfL.style.clipPath = 'polygon(0 0, 50% 0, 50% 100%, 0 100%)';
      halfR.style.clipPath = 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)';

      // Fly outward (burst) then fall with gravity — classic Fruit Ninja arc
      halfL.animate([
        { transform: 'translate(0,0) rotate(0deg)',            opacity: 1 },
        { transform: 'translate(-68px,-42px) rotate(-20deg)',  opacity: 1, offset: 0.30 },
        { transform: 'translate(-95px, 100px) rotate(-32deg)', opacity: 0 },
      ], { duration: 680, easing: 'ease-in', fill: 'forwards' }).onfinish = () => halfL.remove();

      halfR.animate([
        { transform: 'translate(0,0) rotate(0deg)',          opacity: 1 },
        { transform: 'translate(68px,-46px) rotate(20deg)',  opacity: 1, offset: 0.30 },
        { transform: 'translate(90px, 95px) rotate(30deg)',  opacity: 0 },
      ], { duration: 680, easing: 'ease-in', fill: 'forwards' }).onfinish = () => halfR.remove();

      // Enhanced particle burst
      const particleCount = isSingle ? 22 : 15;
      spawnParticles(particleCount, cx, cy, C.gold);

      // Score flash — bigger, glowing, pops in then drifts up
      const scoreFlash = document.createElement('div');
      scoreFlash.textContent = `${Math.round(accuracy)}%`;
      const sCol = scoreColor(accuracy);
      scoreFlash.style.cssText = `
        position: fixed;
        left: ${cx}px;
        top: ${cy - 8}px;
        transform: translateX(-50%);
        font-family: 'Dela Gothic One', cursive;
        font-size: 22px;
        color: ${sCol};
        text-shadow: 0 0 12px ${sCol};
        z-index: 210;
        pointer-events: none;
      `;
      overlay.appendChild(scoreFlash);

      scoreFlash.animate([
        { opacity: 0, transform: 'translateX(-50%) translateY(4px) scale(1.4)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0) scale(1)', offset: 0.18 },
        { opacity: 1, transform: 'translateX(-50%) translateY(-10px) scale(1)', offset: 0.65 },
        { opacity: 0, transform: 'translateX(-50%) translateY(-30px) scale(0.85)' },
      ], { duration: 620, easing: 'ease-out', fill: 'forwards' }).onfinish = () => scoreFlash.remove();

      // Update chain
      chainCount++;
      consecutiveCorrect++;
      updateChainDisplay(true);

      // Combo labels
      if (consecutiveCorrect === 3) {
        showComboLabel('3× CHAIN', C.gold, '26px', false);
        shakeScreen(4);
        flashScreen(C.gold, 0.12, 160);
      } else if (consecutiveCorrect === 5) {
        showComboLabel('5× SHARP', C.goldBright, '30px', false);
        shakeScreen(6);
        flashScreen(C.goldBright, 0.16, 180);
      } else if (consecutiveCorrect >= 7) {
        showComboLabel('FLAWLESS', null, '36px', true);
        shakeScreen(8);
        flashScreen(C.goldBright, 0.22, 220);
        spawnFallingParticles(20, 0);
      }

      setTimeout(() => svgEl.remove(), 700);
      setTimeout(() => wordEl.remove(), 750);

    } else {
      // -------- INCORRECT --------

      // Quick color shift to red
      wordEl.animate([
        { color: C.text },
        { color: C.red },
      ], { duration: 140, easing: 'linear', fill: 'forwards' });

      // Wobble — word shakes as if trying to dodge the blade
      await wordEl.animate([
        { transform: `translateY(${slashZoneY}px) translateX(-50%) rotate(0deg)` },
        { transform: `translateY(${slashZoneY}px) translateX(-50%) rotate(8deg)` },
        { transform: `translateY(${slashZoneY}px) translateX(-50%) rotate(-8deg)` },
        { transform: `translateY(${slashZoneY}px) translateX(-50%) rotate(5deg)` },
        { transform: `translateY(${slashZoneY}px) translateX(-50%) rotate(0deg)` },
      ], { duration: 230, easing: 'ease-in-out', fill: 'forwards' }).finished;

      await delay(60);

      // Red flash
      flashScreen(C.red, 0.18, 160);

      // Dramatic fall with lateral drift
      const rotation  = 9 + Math.random() * 13;
      const signedRot = (Math.random() > 0.5 ? 1 : -1) * rotation;
      const xDrift    = (Math.random() - 0.5) * 70;

      const fallAnim = wordEl.animate([
        {
          left:      `${hw + endXOff}px`,
          transform: `translateY(${slashZoneY}px) translateX(-50%) rotate(0deg)`,
        },
        {
          left:      `${hw + endXOff + xDrift}px`,
          transform: `translateY(${window.innerHeight + 80}px) translateX(-50%) rotate(${signedRot}deg)`,
        },
      ], { duration: 540, easing: 'cubic-bezier(0.4, 0, 0.8, 0.6)', fill: 'forwards' });

      await fallAnim.finished;

      playThud(audioCtx);

      // Failed zone chip
      const chip = document.createElement('div');
      chip.textContent = wordData.word || '';
      chip.style.cssText = `
        font-family: 'Noto Sans', sans-serif;
        font-weight: 600;
        font-size: 14px;
        color: ${C.red};
        background: rgba(194,58,34,0.12);
        border: 1px solid rgba(194,58,34,0.35);
        border-radius: 9999px;
        padding: 4px 12px;
        white-space: nowrap;
      `;
      failedZone.appendChild(chip);

      chip.animate([
        { transform: 'translateY(0) scale(0.85)' },
        { transform: 'translateY(-22px) scale(1.08)' },
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-9px) scale(1)' },
        { transform: 'translateY(0) scale(1)' },
      ], { duration: 520, easing: 'ease-out' });

      // Worst phoneme label
      const phonemes = wordData.phonemes || [];
      const worstPhoneme = phonemes.reduce((worst, p) => {
        const pAcc = typeof p.accuracyScore === 'number' ? p.accuracyScore : 100;
        return pAcc < (worst ? worst.accuracyScore : 100) ? p : worst;
      }, null);

      if (worstPhoneme && (worstPhoneme.accuracyScore || 0) < 50) {
        setTimeout(() => {
          const phonLabel = document.createElement('div');
          phonLabel.textContent = `/${worstPhoneme.phoneme || worstPhoneme.phonemeText || ''}/`;
          phonLabel.style.cssText = `
            font-family: 'Noto Sans', sans-serif;
            font-size: 11px;
            font-weight: 600;
            color: ${C.muted};
            text-align: center;
            margin-top: 2px;
            width: 100%;
          `;
          chip.style.display       = 'flex';
          chip.style.flexDirection = 'column';
          chip.style.alignItems    = 'center';
          chip.appendChild(phonLabel);
        }, 300);
      }

      wordEl.remove();

      consecutiveCorrect = 0;
      flashChainRed();
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2 — Run word sequence
  // -----------------------------------------------------------------------
  async function runWordSequence() {
    await delay(300); // let fade-out start

    for (let i = 0; i < words.length; i++) {
      // Fire-and-forget: don't await so words can overlap during slash/fall
      animateWord(words[i], i);
      if (i < words.length - 1) await delay(800); // 800ms launch interval between words
    }

    // Wait for last word's full animation (rise 900ms + slash/fall processing)
    await delay(2400);

    runPhase3();
  }

  // -----------------------------------------------------------------------
  // Phase 3 — Score reveal
  // -----------------------------------------------------------------------
  async function runPhase3() {
    // Fade out failed zone
    failedZone.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 300, fill: 'forwards',
    });

    // Score display
    const scoreEl = document.createElement('div');
    scoreEl.textContent = '0';
    scoreEl.style.cssText = `
      position: fixed;
      top: 35%;
      left: 50%;
      transform: translateX(-50%) translateY(-50%);
      font-family: 'Dela Gothic One', cursive;
      font-size: 56px;
      color: ${C.red};
      z-index: 206;
      pointer-events: none;
    `;
    overlay.appendChild(scoreEl);

    // Count-up animation
    const countDuration = 800;
    const startTime     = performance.now();

    await new Promise(resolve => {
      function tick(now) {
        const elapsed  = now - startTime;
        const progress = clamp(elapsed / countDuration, 0, 1);
        const eased    = easeOutCubic(progress);
        const current  = Math.round(eased * overallScore);

        scoreEl.textContent = current;
        scoreEl.style.color = scoreColor(current);

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          scoreEl.textContent = overallScore;
          scoreEl.style.color = scoreColor(overallScore);
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });

    await delay(200);

    // Verdict label
    const verdict    = scoreVerdict(overallScore);
    const isMaster   = overallScore >= 90;
    const verdictEl  = document.createElement('div');
    verdictEl.style.cssText = `
      position: fixed;
      top: calc(35% + 40px);
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Dela Gothic One', cursive;
      font-size: 20px;
      color: ${scoreColor(overallScore)};
      z-index: 206;
      pointer-events: none;
      white-space: nowrap;
      ${isMaster ? `text-shadow: 0 0 12px ${C.gold};` : ''}
    `;
    verdictEl.textContent = isMaster ? `${verdict} — MASTER` : verdict;
    overlay.appendChild(verdictEl);

    verdictEl.animate([
      { opacity: 0, transform: 'translateX(-50%) translateY(8px)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
    ], { duration: 300, easing: 'ease-out', fill: 'forwards' });

    if (isMaster) {
      spawnParticles(20, window.innerWidth / 2, window.innerHeight * 0.35 + 40);
    }

    // Error code hint when score is 0 and no words were recognised
    const apiError = result.raw?.error;
    if (overallScore === 0 && !words.length && apiError) {
      const hint = document.createElement('div');
      const suggestion = apiError === 'NoMatch'
        ? 'Speak louder / closer to the mic and retry'
        : 'Check your microphone & API settings, then retry';
      hint.style.cssText = `
        position: fixed;
        top: calc(35% + 70px);
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        z-index: 206;
        pointer-events: none;
      `;
      hint.innerHTML = `
        <div style="font-family:monospace;font-size:13px;color:${C.red};margin-bottom:4px;">Code: ${apiError}</div>
        <div style="font-family:'Noto Sans',sans-serif;font-size:13px;color:${C.muted};">${suggestion}</div>
      `;
      overlay.appendChild(hint);
      hint.animate([
        { opacity: 0, transform: 'translateX(-50%) translateY(6px)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
      ], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    }

    await delay(300);

    // Word chips row
    const chipsRow = document.createElement('div');
    chipsRow.style.cssText = `
      position: fixed;
      top: calc(35% + 90px);
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      max-width: 90vw;
      z-index: 206;
      pointer-events: auto;
    `;
    overlay.appendChild(chipsRow);

    words.forEach(w => {
      const acc       = w.accuracyScore || 0;
      const chipColor = scoreColor(acc);
      const chip      = document.createElement('div');

      // Build phoneme tooltip
      const phonemes = w.phonemes || [];
      const tooltipLines = phonemes.map(p => `/${p.phoneme || p.phonemeText || ''}/ ${Math.round(p.accuracyScore || 0)}%`);
      const tooltipText  = tooltipLines.join('\n');

      chip.textContent    = w.word || '';
      chip.title          = tooltipText;
      chip.style.cssText  = `
        font-family: 'Noto Sans', sans-serif;
        font-weight: 600;
        font-size: 14px;
        color: ${chipColor};
        background: ${chipColor}22;
        border: 1px solid ${chipColor}66;
        border-radius: 9999px;
        padding: 5px 14px;
        cursor: default;
        white-space: nowrap;
        transition: transform 0.15s;
      `;

      chip.addEventListener('mouseenter', () => { chip.style.transform = 'scale(1.06)'; });
      chip.addEventListener('mouseleave', () => { chip.style.transform = 'scale(1)'; });

      chipsRow.appendChild(chip);
    });

    chipsRow.animate([
      { opacity: 0, transform: 'translateX(-50%) translateY(10px)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
    ], { duration: 300, easing: 'ease-out', fill: 'forwards' });

    await delay(300);

    showActionBar();
  }

  // -----------------------------------------------------------------------
  // Phase 4 — Action bar
  // -----------------------------------------------------------------------
  function showActionBar() {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      flex-direction: row;
      justify-content: space-around;
      align-items: center;
      padding: 12px 16px;
      padding-bottom: max(12px, env(safe-area-inset-bottom));
      background: rgba(10,10,15,0.96);
      border-top: 1px solid rgba(232,228,220,0.1);
      z-index: 220;
      transform: translateY(100%);
    `;
    overlay.appendChild(bar);

    const buttons = [
      { label: '🔊', title: 'Listen',  handler: onListen,     always: false },
      { label: '🐢', title: 'Slow',    handler: onListenSlow, always: false },
      { label: '🎧', title: 'Mine',    handler: recordingBlob
        ? () => {
            const url = URL.createObjectURL(recordingBlob);
            const a = new Audio(url);
            a.onended = a.onerror = () => URL.revokeObjectURL(url);
            a.play();
          }
        : null,   always: false },
      { label: '↺',  title: 'Retry',   handler: onRetry,      always: true,  isRetry: true },
      { label: '→',  title: 'Next',    handler: onNext,       always: false },
    ];

    buttons.forEach(({ label, title, handler, isRetry }) => {
      const btn = document.createElement('button');
      btn.innerHTML   = `<span style="font-size:20px">${label}</span><br><span style="font-size:11px">${title}</span>`;
      btn.title       = title;

      const retryColor = (isRetry && overallScore < 70) ? C.red : C.text;

      btn.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: ${handler ? retryColor : C.muted};
        opacity: ${handler ? '1' : '0.4'};
        cursor: ${handler ? 'pointer' : 'not-allowed'};
        padding: 8px 12px;
        font-family: 'Noto Sans', sans-serif;
        font-weight: 600;
        min-width: 52px;
        border-radius: 8px;
        transition: background 0.15s, transform 0.1s;
        -webkit-tap-highlight-color: transparent;
      `;

      if (handler) {
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(232,228,220,0.08)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
        btn.addEventListener('mousedown',  () => { btn.style.transform = 'scale(0.93)'; });
        btn.addEventListener('mouseup',    () => { btn.style.transform = 'scale(1)'; });

        btn.addEventListener('click', () => {
          if (isRetry) {
            // Restore practice screen elements
            practiceEls.forEach(el => {
              el.style.opacity       = '';
              el.style.transition    = '';
              el.style.pointerEvents = '';
            });
            overlay.remove();
            if (onRetry) onRetry();
          } else {
            handler();
          }
        });
      } else {
        btn.disabled = true;
      }

      bar.appendChild(btn);
    });

    // Slide up
    bar.animate([
      { transform: 'translateY(100%)' },
      { transform: 'translateY(0)' },
    ], { duration: 200, easing: 'ease-out', fill: 'forwards' });

    if (onComplete) onComplete();
  }

  // -----------------------------------------------------------------------
  // Kick off
  // -----------------------------------------------------------------------
  runWordSequence();
}
