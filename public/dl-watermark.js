/**
 * dl-watermark — the signature mark in miniature, bottom-left (pointer-events: none).
 * Self-contained like dl-splash.js. An app can lift it clear of a bottom bar with --dl-watermark-bottom.
 */
(function (global) {
  const STYLES = `
    .dl-watermark {
      position: fixed; left: 12px; bottom: var(--dl-watermark-bottom, 10px); z-index: 9990;
      display: block; width: 26px; height: auto; color: inherit; opacity: 0.35;
      pointer-events: none; user-select: none;
    }`;

  function mountWatermark() {
    if (document.getElementById('dl-watermark')) return;

    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    const wm = document.createElement('div');
    wm.id = 'dl-watermark';
    wm.className = 'dl-watermark';
    wm.setAttribute('aria-hidden', 'true');
    wm.innerHTML =
      '<svg viewBox="0 0 150 80" focusable="false" style="display:block;width:100%;height:auto">' +
        '<path fill="none" stroke="currentColor" stroke-width="10" d="M14 40V8H34A32 32 0 0 1 34 72H14Z"/>' +
        '<path fill="none" stroke="currentColor" stroke-width="10" d="M100 4V72H140"/>' +
        '<circle cx="83" cy="70" r="7" fill="#378add"/>' +
      '</svg>';

    document.body.appendChild(wm);
  }

  function initDLWatermark() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountWatermark);
    } else {
      mountWatermark();
    }
  }

  global.initDLWatermark = initDLWatermark;
  initDLWatermark();
})(typeof window !== 'undefined' ? window : globalThis);
