// Shared UI helpers
// ===== UTILS =====
function setWriteUiActive(active) {
  const writeBtn = document.getElementById('write-next-btn');
  const indicator = document.getElementById('writing-indicator');
  const errEl = document.getElementById('library-error');
  if (writeBtn) writeBtn.disabled = active;
  if (indicator) indicator.style.display = active ? 'flex' : 'none';
  if (active && errEl) errEl.style.display = 'none';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function deleteBookFromShelf(id, ev) {
  if (ev) ev.stopPropagation();
  if (!confirm('למחוק את הספר מהמדף?')) return;
  delete app.books[id];
  clearLastReadingSessionIfBook(id);
  if (app.currentBookId === id) {
    const ids = Object.keys(app.books);
    if (ids.length) {
      applyBookSnapshot(app.books[ids[ids.length - 1]]);
      app.currentBookId = state.id;
    } else {
      state = createEmptyBookState();
      state.apiKey = app.apiKey;
      app.currentBookId = null;
    }
  }
  save();
  renderShelf();
  updateWelcomeShelfLink();
}

function enforceOrientationPolicy() {
  if (app.readingPrefs?.allowLandscape && isReadingScreenActive()) return;
  lockAppOrientation();
}
