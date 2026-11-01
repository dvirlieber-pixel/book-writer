// Gemini API client
import * as cfg from './constants.js';
import { store } from './store.js';
import {
  getStoredApiKey
} from './creation-resume.js';
import {
  save
} from './storage.js';

// ===== API CALL =====

const geminiRateLimiter = {
  queue: [],
  pumping: false,
  lastRequestAt: 0,
  pausedUntil: 0,
  recentTimestamps: []
};

const geminiPriorityStack = ['normal'];

export function setGeminiCallPriority(priority) {
  geminiPriorityStack.push(priority);
}

export function popGeminiCallPriority() {
  if (geminiPriorityStack.length > 1) geminiPriorityStack.pop();
}

export function resolveGeminiPriority(options = {}) {
  return options.priority || geminiPriorityStack[geminiPriorityStack.length - 1] || 'normal';
}

export function isDailyQuotaError(message) {
  const m = (message || '').toLowerCase();
  return /per day|daily limit|quota.*day|requests per day|\brpd\b|per 24/.test(m);
}

export function pruneGeminiRequestWindow(now = Date.now()) {
  geminiRateLimiter.recentTimestamps = geminiRateLimiter.recentTimestamps.filter(t => now - t < 60000);
}

export function scheduleGeminiPause(ms) {
  const pause = Math.max(ms, 5000);
  geminiRateLimiter.pausedUntil = Math.max(geminiRateLimiter.pausedUntil, Date.now() + pause);
  return pause;
}

export function showGeminiRateLimitStatus(waitMs) {
  const sec = Math.ceil(waitMs / 1000);
  const msg = sec > 8
    ? `ממתין ${sec} שניות — מגבלת קצב של Gemini (האפליקציה ממשיכה אוטומטית)...`
    : 'ממתין רגע לפני הבקשה הבאה...';
  const el = document.getElementById('loading-status')
    || document.getElementById('writing-status-text');
  if (el) el.textContent = msg;
}

export async function waitForGeminiSlot() {
  const delay = ms => new Promise(res => setTimeout(res, ms));
  while (true) {
    const now = Date.now();
    if (now < geminiRateLimiter.pausedUntil) {
      const waitMs = geminiRateLimiter.pausedUntil - now;
      showGeminiRateLimitStatus(waitMs);
      await delay(Math.min(waitMs, 5000));
      continue;
    }
    pruneGeminiRequestWindow(now);
    if (geminiRateLimiter.recentTimestamps.length >= cfg.GEMINI_MAX_REQUESTS_PER_MINUTE) {
      const oldest = geminiRateLimiter.recentTimestamps[0];
      const waitMs = 60000 - (now - oldest) + 250;
      showGeminiRateLimitStatus(waitMs);
      await delay(Math.min(waitMs, 5000));
      continue;
    }
    const gap = cfg.GEMINI_MIN_REQUEST_GAP_MS - (now - geminiRateLimiter.lastRequestAt);
    if (gap > 0) await delay(gap);
    return;
  }
}

export function recordGeminiRequest() {
  const now = Date.now();
  geminiRateLimiter.lastRequestAt = now;
  geminiRateLimiter.recentTimestamps.push(now);
  pruneGeminiRequestWindow(now);
}

export function enqueueGeminiRequest(fn, priority = 'normal') {
  return new Promise((resolve, reject) => {
    const job = { fn, resolve, reject, priority };
    if (priority === 'high') {
      const idx = geminiRateLimiter.queue.findIndex(j => j.priority !== 'high');
      geminiRateLimiter.queue.splice(idx === -1 ? geminiRateLimiter.queue.length : idx, 0, job);
    } else if (priority === 'low') {
      geminiRateLimiter.queue.push(job);
    } else {
      const idx = geminiRateLimiter.queue.findIndex(j => j.priority === 'low');
      geminiRateLimiter.queue.splice(idx === -1 ? geminiRateLimiter.queue.length : idx, 0, job);
    }
    pumpGeminiRequestQueue();
  });
}

export async function pumpGeminiRequestQueue() {
  if (geminiRateLimiter.pumping) return;
  geminiRateLimiter.pumping = true;
  try {
    while (geminiRateLimiter.queue.length) {
      const job = geminiRateLimiter.queue.shift();
      try {
        await waitForGeminiSlot();
        recordGeminiRequest(); // count at send time, every attempt
        const result = await job.fn();
        job.resolve(result);
      } catch (e) {
        job.reject(e);
      }
    }
  } finally {
    geminiRateLimiter.pumping = false;
    if (geminiRateLimiter.queue.length) pumpGeminiRequestQueue();
  }
}

