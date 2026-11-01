import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as App from '../src/app.js';
import * as cfg from '../src/constants.js';
import { store } from '../src/store.js';

const words = (n, w = 'מילה') => Array.from({ length: n }, (_, i) => `${w}${i % 40}`).join(' ');
const sse = (text, extra = {}) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...extra }] })}\r\n\r\n`;

/** A Response whose body delivers the given strings as separate chunks, then optionally fails */
function streamResponse(chunks, { failAfter = false } = {}) {
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else if (failAfter) controller.error(new TypeError('network error'));
      else controller.close();
    }
  });
  return new Response(body, { status: 200 });
}

describe('readGeminiStream', () => {
  it('reports the growing text, skips thoughts, keeps the finish reason', async () => {
    const thought = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'חושב', thought: true }] } }] })}\r\n\r\n`;
    // An event split across two network chunks
    const second = sse(' עולם.', { finishReason: 'STOP' });
    const seen = [];
    const result = await App.readGeminiStream(
      streamResponse([thought, sse('שלום'), second.slice(0, 20), second.slice(20)]),
      t => seen.push(t)
    );
    expect(seen).toEqual(['שלום', 'שלום עולם.']);
    expect(result).toEqual({ text: 'שלום עולם.', finishReason: 'STOP' });
  });

  it('keeps a long text that broke off, marked INTERRUPTED', async () => {
    const result = await App.readGeminiStream(streamResponse([sse(words(200))], { failAfter: true }), () => {});
    expect(result.finishReason).toBe('INTERRUPTED');
    expect(App.isOutputTruncated(result.text + '.', result.finishReason, 10)).toBe(true);
  });

  it('a short text that broke off is an error worth retrying', async () => {
    const err = await App.readGeminiStream(streamResponse([sse('מעט')], { failAfter: true }), () => {}).catch(e => e);
    expect(err.streamInterrupted).toBe(true);
  });
});

describe('streamed prose calls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });
    store.app.apiKey = 'test-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the SSE endpoint and streams the text', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async url => {
      urls.push(String(url));
      return streamResponse([sse('אחת '), sse('שתיים.', { finishReason: 'STOP' })]);
    }));
    const seen = [];
    const result = App.callGeminiRaw('p', '', 100, 2, cfg.GEMINI_MODEL_PROSE, { onText: t => seen.push(t) });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ text: 'אחת שתיים.', finishReason: 'STOP' });
    expect(urls[0]).toContain(':streamGenerateContent?alt=sse');
    expect(seen.at(-1)).toBe('אחת שתיים.');
  });

  it('retries a stream that dropped before much text arrived', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(streamResponse([sse('מעט')], { failAfter: true }))
      .mockResolvedValueOnce(streamResponse([sse('שלם.', { finishReason: 'STOP' })]));
    vi.stubGlobal('fetch', fetchMock);
    const result = App.callGeminiRaw('p', '', 100, 2, cfg.GEMINI_MODEL_PROSE, { onText: () => {} });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ text: 'שלם.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('extendProse shows the whole text live, continuation merged in', async () => {
    const start = words(60) + '. ויחד הם י';
    vi.stubGlobal('fetch', vi.fn(async () =>
      streamResponse([sse(words(120, 'המשך') + '.', { finishReason: 'STOP' })])));
    const seen = [];
    const result = App.extendProse(start, 'המשך', 100, 2, 4096, 'MAX_TOKENS', '', t => seen.push(t));
    await vi.runAllTimersAsync();
    const final = await result;
    expect(final.startsWith(words(60) + '.')).toBe(true);
    expect(final).not.toContain('הם י');
    expect(seen.at(-1)).toBe(final);
    // Every live update already starts from the trimmed text, never from the half word
    expect(seen.every(t => t.startsWith(words(60) + '.') && !t.includes('ויחד הם י'))).toBe(true);
  });
});
