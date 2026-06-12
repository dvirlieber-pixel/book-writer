// Bootstrap & event wiring
// ===== INIT =====
function initAfterLoad() {
  lockAppOrientation();
  applyReadingPrefs();
  applyWelcomeDefaults();
  renderTasteProfiles();
  updateWelcomeShelfLink();
  updateOfflineBanner();
  if (app.apiKey || state.apiKey) {
    const keyInput = document.getElementById('api-key-input');
    if (keyInput) keyInput.value = app.apiKey || state.apiKey;
  }
  updateApiKeyStatus();
  refreshModelFallbackNotice();
  updateWelcomeWizardUI();
  (function bootstrapAfterSplash() {
    const run = () => {
      expirePendingCreationIfStale();
      tryResumePendingCreation().then(resumed => {
        if (!resumed) bootstrapAppScreens();
      });
    };
    if (typeof initDLSplash === 'function') initDLSplash(run);
    else run();
  })();
}

loadApp().then(initAfterLoad);

window.addEventListener('unhandledrejection', (e) => {
  console.error('unhandled rejection', e.reason);
  const msg = e.reason?.message || String(e.reason || 'שגיאה לא צפויה');
  if (document.getElementById('library-screen')?.classList.contains('active')) {
    showError('library-error', msg);
  } else if (document.getElementById('welcome-screen')?.classList.contains('active')) {
    showError('welcome-error', msg);
  }
});

window.addEventListener('pagehide', () => {
  syncAppFromState();
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(app)); } catch (_) {}
});

window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallUi();
});
window.addEventListener('appinstalled', () => {
  dismissInstallBanner();
  deferredInstallPrompt = null;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    releaseWakeLock();
    if (app.pendingCreation || state.writing) save({ immediate: true });
  } else {
    enforceOrientationPolicy();
    if (app.pendingCreation && !state.writing && !creationResumeRunning && !bookCreationInFlight) {
      tryResumePendingCreation();
    }
  }
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted && app.pendingCreation && !state.writing && !creationResumeRunning && !bookCreationInFlight) {
    tryResumePendingCreation();
  }
});
window.addEventListener('orientationchange', updateLandscapeToggleButton);
const inspirationPanel = document.getElementById('inspiration-panel');
if (inspirationPanel) {
  inspirationPanel.addEventListener('toggle', () => {
    const sum = inspirationPanel.querySelector('summary');
    if (sum) sum.setAttribute('aria-expanded', inspirationPanel.open ? 'true' : 'false');
  });
}

function bootstrapAppScreens() {
  if (shelfCount() > 1) {
    renderShelf();
    showScreen('shelf-screen');
  } else if (state.book) {
    renderLibrary();
    showScreen('library-screen');
  } else if (shelfCount() === 1) {
    openBookFromShelf(Object.keys(app.books)[0]);
  } else {
    showScreen('welcome-screen');
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeChapterDrawer();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      if (reg.waiting) showUpdateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(nw);
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
