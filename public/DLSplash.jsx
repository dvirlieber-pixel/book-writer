/**
 * DLSplash — personal branding splash (vanilla JS; no conflict with app screens).
 * Shows 1.8s, fades out, then calls onComplete so existing init can run.
 */
(function (global) {
  const SPLASH_MS = 1800;
  const FADE_MS = 450;

  function mountSplash() {
    if (document.getElementById('dl-splash')) return;

    const splash = document.createElement('div');
    splash.id = 'dl-splash';
    splash.className = 'dl-splash dl-splash--visible';
    splash.setAttribute('role', 'presentation');
    splash.setAttribute('aria-hidden', 'true');
    splash.innerHTML =
      '<div class="dl-splash-inner">' +
        '<div class="dl-splash-title">D.L</div>' +
        '<div class="dl-splash-dots" aria-hidden="true">' +
          '<span class="dl-splash-dot dl-splash-dot--outer"></span>' +
          '<span class="dl-splash-dot dl-splash-dot--mid"></span>' +
          '<span class="dl-splash-dot dl-splash-dot--center"></span>' +
          '<span class="dl-splash-dot dl-splash-dot--mid"></span>' +
          '<span class="dl-splash-dot dl-splash-dot--outer"></span>' +
        '</div>' +
        '<div class="dl-splash-credit">BUILT BY DVIR</div>' +
      '</div>';

    document.body.insertBefore(splash, document.body.firstChild);
  }

  function initDLSplash(onComplete) {
    mountSplash();
    const el = document.getElementById('dl-splash');
    if (!el) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    document.body.classList.add('dl-splash-active');

    setTimeout(function () {
      el.classList.remove('dl-splash--visible');
      el.classList.add('dl-splash--fade-out');

      setTimeout(function () {
        el.remove();
        document.body.classList.remove('dl-splash-active');
        if (typeof onComplete === 'function') onComplete();
      }, FADE_MS);
    }, SPLASH_MS);
  }

  global.initDLSplash = initDLSplash;
})(typeof window !== 'undefined' ? window : globalThis);
