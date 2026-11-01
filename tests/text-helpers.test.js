import { describe, it, expect } from 'vitest';
import * as App from '../src/app.js';

const words = n => Array.from({ length: n }, (_, i) => `מילה${i}`).join(' ');

describe('mergeContinuation', () => {
  const tail = 'הוא פתח את הדלת לאט, הביט סביבו בזהירות רבה, ואז שמע קול מוכר שקרא בשמו';

  it('drops the overlap when the continuation repeats the tail', () => {
    const merged = App.mergeContinuation(tail, tail.slice(-40) + ' מהחדר השני.');
    expect(merged).toBe(tail + ' מהחדר השני.');
  });

  it('drops a long repeated tail', () => {
    const longTail = words(60);
    expect(App.mergeContinuation(longTail, longTail.slice(-200) + ' סוף.')).toBe(longTail + ' סוף.');
  });

  it('drops a restated passage that starts later in the continuation', () => {
    const longTail = words(60);
    expect(App.mergeContinuation(longTail, 'ובכן, ' + longTail.slice(-120) + ' סוף.')).toBe(longTail + ' סוף.');
  });

  it('keeps a mid-sentence cut in the same paragraph', () => {
    expect(App.mergeContinuation(tail, 'מהחדר השני.')).toBe(tail + ' מהחדר השני.');
  });

  it('starts a new paragraph after a finished sentence', () => {
    expect(App.mergeContinuation('הוא הלך.', 'היא נשארה.')).toBe('הוא הלך.\nהיא נשארה.');
  });

  it('ignores an empty continuation', () => {
    expect(App.mergeContinuation('טקסט.  ', '   ')).toBe('טקסט.');
  });
});

describe('isOutputTruncated', () => {
  const full = words(50) + '.';

  it('flags token-limit finishes', () => {
    expect(App.isOutputTruncated(full, 'MAX_TOKENS', 10)).toBe(true);
  });

  it('flags too few words and missing sentence end', () => {
    expect(App.isOutputTruncated(full, 'STOP', 100)).toBe(true);
    expect(App.isOutputTruncated(words(50), 'STOP', 10)).toBe(true);
  });

  it('flags an unclosed dialogue quote', () => {
    expect(App.isOutputTruncated(words(20) + ' "שלום לך. ' + words(5) + '.', 'STOP', 10)).toBe(true);
  });

  it('accepts complete text', () => {
    expect(App.isOutputTruncated(full, 'STOP', 10)).toBe(false);
  });
});

describe('titles', () => {
  it('rejects model chatter and API errors as titles', () => {
    for (const t of ['', 'שלום! הנה הפרק', 'Error 404', 'שגיאה: מפתח לא תקין', 'model not found', 'JSON בלבד', 'x'.repeat(101)]) {
      expect(App.looksLikeMetaOrErrorTitle(t)).toBe(true);
    }
    expect(App.looksLikeMetaOrErrorTitle('הצל שמעבר להרים')).toBe(false);
  });

  it('falls back to a numbered chapter / generic book title', () => {
    expect(App.sanitizeChapterTitle('Error 500', 3)).toBe('פרק 3');
    expect(App.sanitizeChapterTitle('  השער הנעול ', 3)).toBe('השער הנעול');
    expect(App.sanitizeBookTitle('')).toBe('ספר חדש');
  });

  it('sanitizeFilename strips reserved characters', () => {
    expect(App.sanitizeFilename('ספר: "א/ב"?')).toBe('ספר אב');
    expect(App.sanitizeFilename('***')).toBe('ספר');
  });
});

