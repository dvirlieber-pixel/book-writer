// New book & sequel creation
import * as cfg from './constants.js';
import { store } from './store.js';
import { createEmptyBookState } from './book-model.js';
import {
  popGeminiCallPriority,
  setGeminiCallPriority
} from './api.js';
import {
  applyBookSnapshot,
  bookSnapshot,
  buildCreativeBrief,
  collectWelcomeProfile,
  deepClone,
  genreDisplayLabel,
  getBookProfile,
  isBookComplete,
  isSoftSequelGenre,
  newBookId,
  normalizeBlueprint,
  validateWelcomeSelections
} from './book.js';
import {
  clearPendingCreation,
  emptyMemoryBook,
  ensureApiKeyVerified,
  finishNewBookChapterZero,
  getStoredApiKey,
  initMemoryBookFromBlueprint,
  markPendingCreation,
  migrateMemoryBook,
  openWelcomeApiSettings,
  showApiKeyVerifyError,
  startLoadingStatusRotation
} from './creation-resume.js';
import {
  createBlueprint
} from './blueprint.js';
import {
  renderLibrary
} from './library.js';
import {
  resetWelcomeWizard,
  setWelcomeWizardStep,
  showLibrary,
  showScreen
} from './screens.js';
import {
  clearChapterGenerationQueue,
  prepareStateForNewStandaloneBook,
  restoreBookAfterFailedCreation,
  showShelf
} from './shelf.js';
import {
  save
} from './storage.js';
import {
  showError
} from './utils.js';

// ===== BOOK CREATION =====
export async function startBookCreation() {
  if (store.bookCreationInFlight || store.state.writing) return;
  if (!navigator.onLine) {
    showError('welcome-error', 'אין חיבור רשת — יצירת ספר חדש דורשת אינטרנט. אפשר לקרוא ספרים שכבר במדף.');
    return;
  }
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    setWelcomeWizardStep(3, { focusApi: true });
    showError('welcome-error', 'נדרש מפתח Gemini אישי. הזן מפתח בשלב 3, או קבל מפתח חינמי ב-Google AI Studio.');
    return;
  }

  const verified = await ensureApiKeyVerified();
  if (!verified.ok) {
    setWelcomeWizardStep(3, { focusApi: true });
    const msg = verified.message || 'המפתח לא עבר בדיקה. לחץ "בדוק מפתח" או הזן מפתח חדש.';
    showApiKeyVerifyError(msg);
    showError('welcome-error', msg);
    return;
  }

  const profile = collectWelcomeProfile();
  if (!validateWelcomeSelections(profile)) {
    resetWelcomeWizard(1);
    showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, טון, סופר, ספר, או רעיון חופשי.');
    return;
  }

  const previousBookId = prepareStateForNewStandaloneBook(profile, store.readingLengthKey, apiKey);
  document.getElementById('create-btn').disabled = true;
  document.getElementById('welcome-error').style.display = 'none';
  showScreen('loading-screen');
  document.getElementById('loading-title').textContent = 'פותח ספר חדש...';

  const statusInterval = startLoadingStatusRotation();
  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');

  try {
    const bookData = normalizeBlueprint(await createBookBlueprint());
    store.state.book = bookData;
    store.state.memoryBook = initMemoryBookFromBlueprint(bookData);
    store.state.seriesTitle = bookData.title;
    store.app.books[store.state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: 'standalone',
      previousBookId,
      profile,
      readingLengthKey: store.readingLengthKey
    });

    clearInterval(statusInterval);
    renderLibrary();
    await finishNewBookChapterZero({ kind: 'standalone' });
  } catch(e) {
    clearInterval(statusInterval);
    restoreBookAfterFailedCreation(store.state.id, previousBookId, apiKey);
    document.getElementById('create-btn').disabled = false;
    showScreen('welcome-screen');
    showError('welcome-error', 'שגיאה ביצירת הספר: ' + e.message);
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}

export async function createBookBlueprint() {
  const n = store.state.totalChapters;
  const brief = buildCreativeBrief(getBookProfile());
  const genreLabel = genreDisplayLabel(getBookProfile());

  const context = `**חשוב:** זהו ספר חדש ועצמאי לחלוטין — לא המשך לספר אחר, לא אותו עולם, לא אותן דמויות. צור עולם, דמויות ועלילה מקוריים לפי הבחירות בלבד.

${brief}`;

  return createBlueprint(context, n, genreLabel);
}

export async function createSequelBlueprint(parent) {
  const n = store.state.totalChapters;
  const pb = normalizeBlueprint(parent.book);
  const profile = getBookProfile(parent);
  const soft = isSoftSequelGenre(profile);
  const memoryJson = JSON.stringify(migrateMemoryBook(parent.memoryBook || {}), null, 2).slice(0, 6000);
  const synopsis = (parent.storySynopsis || parent.eventLog?.slice(-5).join('\n') || '').slice(0, 4000);
  const lastChapter = parent.chapters[parent.chapters.length - 1];
  const ending = lastChapter?.text?.slice(-1500) || '';
  const sequelMode = soft
    ? 'ספר חדש באותו עולם ודמויות — עלילה חדשה, תעלומה או קונפליקט חדש. אל תפתור מחדש את העלילה הקודמת.'
    : 'המשך ישיר של העלילה — לא רימייק.';

  const context = `זהו ספר המשך (ספר ${store.state.sequelIndex} בסדרה). ${sequelMode}
שם הספר חייב להיות חדש. השתמש באותו עולם, כללים ודמויות מספר הזיכרון; דמויות חדשות מותרות.

**ספר קודם:** ${pb.title}
**תגית:** ${pb.tagline || ''}
**הגדרה:** ${pb.setting || pb.world || ''}
**כללי עולם:** ${pb.coreRules || pb.magicSystem || ''}
**קונפליקט קודם (הושלם):** ${pb.centralConflict || '—'}

${buildCreativeBrief(profile)}

**סיכום העלילה עד כה:**
${synopsis}

**ספר זיכרון (עובדות מוסכמות — שמור עקביות):**
${memoryJson}

**סיום הספר הקודם:**
"...${ending}"

centralConflict: קונפליקט חדש${soft ? ' — עלילה עצמאית' : ''}.`;

  return createBlueprint(context, n, genreDisplayLabel(profile));
}

