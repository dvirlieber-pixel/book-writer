import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as App from '../src/app.js';
import { store } from '../src/store.js';
import * as cfg from '../src/constants.js';

const rawBible = {
  title: 'השער שמעבר לעמק',
  tagline: 'נערה, מפה ושער שלא נפתח מאה שנה',
  setting: 'עמק מבודד',
  coreRules: 'השער נפתח רק בירח מלא',
  centralConflict: 'נועה מול מועצת הכפר',
  theme: 'אומץ לשאול',
  ending: 'נועה פותחת את השער ונשארת בצד השני.',
  mainCharacters: [
    { name: 'נועה', gender: 'נקבה', role: 'גיבורה', want: 'לפתוח את השער', need: 'לסמוך על אחרים', flaw: 'עקשנות', arc: 'מבודדת לשותפה' },
    { name: 'אבי', gender: 'לא ידוע', role: 'מורה' },
    { role: 'בלי שם' }
  ],
  acts: [
    { name: 'היציאה', fromChapter: 1, toChapter: 3, purpose: 'נועה עוזבת', turningPoint: 'המפה נגנבת' },
    { name: 'הדרך', fromChapter: 4, toChapter: 99, purpose: 'המסע' },
    { name: 'שבור', fromChapter: 'x', toChapter: 2 }
  ],
  threads: [{ name: 'המפה', description: 'מי צייר אותה', setupChapter: 2, payoffChapter: 5 }],
  styleGuide: { narration: 'גוף שלישי, עבר, קרוב לנועה', avoid: 'עברית מתורגמת', extra: 'x' }
};

describe('outlineBatches', () => {
  it('splits into near-equal batches of at most 12', () => {
    expect(App.outlineBatches(15)).toEqual([[1, 8], [9, 15]]);
    expect(App.outlineBatches(12)).toEqual([[1, 12]]);
    expect(App.outlineBatches(30)).toEqual([[1, 10], [11, 20], [21, 30]]);
    expect(App.outlineBatches(50).map(([a, b]) => b - a + 1)).toEqual([10, 10, 10, 10, 10]);
  });
});

describe('normalizeStoryBible', () => {
  const bible = App.normalizeStoryBible(rawBible, 6);

  it('keeps valid characters, genders, acts, threads and style', () => {
    expect(bible.mainCharacters.map(c => c.name)).toEqual(['נועה', 'אבי']);
    expect(bible.mainCharacters[0].gender).toBe('נקבה');
    expect(bible.mainCharacters[1].gender).toBeUndefined();
    expect(bible.acts).toEqual([
      { name: 'היציאה', fromChapter: 1, toChapter: 3, purpose: 'נועה עוזבת', turningPoint: 'המפה נגנבת' },
      { name: 'הדרך', fromChapter: 4, toChapter: 6, purpose: 'המסע', turningPoint: '' }
    ]);
    expect(bible.threads[0]).toMatchObject({ setupChapter: 2, payoffChapter: 5 });
    expect(bible.styleGuide).toEqual({ narration: 'גוף שלישי, עבר, קרוב לנועה', avoid: 'עברית מתורגמת' });
    expect(bible.ending).toBe(rawBible.ending);
  });

  it('rejects a bible without a title or characters', () => {
    expect(App.normalizeStoryBible({ ...rawBible, title: '' }, 6)).toBeNull();
    expect(App.normalizeStoryBible({ ...rawBible, mainCharacters: [] }, 6)).toBeNull();
    expect(App.normalizeStoryBible(null, 6)).toBeNull();
  });
});

describe('normalizeChapterOutlines', () => {
  it('keeps the story-bible outline fields', () => {
    const book = App.normalizeChapterOutlines({
      title: 'ספר',
      chapterOutlines: [{ title: 'א', summary: 'ס', pov: 'נועה', purpose: 'מטרה', turn: 'שינוי', hook: 'וו', conflict: '', threads: ['המפה', 7] }]
    }, 1);
    expect(book.chapterOutlines[0]).toEqual({ number: 1, title: 'א', summary: 'ס', pov: 'נועה', purpose: 'מטרה', turn: 'שינוי', hook: 'וו', threads: ['המפה'] });
  });
});

