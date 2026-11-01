// Shelf screen & navigation
import * as cfg from './constants.js';
import { store } from './store.js';
import { createEmptyBookState } from './book-model.js';
import {
  applyBookSnapshot,
  bookSnapshot,
  genreDisplayLabel,
  getBookProfile,
  isBookComplete,
  newBookId
} from './book.js';
import {
  clearPendingCreation,
  emptyMemoryBook,
  markPendingCreation,
  updateWelcomeShelfLink
} from './creation-resume.js';
import {
  renderLibrary
} from './library.js';
import {
  renderBackupReminder
} from './prefs-export.js';
import {
  refreshQuotaNotice
} from './quota.js';
import {
  openChapter
} from './reading.js';
import {
  resetWelcomeWizard,
  showScreen
} from './screens.js';
import {
  save
} from './storage.js';
import {
  deleteBookFromShelf,
  escapeHtml
} from './utils.js';
import { icon } from './icons.js';

export function onShelfFilterChange(v) { store.shelfFilter = v; renderShelf(); }
export function onShelfSortChange(v) { store.shelfSort = v; renderShelf(); }

export function shelfBookMatchesFilter(b) {
  const written = b.chapters?.length || 0;
  const total = b.totalChapters || 0;
  if (store.shelfFilter === 'complete') return isBookComplete(b);
  if (store.shelfFilter === 'reading') return written > 0 && !isBookComplete(b);
  if (store.shelfFilter === 'series') return (b.sequelIndex || 1) > 1 || !!b.parentBookId;
  return true;
}

export function sortShelfIds(ids) {
  return ids.sort((a, b) => {
    const ba = store.app.books[a], bb = store.app.books[b];
    if (store.shelfSort === 'rating') return (bb.rating || 0) - (ba.rating || 0);
    if (store.shelfSort === 'title') {
      return (ba.book?.title || '').localeCompare(bb.book?.title || '', 'he');
    }
    return (bb.createdAt || 0) - (ba.createdAt || 0);
  });
}

export function getContinueChapterIndex(b) {
  const written = b.chapters?.length || 0;
  if (!written) return -1;
  const last = b.lastReadChapter ?? 0;
  if (last + 1 < written) return last + 1;
  if (last < written) return last;
  return written - 1;
}

export function shelfCount() {
  return Object.keys(store.app.books || {}).length;
}

