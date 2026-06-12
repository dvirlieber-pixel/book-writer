// New book & sequel creation
// ===== BOOK CREATION =====
async function startBookCreation() {
  if (bookCreationInFlight || state.writing) return;
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

  const profile = collectWelcomeProfile();
  if (!validateWelcomeSelections(profile)) {
    resetWelcomeWizard(1);
    showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, טון, סופר, ספר, או רעיון חופשי.');
    return;
  }

  const previousBookId = prepareStateForNewStandaloneBook(profile, readingLengthKey, apiKey);
  document.getElementById('create-btn').disabled = true;
  document.getElementById('welcome-error').style.display = 'none';
  showScreen('loading-screen');
  document.getElementById('loading-title').textContent = 'פותח ספר חדש...';

  const statusInterval = startLoadingStatusRotation();
  bookCreationInFlight = true;
  setGeminiCallPriority('high');

  try {
    const bookData = normalizeBlueprint(await createBookBlueprint());
    state.book = bookData;
    state.memoryBook = initMemoryBookFromBlueprint(bookData);
    state.seriesTitle = bookData.title;
    app.books[state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: 'standalone',
      previousBookId,
      profile,
      readingLengthKey: readingLengthKey
    });

    clearInterval(statusInterval);
    renderLibrary();
    await finishNewBookChapterZero({ kind: 'standalone' });
  } catch(e) {
    clearInterval(statusInterval);
    restoreBookAfterFailedCreation(state.id, previousBookId, apiKey);
    document.getElementById('create-btn').disabled = false;
    showScreen('welcome-screen');
    showError('welcome-error', 'שגיאה ביצירת הספר: ' + e.message);
  } finally {
    popGeminiCallPriority();
    bookCreationInFlight = false;
  }
}

async function createBookBlueprint() {
  const n = state.totalChapters;
  const brief = buildCreativeBrief(getBookProfile());
  const genreLabel = genreDisplayLabel(getBookProfile());

  const prompt = `צור תוכנית לספר בעברית עם ${n} פרקים.

**חשוב:** זהו ספר חדש ועצמאי לחלוטין — לא המשך לספר אחר, לא אותו עולם, לא אותן דמויות. צור עולם, דמויות ועלילה מקוריים לפי הבחירות בלבד.

${brief}

החזר JSON בלבד, ללא markdown, ללא הסברים:
{
  "title": "שם הספר",
  "tagline": "משפט תיאור קצר",
  "genre": "${genreLabel}",
  "setting": "הגדרת עולם/זירה (2 משפטים)",
  "coreRules": "כללי עולם, טכנולוגיה, או מערכת כוח — משפט אחד (רלוונטי לז'אנר)",
  "centralConflict": "קונפליקט מרכזי במשפט",
  "theme": "נושא מרכזי",
  "mainCharacters": [
    {"name": "שם", "role": "תפקיד", "trait": "תכונה"}
  ],
  "chapterOutlines": [
    {"number": 1, "title": "שם", "summary": "משפט אחד בלבד", "pov": "שם דמות"}
  ]
}

כללים קריטיים:
- chapterOutlines: בדיוק ${n} פרקים
- chapterOutlines[].title: שם ספרותי קצר בעברית — לא ברכות, לא הודעות מערכת, לא מספרי שגיאה
- summary: משפט אחד קצר לכל פרק
- mainCharacters: 3 דמויות
- התאם לז'אנר — לא כופה פנטזיה אם לא נבחר
- JSON בלבד`;

  return requestBookBlueprint(prompt, n);
}

async function createSequelBlueprint(parent) {
  const n = state.totalChapters;
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

  const prompt = `צור תוכנית לספר המשך (ספר ${state.sequelIndex} בסדרה) בעברית, ${n} פרקים.
${sequelMode}

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

החזר JSON בלבד:
{
  "title": "שם הספר החדש (לא אותו שם)",
  "tagline": "משפט תיאור",
  "genre": "${genreDisplayLabel(profile)}",
  "setting": "אותה זירה/עולם בקצרה",
  "coreRules": "כללי עולם עקביים",
  "centralConflict": "קונפליקט חדש${soft ? ' — עלילה עצמאית' : ''}",
  "theme": "נושא",
  "mainCharacters": [{"name": "שם", "role": "תפקיד", "trait": "תכונה"}],
  "chapterOutlines": [{"number": 1, "title": "שם", "summary": "משפט אחד", "pov": "שם דמות"}]
}

כללים:
- chapterOutlines: בדיוק ${n} פרקים
- chapterOutlines[].title: שם ספרותי קצר בעברית — לא ברכות, לא הודעות מערכת, לא מספרי שגיאה
- mainCharacters: 3 דמויות
- JSON בלבד`;

  return requestBookBlueprint(prompt, n);
}

