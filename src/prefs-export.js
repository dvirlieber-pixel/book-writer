// Reading prefs, PWA banners, library import/export
import * as cfg from './constants.js';
import { store } from './store.js';
import { defaultBookProfile, createEmptyBookState } from './book-model.js';
import {
  callGeminiLite
} from './api.js';
import {
  applyBookSnapshot,
  bookSnapshot,
  migrateBooksInApp,
  migrateLegacyTaste,
  syncWelcomeUIFromProfile
} from './book.js';
import {
  isReadingScreenActive,
  updateApiKeyStatus,
  updateWelcomeShelfLink
} from './creation-resume.js';
import {
  renderShelf
} from './shelf.js';
import {
  save
} from './storage.js';

export function getStoryContextForPrompt() {
  let parts = [];
  if (store.state.storySynopsis) parts.push(`**עד כה בסיפור (סיכום):**\n${store.state.storySynopsis}`);
  const recent = store.state.eventLog?.slice(-3) || [];
  if (recent.length) parts.push(`**אירועים בפרקים האחרונים:**\n${recent.join('\n\n')}`);
  return parts.join('\n\n');
}

export async function maybeCompressStorySynopsis() {
  const n = store.state.chapters.length;
  if (n < 5 || n % 5 !== 0) return;
  const prompt = `סכם את עלילת הספר עד כה ב-14-18 משפטים בעברית.
כלול: דמויות מרכזיות, קונפליקט, מטרות, תעלומות פתוחות, ומצב אחרון.
כתוב בנקודות קצרות. ללא הקדמה.

${store.state.storySynopsis ? 'סיכום קודם:\n' + store.state.storySynopsis + '\n\n' : ''}
יומן פרקים:
${store.state.eventLog.join('\n\n')}`;

  const bookState = store.state;
  try {
    const synopsis = await callGeminiLite(prompt, '', 1500);
    if (synopsis?.trim()) bookState.storySynopsis = synopsis.trim();
  } catch(e) { console.warn('synopsis compress failed', e); }
}

export function lockAppOrientation() {
  if (!screen.orientation?.lock) return;
  screen.orientation.lock('portrait-primary').catch(() => {});
}

export function unlockAppOrientation() {
  if (!screen.orientation?.unlock) return;
  try { screen.orientation.unlock(); } catch (e) {}
}

export async function toggleReadingLandscape() {
  if (!screen.orientation?.lock) {
    alert('סיבוב מסך אינו נתמך בדפדפן זה');
    return;
  }
  const type = screen.orientation.type || '';
  const isLandscape = type.startsWith('landscape');
  try {
    if (isLandscape) {
      await screen.orientation.lock('portrait-primary');
      store.app.readingPrefs.allowLandscape = false;
    } else {
      await screen.orientation.lock('landscape');
      store.app.readingPrefs.allowLandscape = true;
    }
    save();
    updateLandscapeToggleButton();
  } catch (e) {
    alert('לא ניתן לסובב — נסה במסך מלא או מהאפליקציה המותקנת');
  }
}

export function updateLandscapeToggleButton() {
  const btn = document.getElementById('landscape-toggle-btn');
  if (!btn || !screen.orientation) return;
  const isLandscape = (screen.orientation.type || '').startsWith('landscape');
  btn.textContent = isLandscape ? '⤒' : '⤡';
  btn.title = isLandscape ? 'חזרה לאורך' : 'קריאה לרוחב (לחיצה מפורשת)';
  btn.classList.toggle('landscape-on', isLandscape);
}

