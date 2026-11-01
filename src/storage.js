// IndexedDB & localStorage persistence
import * as cfg from './constants.js';
import { store } from './store.js';
import { createEmptyBookState } from './book-model.js';
import {
  applyBookSnapshot,
  bookSnapshot,
  migrateBooksInApp,
  migrateLegacyTaste,
  newBookId
} from './book.js';
import {
  showError
} from './utils.js';

export function openAppDb() {
  if (!store.idbPromise) {
    store.idbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(cfg.IDB_NAME, cfg.IDB_VERSION);
      req.onupgradeneeded = (e) => {
        if (!e.target.result.objectStoreNames.contains(cfg.IDB_STORE)) {
          e.target.result.createObjectStore(cfg.IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return store.idbPromise;
}

export function idbRequestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbReadApp() {
  const db = await openAppDb();
  const tx = db.transaction(cfg.IDB_STORE, 'readonly');
  return idbRequestToPromise(tx.objectStore(cfg.IDB_STORE).get(cfg.STORAGE_KEY));
}

export async function idbWriteApp(data) {
  const db = await openAppDb();
  const tx = db.transaction(cfg.IDB_STORE, 'readwrite');
  tx.objectStore(cfg.IDB_STORE).put(data, cfg.STORAGE_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function syncAppFromState() {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  if (store.state.apiKey) store.app.apiKey = store.state.apiKey;
  if (store.state.id) store.app.currentBookId = store.state.id;
}

export function reportStorageError(e) {
  console.error('save failed', e);
  if (e.name === 'QuotaExceededError' || e.code === 22) {
    const msg = 'אין מספיק מקום באחסון — שחרר מקום או מחק ספרים מהמדף.';
    showError('library-error', msg);
    showError('welcome-error', msg);
  }
}

export function reportLoadError(e) {
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

export function ensureMinimalAppShell() {
  if (!store.app.books) store.app.books = {};
  if (!store.app.readingPrefs) store.app.readingPrefs = { fontScale: 1, theme: 'dark', immersive: false };
  if (store.app.lastReadingSession === undefined) store.app.lastReadingSession = null;
}

export async function flushSave() {
  syncAppFromState();
  try {
    await idbWriteApp(store.app);
    try { localStorage.removeItem(cfg.STORAGE_KEY); } catch (_) {}
  } catch (e) {
    reportStorageError(e);
    try {
      localStorage.setItem(cfg.STORAGE_KEY, JSON.stringify(store.app));
    } catch (e2) {
      reportStorageError(e2);
    }
  }
}

export function save(opts = {}) {
  syncAppFromState();
  if (opts.immediate) {
    clearTimeout(store.saveTimer);
    return flushSave();
  }
  clearTimeout(store.saveTimer);
  store.saveTimer = setTimeout(flushSave, cfg.SAVE_DEBOUNCE_MS);
}

export function migrateFromLegacyV1() {
  const v1 = localStorage.getItem(cfg.STORAGE_KEY_V1);
  if (!v1) return false;
  const old = JSON.parse(v1);
  store.app = { apiKey: old.apiKey || '', currentBookId: null, books: {}, readingPrefs: { fontScale: 1, theme: 'dark' } };
  if (old.book) {
    const id = newBookId();
    old.id = id;
    const taste = old.taste || 'hard-magic';
    old.storySynopsis = old.storySynopsis || '';
    store.app.books[id] = {
      id,
      bookProfile: migrateLegacyTaste(taste),
      readingLengthKey: (old.totalChapters || 15) >= 45 ? 'long' : (old.totalChapters || 15) >= 25 ? 'medium' : 'short',
      totalChapters: old.totalChapters,
      book: old.book, chapters: old.chapters || [], eventLog: old.eventLog || [],
      storySynopsis: old.storySynopsis, memoryBook: old.memoryBook,
      lastReadChapter: old.lastReadChapter || 0, createdAt: Date.now()
    };
    store.app.currentBookId = id;
  }
  migrateBooksInApp();
  try { localStorage.removeItem(cfg.STORAGE_KEY_V1); } catch (_) {}
  return true;
}

export function applyLoadedAppData() {
  ensureMinimalAppShell();
  if (store.app.lastReadingSession?.bookId && !store.app.books[store.app.lastReadingSession.bookId]) {
    store.app.lastReadingSession = null;
  }
  if (!store.app.tasteProfiles?.length) store.app.tasteProfiles = cfg.DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  migrateBooksInApp();
  const ids = Object.keys(store.app.books);
  if (store.app.currentBookId && store.app.books[store.app.currentBookId]) {
    applyBookSnapshot(store.app.books[store.app.currentBookId]);
  } else if (ids.length) {
    applyBookSnapshot(store.app.books[ids[ids.length - 1]]);
    store.app.currentBookId = store.state.id;
  } else {
    store.state = createEmptyBookState();
    store.state.apiKey = store.app.apiKey || '';
  }
  store.state.apiKey = store.app.apiKey || store.state.apiKey || '';
  if (!store.app.readingPrefs?.theme) {
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    store.app.readingPrefs = store.app.readingPrefs || { fontScale: 1, immersive: false };
    store.app.readingPrefs.theme = prefersLight ? 'light' : 'dark';
  }
  if (store.state.writing) { store.state.writing = false; save(); }
}

export async function loadApp() {
  let loaded = false;
  try {
    if ('indexedDB' in window) {
      try {
        const fromIdb = await idbReadApp();
        if (fromIdb) {
          store.app = fromIdb;
          loaded = true;
        }
      } catch (e) {
        console.warn('IndexedDB read failed, falling back to localStorage', e);
      }
    }
    if (!loaded) {
      const raw = localStorage.getItem(cfg.STORAGE_KEY);
      if (raw) {
        store.app = JSON.parse(raw);
        loaded = true;
        if ('indexedDB' in window) {
          try {
            await idbWriteApp(store.app);
            localStorage.removeItem(cfg.STORAGE_KEY);
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
    else store.state = createEmptyBookState();
  } catch (e) {
    const preservedKey = store.app?.apiKey || store.state?.apiKey || '';
    ensureMinimalAppShell();
    if (loaded) {
      store.state = createEmptyBookState();
      store.state.apiKey = preservedKey;
      if (store.app.currentBookId && store.app.books[store.app.currentBookId]) {
        try { applyBookSnapshot(store.app.books[store.app.currentBookId]); } catch (_) {}
      }
    } else {
      store.app.apiKey = preservedKey;
      store.state = createEmptyBookState();
      store.state.apiKey = preservedKey;
    }
    reportLoadError(e);
  }
}