function promptSequelBook(sourceId) {
  if (state.book && state.id) app.books[state.id] = bookSnapshot();

  const parent = sourceId ? app.books[sourceId] : bookSnapshot();
  if (!parent?.book) {
    alert('לא נמצא ספר מקור');
    return;
  }
  if (!isBookComplete(parent)) {
    alert('סיים קודם את כל פרקי הספר הנוכחי — ואז אפשר המשך בעולם הזה');
    return;
  }

  pendingSequelSourceId = parent.id;
  pendingSequelLengthKey = parent.readingLengthKey || 'short';

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
    b.classList.toggle('selected', b.dataset.length === pendingSequelLengthKey);
  });
  const err = document.getElementById('sequel-error');
  if (err) err.style.display = 'none';

  showScreen('sequel-screen');
}

function selectSequelLength(btn, key) {
  document.querySelectorAll('#sequel-length-options .length-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  pendingSequelLengthKey = key;
}

function cancelSequelSetup() {
  pendingSequelSourceId = null;
  if (state.book) showLibrary();
  else showShelf();
}

async function confirmSequelBook() {
  if (bookCreationInFlight || state.writing) return;
  if (!pendingSequelSourceId) {
    cancelSequelSetup();
    return;
  }
  const err = document.getElementById('sequel-error');
  if (err) err.style.display = 'none';
  await startSequelBook(pendingSequelSourceId, pendingSequelLengthKey);
}

async function startSequelBook(sourceId, lengthKey) {
  if (bookCreationInFlight || state.writing) return;
  const parent = app.books[sourceId] || bookSnapshot();
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

  if (state.book && state.id) app.books[state.id] = bookSnapshot();
  clearChapterGenerationQueue();

  state = createEmptyBookState();
  state.id = newBookId();
  state.apiKey = apiKey;
  state.bookProfile = getBookProfile(parent);
  const lk = lengthKey || pendingSequelLengthKey || 'short';
  state.readingLengthKey = lk;
  state.totalChapters = LENGTH_PRESETS[lk]?.chapters || 15;
  pendingSequelSourceId = null;
  state.parentBookId = parent.id;
  state.seriesTitle = parent.seriesTitle || parent.book.title;
  state.sequelIndex = (parent.sequelIndex || 1) + 1;
  state.memoryBook = parentMem;
  state.storySynopsis = parentSynopsis;
  state.eventLog = [];
  state.chapters = [];
  app.currentBookId = state.id;
  markPendingCreation('blueprint', {
    kind: 'sequel',
    previousBookId: parent.id,
    parentBookId: parent.id,
    profile: state.bookProfile,
    readingLengthKey: lk
  });

  document.getElementById('create-btn').disabled = true;
  showScreen('loading-screen');
  document.getElementById('loading-title').textContent = 'פותח המשך בעולם הזה...';
  document.getElementById('loading-status').textContent = 'בונה על הסיפור הקודם...';
  bookCreationInFlight = true;
  setGeminiCallPriority('high');

  try {
    const bookData = normalizeBlueprint(await createSequelBlueprint(parent));
    state.book = bookData;
    state.memoryBook = parentMem;
    app.books[state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: 'sequel',
      previousBookId: parent.id,
      parentBookId: parent.id,
      profile: state.bookProfile,
      readingLengthKey: lk
    });

    renderLibrary();
    await finishNewBookChapterZero({ kind: 'sequel' });
  } catch(e) {
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    delete app.books[state.id];
    applyBookSnapshot(parent);
    app.currentBookId = parent.id;
    save();
    showScreen('library-screen');
    showError('library-error', 'שגיאה ביצירת ספר המשך: ' + e.message);
  } finally {
    popGeminiCallPriority();
    bookCreationInFlight = false;
  }
}
