// Book blueprint: a story bible (acts, character arcs, threads, ending, style) written by the
// prose model, then chapter outlines in batches that each see the bible and all prior chapters.
import {
  callGeminiProseJson
} from './api.js';
import {
  isBlueprintTruncated,
  normalizeChapterOutlines,
  parseJsonFromResponse
} from './creation-resume.js';

const OUTLINE_BATCH_SIZE = 12;
const GENDERS = ['זכר', 'נקבה'];

/** Splits 1..n into near-equal batches of at most `size` chapters: 15 -> [1-8, 9-15] */
export function outlineBatches(n, size = OUTLINE_BATCH_SIZE) {
  const count = Math.max(1, Math.ceil(n / size));
  const batches = [];
  let from = 1;
  for (let i = 0; i < count; i++) {
    const len = Math.floor(n / count) + (i < n % count ? 1 : 0);
    batches.push([from, from + len - 1]);
    from += len;
  }
  return batches;
}

const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const chapterNum = (v, n) => {
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? Math.min(Math.max(x, 1), n) : null;
};

/** Cleans the model's story bible; returns null when the essentials are missing */
export function normalizeStoryBible(raw, n) {
  if (!raw || !str(raw.title) || !Array.isArray(raw.mainCharacters) || !raw.mainCharacters.length) return null;

  const mainCharacters = raw.mainCharacters
    .filter(c => str(c?.name))
    .map(c => {
      const out = { name: str(c.name, 60) };
      for (const f of ['role', 'trait', 'want', 'need', 'flaw', 'arc']) if (str(c[f])) out[f] = str(c[f]);
      if (GENDERS.includes(str(c.gender))) out.gender = str(c.gender);
      return out;
    });

  const acts = (Array.isArray(raw.acts) ? raw.acts : [])
    .map(a => ({
      name: str(a?.name, 80),
      fromChapter: chapterNum(a?.fromChapter, n),
      toChapter: chapterNum(a?.toChapter, n),
      purpose: str(a?.purpose),
      turningPoint: str(a?.turningPoint)
    }))
    .filter(a => a.fromChapter && a.toChapter && a.fromChapter <= a.toChapter)
    .sort((a, b) => a.fromChapter - b.fromChapter);

  const threads = (Array.isArray(raw.threads) ? raw.threads : [])
    .map(t => ({
      name: str(t?.name, 80),
      description: str(t?.description),
      setupChapter: chapterNum(t?.setupChapter, n),
      payoffChapter: chapterNum(t?.payoffChapter, n)
    }))
    .filter(t => t.name);

  const style = raw.styleGuide && typeof raw.styleGuide === 'object' ? raw.styleGuide : {};
  const styleGuide = {};
  for (const f of ['narration', 'voice', 'dialogue', 'avoid']) if (str(style[f])) styleGuide[f] = str(style[f]);

  const bible = { mainCharacters, acts, threads, styleGuide };
  for (const f of ['title', 'tagline', 'genre', 'setting', 'coreRules', 'centralConflict', 'theme', 'ending']) {
    if (str(raw[f])) bible[f] = str(raw[f], f === 'title' ? 120 : 800);
  }
  return bible;
}

