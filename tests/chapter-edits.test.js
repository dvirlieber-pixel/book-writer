import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as App from '../src/app.js';
import { store } from '../src/store.js';
import { createEmptyBookState } from '../src/book-model.js';

const words = (n, w = 'מילה') => Array.from({ length: n }, (_, i) => `${w}${i % 40}`).join(' ');

describe('applyChapterEdits', () => {
  const text = 'דנה פתחה את הדלת בשקט.\n\nהוא חייך אליה ואמר שלום.\n\nהרוח נשבה מן הים.';

  it('applies an exact, unique quote', () => {
    const r = App.applyChapterEdits(text, [{ find: 'הוא חייך אליה', replace: 'היא חייכה אליו' }]);
    expect(r.text).toBe('דנה פתחה את הדלת בשקט.\n\nהיא חייכה אליו ואמר שלום.\n\nהרוח נשבה מן הים.');
    expect(r.applied).toEqual([{ find: 'הוא חייך אליה', replace: 'היא חייכה אליו' }]);
  });

  it('skips quotes that are missing, repeated, cross paragraphs, or balloon in size', () => {
    const r = App.applyChapterEdits(text + '\n\nהוא חייך אליה שוב.', [
      { find: 'משפט שלא קיים בפרק', replace: 'x' },
      { find: 'הוא חייך אליה', replace: 'היא חייכה' },
      { find: 'בשקט.\n\nהוא', replace: 'בשקט. הוא' },
      { find: 'הרוח נשבה', replace: words(40) },
      { find: 'קצר', replace: 'ארוך' },
      null
    ]);
    expect(r.applied).toEqual([]);
    expect(r.text).toBe(text + '\n\nהוא חייך אליה שוב.');
  });
});

describe('polishChapterInPlace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });
    store.app.apiKey = 'test-key';
    store.state = {
      ...createEmptyBookState(),
      id: 'b1',
      book: { title: 'ספר', chapterOutlines: [{ number: 1, title: 'השער', summary: 's', pov: 'דנה' }] },
      memoryBook: App.emptyMemoryBook()
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const chapter = `${words(500)}. דנה אמר שהוא עייף. ${words(500)}.`;
  const review = { approved: false, issues: [{ type: 'דמות', severity: 'גבוה', description: 'דנה בלשון זכר' }] };
  const reply = obj => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }]
  }), { status: 200 });

  it('asks the prose model for edits and applies the ones that match', async () => {
    const fetchMock = vi.fn(async () => reply({ edits: [
      { find: 'דנה אמר שהוא עייף', replace: 'דנה אמרה שהיא עייפה', issue: 1 },
      { find: 'לא בפרק בכלל', replace: 'x' }
    ] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = App.polishChapterInPlace(chapter, review, 0, { scenes: [] });
    await vi.runAllTimersAsync();
    const r = await result;
    expect(r.applied).toEqual([{ find: 'דנה אמר שהוא עייף', replace: 'דנה אמרה שהיא עייפה' }]);
    expect(r.text).toContain('דנה אמרה שהיא עייפה');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-3.5-flash:generateContent');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('keeps the text when no edit is usable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ edits: [] })));
    const result = App.polishChapterInPlace(chapter, review, 0, { scenes: [] });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ text: chapter, applied: [] });
  });
});
