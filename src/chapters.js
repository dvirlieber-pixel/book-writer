// Chapter generation pipeline
import * as cfg from './constants.js';
import { store } from './store.js';
import {
  assertChapterTextValid,
  callGeminiLiteRaw,
  callGeminiRaw,
  countWords,
  endsWithCompleteSentence,
  isChapterTextValid,
  isOutputTruncated,
  mergeContinuation,
  popGeminiCallPriority,
  setGeminiCallPriority,
  trimToLastSentence
} from './api.js';
import {
  buildStyleInstructions,
  genreDisplayLabel,
  getBookProfile,
  normalizeBlueprint,
  sanitizeChapterTitle
} from './book.js';
import {
  chapterBibleContext
} from './blueprint.js';
import {
  ensureMemoryBook,
  formatMemoryBookForPrompt,
  isReadingScreenActive,
  migrateMemoryBook,
  parseJsonFromResponse,
  setPreparingStatus,
  showReadingPreparing,
  waitForGeneration
} from './creation-resume.js';
import {
  renderLibrary
} from './library.js';
import {
  getStoryContextForPrompt,
  maybeCompressStorySynopsis
} from './prefs-export.js';
import {
  openChapter,
  renderReadingNav
} from './reading.js';
import {
  showScreen
} from './screens.js';
import {
  save
} from './storage.js';
import {
  setWriteUiActive,
  showError
} from './utils.js';

// ===== CHAPTER PIPELINE (מאחורי הקלעים) =====
export function requestChapterGeneration(idx, opts = {}) {
  return new Promise((resolve, reject) => {
    const bookId = store.state.id;
    const dup = store.chapterGenQueue.find(j => j.idx === idx && j.bookId === bookId);
    if (dup) {
      dup.resolves.push(resolve);
      dup.rejects.push(reject);
      pumpChapterGenQueue();
      return;
    }
    store.chapterGenQueue.push({ idx, bookId, opts, resolves: [resolve], rejects: [reject] });
    pumpChapterGenQueue();
  });
}

export async function pumpChapterGenQueue() {
  if (store.chapterGenPumpActive) return;
  store.chapterGenPumpActive = true;
  try {
    while (store.chapterGenQueue.length) {
      const job = store.chapterGenQueue[0];
      // Job queued for a book that is no longer open — drop it quietly
      if (job.bookId !== store.state.id) {
        job.resolves.forEach(r => r());
        store.chapterGenQueue.shift();
        continue;
      }
      if (store.state.writing && store.state.generatingIdx !== job.idx) {
        await waitForGeneration();
        continue;
      }
      try {
        await runGenerateChapterAt(job.idx, job.opts);
        job.resolves.forEach(r => r());
      } catch (e) {
        job.rejects.forEach(r => r(e));
      }
      store.chapterGenQueue.shift();
    }
  } finally {
    store.chapterGenPumpActive = false;
    if (store.chapterGenQueue.length) pumpChapterGenQueue();
  }
}

export async function generateChapterAt(idx, opts = {}) {
  return requestChapterGeneration(idx, opts);
}

