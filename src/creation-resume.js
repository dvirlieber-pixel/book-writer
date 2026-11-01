// Pending creation, blueprint helpers, memory book
import * as cfg from './constants.js';
import { store } from './store.js';
import { defaultBookProfile, createEmptyBookState } from './book-model.js';
import {
  popGeminiCallPriority,
  setGeminiCallPriority,
  verifyGeminiApiKey
} from './api.js';
import {
  createBookBlueprint,
  createSequelBlueprint,
  startBookCreation
} from './book-create.js';
import {
  applyBookSnapshot,
  bookSnapshot,
  deepClone,
  normalizeBlueprint,
  sanitizeBookTitle,
  sanitizeChapterTitle,
  syncWelcomeUIFromProfile
} from './book.js';
import {
  generateChapterAt
} from './chapters.js';
import {
  renderLibrary
} from './library.js';
import {
  setWelcomeWizardStep,
  showScreen,
  syncWelcomeApiKeyField
} from './screens.js';
import {
  clearChapterGenerationQueue,
  renderShelf,
  restoreBookAfterFailedCreation,
  shelfCount
} from './shelf.js';
import {
  save
} from './storage.js';
import {
  showError
} from './utils.js';

// ===== יצירת ספר — שמירה והמשך אחרי יציאה מהאפליקציה =====
export function startLoadingStatusRotation() {
  let si = 0;
  const el = document.getElementById('loading-status');
  if (el) el.textContent = cfg.LOADING_STATUS_MESSAGES[0];
  return setInterval(() => {
    si = (si + 1) % cfg.LOADING_STATUS_MESSAGES.length;
    if (el) el.textContent = cfg.LOADING_STATUS_MESSAGES[si];
  }, 2000);
}

export function markPendingCreation(phase, extras = {}) {
  store.app.pendingCreation = {
    bookId: store.state.id,
    phase,
    kind: extras.kind || 'standalone',
    previousBookId: extras.previousBookId ?? null,
    parentBookId: extras.parentBookId ?? null,
    profile: extras.profile != null ? deepClone(extras.profile) : deepClone(store.state.bookProfile || defaultBookProfile()),
    readingLengthKey: store.state.readingLengthKey || extras.readingLengthKey || 'short',
    startedAt: store.app.pendingCreation?.startedAt || Date.now()
  };
  save();
}

export function clearPendingCreation() {
  if (!store.app.pendingCreation) return;
  delete store.app.pendingCreation;
  save();
}

export function abandonPendingCreationToLibrary() {
  const pending = store.app.pendingCreation;
  const bookId = pending?.bookId || store.state.id;
  clearPendingCreation();
  store.bookCreationInFlight = false;
  store.creationResumeRunning = false;
  store.state.writing = false;
  store.state.generatingIdx = null;
  clearChapterGenerationQueue();
  document.getElementById('create-btn').disabled = false;

  if (bookId && store.app.books[bookId]?.book) {
    applyBookSnapshot(store.app.books[bookId]);
    store.app.currentBookId = bookId;
    store.state.apiKey = store.app.apiKey || store.state.apiKey;
    save();
    renderLibrary();
    showScreen('library-screen');
    return;
  }
  if (bookId && store.app.books[bookId]) {
    delete store.app.books[bookId];
    save();
  }
  if (shelfCount() > 0) {
    renderShelf();
    showScreen('shelf-screen');
  } else {
    showScreen('welcome-screen');
  }
}

export function cancelPendingBookCreation() {
  if (!confirm('לבטל את ההכנה ולחזור לספרייה? אפשר להמשיך לקרוא/לכתוב את הפרק הראשון משם.')) return;
  abandonPendingCreationToLibrary();
}

