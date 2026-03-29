/* AccentNinja — Ninja Mode Animation
 * Implements the full sword-slash word assessment animation sequence.
 * Export: playNinjaAnimation(container, result, options)
 */

// ===========================================================================
// Color palette
// ===========================================================================
const C = {
  bg:         '#0a0a0f',
  text:       '#e8e4dc',
  muted:      '#5c5850',
  chain:      '#8a8478',
  gold:       '#c4a44a',
  goldBright: '#e0c060',
  jade:       '#4a9e6e',
  red:        '#c23a22',
  amber:      '#c47a2a',
};

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
    const osc      = audioCtx.createOscillator();
    const filter   = audioCtx.createBiquadFilter();
    const gain     = audioCtx.createGain();
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
    filter.type            = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value         = 0.5;
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
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

// Spawn fixed-position particles at (cx, cy)
function spawnParticles(count, cx, cy) {
  const colors   = [C.red, C.gold, C.text];
  const elements = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const sz = 4 + Math.random() * 4;
    el.style.cssText = `
      position: fixed;
      width: ${sz}px;
      height: ${sz}px;
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
    const dist  = 30 + Math.random() * 60;
    const dx    = Math.cos(angle) * dist;
    const dy    = Math.sin(angle) * dist;
    const rot   = (Math.random() - 0.5) * 720;

    const anim = el.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(0)`, opacity: 0 },
    ], { duration: 400, easing: 'ease-out', fill: 'forwards' });

    anim.onfinish = () => el.remove();
  }
  return elements;
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

  // Screen shake
  function shakeScreen() {
    overlay.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' },
    ], { duration: 200, easing: 'linear' });
  }

  // -----------------------------------------------------------------------
  // Animate a single word element
  // -----------------------------------------------------------------------
  async function animateWord(wordData, index) {
    const accuracy   = wordData.accuracyScore || 0;
    const isCorrect  = accuracy >= 70;
    const xOff       = (Math.random() - 0.5) * 120;
    const slashZoneY = window.innerHeight * 0.45;

    // Create word element
    const wordEl = document.createElement('div');
    wordEl.textContent = wordData.word || '';
    wordEl.style.cssText = `
      position: fixed;
      left: calc(50% + ${xOff}px);
      top: ${window.innerHeight + 60}px;
      transform: translateX(-50%);
      font-family: 'Dela Gothic One', cursive;
      font-size: ${fontSize};
      color: ${C.text};
      z-index: 203;
      pointer-events: none;
      white-space: nowrap;
    `;
    overlay.appendChild(wordEl);

    // Rise animation (1200ms ease-out)
    const riseAnim = wordEl.animate([
      { top: `${window.innerHeight + 60}px` },
      { top: `${slashZoneY}px` },
    ], { duration: 1200, easing: 'ease-out', fill: 'forwards' });

    await riseAnim.finished;

    if (isCorrect) {
      // -------- CORRECT --------
      playSwoosh(audioCtx);

      // Get position after rise
      const rect = wordEl.getBoundingClientRect();
      const cx   = rect.left + rect.width / 2;
      const cy   = rect.top  + rect.height / 2;

      // SVG slash
      const svgNS = 'http://www.w3.org/2000/svg';
      const svgEl = document.createElementNS(svgNS, 'svg');
      const w     = rect.width + 20;
      const h     = rect.height + 10;
      svgEl.setAttribute('width',  w);
      svgEl.setAttribute('height', h);
      svgEl.style.cssText = `
        position: fixed;
        left: ${rect.left - 10}px;
        top:  ${rect.top  - 5}px;
        z-index: 204;
        pointer-events: none;
        filter: drop-shadow(0 0 12px rgba(196,164,74,0.6));
      `;

      const path    = document.createElementNS(svgNS, 'path');
      const variant = slashVariant % 2;
      slashVariant++;
      const d = variant === 0
        ? `M 0,5 Q ${w * 0.4},${h * 0.5} ${w},${h - 5}`
        : `M ${w},5 Q ${w * 0.6},${h * 0.5} 0,${h - 5}`;
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', C.text);
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-linecap', 'round');

      svgEl.appendChild(path);
      overlay.appendChild(svgEl);

      // Animate stroke-dashoffset
      const pathLen = path.getTotalLength ? path.getTotalLength() : 120;
      path.style.strokeDasharray  = pathLen;
      path.style.strokeDashoffset = pathLen;

      const slashDuration = isSingle ? 200 : 150;
      path.animate([
        { strokeDashoffset: pathLen },
        { strokeDashoffset: 0 },
      ], { duration: slashDuration, easing: 'ease-out', fill: 'forwards' });

      await delay(slashDuration);

      // Word split effect
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

      halfL.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(-40px,-20px) rotate(-15deg)', opacity: 0 },
      ], { duration: 600, easing: 'ease-out', fill: 'forwards' }).onfinish = () => halfL.remove();

      halfR.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(40px,-25px) rotate(12deg)', opacity: 0 },
      ], { duration: 600, easing: 'ease-out', fill: 'forwards' }).onfinish = () => halfR.remove();

      // Particles at slash center
      const particleCount = isSingle ? 15 : 10;
      spawnParticles(particleCount, cx, cy);

      // Score flash
      const scoreFlash = document.createElement('div');
      scoreFlash.textContent = `${Math.round(accuracy)}%`;
      scoreFlash.style.cssText = `
        position: fixed;
        left: ${cx}px;
        top: ${cy}px;
        transform: translateX(-50%);
        font-family: 'Noto Sans', sans-serif;
        font-weight: 600;
        font-size: 16px;
        color: ${C.jade};
        z-index: 210;
        pointer-events: none;
      `;
      overlay.appendChild(scoreFlash);

      scoreFlash.animate([
        { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        { opacity: 0, transform: 'translateX(-50%) translateY(-15px)' },
      ], { duration: 500, easing: 'ease-out', fill: 'forwards' }).onfinish = () => scoreFlash.remove();

      // Update chain
      chainCount++;
      consecutiveCorrect++;
      updateChainDisplay(true);

      // Combo labels
      if (consecutiveCorrect === 3) {
        showComboLabel('3x CHAIN', C.gold, '24px', false);
        shakeScreen();
      } else if (consecutiveCorrect === 5) {
        showComboLabel('5x SHARP', C.goldBright, '28px', false);
      } else if (consecutiveCorrect >= 7) {
        showComboLabel('FLAWLESS', null, '32px', true);
        spawnFallingParticles(15, 0);
      }

      // Cleanup slash after a moment
      setTimeout(() => svgEl.remove(), 600);
      setTimeout(() => wordEl.remove(), 650);

    } else {
      // -------- INCORRECT --------

      // Color shift red
      wordEl.animate([
        { color: C.text },
        { color: C.red },
      ], { duration: 200, easing: 'linear', fill: 'forwards' });

      await delay(300);

      // Fall animation
      const rotation = 5 + Math.random() * 10;
      const signedRot = (Math.random() > 0.5 ? 1 : -1) * rotation;

      const fallAnim = wordEl.animate([
        { top: `${slashZoneY}px`, transform: 'translateX(-50%) rotate(0deg)' },
        { top: `${window.innerHeight + 60}px`, transform: `translateX(-50%) rotate(${signedRot}deg)` },
      ], { duration: 600, easing: 'cubic-bezier(0.55,0,1,0.45)', fill: 'forwards' });

      await fallAnim.finished;

      // Play thud
      playThud(audioCtx);

      // Create failed zone chip
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

      // Bounce chip
      chip.animate([
        { transform: 'translateY(0)' },
        { transform: 'translateY(-20px)' },
        { transform: 'translateY(0)' },
        { transform: 'translateY(-8px)' },
        { transform: 'translateY(0)' },
      ], { duration: 500, easing: 'ease-out' });

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

      // Reset consecutive
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

    // Wait for last word's full animation (rise 1200ms + slash/fall processing)
    await delay(2700);

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
        ? () => { const a = new Audio(URL.createObjectURL(recordingBlob)); a.play(); }
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