export async function runGenerateChapterAt(idx, { background = false, openAfter = false, useLoadingScreen = false } = {}) {
  if (!navigator.onLine) {
    throw new Error('אין חיבור רשת — לא ניתן ליצור פרק חדש');
  }
  if (!store.state.book || idx >= store.state.totalChapters) return;
  if (idx < store.state.chapters.length) {
    if (openAfter) openChapter(idx);
    return;
  }
  if (store.state.writing) {
    if (background && store.state.generatingIdx === idx) return;
    await waitForGeneration();
    if (idx < store.state.chapters.length) {
      if (openAfter) openChapter(idx);
      if (background) notifyReadingChapterPipeline(idx, false);
      return;
    }
    if (store.state.writing) return;
  }

  ensureMemoryBook();
  // applyBookSnapshot replaces `state` wholesale; if that happens mid-generation,
  // stop before writing anything into the newly opened book.
  const genState = store.state;
  const assertSameBook = () => {
    if (store.state !== genState) {
      const err = new Error('book switched during generation');
      err.bookSwitched = true;
      throw err;
    }
  };
  setGeminiCallPriority(background ? 'low' : 'high');
  store.state.writing = true;
  store.state.generatingIdx = idx;
  const chapterNum = idx + 1;
  const outline = store.state.book.chapterOutlines[idx]
    || { title: `פרק ${chapterNum}`, summary: '', pov: '' };

  if (!background) {
    setWriteUiActive(true);
  } else {
    notifyReadingChapterPipeline(idx, true);
    updatePrepareNextButton();
  }

  try {
    setPreparingStatus(`מכין את פרק ${chapterNum}...`, useLoadingScreen);
    const plan = await planChapter(idx);
    assertSameBook();

    setPreparingStatus(`ממשיך את הסיפור (פרק ${chapterNum})...`, useLoadingScreen);
    const onScene = () => {
      assertSameBook();
      setPreparingStatus(`כותב את פרק ${chapterNum}...`, useLoadingScreen);
    };

    let text = null;
    let lastWriteErr;
    for (let writeAttempt = 0; writeAttempt < 2; writeAttempt++) {
      try {
        text = await writeChapter(idx, plan, onScene);
        break;
      } catch (e) {
        assertSameBook();
        lastWriteErr = e;
        if (writeAttempt < 1) {
          setPreparingStatus(`מנסה שוב לכתוב את פרק ${chapterNum}...`, useLoadingScreen);
        }
      }
    }
    if (!text) throw lastWriteErr;

    assertSameBook();
    let validatedText = text;

    setPreparingStatus(`מוודא שהפרק ${chapterNum} מוכן...`, useLoadingScreen);
    let review = await reviewChapter(text, idx, plan);
    assertSameBook();
    let fixAttempts = 0;
    while (!review.approved && fixAttempts < cfg.MAX_CHAPTER_FIXES) {
      setPreparingStatus(`מלטש את פרק ${chapterNum}...`, useLoadingScreen);
      const candidate = await fixChapter(text, review, idx, plan);
      assertSameBook();
      fixAttempts++;
      // Nothing changed (or the rewrite was unusable): reviewing the same text again is wasted quota
      if (candidate === text || !isChapterTextValid(candidate)) break;
      text = candidate;
      validatedText = candidate;
      review = await reviewChapter(text, idx, plan);
      assertSameBook();
    }

    if (!isChapterTextValid(text)) {
      if (isChapterTextValid(validatedText)) {
        text = validatedText;
      } else {
        assertChapterTextValid(text);
      }
    }

    setPreparingStatus('כמעט מוכן...', useLoadingScreen);
    const { memoryBook, summary } = await analyzeChapter(text, chapterNum, outline);
    assertSameBook();

    // Commit chapter, memory and event log together (no await in between)
    store.state.chapters.push({ title: sanitizeChapterTitle(outline.title, chapterNum), text, number: chapterNum });
    if (memoryBook) store.state.memoryBook = memoryBook;
    if (!store.state.eventLog) store.state.eventLog = [];
    store.state.eventLog.push(`פרק ${chapterNum} (${outline.title}):\n${summary}`);
    save();
    await maybeCompressStorySynopsis();
    assertSameBook();

    store.state.writing = false;
    store.state.generatingIdx = null;
    save();

    if (!background) setWriteUiActive(false);
    renderLibrary();

    if (openAfter) openChapter(idx);
    else if (isReadingScreenActive()) refreshReadingEndActions();

    notifyReadingChapterPipeline(idx, false);
    updatePrepareNextButton();
    popGeminiCallPriority();

  } catch(e) {
    popGeminiCallPriority();
    if (e?.bookSwitched) {
      // The open book is a different one now — leave its store.state and UI alone
      console.info(`chapter ${chapterNum} generation dropped: book switched`);
      return;
    }
    store.state.writing = false;
    store.state.generatingIdx = null;
    save();
    notifyReadingChapterPipeline(idx, false);
    updatePrepareNextButton();
    if (!background) {
      setWriteUiActive(false);
      if (useLoadingScreen) {
        showScreen('library-screen');
        showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
      } else {
        showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
      }
      showReadingPreparing(false);
    }
    throw e;
  }
}