export function isQuotaApiError(status, message) {
  if (status === 429) return true;
  const m = (message || '').toLowerCase();
  return /quota|rate limit|resource.?exhausted|too many requests|exceeded|per day|per minute/.test(m);
}

export function quotaExceededError(originalMsg) {
  const detail = originalMsg ? ` (${originalMsg})` : '';
  return new Error(
    `הגעת למכסה החינמית של Gemini — בקשות לדקה או ליום.${detail}\n\n` +
    `• בדיקת שימוש ומגבלות: ${cfg.GEMINI_RATE_LIMITS_URL}\n` +
    `• המכסה מתאפסת בדרך כלל בחצות שעון Pacific (לרוב בבוקר בישראל)\n` +
    `• נסה שוב מאוחר למחר, או הפעל חיוב ב-Google AI Studio לשימוש נוסף`
  );
}

export function normalizeApiError(e, status, apiMessage) {
  if (isQuotaApiError(status, apiMessage || e?.message)) return quotaExceededError(apiMessage);
  return e;
}

export function isModelNotFoundError(e, httpStatus) {
  if (httpStatus === 404 || e?.status === 404) return true;
  const m = (e?.message || '').toLowerCase();
  return /404|not found|not_found|invalid model|unknown model|does not exist|is not supported|no longer available/.test(m);
}

export function setModelFallback(appKey, activeModelId) {
  if (store.app[appKey] === activeModelId) return;
  store.app[appKey] = activeModelId;
  save();
  refreshModelFallbackNotice();
}

export function clearModelFallbackIfPrimary(appKey, primaryModel) {
  if (!store.app[appKey]) return;
  delete store.app[appKey];
  save();
  refreshModelFallbackNotice();
}

export function refreshModelFallbackNotice() {
  const parts = [];
  if (store.app.liteModelFallback && store.app.liteModelFallback !== cfg.GEMINI_MODEL_LITE) {
    parts.push(
      `${cfg.GEMINI_MODEL_LABELS[cfg.GEMINI_MODEL_LITE]} לא זמין בפרויקט — משתמשים ב-${cfg.GEMINI_MODEL_LABELS[store.app.liteModelFallback] || store.app.liteModelFallback} לתכנון, זיכרון וסיכומים.`
    );
  }
  if (store.app.proseModelFallback && store.app.proseModelFallback !== cfg.GEMINI_MODEL_PROSE) {
    parts.push(
      `${cfg.GEMINI_MODEL_LABELS[cfg.GEMINI_MODEL_PROSE]} לא זמין בפרויקט — משתמשים ב-${cfg.GEMINI_MODEL_LABELS[store.app.proseModelFallback] || store.app.proseModelFallback} לכתיבת פרקים.`
    );
  }
  const msg = parts.join('\n\n');
  document.querySelectorAll('.model-fallback-notice').forEach(el => {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  });
}

export async function callGeminiRawOnce(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE, options = {}) {
  return executeGeminiRawOnce(prompt, systemPrompt, maxTokens, retries, model, options);
}