describe('stored book normalization', () => {
  it('normalizeBlueprint fills legacy field aliases and numbers outlines', () => {
    const b = App.normalizeBlueprint({ title: 'ספר', world: 'עולם', magicSystem: 'קסם', chapterOutlines: [{ title: 'Error 1' }, { title: 'שני' }] });
    expect(b.setting).toBe('עולם');
    expect(b.coreRules).toBe('קסם');
    expect(b.chapterOutlines.map(c => [c.number, c.title])).toEqual([[1, 'פרק 1'], [2, 'שני']]);
  });

  it('sanitizeStoredBook takes chapter titles from the outline', () => {
    const snap = App.sanitizeStoredBook({
      book: { title: 'ספר', chapterOutlines: [{ title: 'פתיחה' }] },
      chapters: [{ title: 'שלום! הנה הפרק', text: 'x' }]
    });
    expect(snap.chapters[0]).toMatchObject({ number: 1, title: 'פתיחה', text: 'x' });
  });

  it('normalizeChapterOutlines pads to the expected count', () => {
    const book = App.normalizeChapterOutlines({ title: 'ספר', mainCharacters: [{ name: 'נועה' }], chapterOutlines: [{ title: 'א', summary: '' }] }, 3);
    expect(book.chapterOutlines).toHaveLength(3);
    expect(book.chapterOutlines[0]).toEqual({ number: 1, title: 'א', summary: 'המשך ההרפתקה', pov: 'נועה' });
    expect(book.chapterOutlines[2].title).toBe('פרק 3');
  });
});

describe('migrations', () => {
  it('migrateLegacyTaste maps old taste keys onto a full profile', () => {
    expect(App.migrateLegacyTaste('war')).toMatchObject({ genre: 'historical', tone: 'action', hook: '' });
    expect(App.migrateLegacyTaste('unknown')).toMatchObject({ genre: 'fantasy', author: 'sanderson' });
  });

  it('migrateMemoryBook renames magicRules / artifacts and fills missing lists', () => {
    const mb = App.migrateMemoryBook({
      characters: [{ name: 'א' }],
      magicRules: [{ rule: 'אין קסם בלילה', establishedInChapter: 2, notes: '' }],
      artifacts: [{ name: 'חרב', description: 'ישנה', owner: 'א', status: 'אבדה' }]
    });
    expect(mb.worldRules).toEqual([{ rule: 'אין קסם בלילה', establishedInChapter: 2, notes: '' }]);
    expect(mb.keyObjects[0]).toMatchObject({ name: 'חרב', owner: 'א' });
    expect(mb.locations).toEqual([]);
    expect(App.migrateMemoryBook(null)).toEqual(App.emptyMemoryBook());
  });
});

describe('chapter analysis', () => {
  it('chapterTextForAnalysis keeps short chapters whole and long ones start + end', () => {
    expect(App.chapterTextForAnalysis('קצר')).toBe('קצר');
    const long = 'א'.repeat(10000) + 'ב'.repeat(10000);
    const cut = App.chapterTextForAnalysis(long, 1000);
    expect(cut.startsWith('א'.repeat(350))).toBe(true);
    expect(cut.endsWith('ב'.repeat(650))).toBe(true);
    expect(cut).toContain('[...]');
  });

  it('parseChapterAnalysis returns summary bullets and the memory book', () => {
    const raw = JSON.stringify({ summary: ['נועה מצאה את המפה', '- השער נפתח'], memoryBook: { characters: [{ name: 'נועה' }] } });
    const r = App.parseChapterAnalysis(raw, 'טקסט', 4);
    expect(r.summary).toBe('- נועה מצאה את המפה\n- השער נפתח');
    expect(r.memoryBook.characters).toEqual([{ name: 'נועה' }]);
    expect(r.memoryBook.openMysteries).toEqual([]);
  });

  it('parseChapterAnalysis falls back per field', () => {
    const noMemory = App.parseChapterAnalysis('{"summary":"רק סיכום"}', 'טקסט', 4);
    expect(noMemory).toEqual({ memoryBook: null, summary: '- רק סיכום' });
    const broken = App.parseChapterAnalysis('לא JSON', 'תחילת הפרק', 4);
    expect(broken.memoryBook).toBeNull();
    expect(broken.summary).toBe('פרק 4: תחילת הפרק...');
  });
});