export function notifyReadingChapterPipeline(generatingIdx, active) {
  if (!isReadingScreenActive()) return;
  const cur = store.state.currentReadingChapter;
  if (cur == null || generatingIdx !== cur + 1) return;
  if (active) {
    showReadingPreparing(true, `מכין את פרק ${generatingIdx + 1}...`);
    renderReadingNav(cur);
  } else {
    showReadingPreparing(false);
    renderReadingNav(cur);
  }
}

export function prefetchChapter(idx) {
  if (idx >= store.state.totalChapters || idx < store.state.chapters.length) return;
  updatePrepareNextButton();
  generateChapterAt(idx, { background: true }).catch((err) => {
    console.warn('prepare chapter', idx + 1, err);
    if (isReadingScreenActive() && store.state.currentReadingChapter === idx - 1) {
      showReadingPreparing(false);
      renderReadingNav(store.state.currentReadingChapter);
    }
    if (document.getElementById('library-screen')?.classList.contains('active')) {
      showError('library-error', err.message);
    }
    updatePrepareNextButton();
  });
}

export function prepareNextChapter() {
  if (!store.state.book || !navigator.onLine) {
    if (!navigator.onLine) showError('library-error', 'אין חיבור רשת — לא ניתן להכין פרק');
    return;
  }
  const idx = store.state.chapters.length;
  if (idx >= store.state.totalChapters) return;
  if (store.state.writing) return;
  document.getElementById('library-error').style.display = 'none';
  prefetchChapter(idx);
}

export function updatePrepareNextButton() {
  const btn = document.getElementById('prepare-next-btn');
  if (!btn) return;
  const written = store.state.chapters.length;
  const total = store.state.totalChapters;
  if (!store.state.book || written >= total || written === 0) {
    btn.style.display = 'none';
    return;
  }
  const nextIdx = written;
  const outline = store.state.book.chapterOutlines?.[nextIdx];
  const label = outline?.title || `פרק ${nextIdx + 1}`;
  if (store.state.writing && store.state.generatingIdx === nextIdx) {
    btn.style.display = 'flex';
    btn.disabled = true;
    btn.textContent = `⏳ מכין את "${label}" ברקע...`;
    return;
  }
  btn.style.display = 'flex';
  btn.disabled = !!store.state.writing;
  btn.textContent = `⚡ הכן את "${label}" מראש (אופציונלי)`;
}

export function getReadingContinuationIndex() {
  if (isReadingScreenActive() && store.state.currentReadingChapter != null) {
    return store.state.currentReadingChapter;
  }
  return store.state.lastReadChapter ?? 0;
}

export async function readNextChapter() {
  if (store.state.writing) await waitForGeneration();
  const written = store.state.chapters.length;
  if (written === 0) {
    try {
      await generateChapterAt(0, { openAfter: true });
    } catch (e) {
      showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
    }
    return;
  }
  const last = getReadingContinuationIndex();
  const nextToRead = last + 1;
  if (nextToRead < written) {
    openChapter(nextToRead);
    return;
  }
  if (nextToRead >= store.state.totalChapters) {
    openChapter(Math.min(last, written - 1));
    return;
  }
  try {
    await generateChapterAt(nextToRead, { openAfter: true });
  } catch (e) {
    showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
  }
}

export async function continueFromChapter(currentIdx) {
  const nextIdx = currentIdx + 1;
  if (nextIdx >= store.state.totalChapters) return;

  if (nextIdx < store.state.chapters.length) {
    openChapter(nextIdx);
    return;
  }

  showReadingPreparing(true, `מכין את פרק ${nextIdx + 1}...`);
  try {
    if (store.state.writing && store.state.generatingIdx === nextIdx) {
      await waitForGeneration();
      if (nextIdx < store.state.chapters.length) openChapter(nextIdx);
    } else if (!store.state.writing) {
      await generateChapterAt(nextIdx, { openAfter: true });
    } else {
      await waitForGeneration();
      if (nextIdx < store.state.chapters.length) openChapter(nextIdx);
      else await generateChapterAt(nextIdx, { openAfter: true });
    }
  } catch(e) {
    showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
  } finally {
    showReadingPreparing(false);
  }
}