function storyBiblePrompt(contextBlock, n, genreLabel) {
  return `${contextBlock}

בנה "תנ"ך סיפור" לספר בעברית של ${n} פרקים: התשתית שכל הפרקים ייכתבו לפיה.
חשוב על הספר כשלם לפני הפרטים: לאן הוא מוביל, מה משתנה בדמויות, ואילו רמזים מוטמנים מוקדם ומתממשים מאוחר.

החזר JSON בלבד:
{
  "title": "שם הספר",
  "tagline": "משפט תיאור קצר",
  "genre": "${genreLabel}",
  "setting": "העולם/הזירה (2-3 משפטים)",
  "coreRules": "כללי העולם / הטכנולוגיה / מערכת הכוח (רלוונטי לז'אנר)",
  "centralConflict": "הקונפליקט המרכזי",
  "theme": "הנושא שהספר בוחן",
  "ending": "איך הספר נגמר בפועל — 2-3 משפטים קונקרטיים (לא יוצג לקורא)",
  "mainCharacters": [
    {"name": "שם", "gender": "זכר|נקבה", "role": "תפקיד בסיפור", "trait": "תכונה בולטת",
     "want": "מה הדמות רוצה", "need": "מה היא באמת צריכה", "flaw": "הפגם שעוצר אותה", "arc": "איך תשתנה עד הסוף"}
  ],
  "acts": [
    {"name": "שם המערכה", "fromChapter": 1, "toChapter": 4, "purpose": "מה המערכה משיגה", "turningPoint": "נקודת המפנה שסוגרת אותה"}
  ],
  "threads": [
    {"name": "שם קצר", "description": "עלילת משנה או רמז ומימושו", "setupChapter": 2, "payoffChapter": 9}
  ],
  "styleGuide": {
    "narration": "גוף וזמן הסיפור, ומרחק נקודת המבט",
    "voice": "קצב, אורך משפטים, משלב לשוני, אווירה",
    "dialogue": "איך נכתב דיאלוג (סימני ציטוט, טבעיות)",
    "avoid": "מה להימנע ממנו (קלישאות, עברית מתורגמת, הסברים מיותרים)"
  }
}

כללים:
- acts: 3-4 מערכות רצופות שמכסות את פרקים 1 עד ${n} בדיוק.
- mainCharacters: 3-6 דמויות, לכל אחת gender (קובע את ההטיה הדקדוקית בעברית).
- threads: 3-8 חוטים; setupChapter קטן מ-payoffChapter, ושניהם בין 1 ל-${n}.
- ending: סיום מוחלט ומספק שהמערכות בונות אליו.
- התאם לז'אנר — לא כופה פנטזיה אם לא נבחר. JSON בלבד.`;
}

function outlinesPrompt(bible, n, from, to, previous) {
  const prev = previous.length
    ? previous.map(o => `${o.number}. ${o.title} — ${o.summary}${o.turn ? ` (בסוף: ${o.turn})` : ''}`).join('\n')
    : '(אין — אלה הפרקים הראשונים)';
  return `תכנן את פרקים ${from}-${to} מתוך ${n} של הספר, לפי תנ"ך הסיפור.

**תנ"ך הסיפור:**
${JSON.stringify(bible, null, 1)}

**פרקים שכבר תוכננו:**
${prev}

החזר JSON בלבד:
{
  "chapterOutlines": [
    {"number": ${from}, "title": "שם ספרותי קצר", "pov": "שם דמות",
     "summary": "מה קורה בפרק — 2-3 משפטים",
     "purpose": "למה הפרק קיים: מה הוא מקדם בעלילה או בקשת הדמות",
     "conflict": "מה עומד בדרך בפרק הזה",
     "turn": "מה השתנה עד סוף הפרק",
     "hook": "איך הפרק נגמר ומושך לפרק הבא",
     "threads": ["שמות חוטים מהתנ״ך שהפרק מקדם"]}
  ]
}

כללים:
- בדיוק ${to - from + 1} פרקים, ממוספרים ${from} עד ${to}, ברצף עם הפרקים הקודמים.
- כבד את גבולות המערכות ונקודות המפנה שלהן, ואת setupChapter / payoffChapter של החוטים.
- כל פרק משנה משהו — אין פרקי מעבר ריקים. title: שם ספרותי, לא ברכות או הודעות מערכת.
- JSON בלבד.`;
}

async function requestJson(prompt, maxTokens, temperature, isValid, failMessage) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, finishReason } = await callGeminiProseJson(prompt, maxTokens, { temperature });
      if (isBlueprintTruncated(finishReason)) {
        lastErr = new Error('תוכנית הספר נקטעה באמצע — מנסה שוב');
        continue;
      }
      const data = parseJsonFromResponse(text);
      if (isValid(data)) return data;
      lastErr = new Error(failMessage);
    } catch (e) {
      lastErr = e;
      if (e.message?.includes('הגעת למכסה') || e.modelNotFound) throw e;
    }
  }
  throw lastErr || new Error(failMessage);
}

/**
 * Builds the full blueprint: story bible, then outlines in batches. `contextBlock` carries
 * the user's brief (and, for a sequel, the previous book). Returns a book object with
 * chapterOutlines normalized to exactly n chapters.
 */