export function promptSequelBook(sourceId) {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();

  const parent = sourceId ? store.app.books[sourceId] : bookSnapshot();
  if (!parent?.book) {
    alert('לא נמצא ספר מקור');
    return;
  }
  if (!isBookComplete(parent)) {
    alert('סיים קודם את כל פרקי הספר הנוכחי — ואז אפשר המשך בעולם הזה');
    return;
  }

  store.pendingSequelSourceId = parent.id;
  store.pendingSequelLengthKey = parent.readingLengthKey || 'short';

  const info = document.getElementById('sequel-parent-info');
  if (info) {
    const series = parent.seriesTitle || parent.book.title;
    const num = parent.sequelIndex || 1;
    const soft = isSoftSequelGenre(getBookProfile(parent));
    info.textContent = soft
      ? `עוד סיפור באותו עולם אחרי «${parent.book.title}» — ספר ${num + 1} בסדרה «${series}».`
      : `ממשיך את «${series}» (אחרי «${parent.book.title}») — ספר ${num + 1} בסדרה.`;
  }

  document.querySelectorAll('#sequel-length-options .length-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.length === store.pendingSequelLengthKey);
  });
  const err = document.getElementById('sequel-error');
  if (err) err.style.display = 'none';

  showScreen('sequel-screen');
}

export function selectSequelLength(btn, key) {
  document.querySelectorAll('#sequel-length-options .length-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  store.pendingSequelLengthKey = key;
}

export function cancelSequelSetup() {
  store.pendingSequelSourceId = null;
  if (store.state.book) showLibrary();
  else showShelf();
}

export async function confirmSequelBook() {
  if (store.bookCreationInFlight || store.state.writing) return;
  if (!store.pendingSequelSourceId) {
    cancelSequelSetup();
    return;
  }
  const err = document.getElementById('sequel-error');
  if (err) err.style.display = 'none';
  await startSequelBook(store.pendingSequelSourceId, store.pendingSequelLengthKey);
}

export async function startSequelBook(sourceId, lengthKey) {
  if (store.bookCreationInFlight || store.state.writing) return;
  const parent = store.app.books[sourceId] || bookSnapshot();
  if (!parent?.book || !isBookComplete(parent)) {
    showError('sequel-error', 'לא ניתן לפתוח המשך — הספר הקודם לא הושלם');
    return;
  }

  const apiKey = getStoredApiKey();
  if (!apiKey) {
    openWelcomeApiSettings();
    showError('sequel-error', 'נדרש מפתח API — חזור אחרי שהגדרת מפתח');
    return;
  }

  const parentMem = deepClone(parent.memoryBook || emptyMemoryBook());
  const parentSynopsis = parent.storySynopsis || parent.eventLog?.join('\n\n') || '';

  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  clearChapterGenerationQueue();

  store.state = createEmptyBookState();
  store.state.id = newBookId();
  store.state.apiKey = apiKey;
  store.state.bookProfile = getBookProfile(parent);
  const lk = lengthKey || store.pendingSequelLengthKey || 'short';
  store.state.readingLengthKey = lk;
  store.state.totalChapters = cfg.LENGTH_PRESETS[lk]?.chapters || 15;
  store.pendingSequelSourceId = null;
  store.state.parentBookId = parent.id;
  store.state.seriesTitle = parent.seriesTitle || parent.book.title;
  store.state.sequelIndex = (parent.sequelIndex || 1) + 1;
  store.state.memoryBook = parentMem;
  store.state.storySynopsis = parentSynopsis;
  store.state.eventLog = [];
  store.state.chapters = [];
  store.app.currentBookId = store.state.id;
  markPendingCreation('blueprint', {
    kind: 'sequel',
    previousBookId: parent.id,
    parentBookId: parent.id,
    profile: store.state.bookProfile,
    readingLengthKey: lk
  });

  document.getElementById('create-btn').disabled = true;
  showScreen('loading-screen');
  document.getElementById('loading-title').textContent = 'פותח המשך בעולם הזה...';
  document.getElementById('loading-status').textContent = 'בונה על הסיפור הקודם...';
  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');

  try {
    const bookData = normalizeBlueprint(await createSequelBlueprint(parent));
    store.state.book = bookData;
    store.state.memoryBook = parentMem;
    store.app.books[store.state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: 'sequel',
      previousBookId: parent.id,
      parentBookId: parent.id,
      profile: store.state.bookProfile,
      readingLengthKey: lk
    });

    renderLibrary();
    await finishNewBookChapterZero({ kind: 'sequel' });
  } catch(e) {
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    delete store.app.books[store.state.id];
    applyBookSnapshot(parent);
    store.app.currentBookId = parent.id;
    save();
    showScreen('library-screen');
    showError('library-error', 'שגיאה ביצירת ספר המשך: ' + e.message);
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}