export function refreshReadingEndActions() {
  const idx = store.state.currentReadingChapter;
  if (idx == null) return;
  showReadingPreparing(false);
  renderReadingNav(idx);
}

export async function planChapter(idx) {
  const book = normalizeBlueprint(store.state.book);
  const outline = book.chapterOutlines[idx];
  const memoryContext = formatMemoryBookForPrompt();
  const b = book;

  let priorContext = '';
  if (idx > 0) priorContext = getStoryContextForPrompt();

  const prompt = `תכנן את הפרק הבא לפני כתיבה. החזר JSON בלבד:
{
  "scenes": [{"goal": "מטרת הסצנה", "location": "מקום", "characters": ["שמות"], "beat": "מה קורה"}],
  "chapterGoal": "מטרת הפרק במשפט",
  "povFocus": "מה נקודת המבט חייבת להדגיש",
  "mysteryHooks": ["תעלומות/שאלות לפתח או להזכיר"],
  "continuityMust": ["עובדות שחייבות להופיע או להישמר"],
  "worldRulesUse": "איך כללי העולם/המערכת מופיעים בפרק"
}

**ספר:** ${book.title}
**ז'אנר:** ${book.genre || genreDisplayLabel()}
**הגדרה:** ${b.setting || b.world || '—'}
**כללי עולם:** ${b.coreRules || b.magicSystem || '—'}
**קונפליקט:** ${b.centralConflict || '—'}
**פרק ${outline.number}:** ${outline.title} — ${outline.summary}
**נקודת מבט:** ${outline.pov}
${chapterBibleContext(book, idx)}

${memoryContext}

${priorContext}

3-4 סצנות שמממשות את תפקיד הפרק, מובילות למה שמשתנה בסופו ונגמרות ב-hook שלו. JSON בלבד.`;

  const { text } = await callGeminiLiteRaw(prompt, '', 2500, { jsonMode: true });
  const plan = parseJsonFromResponse(text);
  if (!plan?.scenes?.length) {
    return {
      scenes: [{ goal: outline.summary, location: '', characters: [outline.pov], beat: outline.summary }],
      chapterGoal: outline.summary,
      povFocus: outline.pov,
      mysteryHooks: [],
      continuityMust: [],
      worldRulesUse: book.coreRules || book.magicSystem || ''
    };
  }
  return plan;
}

export async function reviewChapter(text, idx, plan) {
  const book = store.state.book;
  const outline = book.chapterOutlines[idx];
  const memoryContext = formatMemoryBookForPrompt();

  const prompt = `בדוק את הפרק מול התכנון וספר הזיכרון. החזר JSON בלבד:
{
  "approved": true/false,
  "score": 1-10,
  "issues": [{"type": "דמות|מקום|עולם|תעלומה|עלילה|סגנון", "description": "בעיה", "severity": "גבוה|בינוני|נמוך"}]
}

**פרק ${outline.number}:** ${outline.title}
${outline.purpose ? `**תפקיד הפרק:** ${outline.purpose}\n` : ''}${outline.turn ? `**מה אמור להשתנה עד סופו:** ${outline.turn}\n` : ''}**תכנון:**
${JSON.stringify(plan, null, 2)}

${memoryContext}

${outline.purpose || outline.turn ? 'פרק שלא מממש את תפקידו או את השינוי המתוכנן — issue מסוג עלילה בחומרה בינוני.\n' : ''}דמות שמופיעה בלשון (זכר/נקבה) שונה מהמסומן בספר הזיכרון — issue מסוג דמות בחומרה בינוני.

**הפרק המלא:**
${chapterTextForAnalysis(text)}

approved=false אם הפרק נקטע באמצע משפט, חסר סיום, או קצר מ-${cfg.MIN_CHAPTER_WORDS} מילים.
approved=true רק אם אין בעיות severity גבוה, יש סיום מלא, והפרק תואם את התכנון וספר הזיכרון.`;

  const { text: reviewRaw } = await callGeminiLiteRaw(prompt, '', 2000, { jsonMode: true });
  const review = parseJsonFromResponse(reviewRaw) || { approved: true, score: 7, issues: [] };
  if (!review.issues) review.issues = [];

  if (!endsWithCompleteSentence(text)) {
    review.issues.push({ type: 'עלילה', description: 'הפרק נקטע באמצע — חסר סיום במשפט שלם', severity: 'גבוה' });
  }
  if (countWords(text) < cfg.MIN_CHAPTER_WORDS) {
    review.issues.push({ type: 'עלילה', description: `הפרק קצר מדי (${countWords(text)} מילים)`, severity: 'גבוה' });
  }

  if (review.approved === undefined) {
    review.approved = !review.issues.some(i => i.severity === 'גבוה');
  } else if (review.issues.some(i => i.severity === 'גבוה')) {
    review.approved = false;
  }
  return review;
}

