import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as App from '../src/app.js';
import { store } from '../src/store.js';

const ok = text => new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }),
  { status: 200 }
);
const promptOf = init => JSON.parse(init.body).contents[0].parts[0].text;

describe('Gemini request queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });
    store.app.apiKey = 'test-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries after 429 through the queue', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429, headers: { 'Retry-After': '1' }
      }))
      .mockResolvedValueOnce(ok('done'));
    vi.stubGlobal('fetch', fetchMock);

    const result = App.callGeminiRawOnce('a', '', 100, 2, 'm');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ text: 'done', finishReason: 'STOP' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a call waiting to retry does not block other calls', async () => {
    const order = [];
    let firstA = true;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const p = promptOf(init);
      order.push(p);
      if (p === 'A' && firstA) { firstA = false; return new Response('{}', { status: 503 }); }
      return ok(p);
    }));

    const a = App.callGeminiRawOnce('A', '', 100, 2, 'm');
    const b = App.callGeminiRawOnce('B', '', 100, 2, 'm');
    await vi.runAllTimersAsync();

    await expect(a).resolves.toMatchObject({ text: 'A' });
    await expect(b).resolves.toMatchObject({ text: 'B' });
    // B is sent while A sleeps on its 503 backoff, instead of after it
    expect(order).toEqual(['A', 'B', 'A']);
  });
});
