/**
 * Live check against the real Gemini API, using the app's own modules (no browser).
 * Creates a book blueprint and writes the first chapters, then saves every call
 * (model, prompt, reply, timing, token usage) plus the resulting book to live-runs/.
 *
 *   1. Put your key in .env.local (git-ignored):  GEMINI_API_KEY=...
 *      (or set the GEMINI_API_KEY environment variable)
 *   2. npm run live-check -- [chapters=2] [length=short|medium|long] [genre] [hook...]
 *
 * The key is read from the file only; it is never printed or written to the output.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function readKey() {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env.local with GEMINI_API_KEY=...');
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => /^\s*GEMINI_API_KEY\s*=/.test(l));
  const key = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('GEMINI_API_KEY is empty in .env.local');
  return key;
}

// Minimal browser surface for code paths that touch the DOM (status text, errors)
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

const [chaptersArg = '2', lengthArg = 'short', genreArg = 'fantasy', ...hookWords] = process.argv.slice(2);
const chaptersToWrite = Math.max(1, parseInt(chaptersArg, 10) || 2);

const apiKey = readKey();
const App = await import('../src/app.js');
const cfg = await import('../src/constants.js');
const { store } = await import('../src/store.js');
const { createEmptyBookState, defaultBookProfile } = await import('../src/book-model.js');

// ---- call log (wraps fetch; the key header is never recorded) ----
const runDir = path.join(root, 'live-runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(runDir, { recursive: true });
const calls = [];
let stage = 'setup';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const model = u.match(/models\/([^:]+):/)?.[1] || '';
  const body = init?.body ? JSON.parse(init.body) : null;
  const started = Date.now();
  const res = await realFetch(url, init);
  const ms = Date.now() - started;
  const data = await res.clone().json().catch(() => null);
  calls.push({
    stage,
    model,
    endpoint: u.split(':').pop(),
    status: res.status,
    ms,
    json: body?.generationConfig?.responseMimeType === 'application/json',
    temperature: body?.generationConfig?.temperature,
    maxOutputTokens: body?.generationConfig?.maxOutputTokens,
    finishReason: data?.candidates?.[0]?.finishReason || '',
    usage: data?.usageMetadata || null,
    prompt: body?.contents?.[0]?.parts?.[0]?.text || '',
    reply: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? (res.ok ? '' : JSON.stringify(data))
  });
  console.log(`  ${String(calls.length).padStart(2)}. ${stage.padEnd(22)} ${model.padEnd(24)} ${res.status} ${(ms / 1000).toFixed(1)}s`);
  return res;
};

// ---- the same steps the app runs (creation, then runGenerateChapterAt per chapter) ----
store.app.apiKey = apiKey;
store.state = createEmptyBookState();
store.state.id = App.newBookId();
store.state.apiKey = apiKey;
store.state.readingLengthKey = cfg.LENGTH_PRESETS[lengthArg] ? lengthArg : 'short';
store.state.totalChapters = cfg.LENGTH_PRESETS[store.state.readingLengthKey].chapters;
store.state.bookProfile = { ...defaultBookProfile(), genre: genreArg, tone: 'classic', hook: hookWords.join(' ') };

const timings = {};
const time = async (label, fn) => {
  stage = label;
  const t = Date.now();
  try { return await fn(); } finally { timings[label] = Date.now() - t; }
};

console.log(`Live check: ${store.state.totalChapters}-chapter ${genreArg} book, writing ${chaptersToWrite} chapter(s)\n`);
let failure = null;
try {
  const book = App.normalizeBlueprint(await time('blueprint', () => App.createBookBlueprint()));
  store.state.book = book;
  store.state.memoryBook = App.initMemoryBookFromBlueprint(book);

  for (let idx = 0; idx < chaptersToWrite; idx++) {
    const num = idx + 1;
    const outline = store.state.book.chapterOutlines[idx];
    await time(`chapter ${num}`, async () => {
      stage = `ch${num} plan`;
      const plan = await App.planChapter(idx);
      stage = `ch${num} write`;
      let text = await App.writeChapter(idx, plan);
      stage = `ch${num} review`;
      let review = await App.reviewChapter(text, idx, plan);
      const reviews = [review];
      for (let fix = 0; !review.approved && fix < 2; fix++) {
        stage = `ch${num} fix`;
        const candidate = await App.fixChapter(text, review, idx, plan);
        if (App.isChapterTextValid(candidate)) text = candidate;
        stage = `ch${num} review`;
        review = await App.reviewChapter(text, idx, plan);
        reviews.push(review);
      }
      stage = `ch${num} analysis`;
      const { memoryBook, summary } = await App.analyzeChapter(text, num, outline);
      store.state.chapters.push({ title: App.sanitizeChapterTitle(outline.title, num), text, number: num, reviews });
      if (memoryBook) store.state.memoryBook = memoryBook;
      store.state.eventLog.push(`פרק ${num} (${outline.title}):\n${summary}`);
    });
  }
} catch (e) {
  failure = e;
  console.error(`\nFAILED during "${stage}": ${e.message}`);
}

// ---- report ----
const sum = (arr, f) => arr.reduce((s, c) => s + (f(c) || 0), 0);
const byModel = {};
for (const c of calls.filter(c => c.endpoint === 'generateContent')) {
  const m = (byModel[c.model] ||= { calls: 0, inTokens: 0, outTokens: 0, ms: 0 });
  m.calls++;
  m.inTokens += c.usage?.promptTokenCount || 0;
  m.outTokens += (c.usage?.candidatesTokenCount || 0) + (c.usage?.thoughtsTokenCount || 0);
  m.ms += c.ms;
}
const chapters = store.state.chapters.map(ch => ({
  number: ch.number,
  title: ch.title,
  words: App.countWords(ch.text),
  endsComplete: App.endsWithCompleteSentence(ch.text),
  sceneBreaks: (ch.text.match(/\[\*\*\*\]/g) || []).length,
  reviews: ch.reviews.map(r => ({ approved: r.approved, score: r.score, issues: r.issues }))
}));

const result = {
  ok: !failure,
  failure: failure ? { stage, message: failure.message } : null,
  timingsMs: timings,
  byModel,
  callCount: calls.length,
  chapters,
  book: store.state.book,
  memoryBook: store.state.memoryBook,
  eventLog: store.state.eventLog
};
fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(runDir, 'calls.json'), JSON.stringify(calls, null, 2));
store.state.chapters.forEach(ch =>
  fs.writeFileSync(path.join(runDir, `chapter-${ch.number}.txt`), `${ch.title}\n\n${ch.text}\n`));

console.log(`\n${failure ? 'Stopped' : 'Done'}: ${calls.length} calls, ${(sum(Object.values(timings), x => x) / 1000).toFixed(0)}s`);
for (const [m, s] of Object.entries(byModel)) {
  console.log(`  ${m}: ${s.calls} calls, ${s.inTokens} in / ${s.outTokens} out tokens, ${(s.ms / 1000).toFixed(0)}s`);
}
console.log(`Output: ${path.relative(root, runDir)}`);
process.exit(failure ? 1 : 0);
