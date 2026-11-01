// Local estimate of the Gemini daily quota. The API says nothing about usage until it
// refuses a request, so we count what this device sent on the current Pacific day
// (Google resets the free tier at Pacific midnight).
import * as cfg from './constants.js';
import { store } from './store.js';
import { save } from './storage.js';

const pacificFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function pacificParts(now) {
  const parts = {};
  pacificFormat.formatToParts(new Date(now)).forEach(p => { parts[p.type] = p.value; });
  return parts;
}

export function quotaDayKey(now = Date.now()) {
  const p = pacificParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

export function nextQuotaResetAt(now = Date.now()) {
  const p = pacificParts(now);
  const sinceMidnightMs = (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000 + now % 1000;
  return now - sinceMidnightMs + 24 * 60 * 60 * 1000;
}

function todayUsage(now) {
  const day = quotaDayKey(now);
  if (store.app.quotaUsage?.day !== day) store.app.quotaUsage = { day, counts: {}, exhausted: {} };
  return store.app.quotaUsage;
}

/** One request the API answered (refused ones don't count against the quota) */
export function recordQuotaUse(model, now = Date.now()) {
  const usage = todayUsage(now);
  usage.counts[model] = (usage.counts[model] || 0) + 1;
  save();
  refreshQuotaNotice();
}

/** The API said the daily quota is used up: trust that over our count */
export function markQuotaExhausted(model, now = Date.now()) {
  todayUsage(now).exhausted[model] = true;
  save();
  refreshQuotaNotice();
}

export function proseQuotaStatus(now = Date.now()) {
  const model = store.app.proseModelFallback || cfg.GEMINI_MODEL_PROSE;
  const stored = store.app.quotaUsage;
  const usage = stored?.day === quotaDayKey(now) ? stored : { counts: {}, exhausted: {} };
  const used = usage.counts[model] || 0;
  const exhausted = !!usage.exhausted?.[model];
  const left = exhausted ? 0 : Math.max(0, cfg.GEMINI_PROSE_DAILY_LIMIT - used);
  return {
    model, used, left, exhausted,
    chaptersLeft: Math.floor(left / cfg.PROSE_CALLS_PER_CHAPTER),
    resetAt: nextQuotaResetAt(now)
  };
}

export function formatQuotaNotice(status, now = Date.now()) {
  const resetDate = new Date(status.resetAt);
  const day = resetDate.toDateString() === new Date(now).toDateString() ? 'היום' : 'מחר';
  const time = resetDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const reset = `מתאפסת ${day} ב-${time}`;
  if (status.left === 0) return `המכסה היומית לכתיבת פרקים נגמרה — ${reset}.`;
  if (status.chaptersLeft === 0) {
    return `נותרו היום ${status.left} בקשות כתיבה בלבד — ייתכן שלא יספיקו לפרק שלם. ${reset}.`;
  }
  return `מכסה יומית (הערכה): נותרו כ-${status.chaptersLeft} פרקים להיום. ${reset}.`;
}

export function refreshQuotaNotice() {
  const hasKey = !!(store.app.apiKey || store.state.apiKey);
  const status = hasKey ? proseQuotaStatus() : null;
  const msg = status ? formatQuotaNotice(status) : '';
  document.querySelectorAll('.quota-notice').forEach(el => {
    el.textContent = msg;
    el.classList.toggle('low', !!status && status.chaptersLeft <= 1);
    el.style.display = msg ? 'block' : 'none';
  });
}