export async function createBlueprint(contextBlock, n, genreLabel) {
  const rawBible = await requestJson(
    storyBiblePrompt(contextBlock, n, genreLabel), 8192, 0.9,
    d => !!normalizeStoryBible(d, n),
    'תשובת ה-AI לא כללה תוכנית ספר תקינה — נסה שוב'
  );
  const bible = normalizeStoryBible(rawBible, n);

  const outlines = [];
  for (const [from, to] of outlineBatches(n)) {
    const want = to - from + 1;
    let got = [];
    try {
      const data = await requestJson(
        outlinesPrompt(bible, n, from, to, outlines), 8192, 0.8,
        d => (Array.isArray(d?.chapterOutlines) ? d.chapterOutlines.length : 0) >= want,
        'תכנון הפרקים חזר חלקי'
      );
      got = data.chapterOutlines;
    } catch (e) {
      if (e.message?.includes('הגעת למכסה') || e.modelNotFound || !outlines.length) throw e;
      // A later batch failing shouldn't lose the book: the rest is padded below
      console.warn(`outline batch ${from}-${to} failed`, e);
      break;
    }
    got.slice(0, want).forEach((o, i) => outlines.push({ ...o, number: from + i }));
  }

  return normalizeChapterOutlines({ ...bible, chapterOutlines: outlines }, n);
}

// ===== Using the bible while writing =====

export function actForChapter(book, num) {
  return (book?.acts || []).find(a => num >= a.fromChapter && num <= a.toChapter) || null;
}

const genderLabel = c => (c?.gender ? ` (${c.gender})` : '');

function characterArcLine(c) {
  const parts = [
    c.want && `רוצה: ${c.want}`,
    c.need && `צריכה באמת: ${c.need}`,
    c.flaw && `פגם: ${c.flaw}`,
    c.arc && `קשת: ${c.arc}`
  ].filter(Boolean);
  return parts.length ? `${c.name}${genderLabel(c)} — ${parts.join('; ')}` : '';
}

/** Story-bible context for planning / reviewing chapter idx; empty for books made before it */
export function chapterBibleContext(book, idx) {
  const outline = book?.chapterOutlines?.[idx];
  if (!outline) return '';
  const num = idx + 1;
  const lines = [];

  const act = actForChapter(book, num);
  if (act) {
    lines.push(`**מקום הפרק בסיפור:** מערכה "${act.name}" (פרקים ${act.fromChapter}-${act.toChapter})${act.purpose ? ` — ${act.purpose}` : ''}`);
    if (num === act.toChapter && act.turningPoint) lines.push(`**הפרק סוגר את המערכה — נקודת המפנה:** ${act.turningPoint}`);
  }
  if (outline.purpose) lines.push(`**תפקיד הפרק:** ${outline.purpose}`);
  if (outline.conflict) lines.push(`**מה עומד בדרך:** ${outline.conflict}`);
  if (outline.turn) lines.push(`**מה משתנה עד סוף הפרק:** ${outline.turn}`);
  if (outline.hook) lines.push(`**סיום הפרק (hook):** ${outline.hook}`);

  const threadLines = [];
  for (const t of book.threads || []) {
    if (t.setupChapter === num) threadLines.push(`להטמין: ${t.name} — ${t.description}`);
    else if (t.payoffChapter === num) threadLines.push(`לממש: ${t.name} — ${t.description}`);
    else if (outline.threads?.includes(t.name)) threadLines.push(`לקדם: ${t.name} — ${t.description}`);
  }
  if (threadLines.length) lines.push(`**חוטי עלילה בפרק:**\n${threadLines.map(l => `- ${l}`).join('\n')}`);

  const pov = (book.mainCharacters || []).find(c => c.name === outline.pov);
  const arc = pov && characterArcLine(pov);
  if (arc) lines.push(`**קשת דמות נקודת המבט:** ${arc}`);

  const next = book.chapterOutlines[idx + 1];
  if (next) lines.push(`**הפרק הבא (רק כדי להוביל אליו — אל תכתוב אותו):** ${next.title} — ${next.summary}`);
  if (book.ending) lines.push(`**לאן הסיפור הולך (אל תחשוף לפני הזמן):** ${book.ending}`);

  return lines.join('\n');
}

/** The book's style sheet as prompt lines; empty for books made before it */
export function styleGuideText(book) {
  const s = book?.styleGuide;
  if (!s) return '';
  return [
    s.narration && `סיפור: ${s.narration}`,
    s.voice && `קול: ${s.voice}`,
    s.dialogue && `דיאלוג: ${s.dialogue}`,
    s.avoid && `הימנע: ${s.avoid}`
  ].filter(Boolean).join('\n');
}
