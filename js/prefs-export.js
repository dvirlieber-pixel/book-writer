// Reading prefs, PWA banners, library import/export
function getStoryContextForPrompt() {
  let parts = [];
  if (state.storySynopsis) parts.push(`**עד כה בסיפור (סיכום):**\n${state.storySynopsis}`);
  const recent = state.eventLog?.slice(-3) || [];
  if (recent.length) parts.push(`**אירועים בפרקים האחרונים:**\n${recent.join('\n\n')}`);
  return parts.join('\n\n');
}

async function maybeCompressStorySynopsis() {
  const n = state.chapters.length;
  if (n < 5 || n % 5 !== 0) return;
  const prompt = `סכם את עלילת הספר עד כה ב-14-18 משפטים בעברית.
כלול: דמויות מרכזיות, קונפליקט, מטרות, תעלומות פתוחות, ומצב אחרון.
כתוב בנקודות קצרות. ללא הקדמה.

${state.storySynopsis ? 'סיכום קודם:\n' + state.storySynopsis + '\n\n' : ''}
יומן פרקים:
${state.eventLog.join('\n\n')}`;

  try {
    const synopsis = await callGeminiLite(prompt, '', 1500);
    if (synopsis?.trim()) state.storySynopsis = synopsis.trim();
  } catch(e) { console.warn('synopsis compress failed', e); }
}

function lockAppOrientation() {
  if (!screen.orientation?.lock) return;
  screen.orientation.lock('portrait-primary').catch(() => {});
}

function unlockAppOrientation() {
  if (!screen.orientation?.unlock) return;
  try { screen.orientation.unlock(); } catch (e) {}
}

async function toggleReadingLandscape() {
  if (!screen.orientation?.lock) {
    alert('סיבוב מסך אינו נתמך בדפדפן זה');
    return;
  }
  const type = screen.orientation.type || '';
  const isLandscape = type.startsWith('landscape');
  try {
    if (isLandscape) {
      await screen.orientation.lock('portrait-primary');
      app.readingPrefs.allowLandscape = false;
    } else {
      await screen.orientation.lock('landscape');
      app.readingPrefs.allowLandscape = true;
    }
    save();
    updateLandscapeToggleButton();
  } catch (e) {
    alert('לא ניתן לסובב — נסה במסך מלא או מהאפליקציה המותקנת');
  }
}

function updateLandscapeToggleButton() {
  const btn = document.getElementById('landscape-toggle-btn');
  if (!btn || !screen.orientation) return;
  const isLandscape = (screen.orientation.type || '').startsWith('landscape');
  btn.textContent = isLandscape ? '⤒' : '⤡';
  btn.title = isLandscape ? 'חזרה לאורך' : 'קריאה לרוחב (לחיצה מפורשת)';
  btn.classList.toggle('landscape-on', isLandscape);
}

function applyReadingPrefs() {
  const p = app.readingPrefs || { fontScale: 1, theme: 'dark', immersive: false };
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

function adjustFontSize(delta) {
  app.readingPrefs.fontScale = Math.min(1.4, Math.max(0.85, (app.readingPrefs.fontScale || 1) + delta));
  applyReadingPrefs();
  save();
}

function toggleTheme() {
  app.readingPrefs.theme = app.readingPrefs.theme === 'light' ? 'dark' : 'light';
  applyReadingPrefs();
  save();
}

function toggleReadingImmersive() {
  app.readingPrefs.immersive = !app.readingPrefs.immersive;
  applyReadingPrefs();
  save();
}

async function toggleWakeLock() {
  try {
    if (!('wakeLock' in navigator)) {
      alert('הדפדפן לא תומך במניעת נעילת מסך');
      return;
    }
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    } else {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => updateWakeLockButton(false));
    }
    updateWakeLockButton(!!wakeLock);
  } catch (e) {
    console.warn('WakeLock', e);
  }
}

function updateWakeLockButton(on) {
  const btn = document.getElementById('wake-toggle-btn');
  if (!btn) return;
  btn.textContent = on ? '💤' : '💡';
  btn.title = on ? 'בטל מניעת נעילה' : 'מנע נעילת מסך';
}

async function releaseWakeLock() {
  if (wakeLock) {
    try { await wakeLock.release(); } catch (e) {}
    wakeLock = null;
    updateWakeLockButton(false);
  }
}

function getTasteProfiles() {
  if (!app.tasteProfiles?.length) app.tasteProfiles = DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  return app.tasteProfiles;
}