export async function fixChapter(text, review, idx, plan) {
  const book = store.state.book;
  const outline = book.chapterOutlines[idx];
  const baselineWords = countWords(text);
  const issues = review.issues || [];
  const hasTruncationIssue = issues.some(i =>
    i.severity === 'גבוה' && /נקטע|קצר מדי|סיום|חתוך/i.test(i.description || '')
  );

  if (hasTruncationIssue) {
    const ctx = buildChapterContext(idx, plan);
    const extended = await finalizeChapterEnding(text, idx, plan, ctx);
    if (isChapterTextValid(extended) && countWords(extended) >= baselineWords * 0.85) {
      return extended;
    }
  }

  const memoryContext = formatMemoryBookForPrompt();
  const issuesList = issues
    .map((i, n) => `${n + 1}. [${i.type}/${i.severity}] ${i.description}`)
    .join('\n');
  const chapterBody = text.length > 14000
    ? `${text.slice(0, 5000)}\n\n[...]\n\n${text.slice(-8000)}`
    : text;

  const style = buildStyleInstructions(getBookProfile());
  const prompt = `תקן את הפרק הבא לפי הבעיות שזוהו. שמור על אורך מלא (לפחות ${cfg.MIN_CHAPTER_WORDS} מילים) ומעברי [***].
${style}
אם הפרק נקטע — השלם אותו עד סיום מלא עם hook. סיים תמיד במשפט שלם.
אל תשנה אירועים שלא קשורים לתיקון. החזר את הפרק המלא בלבד — ללא כותרת, ללא הסברים.

**בעיות לתיקון:**
${issuesList || 'שיפור עקביות כללי'}

**תכנון הפרק:**
${JSON.stringify(plan, null, 2)}

${memoryContext}

**פרק לתיקון:**
${chapterBody}`;

  let { text: fixed, finishReason } = await callGeminiRaw(prompt, '', cfg.CHAPTER_MAX_TOKENS);
  fixed = (fixed || '').trim();
  if (!fixed || fixed.length < 200) return text;

  fixed = await extendProse(
    fixed,
    'השלם את הפרק עד סיום מלא במשפט שלם, עם hook לפרק הבא.',
    cfg.MIN_CHAPTER_WORDS,
    cfg.PROSE_EXTEND_MAX_ROUNDS,
    6144,
    finishReason,
    chapterContinuationContext(outline, plan)
  );

  if (!isChapterTextValid(fixed) || countWords(fixed) < baselineWords * 0.75) {
    return text;
  }
  return fixed;
}

/** Chapter text for analysis prompts: whole chapter, or start + end when very long */
export function chapterTextForAnalysis(chapterText, maxChars = 14000) {
  if (chapterText.length <= maxChars) return chapterText;
  const head = Math.floor(maxChars * 0.35);
  return `${chapterText.slice(0, head)}\n\n[...]\n\n${chapterText.slice(-(maxChars - head))}`;
}

// Memory book entries are matched by these fields when merging updates
const MEMORY_KEYS = {
  characters: 'name',
  locations: 'name',
  keyObjects: 'name',
  worldRules: 'rule',
  openMysteries: 'question'
};
const MEMORY_CHAPTER_FIELDS = { worldRules: 'establishedInChapter', openMysteries: 'introducedChapter' };

