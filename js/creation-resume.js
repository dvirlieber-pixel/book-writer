// Pending creation, blueprint helpers, memory book
// ===== יצירת ספר — שמירה והמשך אחרי יציאה מהאפליקציה =====
let creationResumeRunning = false;
const PENDING_AUTO_RESUME_MS = 30 * 60 * 1000;

const LOADING_STATUS_MESSAGES = [
  'בוחר את שולחן הכתיבה...',
  'מכין את ההגדרה...',
  'מייצר דמויות...',
  'מתכנן את העלילה...',
  'מסדר את תוכן העניינים...'
];

function startLoadingStatusRotation() {
  let si = 0;
  const el = document.getElementById('loading-status');
  if (el) el.textContent = LOADING_STATUS_MESSAGES[0];
  return setInterval(() => {
    si = (si + 1) % LOADING_STATUS_MESSAGES.length;
    if (el) el.textContent = LOADING_STATUS_MESSAGES[si];
  }, 2000);
}

function markPendingCreation(phase, extras = {}) {
  app.pendingCreation = {
    bookId: state.id,
    phase,
    kind: extras.kind || 'standalone',
    previousBookId: extras.previousBookId ?? null,
    parentBookId: extras.parentBookId ?? null,
    profile: extras.profile != null ? deepClone(extras.profile) : deepClone(state.bookProfile || defaultBookProfile()),
    readingLengthKey: state.readingLengthKey || extras.readingLengthKey || 'short',
    startedAt: app.pendingCreation?.startedAt || Date.now()
  };
  save();
}

function clearPendingCreation() {
  if (!app.pendingCreation) return;
  delete app.pendingCreation;
  save();
}

function abandonPendingCreationToLibrary() {
  const pending = app.pendingCreation;
  const bookId = pending?.bookId || state.id;
  clearPendingCreation();
  bookCreationInFlight = false;
  creationResumeRunning = false;
  state.writing = false;
  state.generatingIdx = null;
  clearChapterGenerationQueue();
  document.getElementById('create-btn').disabled = false;

  if (bookId && app.books[bookId]?.book) {
    applyBookSnapshot(app.books[bookId]);
    app.currentBookId = bookId;
    state.apiKey = app.apiKey || state.apiKey;
    save();
    renderLibrary();
    showScreen('library-screen');
    return;
  }
  if (bookId && app.books[bookId]) {
    delete app.books[bookId];
    save();
  }
  if (shelfCount() > 0) {
    renderShelf();
    showScreen('shelf-screen');
  } else {
    showScreen('welcome-screen');
  }
}

function cancelPendingBookCreation() {
  if (!confirm('לבטל את ההכנה ולחזור לספרייה? אפשר להמשיך לקרוא/לכתוב את הפרק הראשון משם.')) return;
  abandonPendingCreationToLibrary();
}

function expirePendingCreationIfStale() {
  const p = app.pendingCreation;
  if (!p?.startedAt) return false;
  if (Date.now() - p.startedAt <= PENDING_AUTO_RESUME_MS) return false;
  const bookId = p.bookId;
  clearPendingCreation();
  bookCreationInFlight = false;
  state.writing = false;
  state.generatingIdx = null;
  clearChapterGenerationQueue();
  document.getElementById('create-btn').disabled = false;
  if (bookId && app.books[bookId]) {
    applyBookSnapshot(app.books[bookId]);
    app.currentBookId = bookId;
    state.apiKey = app.apiKey || state.apiKey;
    save();
  }
  return true;
}

function sanitizePendingCreation() {
  if (expirePendingCreationIfStale()) return null;
  const p = app.pendingCreation;
  if (!p?.bookId || !p.phase) {
    clearPendingCreation();
    return null;
  }
  const snap = app.books[p.bookId];
  if (snap?.chapters?.length > 0) {
    clearPendingCreation();
    return null;
  }
  if (p.phase === 'chapter0' && !snap?.book) p.phase = 'blueprint';
  return p;
}

function applyPendingCreationState(pending, apiKey) {
  const snap = app.books[pending.bookId];
  if (snap) {
    applyBookSnapshot(snap);
    app.currentBookId = pending.bookId;
  } else {
    state = createEmptyBookState();
    state.id = pending.bookId;
    state.bookProfile = pending.profile || defaultBookProfile();
    state.readingLengthKey = pending.readingLengthKey || 'short';
    state.totalChapters = LENGTH_PRESETS[state.readingLengthKey]?.chapters || 15;
    state.createdAt = pending.startedAt || Date.now();
    state.memoryBook = emptyMemoryBook();
    app.currentBookId = pending.bookId;
  }
  state.apiKey = apiKey;
  app.apiKey = apiKey;
}

