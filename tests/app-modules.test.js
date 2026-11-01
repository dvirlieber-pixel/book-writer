import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as App from '../src/app.js';

describe('module graph', () => {
  it('every data-action in index.html maps to an exported function', () => {
    const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const actions = [...new Set([...html.matchAll(/data-action="([A-Za-z0-9_]+)"/g)].map(m => m[1]))];
    expect(actions.length).toBeGreaterThan(0);
    const missing = actions.filter(a => typeof App[a] !== 'function');
    expect(missing).toEqual([]);
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(App.escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('chapter text checks', () => {
  it('countWords splits on any whitespace', () => {
    expect(App.countWords('  אחת  שתיים\nשלוש ')).toBe(3);
  });

  it('endsWithCompleteSentence', () => {
    expect(App.endsWithCompleteSentence('הוא הלך הביתה.')).toBe(true);
    expect(App.endsWithCompleteSentence('"באמת?"')).toBe(true);
    expect(App.endsWithCompleteSentence('והיא אמרה')).toBe(false);
    expect(App.endsWithCompleteSentence('ואז...')).toBe(false);
  });

  it('isChapterTextValid requires length and a closed ending', () => {
    const long = 'מילה '.repeat(1000).trim();
    expect(App.isChapterTextValid(long + '.')).toBe(true);
    expect(App.isChapterTextValid(long)).toBe(false);
    expect(App.isChapterTextValid('קצר.')).toBe(false);
  });
});

describe('parseJsonFromResponse', () => {
  it('strips code fences and surrounding prose', () => {
    expect(App.parseJsonFromResponse('הנה:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('returns null for non-JSON', () => {
    expect(App.parseJsonFromResponse('אין כאן JSON')).toBeNull();
  });
});
