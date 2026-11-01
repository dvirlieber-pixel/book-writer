import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as App from '../src/app.js';
import * as cfg from '../src/constants.js';
import { store } from '../src/store.js';

const ok = text => new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }),
  { status: 200 }
);
const DAY = 24 * 60 * 60 * 1000;

describe('daily quota estimate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });
    store.app.apiKey = 'test-key';
    delete store.app.quotaUsage;
    delete store.app.proseModelFallback;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('the quota day follows Pacific time', () => {
    // 06:59 UTC in June is 23:59 PDT the day before
    expect(App.quotaDayKey(Date.parse('2026-06-15T06:59:00Z'))).toBe('2026-06-14');
    expect(App.quotaDayKey(Date.parse('2026-06-15T07:01:00Z'))).toBe('2026-06-15');
    expect(App.nextQuotaResetAt(Date.parse('2026-06-15T06:59:30.250Z'))).toBe(Date.parse('2026-06-15T07:00:00Z'));
  });

  it('counts answered prose requests and starts over on a new day', () => {
    const now = Date.parse('2026-06-15T12:00:00Z');
    App.recordQuotaUse(cfg.GEMINI_MODEL_PROSE, now);
    App.recordQuotaUse(cfg.GEMINI_MODEL_PROSE, now);
    App.recordQuotaUse(cfg.GEMINI_MODEL_LITE, now);
    const status = App.proseQuotaStatus(now);
    expect(status.used).toBe(2);
    expect(status.left).toBe(cfg.GEMINI_PROSE_DAILY_LIMIT - 2);
    expect(status.chaptersLeft).toBe(Math.floor((cfg.GEMINI_PROSE_DAILY_LIMIT - 2) / cfg.PROSE_CALLS_PER_CHAPTER));
    expect(App.proseQuotaStatus(now + DAY).used).toBe(0);
  });

  it('a successful call is counted, a daily-quota refusal marks the day used up', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(ok('done'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, per day' }
      }), { status: 429 })));

    const first = App.callGeminiRawOnce('a', '', 100, 2, cfg.GEMINI_MODEL_PROSE);
    await vi.runAllTimersAsync();
    await first;
    expect(App.proseQuotaStatus().used).toBe(1);

    const second = App.callGeminiRawOnce('b', '', 100, 2, cfg.GEMINI_MODEL_PROSE);
    const caught = second.catch(e => e);
    await vi.runAllTimersAsync();
    expect((await caught).message).toContain('הגעת למכסה החינמית');
    const status = App.proseQuotaStatus();
    expect(status.exhausted).toBe(true);
    expect(App.formatQuotaNotice(status)).toContain('נגמרה');
  });

  it('retries a timed-out request once', async () => {
    const hang = (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const fetchMock = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce(ok('late'));
    vi.stubGlobal('fetch', fetchMock);

    const result = App.callGeminiRawOnce('a', '', 100, 2, 'm');
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ text: 'late' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after a second timeout', async () => {
    const hang = (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const fetchMock = vi.fn(hang);
    vi.stubGlobal('fetch', fetchMock);

    const caught = App.callGeminiRawOnce('a', '', 100, 3, 'm').catch(e => e);
    await vi.runAllTimersAsync();
    expect((await caught).message).toContain('נמשכה יותר מדי');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('backup reminder', () => {
  beforeEach(() => {
    store.app.books = { b1: { id: 'b1', chapters: [{ text: 'x' }] } };
    delete store.app.lastBackupAt;
    delete store.app.backupReminderSnoozedAt;
  });
  afterEach(() => { delete store.storagePersisted; });

  it('shows only once the browser declined persistence and a week passed since the last backup', () => {
    const now = Date.now();
    store.storagePersisted = undefined;
    expect(App.shouldShowBackupReminder(now)).toBe(false);
    store.storagePersisted = true;
    expect(App.shouldShowBackupReminder(now)).toBe(false);
    store.storagePersisted = false;
    expect(App.shouldShowBackupReminder(now)).toBe(true);
    store.app.lastBackupAt = now - 2 * DAY;
    expect(App.shouldShowBackupReminder(now)).toBe(false);
    store.app.lastBackupAt = now - 8 * DAY;
    expect(App.shouldShowBackupReminder(now)).toBe(true);
    store.app.backupReminderSnoozedAt = now - DAY;
    expect(App.shouldShowBackupReminder(now)).toBe(false);
  });

  it('stays hidden with no written chapters', () => {
    store.storagePersisted = false;
    store.app.books = { b1: { id: 'b1', chapters: [] } };
    expect(App.shouldShowBackupReminder()).toBe(false);
  });
});
