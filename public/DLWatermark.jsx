/**
 * DLWatermark — subtle bottom-left branding (pointer-events: none).
 */
(function (global) {
  function mountWatermark() {
    if (document.getElementById('dl-watermark')) return;

    const wm = document.createElement('div');
    wm.id = 'dl-watermark';
    wm.className = 'dl-watermark';
    wm.setAttribute('aria-hidden', 'true');
    wm.innerHTML =
      '<span class="dl-watermark-dot"></span>' +
      '<span class="dl-watermark-dot"></span>' +
      '<span class="dl-watermark-text">D.L</span>';

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
