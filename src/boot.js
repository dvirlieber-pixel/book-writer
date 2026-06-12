import * as cfg from './constants.js';
import { store } from './store.js';

export function boot(App) {
  function bootstrapAfterSplash() {
    const run = () => {
      App.expirePendingCreationIfStale();
      App.tryResumePendingCreation().then(resumed => {
        if (!resumed) App.bootstrapAppScreens();
      });
    };
    if (typeof initDLSplash === 'function') initDLSplash(run);
    else run();
  }

  function initAfterLoad() {
    App.lockAppOrientation();
    App.applyReadingPrefs();
    App.applyWelcomeDefaults();
    App.renderTasteProfiles();
    App.updateWelcomeShelfLink();
    App.updateOfflineBanner();
    if (store.app.apiKey || store.state.apiKey) {
      const keyInput = document.getElementById('api-key-input');
      if (keyInput) keyInput.value = store.app.apiKey || store.state.apiKey;
    }
    App.updateApiKeyStatus();
    App.refreshModelFallbackNotice();
    App.updateWelcomeWizardUI();
    bootstrapAfterSplash();
  }

  App.loadApp().then(initAfterLoad);

  window.addEventListener('unhandledrejection', (e) => {
    console.error('unhandled rejection', e.reason);
    const msg = e.reason?.message || String(e.reason || 'שגיאה לא צפויה');
    if (document.getElementById('library-screen')?.classList.contains('active')) {
      App.showError('library-error', msg);
    } else if (document.getElementById('welcome-screen')?.classList.contains('active')) {
      App.showError('welcome-error', msg);
    }
  });

  window.addEventListener('pagehide', () => {
    App.syncAppFromState();
    clearTimeout(store.saveTimer);
    try { localStorage.setItem(cfg.STORAGE_KEY, JSON.stringify(store.app)); } catch (_) {}
  });

  window.addEventListener('online', () => App.updateOfflineBanner());
  window.addEventListener('offline', () => App.updateOfflineBanner());
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    store.deferredInstallPrompt = e;
    App.showInstallUi();
  });
  window.addEventListener('appinstalled', () => {
    App.dismissInstallBanner();
    store.deferredInstallPrompt = null;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      App.releaseWakeLock();
      if (store.app.pendingCreation || store.state.writing) App.save({ immediate: true });
    } else {
      App.enforceOrientationPolicy();
      if (store.app.pendingCreation && !store.state.writing && !store.creationResumeRunning && !store.bookCreationInFlight) {
        App.tryResumePendingCreation();
      }
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && store.app.pendingCreation && !store.state.writing && !store.creationResumeRunning && !store.bookCreationInFlight) {
      App.tryResumePendingCreation();
    }
  });
  window.addEventListener('orientationchange', () => App.updateLandscapeToggleButton());
  const inspirationPanel = document.getElementById('inspiration-panel');
  if (inspirationPanel) {
    inspirationPanel.addEventListener('toggle', () => {
      const sum = inspirationPanel.querySelector('summary');
      if (sum) sum.setAttribute('aria-expanded', inspirationPanel.open ? 'true' : 'false');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      App.closeWorldDictionary();
      App.closeChapterDrawer();
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        if (reg.waiting) App.showUpdateBanner(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              App.showUpdateBanner(nw);
            }
          });
        });
      }).catch(err => console.warn('Service worker registration failed:', err));

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });
  }
}