export function applyReadingPrefs() {
  const p = store.app.readingPrefs || { fontScale: 1, theme: 'dark', immersive: false };
  document.documentElement.style.setProperty('--read-font-scale', String(p.fontScale || 1));
  const isLight = p.theme === 'light';
  document.body.classList.toggle('theme-light', isLight);
  document.body.classList.toggle('theme-dark', !isLight);
  document.body.classList.toggle('reading-immersive', !!p.immersive && isReadingScreenActive());
  const themeIcon = isLight ? '☾' : '☀';
  ['theme-toggle-btn', 'theme-toggle-shelf', 'theme-toggle-library'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = themeIcon;
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isLight ? '#ebe4d4' : '#1a1410';
  const imm = document.getElementById('immersive-toggle-btn');
  if (imm) imm.classList.toggle('immersive-on', !!p.immersive);
}

export function adjustFontSize(delta) {
  store.app.readingPrefs.fontScale = Math.min(1.4, Math.max(0.85, (store.app.readingPrefs.fontScale || 1) + delta));
  applyReadingPrefs();
  save();
}

export function toggleTheme() {
  store.app.readingPrefs.theme = store.app.readingPrefs.theme === 'light' ? 'dark' : 'light';
  applyReadingPrefs();
  save();
}

export function toggleReadingImmersive() {
  store.app.readingPrefs.immersive = !store.app.readingPrefs.immersive;
  applyReadingPrefs();
  save();
}

export async function toggleWakeLock() {
  try {
    if (!('wakeLock' in navigator)) {
      alert('הדפדפן לא תומך במניעת נעילת מסך');
      return;
    }
    if (store.wakeLock) {
      await store.wakeLock.release();
      store.wakeLock = null;
    } else {
      store.wakeLock = await navigator.wakeLock.request('screen');
      store.wakeLock.addEventListener('release', () => updateWakeLockButton(false));
    }
    updateWakeLockButton(!!store.wakeLock);
  } catch (e) {
    console.warn('WakeLock', e);
  }
}

export function updateWakeLockButton(on) {
  const btn = document.getElementById('wake-toggle-btn');
  if (!btn) return;
  btn.textContent = on ? '💤' : '💡';
  btn.title = on ? 'בטל מניעת נעילה' : 'מנע נעילת מסך';
}

export async function releaseWakeLock() {
  if (store.wakeLock) {
    try { await store.wakeLock.release(); } catch (e) {}
    store.wakeLock = null;
    updateWakeLockButton(false);
  }
}

export function getTasteProfiles() {
  if (!store.app.tasteProfiles?.length) store.app.tasteProfiles = cfg.DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  return store.app.tasteProfiles;
}

export function renderTasteProfiles() {
  const wrap = document.getElementById('profile-options');
  if (!wrap) return;
  const active = store.app.readingPrefs?.activeProfile || 'classic';
  wrap.innerHTML = '';
  getTasteProfiles().forEach(p => {
    const lenLabel = cfg.LENGTH_PRESETS[p.lengthKey || 'medium']?.label || 'בינוני';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-btn' + (p.id === active ? ' selected' : '');
    btn.textContent = `${p.name} · ${lenLabel}`;
    btn.onclick = () => applyTasteProfile(p.id);
    wrap.appendChild(btn);
  });
}

export function applyTasteProfile(profileId) {
  const p = getTasteProfiles().find(x => x.id === profileId);
  if (!p) return;
  store.app.readingPrefs.activeProfile = profileId;
  const legacy = p.taste ? migrateLegacyTaste(p.taste) : null;
  const profile = {
    ...defaultBookProfile(),
    genre: p.genre || legacy?.genre || 'fantasy',
    tone: p.tone || legacy?.tone || 'classic'
  };
  const lk = p.lengthKey || (p.length >= 45 ? 'long' : p.length >= 25 ? 'medium' : 'short');
  store.app.readingPrefs.defaultLengthKey = lk;
  store.readingLengthKey = lk;
  store.state.totalChapters = cfg.LENGTH_PRESETS[lk]?.chapters || 30;
  syncWelcomeUIFromProfile(profile, lk);
  renderTasteProfiles();
  save();
}

export function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const online = navigator.onLine;
  if (banner) banner.style.display = online ? 'none' : 'flex';
  document.body.classList.toggle('has-offline-banner', !online);
}

export function showInstallUi() {
  const banner = document.getElementById('app-install-banner');
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'block';
  if (banner && !localStorage.getItem('pwa-install-dismissed')) {
    banner.style.display = 'flex';
    document.body.classList.add('has-app-banner');
  }
}

export function dismissInstallBanner() {
  localStorage.setItem('pwa-install-dismissed', '1');
  const banner = document.getElementById('app-install-banner');
  if (banner) banner.style.display = 'none';
  document.body.classList.remove('has-app-banner');
}