export function expirePendingCreationIfStale() {
  const p = store.app.pendingCreation;
  if (!p?.startedAt) return false;
  if (Date.now() - p.startedAt <= cfg.PENDING_AUTO_RESUME_MS) return false;
  const bookId = p.bookId;
  clearPendingCreation();
  store.bookCreationInFlight = false;
  store.state.writing = false;
  store.state.generatingIdx = null;
  clearChapterGenerationQueue();
  document.getElementById('create-btn').disabled = false;
  if (bookId && store.app.books[bookId]) {
    applyBookSnapshot(store.app.books[bookId]);
    store.app.currentBookId = bookId;
    store.state.apiKey = store.app.apiKey || store.state.apiKey;
    save();
  }
  return true;
}

export function sanitizePendingCreation() {
  if (expirePendingCreationIfStale()) return null;
  const p = store.app.pendingCreation;
  if (!p?.bookId || !p.phase) {
    clearPendingCreation();
    return null;
  }
  const snap = store.app.books[p.bookId];
  if (snap?.chapters?.length > 0) {
    clearPendingCreation();
    return null;
  }
  if (p.phase === 'chapter0' && !snap?.book) p.phase = 'blueprint';
  return p;
}

export function applyPendingCreationState(pending, apiKey) {
  const snap = store.app.books[pending.bookId];
  if (snap) {
    applyBookSnapshot(snap);
    store.app.currentBookId = pending.bookId;
  } else {
    store.state = createEmptyBookState();
    store.state.id = pending.bookId;
    store.state.bookProfile = pending.profile || defaultBookProfile();
    store.state.readingLengthKey = pending.readingLengthKey || 'short';
    store.state.totalChapters = cfg.LENGTH_PRESETS[store.state.readingLengthKey]?.chapters || 15;
    store.state.createdAt = pending.startedAt || Date.now();
    store.state.memoryBook = emptyMemoryBook();
    store.app.currentBookId = pending.bookId;
  }
  store.state.apiKey = apiKey;
  store.app.apiKey = apiKey;
}

export async function finishNewBookChapterZero(pending) {
  document.getElementById('loading-status').textContent = 'מכין את הפרק הראשון...';
  await generateChapterAt(0, { openAfter: true, useLoadingScreen: true });
  clearPendingCreation();
  save();
  document.getElementById('create-btn').disabled = false;
  if (pending?.kind === 'sequel') {
    document.getElementById('loading-title').textContent = 'פותח ספר חדש...';
  }
}

export async function runResumeBlueprint(pending) {
  const apiKey = getStoredApiKey();
  if (!apiKey || !navigator.onLine) return false;

  applyPendingCreationState(pending, apiKey);
  store.app.currentBookId = pending.bookId;

  showScreen('loading-screen');
  const ltEl = document.getElementById('loading-title');
if (ltEl) ltEl.textContent =
    pending.kind === 'sequel' ? 'ממשיך לפתוח המשך...' : 'ממשיך ליצור את הספר...';
  document.getElementById('create-btn').disabled = true;

  const statusInterval = startLoadingStatusRotation();
  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');
  try {
    let bookData;
    if (pending.kind === 'sequel' && pending.parentBookId) {
      const parent = store.app.books[pending.parentBookId];
      if (!parent?.book) throw new Error('ספר המקור לא נמצא');
      bookData = normalizeBlueprint(await createSequelBlueprint(parent));
      store.state.memoryBook = deepClone(parent.memoryBook || emptyMemoryBook());
    } else {
      bookData = normalizeBlueprint(await createBookBlueprint());
      store.state.memoryBook = initMemoryBookFromBlueprint(bookData);
    }
    store.state.book = bookData;
    store.state.seriesTitle = bookData.title;
    store.app.books[store.state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: pending.kind,
      previousBookId: pending.previousBookId,
      parentBookId: pending.parentBookId,
      profile: pending.profile,
      readingLengthKey: pending.readingLengthKey
    });

    clearInterval(statusInterval);
    renderLibrary();
    await finishNewBookChapterZero(pending);
    return true;
  } catch (e) {
    clearInterval(statusInterval);
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    if (pending.kind === 'sequel' && pending.parentBookId && store.app.books[pending.parentBookId]) {
      delete store.app.books[pending.bookId];
      applyBookSnapshot(store.app.books[pending.parentBookId]);
      store.app.currentBookId = pending.parentBookId;
      save();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את יצירת הספר: ' + e.message);
    } else if (store.app.books[pending.bookId]?.book) {
      applyBookSnapshot(store.app.books[pending.bookId]);
      store.app.currentBookId = pending.bookId;
      save();
      renderLibrary();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את יצירת הספר: ' + e.message);
    } else {
      restoreBookAfterFailedCreation(pending.bookId, pending.previousBookId, apiKey);
      showScreen('welcome-screen');
      showError('welcome-error', 'לא הצלחנו להמשיך את יצירת הספר: ' + e.message);
    }
    return true;
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}