const memoryKey = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Applies the model's per-chapter updates to the memory book without ever dropping an
 * entry: known keys are patched with the non-empty fields given, unknown keys are added.
 * Returns a new memory book (input is not mutated), or null when there is nothing usable.
 */
export function mergeMemoryUpdates(current, updates, chapterNum) {
  if (!updates || typeof updates !== 'object') return null;
  const merged = migrateMemoryBook(current);
  let touched = false;

  for (const [list, keyField] of Object.entries(MEMORY_KEYS)) {
    const items = Array.isArray(updates[list]) ? updates[list] : [];
    if (!items.length) continue;
    const entries = merged[list].map(e => ({ ...e }));
    for (const item of items) {
      if (!item || typeof item !== 'object' || !memoryKey(item[keyField])) continue;
      const patch = Object.fromEntries(
        Object.entries(item).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      );
      const existing = entries.find(e => memoryKey(e[keyField]) === memoryKey(item[keyField]));
      if (existing) {
        Object.assign(existing, patch);
      } else {
        const chapterField = MEMORY_CHAPTER_FIELDS[list];
        entries.push(chapterField && !patch[chapterField] ? { ...patch, [chapterField]: chapterNum } : patch);
      }
      touched = true;
    }
    merged[list] = entries;
  }
  return touched ? merged : null;
}

/** Shape the analysis response; falls back per field so one bad field doesn't lose the other */
export function parseChapterAnalysis(raw, chapterText, chapterNum, currentMemory) {
  const data = parseJsonFromResponse(raw || '') || {};
  const memoryBook = mergeMemoryUpdates(currentMemory, data.memoryUpdates, chapterNum);
  const lines = Array.isArray(data.summary) ? data.summary : [data.summary];
  const summary = lines
    .map(l => String(l ?? '').trim())
    .filter(Boolean)
    .map(l => (l.startsWith('-') ? l : `- ${l}`))
    .join('\n');
  return {
    memoryBook,
    summary: summary || `פרק ${chapterNum}: ${chapterText.substring(0, 200)}...`
  };
}

/**
 * One Lite call after each chapter: writes the event-log summary and lists only the memory
 * book entries this chapter added or changed, which mergeMemoryUpdates applies. The reply
 * stays small however large the memory book grows (a full rewrite could hit the output
 * limit and silently stop updating it).
 * Returns { memoryBook (or null), summary }; the caller commits both to store.state.
 */
export async function analyzeChapter(chapterText, chapterNum, outline) {
  ensureMemoryBook();
  const currentMemory = store.state.memoryBook;
  const current = JSON.stringify(currentMemory, null, 2);

  const prompt = `קרא את הפרק החדש ובצע שתי משימות. החזר JSON בלבד.

1. summary — 4-6 נקודות קצרות בעברית: אירועים מרכזיים, החלטות חשובות של דמויות, שינויים במצב העולם, וכל מידע חיוני להמשך. רק עובדות, ללא הקדמה.
2. memoryUpdates — רק מה שהפרק הזה הוסיף או שינה בספר הזיכרון:
   - רשומה חדשה: כל השדות.
   - רשומה קיימת שהשתנתה: אותו מפתח בדיוק כמו בספר הזיכרון (name / rule / question) ורק השדות שהשתנו.
   - תעלומה שנפתרה: אותה question עם "status": "נפתר".
   - רשומה שלא השתנתה — אל תכלול. אין צורך למחוק דבר.

ספר זיכרון נוכחי:
${current}

פרק ${chapterNum} — ${outline.title}:
${chapterTextForAnalysis(chapterText)}

מבנה התשובה (רשימות ריקות כשאין שינוי):
{
  "summary": ["אירוע", "אירוע"],
  "memoryUpdates": {
    "characters": [{"name":"","gender":"זכר|נקבה","role":"","status":"","notes":""}],
    "locations": [{"name":"","description":"","significance":""}],
    "keyObjects": [{"name":"","description":"","owner":"","status":""}],
    "worldRules": [{"rule":"","establishedInChapter":${chapterNum},"notes":""}],
    "openMysteries": [{"question":"","introducedChapter":${chapterNum},"status":"פתוח|נפתר|בתהליך","clues":""}]
  }
}`;

  try {
    const { text } = await callGeminiLiteRaw(prompt, '', 4000, { jsonMode: true });
    return parseChapterAnalysis(text, chapterText, chapterNum, currentMemory);
  } catch (e) {
    console.warn('analyzeChapter failed:', e);
    return parseChapterAnalysis('', chapterText, chapterNum, currentMemory);
  }
}

