/**
 * dl-splash — Dvir's signature opening screen. The same file goes into every app, unchanged.
 *
 * Install: <script src="/dl-splash.js"></script> at the top of <head>. It carries its own styles and
 * draws the mark as vector paths, so it needs no fonts, no CSS and no framework, and it dismisses itself.
 * Optional: initDLSplash(cb) runs cb as the splash starts to fade, so the app's first screen is ready
 * underneath it. A tap skips ahead.
 *
 * The moment: the five dots gather into one, which falls into place as the period of D.L,
 * and the letters are drawn on either side of it.
 */
(function (global) {
  const HOLD_MS = 1700;
  const HOLD_REDUCED_MS = 900;
  const FADE_MS = 350;
  const INK = '#0a1420';
  const PAPER = '#f4f6f8';
  const BLUE = '#378add';
  const MUTED = '#8a9bad';

  const DOTS = [
    { dx: -32, from: 0.25, to: 0 },
    { dx: -16, from: 0.55, to: 0 },
    { dx: 16, from: 0.55, to: 0 },
    { dx: 32, from: 0.25, to: 0 },
    { dx: 0, from: 1, to: 1 }
  ];

  const STYLES = `
    .dl-splash {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: clamp(1.25rem, 4vh, 2rem);
      background: ${INK}; direction: ltr; cursor: pointer;
      -webkit-tap-highlight-color: transparent; user-select: none;
      opacity: 1; transition: opacity ${FADE_MS}ms ease;
    }
    .dl-splash--out { opacity: 0; pointer-events: none; }
    .dl-splash-mark { display: block; width: clamp(9rem, 40vw, 15rem); height: auto; overflow: visible; }
    .dl-splash-letter {
      fill: none; stroke: ${PAPER}; stroke-width: 8; stroke-linecap: butt; stroke-linejoin: miter;
      stroke-dasharray: 1 1; stroke-dashoffset: 1;
      animation: dl-draw 560ms cubic-bezier(.65, 0, .35, 1) 420ms forwards;
    }
    .dl-splash-dot {
      fill: ${BLUE}; opacity: 0;
      animation: dl-gather 700ms cubic-bezier(.45, 0, .2, 1) forwards;
    }
    .dl-splash-credit {
      font: 500 0.8125rem/1 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      letter-spacing: 0.02em; color: ${MUTED}; opacity: 0;
      animation: dl-appear 300ms ease 1000ms forwards;
    }
    @keyframes dl-draw { to { stroke-dashoffset: 0; } }
    @keyframes dl-appear { to { opacity: 1; } }
    @keyframes dl-gather {
      0% { opacity: 0; transform: translate(var(--dx), -30px); }
      15% { opacity: var(--from); transform: translate(var(--dx), -30px); }
      60% { opacity: var(--from); transform: translate(0, -30px); }
      100% { opacity: var(--to); transform: translate(0, 0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .dl-splash-letter, .dl-splash-dot, .dl-splash-credit { animation: none; }
      .dl-splash-letter { stroke-dashoffset: 0; }
      .dl-splash-dot { opacity: var(--to); }
      .dl-splash-credit { opacity: 1; }
    }`;

  const MARK = `
    <svg class="dl-splash-mark" viewBox="0 0 150 80" aria-hidden="true" focusable="false">
      <path class="dl-splash-letter" pathLength="1" d="M14 40V8H34A32 32 0 0 1 34 72H14Z"/>
      <path class="dl-splash-letter" pathLength="1" d="M100 4V72H140"/>
      ${DOTS.map(d => `<circle class="dl-splash-dot" cx="83" cy="70" r="6" style="--dx:${d.dx}px;--from:${d.from};--to:${d.to}"/>`).join('')}
    </svg>
    <div class="dl-splash-credit">Built by Dvir</div>`;

  let splash = null;
  let holdTimer = 0;
  let started = false;
  let callbacks = [];

  function flushCallbacks() {
    const pending = callbacks;
    callbacks = [];
    pending.forEach(cb => cb());
  }

  function dismiss() {
    if (started) return;
    started = true;
    clearTimeout(holdTimer);
    flushCallbacks();
    splash.classList.add('dl-splash--out');
    setTimeout(() => splash.remove(), FADE_MS);
  }

  function mount() {
    const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const style = document.createElement('style');
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);

    splash = document.createElement('div');
    splash.className = 'dl-splash';
    splash.setAttribute('aria-hidden', 'true');
    splash.innerHTML = MARK;
    splash.addEventListener('click', dismiss);
    document.documentElement.appendChild(splash);

    holdTimer = setTimeout(dismiss, reduced ? HOLD_REDUCED_MS : HOLD_MS);
  }

  global.initDLSplash = function initDLSplash(onReady) {
    if (typeof onReady !== 'function') return;
    if (started) onReady();
    else callbacks.push(onReady);
  };

  mount();
})(typeof window !== 'undefined' ? window : globalThis);
