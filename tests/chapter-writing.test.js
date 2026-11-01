import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as App from '../src/app.js';
import * as cfg from '../src/constants.js';
import { store } from '../src/store.js';
import { createEmptyBookState } from '../src/book-model.js';

const words = (n, w = 'מילה') => Array.from({ length: n }, (_, i) => `${w}${i % 40}`).join(' ');

describe('trimToLastSentence', () => {
  it('cuts a mid-word ending back to the last sentence', () => {
    const t = words(50) + '. ויחד הם י';
    expect(App.trimToLastSentence(t)).toEqual({ text: words(50) + '.', trimmed: true, paragraphEnd: false });
  });

  it('notes when the cut lands on a paragraph break', () => {
    const t = words(50) + '.\n\n' + 'והיא';
    expect(App.trimToLastSentence(t)).toMatchObject({ trimmed: true, paragraphEnd: true });
  });

  it('keeps complete text, and text where trimming would lose too much', () => {
    expect(App.trimToLastSentence('הכל טוב.')).toMatchObject({ text: 'הכל טוב.', trimmed: false });
    const t = 'משפט קצר. ' + words(50);
    expect(App.trimToLastSentence(t)).toMatchObject({ text: t, trimmed: false });
  });

  it('accepts a closing quote after the punctuation', () => {
    expect(App.trimToLastSentence(words(30) + ' "באמת?" ' + 'והוא ה').text).toBe(words(30) + ' "באמת?"');
  });
});

describe('mergeContinuation sameParagraph', () => {
  it('joins with a space inside a paragraph even after a full sentence', () => {
    expect(App.mergeContinuation('הוא הלך.', 'היא נשארה.', { sameParagraph: true })).toBe('הוא הלך. היא נשארה.');
  });
});

describe('chapter writing against a stubbed Gemini', () => {
  const reply = (text, finishReason = 'STOP') => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }), { status: 200 }
  );
  let requests;
  let handler;

  const plan = {
    scenes: [{ goal: 'להגיע לשער', beat: 'נועה מטפסת', location: 'העמק', characters: ['נועה'] }, { goal: 'לפתוח', beat: 'השער נפתח' }],
    chapterGoal: 'לפתוח את השער'
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });
    store.app.apiKey = 'test-key';
    store.state = {
      ...createEmptyBookState(),
      id: 'b1',
      book: {
        title: 'ספר', setting: 'עמק',
        chapterOutlines: [
          { number: 1, title: 'השער', summary: 'נועה פותחת את השער', pov: 'נועה', turn: 'השער פתוח', hook: 'מישהו מחכה מעבר לשער' },
          { number: 2, title: 'מעבר', summary: 'מה שמעבר', pov: 'נועה' }
        ]
      },
      memoryBook: App.emptyMemoryBook()
    };
    requests = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ model: String(url).match(/models\/([^:]+):/)[1], body, prompt: body.contents[0].parts[0].text });
      return handler(requests.at(-1));
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const run = async promise => { await vi.runAllTimersAsync(); return promise; };

  it('writes a complete chapter in one prose call with capped thinking', async () => {
    handler = () => reply(words(1500) + '. מישהו חיכה מעבר לשער.');
    const text = await run(App.writeChapter(0, plan));

    expect(requests).toHaveLength(1);
    const r = requests[0];
    expect(r.model).toBe(cfg.GEMINI_MODEL_PROSE);
    expect(r.body.generationConfig.maxOutputTokens).toBe(cfg.CHAPTER_MAX_TOKENS);
    expect(r.body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: cfg.PROSE_THINKING_BUDGET });
    expect(r.prompt).toContain('1. [העמק] להגיע לשער — נועה מטפסת');
    expect(r.prompt).toContain('ה-hook המתוכנן: מישהו מחכה מעבר לשער');
    expect(App.countWords(text)).toBeGreaterThan(1500);
  });

  it('continues a cut-off chapter from the last sentence, with the plan in the prompt', async () => {
    let call = 0;
    handler = () => (++call === 1
      ? reply(words(1000) + '. ויחד הם י', 'MAX_TOKENS')
      : reply('יצרו מארג של צלילים. מישהו חיכה מעבר לשער.'));
    const text = await run(App.writeChapter(0, plan));

    expect(requests).toHaveLength(2);
    const cont = requests[1].prompt;
    expect(cont).toContain('הישאר נאמן לתכנון');
    expect(cont).toContain('הסיום המתוכנן (hook):** מישהו מחכה מעבר לשער');
    expect(cont).toMatch(/מילה\d+\."\s*\n\nכתוב המשך בלבד/); // tail sent ends at the sentence, not "הם י"
    expect(text).not.toContain('הם י');
    expect(text).toContain(words(1000) + '. יצרו מארג של צלילים.');
  });

  it('retries without thinkingConfig when the model rejects it', async () => {
    let call = 0;
    handler = () => (++call === 1
      ? new Response(JSON.stringify({ error: { message: 'Thinking budget is not supported for this model.' } }), { status: 400 })
      : reply(words(1500) + '. סוף.'));
    await run(App.writeChapter(0, plan));

    expect(requests).toHaveLength(2);
    expect(requests[0].body.generationConfig.thinkingConfig).toBeDefined();
    expect(requests[1].body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it('review sees the whole chapter, not just its opening', async () => {
    handler = () => reply('{"approved":true,"score":8,"issues":[]}');
    const chapter = words(400, 'התחלה') + '. ' + words(400, 'אמצע') + '. ' + words(400, 'סוף') + '.';
    await run(App.reviewChapter(chapter, 0, plan));

    expect(requests[0].prompt).toContain(chapter);
    expect(requests[0].body.generationConfig.thinkingConfig).toBeUndefined();
  });
});
