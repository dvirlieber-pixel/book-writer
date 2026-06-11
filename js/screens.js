// Screen routing
// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  if (id !== 'reading-screen') {
    releaseWakeLock();
    document.body.classList.remove('reading-immersive');
    if (app.readingPrefs) app.readingPrefs.allowLandscape = false;
    lockAppOrientation();
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (!screen) return;
  screen.classList.add('active');
  window.scrollTo(0, 0);
  applyReadingPrefs();
  updateLandscapeToggleButton();
}

function showLibrary() {
  closeChapterDrawer();
  renderLibrary();
  showScreen('library-screen');
}

function applyWelcomeDefaults() {
  const p = app.readingPrefs || {};
  if (p.activeProfile) applyTasteProfile(p.activeProfile);
  else {
    const lk = p.defaultLengthKey || 'short';
    readingLengthKey = lk;
    state.totalChapters = LENGTH_PRESETS[lk]?.chapters || 15;
    syncWelcomeUIFromProfile(defaultBookProfile(), lk);
  }
  document.querySelectorAll('.optional-input').forEach(el => { el.style.display = 'none'; });
}
