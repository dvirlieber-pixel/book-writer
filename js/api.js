// Gemini API client
// ===== API CALL =====

const geminiRateLimiter = {
  queue: [],
  pumping: false,
  lastRequestAt: 0,
  pausedUntil: 0,
  recentTimestamps: []
};

const geminiPriorityStack = ['normal'];

function setGeminiCallPriority(priority) {
  geminiPriorityStack.push(priority);
}

function popGeminiCallPriority() {
  if (geminiPriorityStack.length > 1) geminiPriorityStack.pop();
}

function resolveGeminiPriority(options = {}) {
  return options.priority || geminiPriorityStack[geminiPriorityStack.length - 1] || 'normal';
}

function isDailyQuotaError(message) {
  const m = (message || '').toLowerCase();
  return /per day|daily limit|quota.*day|requests per day|\brpd\b|per 24/.test(m);
}

function pruneGeminiRequestWindow(now = Date.now()) {
  geminiRateLimiter.recentTimestamps = geminiRateLimiter.recentTimestamps.filter(t => now - t < 60000);
}

function scheduleGeminiPause(ms) {
  const pause = Math.max(ms, 5000);
  geminiRateLimiter.pausedUntil = Math.max(geminiRateLimiter.pausedUntil, Date.now() + pause);
  return pause;
}

function showGeminiRateLimitStatus(waitMs) {
  const sec = Math.ceil(waitMs / 1000);
  const msg = sec > 8
    ? `ממתין ${sec} שניות — מגבלת קצב של Gemini (האפליקציה ממשיכה אוטומטית)...`
    : 'ממתין רגע לפני הבקשה הבאה...';
  const el = document.getElementById('loading-status')
    || document.getElementById('writing-status-text');
  if (el) el.textContent = msg;
}

async function waitForGeminiSlot() {
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
    if (geminiRateLimiter.recentTimestamps.length >= GEMINI_MAX_REQUESTS_PER_MINUTE) {
      const oldest = geminiRateLimiter.recentTimestamps[0];
      const waitMs = 60000 - (now - oldest) + 250;
      showGeminiRateLimitStatus(waitMs);
      await delay(Math.min(waitMs, 5000));
      continue;
    }
    const gap = GEMINI_MIN_REQUEST_GAP_MS - (now - geminiRateLimiter.lastRequestAt);
    if (gap > 0) await delay(gap);
    return;
  }
}

function recordGeminiRequest() {
  const now = Date.now();
  geminiRateLimiter.lastRequestAt = now;
  geminiRateLimiter.recentTimestamps.push(now);
  pruneGeminiRequestWindow(now);
}