export function renderShelf() {
  const grid = document.getElementById('shelf-grid');
  if (!grid) return;
  renderBackupReminder();
  refreshQuotaNotice();
  const filterEl = document.getElementById('shelf-filter');
  const sortEl = document.getElementById('shelf-sort');
  if (filterEl) filterEl.value = store.shelfFilter;
  if (sortEl) sortEl.value = store.shelfSort;

  let ids = Object.keys(store.app.books).filter(id => shelfBookMatchesFilter(store.app.books[id]));
  ids = sortShelfIds(ids);

  if (!Object.keys(store.app.books).length) {
    grid.innerHTML = '<div class="shelf-empty">המדף ריק. לחץ על "ספר חדש" כדי לפתוח את הראשון.</div>';
    renderShelfContinueFab();
    return;
  }
  if (!ids.length) {
    grid.innerHTML = '<div class="shelf-empty">אין ספרים שמתאימים לסינון הזה.</div>';
    renderShelfContinueFab();
    return;
  }
  grid.innerHTML = '';
  ids.forEach(id => {
    const b = store.app.books[id];
    const written = b.chapters?.length || 0;
    const total = b.totalChapters || 0;
    const continueIdx = getContinueChapterIndex(b);
    const canContinue = continueIdx >= 0;
    const pct = total > 0 ? Math.round((written / total) * 100) : 0;
    const stars = b.rating ? '★'.repeat(b.rating) : '';
    const isSeries = (b.sequelIndex || 1) > 1 || !!b.parentBookId;
    const status = isBookComplete(b) ? '<span class="is-done">הושלם</span>' : written ? `${written} מתוך ${total} פרקים` : 'עוד לא התחלת';
    const meta = [escapeHtml(genreDisplayLabel(getBookProfile(b))), isSeries ? `ספר ${b.sequelIndex || 1} בסדרה` : '', status, stars ? `<span class="stars" aria-label="${b.rating} כוכבים">${stars}</span>` : '']
      .filter(Boolean).join(' · ');

    const card = document.createElement('div');
    card.className = 'shelf-card';
    card.innerHTML = `
      <button type="button" class="shelf-card-main">
        <div class="shelf-card-title">${escapeHtml(b.book?.title || 'ספר ללא שם')}</div>
        <div class="shelf-card-meta">${meta}</div>
        ${total ? `<div class="shelf-card-progress" aria-hidden="true"><span style="width:${pct}%"></span></div>` : ''}
      </button>
      <div class="shelf-card-actions">
        ${canContinue ? `<button type="button" class="shelf-continue-btn" data-continue="${id}">לפרק ${continueIdx + 1}</button>` : ''}
        <button type="button" class="icon-btn" title="מחק ספר" aria-label="מחק את ${escapeHtml(b.book?.title || 'הספר')}" data-delete="${id}">${icon('trash')}</button>
      </div>`;

    card.querySelector('.shelf-card-main').onclick = () => openBookFromShelf(id);
    const cont = card.querySelector('[data-continue]');
    if (cont) cont.onclick = (e) => continueBookFromShelf(id, e);
    card.querySelector('[data-delete]').onclick = (e) => deleteBookFromShelf(id, e);
    grid.appendChild(card);
  });
  renderShelfContinueFab();
}

export function recordLastReadingSession(bookId, chapterIdx) {
  if (!bookId || chapterIdx == null || chapterIdx < 0) return;
  store.app.lastReadingSession = {
    bookId,
    chapterIdx,
    updatedAt: Date.now()
  };
}

export function clearLastReadingSessionIfBook(bookId) {
  if (store.app.lastReadingSession?.bookId === bookId) {
    store.app.lastReadingSession = null;
  }
}

export function getLastReadingSessionTarget() {
  let bookId = store.app.lastReadingSession?.bookId;
  let chapterIdx = store.app.lastReadingSession?.chapterIdx;

  if (bookId && !store.app.books[bookId]) {
    store.app.lastReadingSession = null;
    save();
    bookId = null;
  }

  if (!bookId) {
    bookId = store.app.currentBookId;
    if (!bookId || !store.app.books[bookId]) return null;
    const b = store.app.books[bookId];
    const written = b.chapters?.length || 0;
    if (!written) return null;
    chapterIdx = b.lastReadChapter ?? 0;
    if (chapterIdx >= written) chapterIdx = written - 1;
  }

  const book = store.app.books[bookId];
  if (!book) return null;
  const written = book.chapters?.length || 0;
  if (!written) return null;

  if (chapterIdx == null || chapterIdx < 0) chapterIdx = 0;
  if (chapterIdx >= written) chapterIdx = written - 1;

  const ch = book.chapters[chapterIdx];
  return {
    bookId,
    chapterIdx,
    chapterNum: ch?.number || chapterIdx + 1,
    title: book.book?.title || 'ספר ללא שם'
  };
}

export function renderShelfContinueFab() {
  const fab = document.getElementById('shelf-continue-fab');
  const label = document.getElementById('shelf-continue-fab-label');
  const body = document.querySelector('#shelf-screen .shelf-body');
  if (!fab || !label) return;

  const onShelf = document.getElementById('shelf-screen')?.classList.contains('active');
  const target = getLastReadingSessionTarget();

  if (!onShelf || !target) {
    fab.hidden = true;
    if (body) body.classList.remove('has-continue-fab');
    return;
  }

  const shortTitle = target.title.length > 32 ? target.title.slice(0, 30) + '…' : target.title;
  label.textContent = `חזרה לקריאה: ${shortTitle}, פרק ${target.chapterNum}`;
  fab.hidden = false;
  if (body) body.classList.add('has-continue-fab');
}