export async function promptPwaInstall() {
  if (!store.deferredInstallPrompt) return;
  const ev = store.deferredInstallPrompt;
  store.deferredInstallPrompt = null;
  dismissInstallBanner();
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
  await ev.prompt();
  await ev.userChoice;
}

export function showUpdateBanner(worker) {
  store.waitingSwWorker = worker;
  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.style.display = 'flex';
    document.body.classList.add('has-update-banner');
  }
}

export function dismissUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (banner) banner.style.display = 'none';
  document.body.classList.remove('has-update-banner');
}

export function applyAppUpdate() {
  if (store.waitingSwWorker) {
    store.waitingSwWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  window.location.reload();
}

export async function exportLibraryJson() {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  const data = {
    version: cfg.EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    readingPrefs: store.app.readingPrefs,
    tasteProfiles: store.app.tasteProfiles,
    books: store.app.books || {}
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seferiyat-hanetzach-shelf.json';
  a.click();
  URL.revokeObjectURL(url);
  store.app.lastBackupAt = Date.now();
  save();
  renderBackupReminder();
}

/** Only once the browser has answered that it may evict the books (storagePersisted === false) */
export function shouldShowBackupReminder(now = Date.now()) {
  if (store.storagePersisted !== false) return false;
  const hasChapters = Object.values(store.app.books || {}).some(b => b?.chapters?.length);
  if (!hasChapters) return false;
  const last = Math.max(store.app.lastBackupAt || 0, store.app.backupReminderSnoozedAt || 0);
  return now - last > cfg.BACKUP_REMINDER_INTERVAL_MS;
}

export function renderBackupReminder() {
  const el = document.getElementById('backup-reminder');
  if (!el) return;
  el.hidden = !shouldShowBackupReminder();
  const text = document.getElementById('backup-reminder-text');
  if (!text || el.hidden) return;
  const days = store.app.lastBackupAt
    ? Math.floor((Date.now() - store.app.lastBackupAt) / (24 * 60 * 60 * 1000))
    : null;
  text.textContent = 'הדפדפן לא התחייב לשמור את הספרים לצמיתות — הוא עלול למחוק אותם כשחסר מקום או אחרי תקופה בלי שימוש. '
    + (days == null ? 'עדיין לא שמרת גיבוי.' : `הגיבוי האחרון נשמר לפני ${days} ימים.`);
}

export function snoozeBackupReminder() {
  store.app.backupReminderSnoozedAt = Date.now();
  save();
  renderBackupReminder();
}

export function onImportLibraryFile(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > cfg.IMPORT_MAX_BYTES) {
    alert('הקובץ גדול מדי (מעל 50MB) — לא ניתן לייבא.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data?.books || typeof data.books !== 'object') throw new Error('קובץ לא תקין');
      if (data.version > cfg.EXPORT_FORMAT_VERSION) {
        throw new Error('הקובץ מגרסה חדשה יותר — עדכן את האפליקציה');
      }
      if (!confirm('לשחזר את המדף מהקובץ? ספרים קיימים יוחלפו.')) return;
      store.app.books = data.books;
      if (data.apiKey) {
        if (confirm('הקובץ מכיל מפתח API ישן. לייבא גם אותו למכשיר זה?')) {
          store.app.apiKey = String(data.apiKey).trim();
          store.state.apiKey = store.app.apiKey;
          const keyInput = document.getElementById('api-key-input');
          if (keyInput) keyInput.value = store.app.apiKey;
          updateApiKeyStatus();
        }
      }
      if (data.readingPrefs) store.app.readingPrefs = { ...store.app.readingPrefs, ...data.readingPrefs };
      if (data.tasteProfiles?.length) store.app.tasteProfiles = data.tasteProfiles;
      migrateBooksInApp();
      const ids = Object.keys(store.app.books);
      if (ids.length) {
        applyBookSnapshot(store.app.books[ids[ids.length - 1]]);
        store.app.currentBookId = store.state.id;
      } else {
        store.state = createEmptyBookState();
        store.state.apiKey = store.app.apiKey;
        store.app.currentBookId = null;
      }
      save();
      applyReadingPrefs();
      renderTasteProfiles();
      renderShelf();
      updateWelcomeShelfLink();
      alert('המדף שוחזר בהצלחה');
    } catch (e) {
      alert('שגיאה בטעינת גיבוי: ' + e.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}