async function finishNewBookChapterZero(pending) {
  document.getElementById('loading-status').textContent = 'מכין את הפרק הראשון...';
  await generateChapterAt(0, { openAfter: true, useLoadingScreen: true });
  clearPendingCreation();
  save();
  document.getElementById('create-btn').disabled = false;
  if (pending?.kind === 'sequel') {
    document.getElementById('loading-title').textContent = 'פותח ספר חדש...';
  }
}

async function runResumeBlueprint(pending) {
  const apiKey = getStoredApiKey();
  if (!apiKey || !navigator.onLine) return false;

  applyPendingCreationState(pending, apiKey);
  app.currentBookId = pending.bookId;

  showScreen('loading-screen');
  const ltEl = document.getElementById('loading-title');
if (ltEl) ltEl.textContent =
    pending.kind === 'sequel' ? 'ממשיך לפתוח המשך...' : 'ממשיך ליצור את הספר...';
  document.getElementById('create-btn').disabled = true;

  const statusInterval = startLoadingStatusRotation();
  bookCreationInFlight = true;
  setGeminiCallPriority('high');
  try {
    let bookData;
    if (pending.kind === 'sequel' && pending.parentBookId) {
      const parent = app.books[pending.parentBookId];
      if (!parent?.book) throw new Error('ספר המקור לא נמצא');
      bookData = normalizeBlueprint(await createSequelBlueprint(parent));
      state.memoryBook = deepClone(parent.memoryBook || emptyMemoryBook());
    } else {
      bookData = normalizeBlueprint(await createBookBlueprint());
      state.memoryBook = initMemoryBookFromBlueprint(bookData);
    }
    state.book = bookData;
    state.seriesTitle = bookData.title;
    app.books[state.id] = bookSnapshot();
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
    if (pending.kind === 'sequel' && pending.parentBookId && app.books[pending.parentBookId]) {
      delete app.books[pending.bookId];
      applyBookSnapshot(app.books[pending.parentBookId]);
      app.currentBookId = pending.parentBookId;
      save();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את יצירת הספר: ' + e.message);
    } else if (app.books[pending.bookId]?.book) {
      applyBookSnapshot(app.books[pending.bookId]);
      app.currentBookId = pending.bookId;
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
    bookCreationInFlight = false;
  }
}

async function runResumeChapter0(pending) {
  const apiKey = getStoredApiKey();
  if (!apiKey || !navigator.onLine) return false;

  applyPendingCreationState(pending, apiKey);
  if (!state.book) return runResumeBlueprint(pending);

  showScreen('loading-screen');
  const ltEl = document.getElementById('loading-title');
if (ltEl) ltEl.textContent =
    pending.kind === 'sequel' ? 'ממשיך לפתוח המשך...' : 'ממשיך ליצור את הספר...';

  bookCreationInFlight = true;
  setGeminiCallPriority('high');
  try {
    renderLibrary();
    await finishNewBookChapterZero(pending);
    return true;
  } catch (e) {
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    if (app.books[pending.bookId]?.book) {
      applyBookSnapshot(app.books[pending.bookId]);
      app.currentBookId = pending.bookId;
      save();
      renderLibrary();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    } else if (pending.kind === 'sequel' && pending.parentBookId && app.books[pending.parentBookId]) {
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    } else {
      showScreen('welcome-screen');
      showError('welcome-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    }
    return true;
  } finally {
    popGeminiCallPriority();
    bookCreationInFlight = false;
  }
}

async function tryResumePendingCreation() {
  if (creationResumeRunning || state.writing || bookCreationInFlight) return false;
  const pending = sanitizePendingCreation();
  if (!pending) return false;

  creationResumeRunning = true;
  try {
    if (pending.phase === 'blueprint') return await runResumeBlueprint(pending);
    if (pending.phase === 'chapter0') return await runResumeChapter0(pending);
    clearPendingCreation();
    return false;
  } finally {
    creationResumeRunning = false;
  }
}

function updateWelcomeShelfLink() {
  const link = document.getElementById('welcome-shelf-link');
  if (link) link.style.display = shelfCount() > 0 ? 'block' : 'none';
}

function startRandomBook() {
  const genreKeys = Object.keys(GENRES);
  const toneKeys = Object.keys(TONES);
  const profile = {
    ...defaultBookProfile(),
    genre: genreKeys[Math.floor(Math.random() * genreKeys.length)],
    tone: toneKeys[Math.floor(Math.random() * toneKeys.length)]
  };
  syncWelcomeUIFromProfile(profile, readingLengthKey);
  startBookCreation();
}

let apiKeyVerifyCache = { key: '', state: 'idle', message: '' };
let apiKeyVerifyInFlight = false;
let apiKeyVerifyAutoKey = '';

function getStoredApiKey() {
  return (document.getElementById('api-key-input')?.value.trim() || app.apiKey || state.apiKey || '').trim();
}

function showApiKeyVerifyError(msg) {
  const el = document.getElementById('api-key-verify-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function hideApiKeyVerifyError() {
  showApiKeyVerifyError('');
}

function invalidateApiKeyVerification() {
  const key = getStoredApiKey();
  if (apiKeyVerifyCache.key && apiKeyVerifyCache.key !== key) {
    apiKeyVerifyCache = { key: '', state: 'idle', message: '' };
    updateApiKeyVerifyUI('idle');
    hideApiKeyVerifyError();
  }
}

function updateApiKeyVerifyUI(forcedState) {
  const indicator = document.getElementById('api-key-verify-indicator');
  const btn = document.getElementById('api-verify-btn');
  if (!indicator) return;

  const key = getStoredApiKey();
  let state = forcedState;
  if (!state) {
    if (apiKeyVerifyInFlight) state = 'checking';
    else if (apiKeyVerifyCache.key === key) state = apiKeyVerifyCache.state;
    else state = 'idle';
  }

  if (state === 'idle' || !key) {
    indicator.hidden = true;
    indicator.className = 'api-key-verify-indicator';
    indicator.textContent = '';
    if (btn) btn.disabled = false;
    return;
  }

  indicator.hidden = false;
  indicator.className = `api-key-verify-indicator is-${state}`;

  if (state === 'checking') {
    indicator.innerHTML = '<span class="api-verify-spinner" aria-hidden="true"></span><span>בודק מפתח...</span>';
    if (btn) btn.disabled = true;
  } else if (state === 'valid') {
    indicator.innerHTML = '<span class="api-verify-icon valid" aria-hidden="true">✓</span><span>מפתח תקין</span>';
    if (btn) btn.disabled = false;
  } else if (state === 'invalid') {
    indicator.innerHTML = '<span class="api-verify-icon invalid" aria-hidden="true">✗</span><span>מפתח לא תקין</span>';
    if (btn) btn.disabled = false;
  }
}

async function runApiKeyVerification({ auto = false } = {}) {
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
    app.apiKey = key;
    state.apiKey = key;
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

function validateApiKey() {
  runApiKeyVerification({ auto: false });
}

async function ensureApiKeyVerified() {
  const key = getStoredApiKey();
  if (!key) return { ok: false, message: 'נדרש מפתח Gemini אישי.' };
  if (apiKeyVerifyCache.key === key && apiKeyVerifyCache.state === 'valid') return { ok: true };
  return runApiKeyVerification({ auto: true });
}

function maybeAutoVerifyApiKey() {
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

function updateApiKeyStatus() {
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

function onApiKeyInput() {
  invalidateApiKeyVerification();
  updateApiKeyStatus();
}

function saveApiKeyFromInput() {
  const key = document.getElementById('api-key-input')?.value.trim();
  if (!key) return;
  app.apiKey = key;
  state.apiKey = key;
  save();
  updateApiKeyStatus();
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  const btn = document.querySelector('.api-show-key-btn');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (btn) btn.textContent = show ? 'הסתר' : 'הצג';
}

function openWelcomeApiSettings() {
  if (state.book && state.id) {
    app.books[state.id] = bookSnapshot();
    save();
  }
  showScreen('welcome-screen');
  updateWelcomeShelfLink();
  document.getElementById('create-btn').disabled = false;
  syncWelcomeApiKeyField();
  setWelcomeWizardStep(3, { focusApi: true });
}

function setWritingStatus(msg) {
  const el = document.getElementById('writing-status-text');
  if (el) el.textContent = msg;
}

function setPreparingStatus(msg, useLoadingScreen) {
  if (useLoadingScreen) {
    const el = document.getElementById('loading-status');
    if (el) el.textContent = msg;
  } else {
    setWritingStatus(msg);
  }
}

function showReadingPreparing(show, msg) {
  const box = document.getElementById('reading-preparing');
  const text = document.getElementById('reading-preparing-text');
  if (!box) return;
  box.classList.toggle('active', show);
  if (msg && text) text.textContent = msg;
}

function waitForGeneration() {
  return new Promise(resolve => {
    const tick = () => {
      if (!state.writing) resolve();
      else setTimeout(tick, 400);
    };
    tick();
  });
}

function isReadingScreenActive() {
  return document.getElementById('reading-screen')?.classList.contains('active');
}

function parseJsonFromResponse(raw) {
  const cleaned = raw.replace(/`{3}json/gi, '').replace(/`{3}/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]); }
  catch(e) {
    try { return JSON.parse(cleaned); } catch(e2) { return null; }
  }
}

function blueprintMaxTokens(chapterCount) {
  return Math.min(16000, Math.max(6000, 3500 + chapterCount * 200));
}

function isBlueprintTruncated(finishReason) {
  return finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH';
}

function normalizeChapterOutlines(book, expectedCount) {
  const defaultPov = book.chapterOutlines?.[0]?.pov?.trim()
    || book.mainCharacters?.[0]?.name
    || 'הגיבור';
  const outlines = (book.chapterOutlines || []).slice(0, expectedCount).map((ch, i) => ({
    number: i + 1,
    title: sanitizeChapterTitle(ch.title, i + 1),
    summary: ((ch.summary || '').trim() || 'המשך ההרפתקה').slice(0, 400),
    pov: ((ch.pov || defaultPov).trim() || defaultPov)
  }));
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

async function requestBookBlueprint(prompt, expectedCount) {
  const maxTokens = blueprintMaxTokens(expectedCount);
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, finishReason } = await callGeminiLiteRaw(prompt, '', maxTokens, { jsonMode: true });
      if (isBlueprintTruncated(finishReason)) {
        lastErr = new Error('תוכנית הספר נקטעה באמצע — מנסה שוב');
        continue;
      }
      const book = parseJsonFromResponse(text);
      if (!book?.title?.trim() || !book.chapterOutlines?.length) {
        lastErr = new Error('תשובת ה-AI לא כללה JSON תקין — נסה שוב');
        continue;
      }
      return normalizeChapterOutlines(book, expectedCount);
    } catch (e) {
      lastErr = e;
      if (e.message?.includes('הגעת למכסה') || e.modelNotFound) throw e;
    }
  }
  throw lastErr || new Error('לא הצלחנו ליצור תוכנית ספר — נסה שוב');
}

function emptyMemoryBook() {
  return { characters: [], locations: [], keyObjects: [], worldRules: [], openMysteries: [] };
}

function migrateMemoryBook(mb) {
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

function ensureMemoryBook() {
  if (!state.memoryBook) {
    state.memoryBook = state.book ? initMemoryBookFromBlueprint(state.book) : emptyMemoryBook();
  } else {
    state.memoryBook = migrateMemoryBook(state.memoryBook);
  }
}

function initMemoryBookFromBlueprint(book) {
  const b = normalizeBlueprint(book);
  return {
    characters: (b.mainCharacters || []).map(c => ({
      name: c.name,
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

function formatMemoryBookForPrompt() {
  ensureMemoryBook();
  const mb = state.memoryBook;
  const fmt = (arr, lineFn) => (arr?.length ? arr.map(lineFn).join('\n') : '(ריק)');
  const objects = mb.keyObjects?.length ? mb.keyObjects : mb.artifacts;
  const rules = mb.worldRules?.length ? mb.worldRules : mb.magicRules;
  return `**ספר הזיכרון (עובדות מוסכמות — חובה לשמור על עקביות):**

דמויות:
${fmt(mb.characters, c => `- ${c.name} (${c.role}): ${c.status}. ${c.notes || ''}`)}

מקומות:
${fmt(mb.locations, l => `- ${l.name}: ${l.description}. ${l.significance || ''}`)}

חפצים ואובייקטים מרכזיים:
${fmt(objects, a => `- ${a.name}: ${a.description}. בעלים: ${a.owner || '?'}. ${a.status || ''}`)}

כללי עולם:
${fmt(rules, r => `- ${r.rule} (מוכר מפרק ${r.establishedInChapter || 0}). ${r.notes || ''}`)}

תעלומות ושאלות פתוחות:
${fmt(mb.openMysteries, m => `- ${m.question} [${m.status || 'פתוח'}, מפרק ${m.introducedChapter || '?'}]. רמזים: ${m.clues || ''}`)}`;
}