export function openBookForReading(id, chapterIdx) {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  applyBookSnapshot(store.app.books[id]);
  store.app.currentBookId = id;
  store.state.apiKey = store.app.apiKey;
  save();
  openChapter(chapterIdx);
}

export function continueReadingFromFab() {
  const target = getLastReadingSessionTarget();
  if (!target) {
    renderShelfContinueFab();
    return;
  }
  openBookForReading(target.bookId, target.chapterIdx);
}

export function continueBookFromShelf(id, ev) {
  if (ev) ev.stopPropagation();
  const b = store.app.books[id];
  const idx = getContinueChapterIndex(b);
  if (idx >= 0) openBookForReading(id, idx);
}

export function openBookFromShelf(id) {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  applyBookSnapshot(store.app.books[id]);
  store.app.currentBookId = id;
  store.state.apiKey = store.app.apiKey;
  save();
  renderLibrary();
  showScreen('library-screen');
}

export function showShelf() {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  save();
  renderShelf();
  updateWelcomeShelfLink();
  showScreen('shelf-screen');
}

export function openWelcomeNewBook() {
  if (store.state.book && store.state.id) {
    store.app.books[store.state.id] = bookSnapshot();
    save();
  }
  showScreen('welcome-screen');
  resetWelcomeWizard(1);
  updateWelcomeShelfLink();
  document.getElementById('create-btn').disabled = false;
}

export function clearChapterGenerationQueue() {
  while (store.chapterGenQueue.length) {
    const job = store.chapterGenQueue.shift();
    job.rejects.forEach(r => r(new Error('בוטל — נפתח ספר חדש')));
  }
  store.chapterGenPumpActive = false;
  store.state.writing = false;
  store.state.generatingIdx = null;
}

/** ספר עצמאי חדש — מאפס store.state כדי שלא יישארו דמויות/זיכרון מהספר הקודם */
export function prepareStateForNewStandaloneBook(profile, lengthKey, apiKey) {
  const previousBookId = store.state.book && store.state.id ? store.state.id : (store.app.currentBookId || null);
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();

  clearChapterGenerationQueue();

  const newId = newBookId();
  store.state = createEmptyBookState();
  store.state.id = newId;
  store.state.apiKey = apiKey;
  store.app.apiKey = apiKey;
  store.state.bookProfile = profile;
  store.state.readingLengthKey = lengthKey;
  store.state.totalChapters = cfg.LENGTH_PRESETS[lengthKey]?.chapters || 15;
  store.state.createdAt = Date.now();
  store.state.memoryBook = emptyMemoryBook();
  store.state.storySynopsis = '';
  store.state.eventLog = [];
  store.state.chapters = [];
  store.state.parentBookId = null;
  store.state.seriesTitle = '';
  store.state.sequelIndex = 1;
  store.app.currentBookId = store.state.id;
  markPendingCreation('blueprint', {
    kind: 'standalone',
    previousBookId,
    profile,
    readingLengthKey: lengthKey
  });
  return previousBookId;
}

export function restoreBookAfterFailedCreation(failedId, previousBookId, apiKey) {
  clearPendingCreation();
  if (failedId) delete store.app.books[failedId];
  if (previousBookId && store.app.books[previousBookId]) {
    applyBookSnapshot(store.app.books[previousBookId]);
    store.app.currentBookId = previousBookId;
  } else {
    const ids = Object.keys(store.app.books || {});
    if (ids.length) {
      const id = ids[ids.length - 1];
      applyBookSnapshot(store.app.books[id]);
      store.app.currentBookId = id;
    } else {
      store.state = createEmptyBookState();
      store.state.apiKey = apiKey;
    }
  }
  save();
}