// Each HTTP attempt goes through the rate-limit queue on its own, so retries are counted
// against the per-minute budget and backoff waits never hold the queue for other calls.
export async function executeGeminiRawOnce(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE, options = {}) {
  const delay = ms => new Promise(res => setTimeout(res, ms));
  // Captured once: the priority stack may change while this call waits between attempts
  const priority = resolveGeminiPriority(options);
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: options.temperature ?? (options.jsonMode ? 0.7 : 0.9)
  };
  if (options.jsonMode) generationConfig.responseMimeType = 'application/json';

  const apiKey = getStoredApiKey();
  if (!apiKey) throw new Error('נדרש מפתח Gemini — הגדר מפתח בהגדרות');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let timeoutId;
    try {
      const response = await enqueueGeminiRequest(() => {
        // Timeout starts when the request is actually sent, not while it waits in the queue
        timeoutId = setTimeout(() => controller.abort(), cfg.GEMINI_FETCH_TIMEOUT_MS);
        return fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: (systemPrompt ? systemPrompt + '\n\n' : '') + prompt }] }],
              generationConfig
            })
          }
        );
      }, priority);
      clearTimeout(timeoutId);

      if (response.status === 429) {
        const errBody = await response.json().catch(() => ({}));
        const msg = errBody?.error?.message || '';
        if (isDailyQuotaError(msg)) throw quotaExceededError(msg);
        const retryHdr = parseInt(response.headers.get('Retry-After'), 10);
        const backoffMs = scheduleGeminiPause(
          (retryHdr && !Number.isNaN(retryHdr) ? retryHdr * 1000 : null)
          || cfg.GEMINI_RATE_LIMIT_PAUSE_MS * (attempt + 1)
        );
        if (attempt < retries) {
          // The global pause makes waitForGeminiSlot hold the next attempt (and every other call)
          showGeminiRateLimitStatus(backoffMs);
          continue;
        }
        throw quotaExceededError(msg || 'יותר מדי בקשות בדקה — נסה שוב בעוד דקה');
      }

      if (response.status === 503) {
        const waitSec = (attempt + 1) * 8;
        const statusEl = document.getElementById('loading-status') || document.getElementById('writing-status-text');
        if (statusEl) statusEl.textContent = `עומס על השרת — מנסה שוב בעוד ${waitSec} שניות... (ניסיון ${attempt + 1}/${retries})`;
        if (attempt < retries) { await delay(waitSec * 1000); continue; }
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err?.error?.message || `שגיאת API: ${response.status}`;
        if (isQuotaApiError(response.status, msg) && isDailyQuotaError(msg)) throw quotaExceededError(msg);
        if (response.status === 404 || isModelNotFoundError(null, response.status)) {
          const e = new Error(msg);
          e.status = 404;
          e.modelNotFound = true;
          throw e;
        }
        throw new Error(msg);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      return {
        text: candidate?.content?.parts?.[0]?.text || '',
        finishReason: candidate?.finishReason || ''
      };

    } catch(e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('הבקשה לשרת נמשכה יותר מדי — נסה שוב');
      }
      if (e.modelNotFound || isModelNotFoundError(e, e.status)) throw e;
      if (e.message && e.message.includes('הגעת למכסה החינמית')) throw e;
      if (isQuotaApiError(null, e.message) && isDailyQuotaError(e.message)) throw quotaExceededError(e.message);
      if (attempt < retries && (e.message.includes('503') || e.message.includes('fetch'))) {
        const waitSec = (attempt + 1) * 8;
        await delay(waitSec * 1000);
        continue;
      }
      throw normalizeApiError(e, null, e.message);
    }
  }
  throw new Error('השרת עמוס מדי — נסה שוב מאוחר יותר');
}

export async function callGeminiRawWithModelChain(chain, appKey, primaryModel, prompt, systemPrompt, maxTokens, retries, options = {}) {
  let lastErr;
  const chainLabel = chain === cfg.GEMINI_LITE_MODEL_CHAIN ? 'Lite' : 'כתיבה';
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const result = await callGeminiRawOnce(prompt, systemPrompt, maxTokens, retries, model, options);
      if (i > 0) setModelFallback(appKey, model);
      else clearModelFallbackIfPrimary(appKey, primaryModel);
      return result;
    } catch (e) {
      lastErr = e;
      if (isModelNotFoundError(e, e.status) && i < chain.length - 1) continue;
      throw e;
    }
  }
  const tried = chain.map(m => cfg.GEMINI_MODEL_LABELS[m] || m).join(' / ');
  throw new Error(`מודלי ${chainLabel} לא זמינים (${tried}) — בדוק ב-Google AI Studio אילו מודלים פעילים בפרויקט.`);
}

export async function callGeminiRaw(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE) {
  if (model !== cfg.GEMINI_MODEL_PROSE) {
    return callGeminiRawOnce(prompt, systemPrompt, maxTokens, retries, model);
  }
  return callGeminiRawWithModelChain(
    cfg.GEMINI_PROSE_MODEL_CHAIN, 'proseModelFallback', cfg.GEMINI_MODEL_PROSE, prompt, systemPrompt, maxTokens, retries
  );
}

export async function callGemini(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE) {
  const { text } = await callGeminiRaw(prompt, systemPrompt, maxTokens, retries, model);
  return text;
}

/** Structured (JSON) output from the prose model — for planning steps worth the stronger model */
export async function callGeminiProseJson(prompt, maxTokens = 8192, options = {}) {
  return callGeminiRawWithModelChain(
    cfg.GEMINI_PROSE_MODEL_CHAIN, 'proseModelFallback', cfg.GEMINI_MODEL_PROSE, prompt, '', maxTokens, 4,
    { ...options, jsonMode: true }
  );
}

