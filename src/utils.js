// Shared UI helpers
import { store } from './store.js';
import { createEmptyBookState } from './book-model.js';
import {
  applyBookSnapshot
} from './book.js';
import {
  isReadingScreenActive,
  updateWelcomeShelfLink
} from './creation-resume.js';
import {
  lockAppOrientation
} from './prefs-export.js';
import {
  clearLastReadingSessionIfBook,
  renderShelf
} from './shelf.js';
import {
  save
} from './storage.js';

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== UTILS =====
export function setWriteUiActive(active) {
  const writeBtn = document.getElementById('write-next-btn');
  const indicator = document.getElementById('writing-indicator');
  const errEl = document.getElementById('library-error');
  if (writeBtn) writeBtn.disabled = active;
  if (indicator) indicator.style.display = active ? 'flex' : 'none';
  if (active && errEl) errEl.style.display = 'none';
}

export function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

export function deleteBookFromShelf(id, ev) {
  if (ev) ev.stopPropagation();
  if (!confirm('למחוק את הספר מהמדף?')) return;
  delete store.app.books[id];
  clearLastReadingSessionIfBook(id);
  if (store.app.currentBookId === id) {
    const ids = Object.keys(store.app.books);
    if (ids.length) {
      applyBookSnapshot(store.app.books[ids[ids.length - 1]]);
      store.app.currentBookId = store.state.id;
    } else {
      store.state = createEmptyBookState();
      store.state.apiKey = store.app.apiKey;
      store.app.currentBookId = null;
    }
  }
  save();
  renderShelf();
  updateWelcomeShelfLink();
}

export function enforceOrientationPolicy() {
  if (store.app.readingPrefs?.allowLandscape && isReadingScreenActive()) return;
  lockAppOrientation();
}