export function buildChapterContext(idx, plan) {
  const book = store.state.book;
  const outline = book.chapterOutlines[idx];
  const memoryContext = formatMemoryBookForPrompt();

  let eventLogContext = '';
  if (idx > 0) eventLogContext = getStoryContextForPrompt();

  let lastChapterSnippet = '';
  if (idx > 0 && store.state.chapters.length > 0) {
    // Enough of the previous chapter's ending to carry its voice and the exact moment it stopped
    const last = store.state.chapters[store.state.chapters.length - 1];
    lastChapterSnippet = `**סוף הפרק הקודם (המשך ממנו בקול זהה):**\n"...${last.text.trimEnd().slice(-1500)}"`;
  }

  const b = normalizeBlueprint(book);
  const planContext = `**תכנון הפרק:**
מטרה: ${plan.chapterGoal || outline.summary}
מיקוד POV: ${plan.povFocus || outline.pov}
חובות עקביות: ${(plan.continuityMust || []).join('; ') || '—'}
תעלומות: ${(plan.mysteryHooks || []).join('; ') || '—'}
כללי עולם: ${plan.worldRulesUse || plan.magicUse || b.coreRules || b.magicSystem || '—'}
**הגדרת הספר:** ${b.setting || b.world || '—'}
**קונפליקט מרכזי:** ${b.centralConflict || '—'}`;

  return {
    book, outline, memoryContext, eventLogContext, lastChapterSnippet, planContext,
    continuationContext: chapterContinuationContext(outline, plan)
  };
}

/** What a continuation must stay faithful to: the chapter's plan and its planned ending */
export function chapterContinuationContext(outline, plan) {
  const scenes = (plan?.scenes || [])
    .map((s, i) => `${i + 1}. ${s.beat || s.goal || ''}`.trim())
    .filter(l => l.length > 3);
  return [
    `**הפרק:** ${outline.number} — ${outline.title}: ${outline.summary}`,
    scenes.length ? `**הסצנות המתוכננות:**\n${scenes.join('\n')}` : '',
    outline.turn ? `**מה משתנה עד סוף הפרק:** ${outline.turn}` : '',
    outline.hook ? `**הסיום המתוכנן (hook):** ${outline.hook}` : ''
  ].filter(Boolean).join('\n');
}

export async function continueProse(existing, instruction, maxTokens = 4096, context = '') {
  const style = buildStyleInstructions(getBookProfile());
  const prompt = `המשך את הטקסט בעברית ספרותית — בדיוק מהנקודה שבה נעצר, בלי לחזור על פסקאות שכבר נכתבו.
${instruction}
${context ? `\nהישאר נאמן לתכנון: אל תמציא תפניות, גילויים או שינויים בדמויות שאינם בו.\n${context}\n` : ''}
${style}

**סוף הטקסט עד כה:**
"...${existing.trimEnd().slice(-2500)}"

כתוב המשך בלבד — פרוזה, ללא כותרות והסברים. סיים במשפט שלם.`;

  const { text, finishReason } = await callGeminiRaw(prompt, '', maxTokens);
  return { text: text.trim(), finishReason };
}

export async function extendProse(text, instruction, minWords, maxRounds = cfg.PROSE_EXTEND_MAX_ROUNDS, maxTokens = 4096, initialFinishReason = 'STOP', context = '') {
  let result = text.trim();
  let finishReason = initialFinishReason || 'STOP';
  for (let r = 0; r < maxRounds && isOutputTruncated(result, finishReason, minWords); r++) {
    // Continue from the last complete sentence, never from a half word
    const cut = trimToLastSentence(result);
    const cont = await continueProse(cut.text, instruction, maxTokens, context);
    if (!cont.text) break;
    result = mergeContinuation(cut.text, cont.text, { sameParagraph: cut.trimmed && !cut.paragraphEnd });
    finishReason = cont.finishReason;
  }
  return result;
}