export async function callGeminiLiteRaw(prompt, systemPrompt = '', maxTokens = 4096, options = {}) {
  return callGeminiRawWithModelChain(
    cfg.GEMINI_LITE_MODEL_CHAIN, 'liteModelFallback', cfg.GEMINI_MODEL_LITE, prompt, systemPrompt, maxTokens, 4, options
  );
}

export async function callGeminiLite(prompt, systemPrompt = '', maxTokens = 4096, options = {}) {
  const { text } = await callGeminiLiteRaw(prompt, systemPrompt, maxTokens, options);
  return text;
}

export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function endsWithCompleteSentence(text) {
  const t = text.trim();
  if (!t) return false;
  if (/\.{3}\s*$/.test(t)) return false;
  return /[.!?…]["'»”]?\s*$/.test(t) || /[.!?…]["'»”]?$/.test(t.slice(-4));
}

export function isChapterTextValid(text) {
  return countWords(text) >= cfg.MIN_CHAPTER_WORDS && endsWithCompleteSentence(text);
}

export function chapterValidationError(text) {
  const words = countWords(text);
  if (words < cfg.MIN_CHAPTER_WORDS) return `הפרק קצר מדי (${words} מילים)`;
  if (!endsWithCompleteSentence(text)) return 'הפרק נסגר ללא סיום מלא';
  return null;
}

export function assertChapterTextValid(text) {
  const err = chapterValidationError(text);
  if (err) throw new Error(`${err} — נסה שוב`);
}

export function isOutputTruncated(text, finishReason, minWords) {
  if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') return true;
  if (countWords(text) < minWords) return true;
  if (!endsWithCompleteSentence(text)) return true;
  // בדיקה נוספת: אם הטקסט נגמר באמצע דיאלוג פתוח.
  // מרכאות בין שתי אותיות עבריות הן קיצור (ד"ר, צה"ל, עו"ד) ולא פתיחת דיאלוג.
  const trimmed = text.trimEnd();
  const dialogueQuotes = trimmed.replace(/[א-ת]"(?=[א-ת])/g, '').match(/"/g) || [];
  if (trimmed.endsWith('"') === false && dialogueQuotes.length % 2 !== 0) return true;
  return false;
}

export function mergeContinuation(existing, continuation) {
  const tail = existing.trimEnd();
  const head = continuation.trimStart();
  if (!head) return tail;
  // The model often restates the last few words before continuing: drop the longest
  // end-of-tail / start-of-head overlap (15+ chars, so a shared short word isn't cut)
  for (let len = Math.min(tail.length, head.length, 400); len >= 15; len--) {
    if (head.startsWith(tail.slice(-len))) return tail + head.slice(len);
  }
  const tailBit = tail.slice(-120);
  if (head.includes(tailBit) && tailBit.length > 20) {
    const idx = head.indexOf(tailBit);
    return tail + head.slice(idx + tailBit.length);
  }
  // Cut mid-sentence (e.g. MAX_TOKENS): keep the sentence in one paragraph
  return tail + (endsWithCompleteSentence(tail) ? '\n' : ' ') + head;
}

/** בדיקה קלילה של מפתח API — countTokens, ללא תור ה-rate limiter */
export async function verifyGeminiApiKey(apiKey) {
  const key = (apiKey || '').trim();
  if (!key) return { ok: false, message: 'הזן מפתח לפני הבדיקה.' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${cfg.GEMINI_MODEL_LITE}:countTokens`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ok' }] }]
        })
      }
    );
    clearTimeout(timeoutId);

    if (response.ok) return { ok: true };

    const errBody = await response.json().catch(() => ({}));
    const apiMsg = errBody?.error?.message || '';

    if (response.status === 400 || response.status === 403 || response.status === 401) {
      const invalidKey = /api.?key|invalid|permission|denied|unauthorized/i.test(apiMsg);
      return {
        ok: false,
        message: invalidKey
          ? 'המפתח לא תקין או שאינו מורשה. ודא שהעתקת אותו נכון מ-Google AI Studio.'
          : (apiMsg || 'המפתח נדחה על ידי השרת. בדוק את ההגדרות בפרויקט שלך.')
      };
    }

    if (response.status === 429) {
      return { ok: true };
    }

    return {
      ok: false,
      message: apiMsg || `הבדיקה נכשלה (שגיאה ${response.status}). נסה שוב בעוד רגע.`
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      return { ok: false, message: 'הבדיקה ארכה יותר מדי — בדוק את חיבור האינטרנט.' };
    }
    return { ok: false, message: 'לא ניתן להתחבר לשרת Gemini. בדוק את החיבור לרשת.' };
  }
}