export async function runResumeChapter0(pending) {
  const apiKey = getStoredApiKey();
  if (!apiKey || !navigator.onLine) return false;

  applyPendingCreationState(pending, apiKey);
  if (!store.state.book) return runResumeBlueprint(pending);

  showScreen('loading-screen');
  const ltEl = document.getElementById('loading-title');
if (ltEl) ltEl.textContent =
    pending.kind === 'sequel' ? 'ממשיך לפתוח המשך...' : 'ממשיך ליצור את הספר...';

  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');
  try {
    renderLibrary();
    await finishNewBookChapterZero(pending);
    return true;
  } catch (e) {
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    if (store.app.books[pending.bookId]?.book) {
      applyBookSnapshot(store.app.books[pending.bookId]);
      store.app.currentBookId = pending.bookId;
      save();
      renderLibrary();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    } else if (pending.kind === 'sequel' && pending.parentBookId && store.app.books[pending.parentBookId]) {
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    } else {
      showScreen('welcome-screen');
      showError('welcome-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    }
    return true;
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}

export async function tryResumePendingCreation() {
  if (store.creationResumeRunning || store.state.writing || store.bookCreationInFlight) return false;
  const pending = sanitizePendingCreation();
  if (!pending) return false;

  store.creationResumeRunning = true;
  try {
    if (pending.phase === 'blueprint') return await runResumeBlueprint(pending);
    if (pending.phase === 'chapter0') return await runResumeChapter0(pending);
    clearPendingCreation();
    return false;
  } finally {
    store.creationResumeRunning = false;
  }
}

export function updateWelcomeShelfLink() {
  const link = document.getElementById('welcome-shelf-link');
  if (link) link.style.display = shelfCount() > 0 ? 'block' : 'none';
}

export function startRandomBook() {
  const genreKeys = Object.keys(cfg.GENRES);
  const toneKeys = Object.keys(cfg.TONES);
  const profile = {
    ...defaultBookProfile(),
    genre: genreKeys[Math.floor(Math.random() * genreKeys.length)],
    tone: toneKeys[Math.floor(Math.random() * toneKeys.length)]
  };
  syncWelcomeUIFromProfile(profile, store.readingLengthKey);
  startBookCreation();
}

let apiKeyVerifyCache = { key: '', state: 'idle', message: '' };
let apiKeyVerifyInFlight = false;
let apiKeyVerifyAutoKey = '';

export function getStoredApiKey() {
  return (document.getElementById('api-key-input')?.value.trim() || store.app.apiKey || store.state.apiKey || '').trim();
}

export function showApiKeyVerifyError(msg) {
  const el = document.getElementById('api-key-verify-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

export function hideApiKeyVerifyError() {
  showApiKeyVerifyError('');
}

export function invalidateApiKeyVerification() {
  const key = getStoredApiKey();
  if (apiKeyVerifyCache.key && apiKeyVerifyCache.key !== key) {
    apiKeyVerifyCache = { key: '', state: 'idle', message: '' };
    updateApiKeyVerifyUI('idle');
    hideApiKeyVerifyError();
  }
}

export function updateApiKeyVerifyUI(forcedState) {
  const indicator = document.getElementById('api-key-verify-indicator');
  const btn = document.getElementById('api-verify-btn');
  if (!indicator) return;

  const key = getStoredApiKey();
  let verifyState = forcedState;
  if (!verifyState) {
    if (apiKeyVerifyInFlight) verifyState = 'checking';
    else if (apiKeyVerifyCache.key === key) verifyState = apiKeyVerifyCache.state;
    else verifyState = 'idle';
  }

  if (verifyState === 'idle' || !key) {
    indicator.hidden = true;
    indicator.className = 'api-key-verify-indicator';
    indicator.textContent = '';
    if (btn) btn.disabled = false;
    return;
  }

  indicator.hidden = false;
  indicator.className = `api-key-verify-indicator is-${verifyState}`;

  if (verifyState === 'checking') {
    indicator.innerHTML = '<span class="api-verify-spinner" aria-hidden="true"></span><span>בודק מפתח...</span>';
    if (btn) btn.disabled = true;
  } else if (verifyState === 'valid') {
    indicator.innerHTML = '<span class="api-verify-icon valid" aria-hidden="true">✓</span><span>מפתח תקין</span>';
    if (btn) btn.disabled = false;
  } else if (verifyState === 'invalid') {
    indicator.innerHTML = '<span class="api-verify-icon invalid" aria-hidden="true">✗</span><span>מפתח לא תקין</span>';
    if (btn) btn.disabled = false;
  }
}

export async function runApiKeyVerification({ auto = false } = {}) {
  const key = (document.getElementById('api-key-input')?.value.trim() || '').trim();
  if (!key) {
    if (!auto) showApiKeyVerifyError('הזן מפתח לפני הבדיקה.');
    updateApiKeyVerifyUI('idle');
    return { ok: false, message: 'הזן מפתח לפני הבדיקה.' };
  }

  if (apiKeyVerifyCache.key === key && apiKeyVerifyCache.state === 'valid') {
    updateApiKeyVerifyUI('valid');
    hideApiKeyVerifyError();
    return { ok: true };
  }

  if (apiKeyVerifyInFlight) return { ok: false };

  if (!navigator.onLine) {
    const msg = 'אין חיבור רשת — לא ניתן לבדוק את המפתח כרגע.';
    if (!auto) showApiKeyVerifyError(msg);
    return { ok: false, message: msg };
  }

  apiKeyVerifyInFlight = true;
  updateApiKeyVerifyUI('checking');
  hideApiKeyVerifyError();

  const result = await verifyGeminiApiKey(key);
  apiKeyVerifyInFlight = false;

  if (result.ok) {
    store.app.apiKey = key;
    store.state.apiKey = key;
    save();
    apiKeyVerifyCache = { key, state: 'valid', message: '' };
    updateApiKeyVerifyUI('valid');
    updateApiKeyStatus();
    hideApiKeyVerifyError();
    return { ok: true };
  }

  apiKeyVerifyCache = { key, state: 'invalid', message: result.message || '' };
  updateApiKeyVerifyUI('invalid');
  if (!auto) showApiKeyVerifyError(result.message || 'המפתח לא תקין.');
  return { ok: false, message: result.message };
}

export function validateApiKey() {
  runApiKeyVerification({ auto: false });
}

export async function ensureApiKeyVerified() {
  const key = getStoredApiKey();
  if (!key) return { ok: false, message: 'נדרש מפתח Gemini אישי.' };
  if (apiKeyVerifyCache.key === key && apiKeyVerifyCache.state === 'valid') return { ok: true };
  return runApiKeyVerification({ auto: true });
}

export function maybeAutoVerifyApiKey() {
  const key = getStoredApiKey();
  if (!key || key.length < 8) return;
  if (apiKeyVerifyCache.key === key && apiKeyVerifyCache.state === 'valid') {
    updateApiKeyVerifyUI('valid');
    return;
  }
  if (apiKeyVerifyAutoKey === key && (apiKeyVerifyInFlight || apiKeyVerifyCache.key === key)) return;
  apiKeyVerifyAutoKey = key;
  runApiKeyVerification({ auto: true });
}

export function updateApiKeyStatus() {
  const el = document.getElementById('api-key-status');
  if (!el) return;
  const key = getStoredApiKey();
  if (key.length > 8) {
    const verified = apiKeyVerifyCache.key === key && apiKeyVerifyCache.state === 'valid';
    el.textContent = verified
      ? '✓ מפתח שמור ואומת (מסתיים ב-…' + key.slice(-4) + ')'
      : 'מפתח שמור במכשיר (מסתיים ב-…' + key.slice(-4) + ') — לחץ "בדוק מפתח" לאימות';
    el.className = 'api-key-status saved';
  } else {
    el.textContent = 'טרם הוזן מפתח — נדרש לפני פתיחת ספר';
    el.className = 'api-key-status';
  }
}

export function onApiKeyInput() {
  invalidateApiKeyVerification();
  updateApiKeyStatus();
}

export function saveApiKeyFromInput() {
  const key = document.getElementById('api-key-input')?.value.trim();
  if (!key) return;
  store.app.apiKey = key;
  store.state.apiKey = key;
  save();
  updateApiKeyStatus();
}

export function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  const btn = document.querySelector('.api-show-key-btn');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (btn) btn.textContent = show ? 'הסתר' : 'הצג';
}

export function openWelcomeApiSettings() {
  if (store.state.book && store.state.id) {
    store.app.books[store.state.id] = bookSnapshot();
    save();
  }
  showScreen('welcome-screen');
  updateWelcomeShelfLink();
  document.getElementById('create-btn').disabled = false;
  syncWelcomeApiKeyField();
  setWelcomeWizardStep(3, { focusApi: true });
}

export function setWritingStatus(msg) {
  const el = document.getElementById('writing-status-text');
  if (el) el.textContent = msg;
}

export function setPreparingStatus(msg, useLoadingScreen) {
  if (useLoadingScreen) {
    const el = document.getElementById('loading-status');
    if (el) el.textContent = msg;
  } else {
    setWritingStatus(msg);
  }
}

export function showReadingPreparing(show, msg) {
  const box = document.getElementById('reading-preparing');
  const text = document.getElementById('reading-preparing-text');
  if (!box) return;
  box.classList.toggle('active', show);
  if (msg && text) text.textContent = msg;
}

export function waitForGeneration() {
  return new Promise(resolve => {
    const tick = () => {
      if (!store.state.writing) resolve();
      else setTimeout(tick, 400);
    };
    tick();
  });
}

export function isReadingScreenActive() {
  return document.getElementById('reading-screen')?.classList.contains('active');
}

export function parseJsonFromResponse(raw) {
  const cleaned = raw.replace(/`{3}json/gi, '').replace(/`{3}/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]); }
  catch(e) {
    try { return JSON.parse(cleaned); } catch(e2) { return null; }
  }
}

export function isBlueprintTruncated(finishReason) {
  return finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH';
}

export function normalizeChapterOutlines(book, expectedCount) {
  const defaultPov = book.chapterOutlines?.[0]?.pov?.trim()
    || book.mainCharacters?.[0]?.name
    || 'הגיבור';
  const text = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const outlines = (book.chapterOutlines || []).slice(0, expectedCount).map((ch, i) => {
    const out = {
      number: i + 1,
      title: sanitizeChapterTitle(ch.title, i + 1),
      summary: (text(ch.summary, 600) || 'המשך ההרפתקה'),
      pov: ((ch.pov || defaultPov).trim() || defaultPov)
    };
    // Story-bible outline fields (books created before them simply don't have these)
    for (const f of ['purpose', 'conflict', 'turn', 'hook']) {
      if (text(ch[f])) out[f] = text(ch[f]);
    }
    const threads = Array.isArray(ch.threads) ? ch.threads.map(t => text(t, 80)).filter(Boolean) : [];
    if (threads.length) out.threads = threads;
    return out;
  });
  while (outlines.length < expectedCount) {
    const n = outlines.length + 1;
    outlines.push({
      number: n,
      title: `פרק ${n}`,
      summary: 'המשך ההרפתקה',
      pov: defaultPov
    });
  }
  book.chapterOutlines = outlines;
  book.title = sanitizeBookTitle(book.title);
  return book;
}

export function emptyMemoryBook() {
  return { characters: [], locations: [], keyObjects: [], worldRules: [], openMysteries: [] };
}

export function migrateMemoryBook(mb) {
  if (!mb) return emptyMemoryBook();
  const out = { ...emptyMemoryBook(), ...mb };
  if (!out.worldRules?.length && mb.magicRules?.length) {
    out.worldRules = mb.magicRules.map(r => ({
      rule: r.rule,
      establishedInChapter: r.establishedInChapter,
      notes: r.notes
    }));
  }
  if (!out.keyObjects?.length && mb.artifacts?.length) {
    out.keyObjects = mb.artifacts.map(a => ({
      name: a.name,
      description: a.description,
      owner: a.owner,
      status: a.status
    }));
  }
  return out;
}

export function ensureMemoryBook() {
  if (!store.state.memoryBook) {
    store.state.memoryBook = store.state.book ? initMemoryBookFromBlueprint(store.state.book) : emptyMemoryBook();
  } else {
    store.state.memoryBook = migrateMemoryBook(store.state.memoryBook);
  }
}

export function initMemoryBookFromBlueprint(book) {
  const b = normalizeBlueprint(book);
  return {
    characters: (b.mainCharacters || []).map(c => ({
      name: c.name,
      ...(c.gender ? { gender: c.gender } : {}),
      role: c.role || '',
      status: 'פעיל',
      notes: c.trait || ''
    })),
    locations: b.setting ? [{ name: 'הגדרה', description: b.setting, significance: 'בסיס' }] : [],
    keyObjects: [],
    worldRules: b.coreRules
      ? [{ rule: b.coreRules, establishedInChapter: 0, notes: 'כללי עולם' }]
      : [],
    openMysteries: []
  };
}

export function formatMemoryBookForPrompt() {
  ensureMemoryBook();
  const mb = store.state.memoryBook;
  const fmt = (arr, lineFn) => (arr?.length ? arr.map(lineFn).join('\n') : '(ריק)');
  const objects = mb.keyObjects?.length ? mb.keyObjects : mb.artifacts;
  const rules = mb.worldRules?.length ? mb.worldRules : mb.magicRules;
  return `**ספר הזיכרון (עובדות מוסכמות — חובה לשמור על עקביות):**

דמויות:
${fmt(mb.characters, c => `- ${c.name}${c.gender ? ` [${c.gender}]` : ''} (${c.role}): ${c.status}. ${c.notes || ''}`)}

מקומות:
${fmt(mb.locations, l => `- ${l.name}: ${l.description}. ${l.significance || ''}`)}

חפצים ואובייקטים מרכזיים:
${fmt(objects, a => `- ${a.name}: ${a.description}. בעלים: ${a.owner || '?'}. ${a.status || ''}`)}

כללי עולם:
${fmt(rules, r => `- ${r.rule} (מוכר מפרק ${r.establishedInChapter || 0}). ${r.notes || ''}`)}

תעלומות ושאלות פתוחות:
${fmt(mb.openMysteries, m => `- ${m.question} [${m.status || 'פתוח'}, מפרק ${m.introducedChapter || '?'}]. רמזים: ${m.clues || ''}`)}`;
}