function renderTasteProfiles() {
  const wrap = document.getElementById('profile-options');
  if (!wrap) return;
  const active = app.readingPrefs?.activeProfile || 'classic';
  wrap.innerHTML = '';
  getTasteProfiles().forEach(p => {
    const lenLabel = LENGTH_PRESETS[p.lengthKey || 'medium']?.label || 'בינוני';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-btn' + (p.id === active ? ' selected' : '');
    btn.textContent = `${p.name} · ${lenLabel}`;
    btn.onclick = () => applyTasteProfile(p.id);
    wrap.appendChild(btn);
  });
}

function applyTasteProfile(profileId) {
  const p = getTasteProfiles().find(x => x.id === profileId);
  if (!p) return;
  app.readingPrefs.activeProfile = profileId;
  const legacy = p.taste ? migrateLegacyTaste(p.taste) : null;
  const profile = {
    ...defaultBookProfile(),
    genre: p.genre || legacy?.genre || 'fantasy',
    tone: p.tone || legacy?.tone || 'classic'
  };
  const lk = p.lengthKey || (p.length >= 45 ? 'long' : p.length >= 25 ? 'medium' : 'short');
  app.readingPrefs.defaultLengthKey = lk;
  readingLengthKey = lk;
  state.totalChapters = LENGTH_PRESETS[lk]?.chapters || 30;
  syncWelcomeUIFromProfile(profile, lk);
  renderTasteProfiles();
  save();
}

function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const online = navigator.onLine;
  if (banner) banner.style.display = online ? 'none' : 'flex';
  document.body.classList.toggle('has-offline-banner', !online);
}

function showInstallUi() {
  const banner = document.getElementById('app-install-banner');
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'block';
  if (banner && !localStorage.getItem('pwa-install-dismissed')) {
    banner.style.display = 'flex';
    document.body.classList.add('has-app-banner');
  }
}

function dismissInstallBanner() {
  localStorage.setItem('pwa-install-dismissed', '1');
  const banner = document.getElementById('app-install-banner');
  if (banner) banner.style.display = 'none';
  document.body.classList.remove('has-app-banner');
}

async function promptPwaInstall() {
  if (!deferredInstallPrompt) return;
  const ev = deferredInstallPrompt;
  deferredInstallPrompt = null;
  dismissInstallBanner();
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
  await ev.prompt();
  await ev.userChoice;
}

function showUpdateBanner(worker) {
  waitingSwWorker = worker;
  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.style.display = 'flex';
    document.body.classList.add('has-update-banner');
  }
}

function dismissUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (banner) banner.style.display = 'none';
  document.body.classList.remove('has-update-banner');
}

function applyAppUpdate() {
  if (waitingSwWorker) {
    waitingSwWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  window.location.reload();
}

async function exportLibraryJson() {
  if (state.book && state.id) app.books[state.id] = bookSnapshot();
  const data = {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    readingPrefs: app.readingPrefs,
    tasteProfiles: app.tasteProfiles,
    books: app.books || {}
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seferiyat-hanetzach-shelf.json';
  a.click();
  URL.revokeObjectURL(url);
}

function onImportLibraryFile(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > IMPORT_MAX_BYTES) {
    alert('הקובץ גדול מדי (מעל 50MB) — לא ניתן לייבא.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data?.books || typeof data.books !== 'object') throw new Error('קובץ לא תקין');
      if (data.version > EXPORT_FORMAT_VERSION) {
        throw new Error('הקובץ מגרסה חדשה יותר — עדכן את האפליקציה');
      }
      if (!confirm('לשחזר את המדף מהקובץ? ספרים קיימים יוחלפו.')) return;
      app.books = data.books;
      if (data.apiKey) {
        if (confirm('הקובץ מכיל מפתח API ישן. לייבא גם אותו למכשיר זה?')) {
          app.apiKey = String(data.apiKey).trim();
          state.apiKey = app.apiKey;
          const keyInput = document.getElementById('api-key-input');
          if (keyInput) keyInput.value = app.apiKey;
          updateApiKeyStatus();
        }
      }
      if (data.readingPrefs) app.readingPrefs = { ...app.readingPrefs, ...data.readingPrefs };
      if (data.tasteProfiles?.length) app.tasteProfiles = data.tasteProfiles;
      migrateBooksInApp();
      const ids = Object.keys(app.books);
      if (ids.length) {
        applyBookSnapshot(app.books[ids[ids.length - 1]]);
        app.currentBookId = state.id;
      } else {
        state = createEmptyBookState();
        state.apiKey = app.apiKey;
        app.currentBookId = null;
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