function enqueueGeminiRequest(fn, priority = 'normal') {
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

async function pumpGeminiRequestQueue() {
  if (geminiRateLimiter.pumping) return;
  geminiRateLimiter.pumping = true;
  try {
    while (geminiRateLimiter.queue.length) {
      const job = geminiRateLimiter.queue.shift();
      try {
        await waitForGeminiSlot();
        const result = await job.fn();
        recordGeminiRequest();
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

function isQuotaApiError(status, message) {
  if (status === 429) return true;
  const m = (message || '').toLowerCase();
  return /quota|rate limit|resource.?exhausted|too many requests|exceeded|per day|per minute/.test(m);
}

function quotaExceededError(originalMsg) {
  const detail = originalMsg ? ` (${originalMsg})` : '';
  return new Error(
    `הגעת למכסה החינמית של Gemini — בקשות לדקה או ליום.${detail}\n\n` +
    `• בדיקת שימוש ומגבלות: ${GEMINI_RATE_LIMITS_URL}\n` +
    `• המכסה מתאפסת בדרך כלל בחצות שעון Pacific (לרוב בבוקר בישראל)\n` +
    `• נסה שוב מאוחר למחר, או הפעל חיוב ב-Google AI Studio לשימוש נוסף`
  );
}

function normalizeApiError(e, status, apiMessage) {
  if (isQuotaApiError(status, apiMessage || e?.message)) return quotaExceededError(apiMessage);
  return e;
}

function isModelNotFoundError(e, httpStatus) {
  if (httpStatus === 404 || e?.status === 404) return true;
  const m = (e?.message || '').toLowerCase();
  return /404|not found|not_found|invalid model|unknown model|does not exist|is not supported|no longer available/.test(m);
}

function setModelFallback(appKey, activeModelId) {
  if (app[appKey] === activeModelId) return;
  app[appKey] = activeModelId;
  save();
  refreshModelFallbackNotice();
}

function clearModelFallbackIfPrimary(appKey, primaryModel) {
  if (!app[appKey]) return;
  delete app[appKey];
  save();
  refreshModelFallbackNotice();
}

function refreshModelFallbackNotice() {
  const parts = [];
  if (app.liteModelFallback && app.liteModelFallback !== GEMINI_MODEL_LITE) {
    parts.push(
      `${GEMINI_MODEL_LABELS[GEMINI_MODEL_LITE]} לא זמין בפרויקט — משתמשים ב-${GEMINI_MODEL_LABELS[app.liteModelFallback] || app.liteModelFallback} לתכנון, זיכרון וסיכומים.`
    );
  }
  if (app.proseModelFallback && app.proseModelFallback !== GEMINI_MODEL_PROSE) {
    parts.push(
      `${GEMINI_MODEL_LABELS[GEMINI_MODEL_PROSE]} לא זמין בפרויקט — משתמשים ב-${GEMINI_MODEL_LABELS[app.proseModelFallback] || app.proseModelFallback} לכתיבת פרקים.`
    );
  }
  const msg = parts.join('\n\n');
  document.querySelectorAll('.model-fallback-notice').forEach(el => {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  });
}

async function callGeminiRawOnce(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = GEMINI_MODEL_PROSE, options = {}) {
  const priority = resolveGeminiPriority(options);
  return enqueueGeminiRequest(
    () => executeGeminiRawOnce(prompt, systemPrompt, maxTokens, retries, model, options),
    priority
  );
}

async function executeGeminiRawOnce(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = GEMINI_MODEL_PROSE, options = {}) {
  const delay = ms => new Promise(res => setTimeout(res, ms));
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: options.jsonMode ? 0.7 : 0.9
  };
  if (options.jsonMode) generationConfig.responseMimeType = 'application/json';

  const apiKey = getStoredApiKey();
  if (!apiKey) throw new Error('נדרש מפתח Gemini — הגדר מפתח בהגדרות');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(
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
      clearTimeout(timeoutId);

      if (response.status === 429) {
        const errBody = await response.json().catch(() => ({}));
        const msg = errBody?.error?.message || '';
        if (isDailyQuotaError(msg)) throw quotaExceededError(msg);
        const retryHdr = parseInt(response.headers.get('Retry-After'), 10);
        const backoffMs = scheduleGeminiPause(
          (retryHdr && !Number.isNaN(retryHdr) ? retryHdr * 1000 : null)
          || GEMINI_RATE_LIMIT_PAUSE_MS * (attempt + 1)
        );
        if (attempt < retries) {
          showGeminiRateLimitStatus(backoffMs);
          await delay(backoffMs);
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

async function callGeminiRawWithModelChain(chain, appKey, primaryModel, prompt, systemPrompt, maxTokens, retries, options = {}) {
  let lastErr;
  const chainLabel = chain === GEMINI_LITE_MODEL_CHAIN ? 'Lite' : 'כתיבה';
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
  const tried = chain.map(m => GEMINI_MODEL_LABELS[m] || m).join(' / ');
  throw new Error(`מודלי ${chainLabel} לא זמינים (${tried}) — בדוק ב-Google AI Studio אילו מודלים פעילים בפרויקט.`);
}

async function callGeminiRaw(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = GEMINI_MODEL_PROSE) {
  if (model !== GEMINI_MODEL_PROSE) {
    return callGeminiRawOnce(prompt, systemPrompt, maxTokens, retries, model);
  }
  return callGeminiRawWithModelChain(
    GEMINI_PROSE_MODEL_CHAIN, 'proseModelFallback', GEMINI_MODEL_PROSE, prompt, systemPrompt, maxTokens, retries
  );
}

async function callGemini(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = GEMINI_MODEL_PROSE) {
  const { text } = await callGeminiRaw(prompt, systemPrompt, maxTokens, retries, model);
  return text;
}

async function callGeminiLiteRaw(prompt, systemPrompt = '', maxTokens = 4096, options = {}) {
  return callGeminiRawWithModelChain(
    GEMINI_LITE_MODEL_CHAIN, 'liteModelFallback', GEMINI_MODEL_LITE, prompt, systemPrompt, maxTokens, 4, options
  );
}

async function callGeminiLite(prompt, systemPrompt = '', maxTokens = 4096, options = {}) {
  const { text } = await callGeminiLiteRaw(prompt, systemPrompt, maxTokens, options);
  return text;
}

const MIN_CHAPTER_WORDS = 900;
const PROSE_EXTEND_MAX_ROUNDS = 4;

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endsWithCompleteSentence(text) {
  const t = text.trim();
  if (!t) return false;
  if (/\.{3}\s*$/.test(t)) return false;
  return /[.!?…]["'»”]?\s*$/.test(t) || /[.!?…]["'»”]?$/.test(t.slice(-4));
}

function isChapterTextValid(text) {
  return countWords(text) >= MIN_CHAPTER_WORDS && endsWithCompleteSentence(text);
}

function chapterValidationError(text) {
  const words = countWords(text);
  if (words < MIN_CHAPTER_WORDS) return `הפרק קצר מדי (${words} מילים)`;
  if (!endsWithCompleteSentence(text)) return 'הפרק נסגר ללא סיום מלא';
  return null;
}

function assertChapterTextValid(text) {
  const err = chapterValidationError(text);
  if (err) throw new Error(`${err} — נסה שוב`);
}

function isOutputTruncated(text, finishReason, minWords) {
  if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') return true;
  if (countWords(text) < minWords) return true;
  if (!endsWithCompleteSentence(text)) return true;
  // בדיקה נוספת: אם הטקסט נגמר באמצע דיאלוג פתוח
  const trimmed = text.trimEnd();
  if (trimmed.endsWith('"') === false && (trimmed.match(/"/g) || []).length % 2 !== 0) return true;
  return false;
}

function mergeContinuation(existing, continuation) {
  const tail = existing.trimEnd();
  const head = continuation.trimStart();
  if (!head) return tail;
  const overlap = 120;
  const tailBit = tail.slice(-overlap);
  if (tailBit.length > 20 && head.startsWith(tailBit)) {
    return tail + head.slice(tailBit.length);
  }
  if (head.includes(tailBit) && tailBit.length > 20) {
    const idx = head.indexOf(tailBit);
    return tail + head.slice(idx + tailBit.length);
  }
  return tail + '\n' + head;
}

/** בדיקה קלילה של מפתח API — countTokens, ללא תור ה-rate limiter */
async function verifyGeminiApiKey(apiKey) {
  const key = (apiKey || '').trim();
  if (!key) return { ok: false, message: 'הזן מפתח לפני הבדיקה.' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_LITE}:countTokens`,
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
