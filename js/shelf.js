// Shelf screen & navigation
function onShelfFilterChange(v) { shelfFilter = v; renderShelf(); }
function onShelfSortChange(v) { shelfSort = v; renderShelf(); }

function shelfBookMatchesFilter(b) {
  const written = b.chapters?.length || 0;
  const total = b.totalChapters || 0;
  if (shelfFilter === 'complete') return isBookComplete(b);
  if (shelfFilter === 'reading') return written > 0 && !isBookComplete(b);
  if (shelfFilter === 'series') return (b.sequelIndex || 1) > 1 || !!b.parentBookId;
  return true;
}

function sortShelfIds(ids) {
  return ids.sort((a, b) => {
    const ba = app.books[a], bb = app.books[b];
    if (shelfSort === 'rating') return (bb.rating || 0) - (ba.rating || 0);
    if (shelfSort === 'title') {
      return (ba.book?.title || '').localeCompare(bb.book?.title || '', 'he');
    }
    return (bb.createdAt || 0) - (ba.createdAt || 0);
  });
}

function getContinueChapterIndex(b) {
  const written = b.chapters?.length || 0;
  if (!written) return -1;
  const last = b.lastReadChapter ?? 0;
  if (last + 1 < written) return last + 1;
  if (last < written) return last;
  return written - 1;
}

function shelfCount() {
  return Object.keys(app.books || {}).length;
}

function renderShelf() {
  const grid = document.getElementById('shelf-grid');
  if (!grid) return;
  const filterEl = document.getElementById('shelf-filter');
  const sortEl = document.getElementById('shelf-sort');
  if (filterEl) filterEl.value = shelfFilter;
  if (sortEl) sortEl.value = shelfSort;

  let ids = Object.keys(app.books).filter(id => shelfBookMatchesFilter(app.books[id]));
  ids = sortShelfIds(ids);

  if (!Object.keys(app.books).length) {
    grid.innerHTML = '<div class="shelf-empty">אין ספרים במדף — פתח ספר חדש להתחיל</div>';
    return;
  }
  if (!ids.length) {
    grid.innerHTML = '<div class="shelf-empty">אין ספרים בסינון זה — נסה סינון אחר</div>';
    return;
  }
  grid.innerHTML = '';
  ids.forEach(id => {
    const b = app.books[id];
    const written = b.chapters?.length || 0;
    const total = b.totalChapters || 0;
    const continueIdx = getContinueChapterIndex(b);
    const canContinue = continueIdx >= 0;
    const pct = total > 0 ? Math.round((written / total) * 100) : 0;
    const stars = b.rating ? '★'.repeat(b.rating) : '';

    const card = document.createElement('div');
    card.className = 'shelf-card';
    card.innerHTML = `
      <button type="button" class="shelf-card-main" style="flex:1;background:none;border:none;color:inherit;text-align:right;cursor:pointer;font:inherit;padding:0">
        <div class="shelf-card-title">${escapeHtml(b.book?.title || 'ספר ללא שם')}</div>
        <div class="shelf-card-meta">
          <span class="meta-pill">${written}/${total} · ${pct}%</span>
          ${isBookComplete(b) ? '<span class="meta-pill meta-done">הושלם</span>' : written ? '<span class="meta-pill">בתהליך</span>' : '<span class="meta-pill">חדש</span>'}
          ${(b.sequelIndex || 1) > 1 || b.parentBookId ? `<span class="meta-pill meta-series">סדרה ${b.sequelIndex || 1}</span>` : ''}
          <span class="meta-pill">${escapeHtml(genreDisplayLabel(getBookProfile(b)))}</span>
          ${stars ? `<span class="meta-pill">${stars}</span>` : ''}
        </div>
        ${canContinue ? `<div style="font-size:0.78rem;color:var(--gold);margin-top:0.35rem">↪ המשך מפרק ${continueIdx + 1}</div>` : ''}
      </button>
      <div class="shelf-card-actions">
        ${canContinue ? `<button type="button" class="shelf-continue-btn" data-continue="${id}">המשך קריאה</button>` : ''}
        <button type="button" class="read-tool-btn" title="מחק" data-delete="${id}">✕</button>
      </div>`;

    card.querySelector('.shelf-card-main').onclick = () => openBookFromShelf(id);
    const cont = card.querySelector('[data-continue]');
    if (cont) cont.onclick = (e) => continueBookFromShelf(id, e);
    card.querySelector('[data-delete]').onclick = (e) => deleteBookFromShelf(id, e);
    grid.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function continueBookFromShelf(id, ev) {
  if (ev) ev.stopPropagation();
  openBookFromShelf(id);
  const b = app.books[id];
  const idx = getContinueChapterIndex(b);
  if (idx >= 0) openChapter(idx);
}

function openBookFromShelf(id) {
  if (state.book && state.id) app.books[state.id] = bookSnapshot();
  applyBookSnapshot(app.books[id]);
  app.currentBookId = id;
  state.apiKey = app.apiKey;
  save();
  renderLibrary();
  showScreen('library-screen');
}

function showShelf() {
  if (state.book && state.id) app.books[state.id] = bookSnapshot();
  save();
  renderShelf();
  updateWelcomeShelfLink();
  showScreen('shelf-screen');
}

function openWelcomeNewBook() {
  if (state.book && state.id) {
    app.books[state.id] = bookSnapshot();
    save();
  }
  showScreen('welcome-screen');
  resetWelcomeWizard(1);
  updateWelcomeShelfLink();
  document.getElementById('create-btn').disabled = false;
}

function clearChapterGenerationQueue() {
  while (chapterGenQueue.length) {
    const job = chapterGenQueue.shift();
    job.rejects.forEach(r => r(new Error('בוטל — נפתח ספר חדש')));
  }
  chapterGenPumpActive = false;
  state.writing = false;
  state.generatingIdx = null;
}

/** ספר עצמאי חדש — מאפס state כדי שלא יישארו דמויות/זיכרון מהספר הקודם */
function prepareStateForNewStandaloneBook(profile, lengthKey, apiKey) {
  const previousBookId = state.book && state.id ? state.id : (app.currentBookId || null);
  if (state.book && state.id) app.books[state.id] = bookSnapshot();

  clearChapterGenerationQueue();

  const newId = newBookId();
  state = createEmptyBookState();
  state.id = newId;
  state.apiKey = apiKey;
  app.apiKey = apiKey;
  state.bookProfile = profile;
  state.readingLengthKey = lengthKey;
  state.totalChapters = LENGTH_PRESETS[lengthKey]?.chapters || 15;
  state.createdAt = Date.now();
  state.memoryBook = emptyMemoryBook();
  state.storySynopsis = '';
  state.eventLog = [];
  state.chapters = [];
  state.parentBookId = null;
  state.seriesTitle = '';
  state.sequelIndex = 1;
  app.currentBookId = state.id;
  markPendingCreation('blueprint', {
    kind: 'standalone',
    previousBookId,
    profile,
    readingLengthKey: lengthKey
  });
  return previousBookId;
}

function restoreBookAfterFailedCreation(failedId, previousBookId, apiKey) {
  clearPendingCreation();
  if (failedId) delete app.books[failedId];
  if (previousBookId && app.books[previousBookId]) {
    applyBookSnapshot(app.books[previousBookId]);
    app.currentBookId = previousBookId;
  } else {
    const ids = Object.keys(app.books || {});
    if (ids.length) {
      const id = ids[ids.length - 1];
      applyBookSnapshot(app.books[id]);
      app.currentBookId = id;
    } else {
      state = createEmptyBookState();
      state.apiKey = apiKey;
    }
  }
  save();
}
