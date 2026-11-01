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

  it('does not treat Hebrew abbreviations as an open quote', () => {
    expect(App.isOutputTruncated(words(20) + ' הוא פנה אל ד"ר כהן.', 'STOP', 10)).toBe(false);
    expect(App.isOutputTruncated(words(20) + ' צה"ל, עו"ד ו-ש"ח.', 'STOP', 10)).toBe(false);
    // An abbreviation inside a still-open line of dialogue is still caught
    expect(App.isOutputTruncated(words(20) + ' "ד"ר כהן הגיע. ' + words(5) + '.', 'STOP', 10)).toBe(true);
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

  it('parseChapterAnalysis returns summary bullets and the merged memory book', () => {
    const raw = JSON.stringify({ summary: ['נועה מצאה את המפה', '- השער נפתח'], memoryUpdates: { characters: [{ name: 'נועה', status: 'בשער' }] } });
    const r = App.parseChapterAnalysis(raw, 'טקסט', 4, { characters: [{ name: 'נועה', role: 'גיבורה', status: 'בדרך' }] });
    expect(r.summary).toBe('- נועה מצאה את המפה\n- השער נפתח');
    expect(r.memoryBook.characters).toEqual([{ name: 'נועה', role: 'גיבורה', status: 'בשער' }]);
    expect(r.memoryBook.openMysteries).toEqual([]);
  });

  it('parseChapterAnalysis falls back per field', () => {
    const noMemory = App.parseChapterAnalysis('{"summary":"רק סיכום"}', 'טקסט', 4, {});
    expect(noMemory).toEqual({ memoryBook: null, summary: '- רק סיכום' });
    const broken = App.parseChapterAnalysis('לא JSON', 'תחילת הפרק', 4, {});
    expect(broken.memoryBook).toBeNull();
    expect(broken.summary).toBe('פרק 4: תחילת הפרק...');
  });
});

describe('mergeMemoryUpdates', () => {
  const current = {
    characters: [{ name: 'נועה', role: 'גיבורה', status: 'בדרך', notes: 'יודעת לקרוא מפות' }, { name: 'אבי', role: 'מורה', status: 'חי', notes: '' }],
    locations: [{ name: 'העמק', description: 'ירוק', significance: 'בית' }],
    keyObjects: [],
    worldRules: [{ rule: 'אין קסם בלילה', establishedInChapter: 1, notes: '' }],
    openMysteries: [{ question: 'מי פתח את השער?', introducedChapter: 2, status: 'פתוח', clues: 'עקבות' }]
  };

  it('patches existing entries without losing untouched fields or entries', () => {
    const m = App.mergeMemoryUpdates(current, { characters: [{ name: 'נועה', status: 'פצועה', notes: '' }] }, 5);
    expect(m.characters[0]).toEqual({ name: 'נועה', role: 'גיבורה', status: 'פצועה', notes: 'יודעת לקרוא מפות' });
    expect(m.characters[1]).toEqual(current.characters[1]);
    expect(m.locations).toEqual(current.locations);
    expect(m.worldRules).toEqual(current.worldRules);
  });

  it('matches keys ignoring case and extra spaces, and resolves mysteries', () => {
    const m = App.mergeMemoryUpdates(current, { openMysteries: [{ question: '  מי  פתח את השער? ', status: 'נפתר' }] }, 6);
    expect(m.openMysteries).toHaveLength(1);
    expect(m.openMysteries[0]).toMatchObject({ status: 'נפתר', clues: 'עקבות', introducedChapter: 2 });
  });

  it('adds new entries and stamps the chapter where relevant', () => {
    const m = App.mergeMemoryUpdates(current, {
      keyObjects: [{ name: 'מפתח', description: 'ברזל', owner: 'נועה', status: '' }],
      worldRules: [{ rule: 'השער נפתח רק בירח מלא' }]
    }, 7);
    expect(m.keyObjects).toEqual([{ name: 'מפתח', description: 'ברזל', owner: 'נועה' }]);
    expect(m.worldRules[1]).toEqual({ rule: 'השער נפתח רק בירח מלא', establishedInChapter: 7 });
  });

  it('does not mutate the current memory book', () => {
    const before = JSON.stringify(current);
    App.mergeMemoryUpdates(current, { characters: [{ name: 'נועה', status: 'x' }, { name: 'חדש' }] }, 8);
    expect(JSON.stringify(current)).toBe(before);
  });

  it('returns null when there is nothing usable', () => {
    expect(App.mergeMemoryUpdates(current, undefined, 1)).toBeNull();
    expect(App.mergeMemoryUpdates(current, { characters: [] }, 1)).toBeNull();
    expect(App.mergeMemoryUpdates(current, { characters: [{ role: 'בלי שם' }] }, 1)).toBeNull();
  });

  it('keeps every entry as the book grows', () => {
    let mb = App.emptyMemoryBook();
    for (let ch = 1; ch <= 60; ch++) {
      mb = App.mergeMemoryUpdates(mb, { characters: [{ name: `דמות ${ch}`, status: 'חיה' }, { name: 'דמות 1', status: `פרק ${ch}` }] }, ch);
    }
    expect(mb.characters).toHaveLength(60);
    expect(mb.characters[0].status).toBe('פרק 60');
  });
});