export async function finalizeChapterEnding(fullText, idx, plan, ctx) {
  if (isChapterTextValid(fullText) && countWords(fullText) >= 1100) return fullText;

  const { outline } = ctx;
  let merged = await extendProse(
    fullText,
    `הפרק ${outline.number} ("${outline.title}") נקטע באמצע. כתוב את המשך וסיום הפרק בלבד — עוד 250-450 מילים, עם hook לפרק הבא.`,
    cfg.MIN_CHAPTER_WORDS,
    cfg.PROSE_EXTEND_MAX_ROUNDS,
    6144,
    'STOP',
    ctx.continuationContext
  );
  if (!endsWithCompleteSentence(merged)) {
    merged = await extendProse(
      merged,
      'סיים במשפט אחד חזק וסגור — סיום הפרק.',
      cfg.MIN_CHAPTER_WORDS,
      2,
      4096,
      'STOP',
      ctx.continuationContext
    );
  }
  return merged;
}

/**
 * Writes the whole chapter in one prose call from the scene plan: one seamless text, and a
 * single request against the prose model's small daily quota (it used to be one per scene
 * plus continuations). Continuations only run if the reply still comes back cut off.
 */
export async function writeChapter(idx, plan, onSceneProgress) {
  const ctx = buildChapterContext(idx, plan);
  const { book, outline, memoryContext, eventLogContext, lastChapterSnippet, planContext } = ctx;

  const scenes = plan.scenes?.length
    ? plan.scenes
    : [{ goal: outline.summary, beat: outline.summary, location: '', characters: [outline.pov] }];
  const sceneLines = scenes.map((s, i) =>
    `${i + 1}. ${s.location ? `[${s.location}] ` : ''}${s.goal || ''}${s.beat ? ` — ${s.beat}` : ''}` +
    ` (דמויות: ${(s.characters || []).join(', ') || outline.pov})`).join('\n');

  const style = buildStyleInstructions(getBookProfile());
  const prompt = `כתוב את פרק ${outline.number} המלא של הספר.

${style}

**ספר:** ${book.title} | **פרק ${outline.number}:** ${outline.title} | **POV:** ${outline.pov}

${memoryContext}

${planContext}

${eventLogContext ? eventLogContext + '\n\n' : ''}${lastChapterSnippet ? lastChapterSnippet + '\n\n' : ''}**הסצנות של הפרק, לפי הסדר:**
${sceneLines}

**הנחיות:**
- פרק שלם ורציף של 1,500-2,200 מילים שמכסה את כל הסצנות לפי הסדר.
- ${idx === 0 ? 'פתח באמצע פעולה — בלי הקדמת רקע ארוכה.' : 'המשך באופן טבעי מהרגע שבו נגמר הפרק הקודם.'}
- מעבר בין סצנות: שורה נפרדת עם [***] רק כשיש קפיצה בזמן או במקום; אחרת מעבר רציף בפרוזה.
- סיים את הפרק ב-hook חזק במשפט סגור${outline.hook ? `. ה-hook המתוכנן: ${outline.hook}` : ''}.
- פרוזה בלבד, ללא כותרות.`;

  if (onSceneProgress) onSceneProgress(0, 1);
  const { text, finishReason } = await callGeminiRaw(prompt, '', cfg.CHAPTER_MAX_TOKENS);
  let full = await extendProse(
    text,
    'השלם את הפרק לפי התכנון וסיים אותו ב-hook.',
    cfg.MIN_CHAPTER_WORDS,
    cfg.PROSE_EXTEND_MAX_ROUNDS,
    6144,
    finishReason,
    ctx.continuationContext
  );
  full = await finalizeChapterEnding(full, idx, plan, ctx);
  assertChapterTextValid(full);
  return full;
}