describe('chapterBibleContext', () => {
  const book = {
    ...App.normalizeStoryBible(rawBible, 6),
    chapterOutlines: [1, 2, 3, 4, 5, 6].map(n => ({
      number: n, title: `פרק ${n}`, summary: `קורה ${n}`, pov: 'נועה',
      ...(n === 3 ? { purpose: 'לאבד את המפה', turn: 'נועה לבד', hook: 'צעדים בחושך', threads: ['המפה'] } : {})
    }))
  };

  it('describes the act, the chapter role, arcs, next chapter and ending', () => {
    const ctx = App.chapterBibleContext(book, 2);
    expect(ctx).toContain('מערכה "היציאה" (פרקים 1-3)');
    expect(ctx).toContain('נקודת המפנה:** המפה נגנבת');
    expect(ctx).toContain('תפקיד הפרק:** לאבד את המפה');
    expect(ctx).toContain('סיום הפרק (hook):** צעדים בחושך');
    expect(ctx).toContain('לקדם: המפה');
    expect(ctx).toContain('נועה (נקבה) — רוצה: לפתוח את השער');
    expect(ctx).toContain('פרק 4 — קורה 4');
    expect(ctx).toContain(rawBible.ending);
  });

  it('marks thread setup and payoff chapters', () => {
    expect(App.chapterBibleContext(book, 1)).toContain('להטמין: המפה');
    expect(App.chapterBibleContext(book, 4)).toContain('לממש: המפה');
  });

  it('degrades to the next-chapter hint for books made before the bible', () => {
    const old = { title: 'ישן', chapterOutlines: [{ title: 'א', summary: 'ס', pov: 'x' }, { title: 'ב', summary: 'ת', pov: 'x' }] };
    expect(App.chapterBibleContext(old, 0)).toBe('**הפרק הבא (רק כדי להוביל אליו — אל תכתוב אותו):** ב — ת');
    expect(App.chapterBibleContext(old, 1)).toBe('');
  });
});

describe('styleGuideText', () => {
  it('formats the style sheet and is empty without one', () => {
    expect(App.styleGuideText({ styleGuide: { narration: 'גוף ראשון', avoid: 'קלישאות' } })).toBe('סיפור: גוף ראשון\nהימנע: קלישאות');
    expect(App.styleGuideText({})).toBe('');
  });
});

describe('createBlueprint', () => {
  const reply = obj => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] }),
    { status: 200 }
  );
  let prompts;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });
    store.app.apiKey = 'test-key';
    prompts = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const prompt = JSON.parse(init.body).contents[0].parts[0].text;
      prompts.push({ url: String(url), prompt });
      if (prompt.includes('בנה "תנ"ך סיפור"')) return reply(rawBible);
      const [, from, to] = prompt.match(/תכנן את פרקים (\d+)-(\d+)/);
      const outlines = [];
      for (let n = +from; n <= +to; n++) outlines.push({ number: n, title: `שם ${n}`, pov: 'נועה', summary: `קורה ${n}`, purpose: `תפקיד ${n}`, turn: `שינוי ${n}` });
      return reply({ chapterOutlines: outlines });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes the bible, then outlines in batches that see earlier chapters', async () => {
    const pending = App.createBlueprint('רעיון: נערה ושער', 15, 'פנטזיה');
    await vi.runAllTimersAsync();
    const book = await pending;

    expect(prompts).toHaveLength(3); // bible + 2 outline batches
    expect(prompts.every(p => p.url.includes(`/models/${cfg.GEMINI_MODEL_PROSE}:`))).toBe(true);
    expect(prompts[0].prompt).toContain('רעיון: נערה ושער');
    expect(prompts[1].prompt).toContain('תכנן את פרקים 1-8');
    expect(prompts[2].prompt).toContain('תכנן את פרקים 9-15');
    expect(prompts[2].prompt).toContain('8. שם 8 — קורה 8 (בסוף: שינוי 8)');

    expect(book.title).toBe(rawBible.title);
    expect(book.acts).toHaveLength(2);
    expect(book.chapterOutlines).toHaveLength(15);
    expect(book.chapterOutlines[14]).toMatchObject({ number: 15, title: 'שם 15', purpose: 'תפקיד 15', turn: 'שינוי 15' });
  });
});
