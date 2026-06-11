// IndexedDB & localStorage persistence
function openAppDb() {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        if (!e.target.result.objectStoreNames.contains(IDB_STORE)) {
          e.target.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return idbPromise;
}

function idbRequestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbReadApp() {
  const db = await openAppDb();
  const tx = db.transaction(IDB_STORE, 'readonly');
  return idbRequestToPromise(tx.objectStore(IDB_STORE).get(STORAGE_KEY));
}

async function idbWriteApp(data) {
  const db = await openAppDb();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(data, STORAGE_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function syncAppFromState() {
  if (state.book && state.id) app.books[state.id] = bookSnapshot();
  if (state.apiKey) app.apiKey = state.apiKey;
  if (state.id) app.currentBookId = state.id;
}

function reportStorageError(e) {
  console.error('save failed', e);
  if (e.name === 'QuotaExceededError' || e.code === 22) {
    const msg = 'אין מספיק מקום באחסון — שחרר מקום או מחק ספרים מהמדף.';
    showError('library-error', msg);
    showError('welcome-error', msg);
  }
}

function reportLoadError(e) {
  console.error('load failed', e);
  let msg = 'שגיאה בטעינת הנתונים מהמכשיר.';
  if (e?.name === 'SyntaxError') {
    msg += ' הנתונים השמורים פגומים — אם יש לך גיבוי JSON, ייבא אותו דרך «גיבוי המדף».';
  } else if (e?.message) {
    msg += ' ' + e.message;
  }
  showError('welcome-error', msg);
  showError('library-error', msg);
}

function ensureMinimalAppShell() {
  if (!app.books) app.books = {};
  if (!app.readingPrefs) app.readingPrefs = { fontScale: 1, theme: 'dark', immersive: false };
}

async function flushSave() {
  syncAppFromState();
  try {
    await idbWriteApp(app);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  } catch (e) {
    reportStorageError(e);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    } catch (e2) {
      reportStorageError(e2);
    }
  }
}

function save(opts = {}) {
  syncAppFromState();
  if (opts.immediate) {
    clearTimeout(saveTimer);
    return flushSave();
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

function migrateFromLegacyV1() {
  const v1 = localStorage.getItem(STORAGE_KEY_V1);
  if (!v1) return false;
  const old = JSON.parse(v1);
  app = { apiKey: old.apiKey || '', currentBookId: null, books: {}, readingPrefs: { fontScale: 1, theme: 'dark' } };
  if (old.book) {
    const id = newBookId();
    old.id = id;
    const taste = old.taste || 'hard-magic';
    old.storySynopsis = old.storySynopsis || '';
    app.books[id] = {
      id,
      bookProfile: migrateLegacyTaste(taste),
      readingLengthKey: (old.totalChapters || 15) >= 45 ? 'long' : (old.totalChapters || 15) >= 25 ? 'medium' : 'short',
      totalChapters: old.totalChapters,
      book: old.book, chapters: old.chapters || [], eventLog: old.eventLog || [],
      storySynopsis: old.storySynopsis, memoryBook: old.memoryBook,
      lastReadChapter: old.lastReadChapter || 0, createdAt: Date.now()
    };
    app.currentBookId = id;
  }
  migrateBooksInApp();
  try { localStorage.removeItem(STORAGE_KEY_V1); } catch (_) {}
  return true;
}

function applyLoadedAppData() {
  if (!app.books) app.books = {};
  if (!app.readingPrefs) app.readingPrefs = { fontScale: 1, theme: 'dark', immersive: false };
  if (!app.tasteProfiles?.length) app.tasteProfiles = DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  migrateBooksInApp();
  const ids = Object.keys(app.books);
  if (app.currentBookId && app.books[app.currentBookId]) {
    applyBookSnapshot(app.books[app.currentBookId]);
  } else if (ids.length) {
    applyBookSnapshot(app.books[ids[ids.length - 1]]);
    app.currentBookId = state.id;
  } else {
    state = createEmptyBookState();
    state.apiKey = app.apiKey || '';
  }
  state.apiKey = app.apiKey || state.apiKey || '';
  if (!app.readingPrefs?.theme) {
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    app.readingPrefs = app.readingPrefs || { fontScale: 1, immersive: false };
    app.readingPrefs.theme = prefersLight ? 'light' : 'dark';
  }
  if (!app.tasteProfiles?.length) app.tasteProfiles = DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  if (state.writing) { state.writing = false; save(); }
}

async function loadApp() {
  let loaded = false;
  try {
    if ('indexedDB' in window) {
      try {
        const fromIdb = await idbReadApp();
        if (fromIdb) {
          app = fromIdb;
          loaded = true;
        }
      } catch (e) {
        console.warn('IndexedDB read failed, falling back to localStorage', e);
      }
    }
    if (!loaded) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        app = JSON.parse(raw);
        loaded = true;
        if ('indexedDB' in window) {
          try {
            await idbWriteApp(app);
            localStorage.removeItem(STORAGE_KEY);
          } catch (e) {
            console.warn('IndexedDB migration failed', e);
          }
        }
      } else if (migrateFromLegacyV1()) {
        loaded = true;
        save({ immediate: true });
      }
    }
    if (loaded) applyLoadedAppData();
    else state = createEmptyBookState();
  } catch (e) {
    const preservedKey = app?.apiKey || state?.apiKey || '';
    ensureMinimalAppShell();
    if (loaded) {
      state = createEmptyBookState();
      state.apiKey = preservedKey;
      if (app.currentBookId && app.books[app.currentBookId]) {
        try { applyBookSnapshot(app.books[app.currentBookId]); } catch (_) {}
      }
    } else {
      app.apiKey = preservedKey;
      state = createEmptyBookState();
      state.apiKey = preservedKey;
    }
    reportLoadError(e);
  }
}
