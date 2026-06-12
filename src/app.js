import JSZip from 'jszip';
import * as cfg from './constants.js';
import { store } from './store.js';
import * as bookModel from './book-model.js';

const createEmptyBookState = bookModel.createEmptyBookState;


// --- book.js ---
function defaultBookProfile() {
  return { genre: '', genreCustom: '', tone: '', toneCustom: '', author: '', authorCustom: '', bookRef: '', bookRefCustom: '', hook: '' };
}

function migrateLegacyTaste(taste) {
  const map = {
    'hard-magic': { genre: 'fantasy', tone: 'classic', author: 'sanderson' },
    mystery: { genre: 'mystery', tone: 'classic' },
    war: { genre: 'historical', tone: 'action' },
    character: { genre: 'romance', tone: 'philosophical' }
  };
  return { ...defaultBookProfile(), ...(map[taste] || { genre: 'fantasy', tone: 'classic', author: 'sanderson' }) };
}

function getBookProfile(snap) {
  const s = snap || store.state;
  if (s.bookProfile && (s.bookProfile.genre || s.bookProfile.tone || s.bookProfile.hook || s.bookProfile.author || s.bookProfile.bookRef)) {
    return { ...defaultBookProfile(), ...s.bookProfile };
  }
  if (s.taste) return migrateLegacyTaste(s.taste);
  return defaultBookProfile();
}

function genreDisplayLabel(profile) {
  const p = profile || getBookProfile();
  if (p.genre === 'other' && p.genreCustom?.trim()) return p.genreCustom.trim();
  return cfg.GENRES[p.genre]?.label || p.genre || 'ספרות בדיונית';
}

function looksLikeMetaOrErrorTitle(title) {
  const t = (title || '').trim();
  if (!t || t.length > 100) return true;
  const lower = t.toLowerCase();
  if (/^(בוקר טוב|שלום|היי|hello|good morning)/i.test(t)) return true;
  if (/\b404\b/.test(t)) return true;
  if (/שגיאה(\s*\d|:|$)/.test(t)) return true;
  if (/error\s*\d/i.test(lower)) return true;
  if (/not\s*found|invalid\s*model|unknown\s*model|api\s*key|generatecontent/i.test(lower)) return true;
  if (/json\s*בלבד|```|markdown/i.test(lower)) return true;
  return false;
}

function sanitizeChapterTitle(title, number) {
  const t = (title || '').trim();
  return looksLikeMetaOrErrorTitle(t) ? `פרק ${number}` : t;
}

function sanitizeBookTitle(title) {
  const t = (title || '').trim();
  return looksLikeMetaOrErrorTitle(t) ? 'ספר חדש' : t;
}

function sanitizeStoredBook(snap) {
  if (!snap) return snap;
  const out = { ...snap };
  if (out.book) out.book = normalizeBlueprint(out.book);
  if (out.chapters?.length) {
    out.chapters = out.chapters.map((ch, i) => {
      const num = ch.number || i + 1;
      const fromOutline = out.book?.chapterOutlines?.[i]?.title;
      return {
        ...ch,
        number: num,
        title: sanitizeChapterTitle(fromOutline || ch.title, num)
      };
    });
  }
  return out;
}

function normalizeBlueprint(book) {
  if (!book) return book;
  const out = { ...book };
  if (!out.setting && out.world) out.setting = out.world;
  if (!out.coreRules && out.magicSystem) out.coreRules = out.magicSystem;
  if (!out.world && out.setting) out.world = out.setting;
  if (!out.magicSystem && out.coreRules) out.magicSystem = out.coreRules;
  if (out.title) out.title = sanitizeBookTitle(out.title);
  if (out.chapterOutlines?.length) {
    out.chapterOutlines = out.chapterOutlines.map((ch, i) => ({
      ...ch,
      number: ch.number ?? i + 1,
      title: sanitizeChapterTitle(ch.title, i + 1)
    }));
  }
  return out;
}

function buildCreativeBrief(profile) {
  const p = profile || getBookProfile();
  const parts = [];
  if (p.hook?.trim()) parts.push(`**רעיון המשתמש (עדיפות עליונה):** ${p.hook.trim()}`);
  if (p.bookRef) {
    const ref = p.bookRef === 'other' ? p.bookRefCustom?.trim() : cfg.BOOK_REFS[p.bookRef];
    if (ref) parts.push(`**השראה מספר:** ${ref}`);
  }
  if (p.author) {
    const auth = p.author === 'other' ? p.authorCustom?.trim() : cfg.AUTHORS[p.author];
    if (auth) parts.push(`**השראה מסופר:** ${auth}`);
  }
  if (p.tone) {
    const tone = p.tone === 'other' ? p.toneCustom?.trim() : cfg.TONES[p.tone];
    if (tone) parts.push(`**טון ואווירה:** ${tone}`);
  }
  if (p.genre) {
    const g = p.genre === 'other' ? p.genreCustom?.trim() : (cfg.GENRES[p.genre]?.blueprint || cfg.GENRES[p.genre]?.label);
    if (g) parts.push(`**ז'אנר:** ${g}`);
  }
  return parts.join('\n') || "ספר ספרותי בעברית — בחר את הז'אנר והטון לפי שיקולך.";
}

function buildStyleInstructions(profile) {
  const p = profile || getBookProfile();
  const lines = ['כתוב בעברית ספרותית, סוחפת, עם דיאלוג חי ותיאור ממוקד.'];
  if (p.author && p.author !== 'other' && cfg.AUTHORS[p.author]) {
    lines.push(`מבנה וקצב בהשראת: ${cfg.AUTHORS[p.author]} — לא חיקוי סגנון או דמויות.`);
  } else if (p.author === 'other' && p.authorCustom?.trim()) {
    lines.push(`השראה מסופר: ${p.authorCustom.trim()} — לא חיקוי.`);
  }
  if (p.tone && p.tone !== 'other' && cfg.TONES[p.tone]) lines.push(`טון: ${cfg.TONES[p.tone]}.`);
  else if (p.tone === 'other' && p.toneCustom?.trim()) lines.push(`טון: ${p.toneCustom.trim()}.`);
  if (p.genre && p.genre !== 'other' && cfg.GENRES[p.genre]) {
    lines.push(`ז'אנר: ${cfg.GENRES[p.genre].label} — ${cfg.GENRES[p.genre].blueprint}.`);
  }
  lines.push('אל תחזור על פסקאות שכבר נכתבו. סיים תמיד במשפט שלם.');
  return lines.join('\n');
}

function isSoftSequelGenre(profile) {
  const g = (profile || getBookProfile()).genre;
  return g === 'mystery' || g === 'horror';
}

function selectChoice(btn) {
  const group = btn.dataset.group;
  const value = btn.dataset.value;
  const container = btn.closest('.choice-tiles');
  if (!container || !group) return;
  const wasSelected = btn.classList.contains('selected');
  container.querySelectorAll('.choice-tile').forEach(b => b.classList.remove('selected'));
  if (!wasSelected) {
    btn.classList.add('selected');
    store.welcomeDraft[group] = value;
  } else {
    store.welcomeDraft[group] = '';
  }
  const customId = { genre: 'genre-custom', tone: 'tone-custom', author: 'author-custom', bookRef: 'bookref-custom' }[group];
  const customEl = customId ? document.getElementById(customId) : null;
  if (customEl) customEl.style.display = store.welcomeDraft[group] === 'other' ? 'block' : 'none';
}

function collectWelcomeProfile() {
  const hook = document.getElementById('hook-input')?.value?.trim() || '';
  const genreCustom = document.getElementById('genre-custom')?.value?.trim() || '';
  const toneCustom = document.getElementById('tone-custom')?.value?.trim() || '';
  const authorCustom = document.getElementById('author-custom')?.value?.trim() || '';
  const bookRefCustom = document.getElementById('bookref-custom')?.value?.trim() || '';
  return {
    ...defaultBookProfile(),
    ...store.welcomeDraft,
    hook,
    genreCustom,
    toneCustom,
    authorCustom,
    bookRefCustom
  };
}

function validateWelcomeSelections(profile) {
  const p = profile || collectWelcomeProfile();
  const hasGenre = !!(p.genre && (p.genre !== 'other' || p.genreCustom?.trim()));
  const hasTone = !!(p.tone && (p.tone !== 'other' || p.toneCustom?.trim()));
  const hasAuthor = !!(p.author && (p.author !== 'other' || p.authorCustom?.trim()));
  const hasBookRef = !!(p.bookRef && (p.bookRef !== 'other' || p.bookRefCustom?.trim()));
  const hasHook = !!p.hook?.trim();
  return hasGenre || hasTone || hasAuthor || hasBookRef || hasHook;
}

function syncWelcomeUIFromProfile(profile, lengthKey) {
  const p = profile || defaultBookProfile();
  store.welcomeDraft = { ...defaultBookProfile(), ...p };
  document.getElementById('hook-input').value = p.hook || '';
  ['genre', 'tone', 'author', 'bookRef'].forEach(group => {
    const val = p[group];
    const tiles = document.querySelectorAll(`#welcome-screen .choice-tile[data-group="${group}"]`);
    tiles.forEach(b => b.classList.toggle('selected', b.dataset.value === val));
    const customId = { genre: 'genre-custom', tone: 'tone-custom', author: 'author-custom', bookRef: 'bookref-custom' }[group];
    const customEl = document.getElementById(customId);
    if (customEl) {
      customEl.value = p[group + 'Custom'] || '';
      customEl.style.display = val === 'other' ? 'block' : 'none';
    }
  });
  const lk = lengthKey || store.readingLengthKey || 'short';
  store.readingLengthKey = lk;
  document.querySelectorAll('#length-presets .length-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.length === lk);
  });
}

function selectReadingLength(btn, key) {
  store.readingLengthKey = key;
  document.querySelectorAll('#length-presets .length-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  store.state.totalChapters = cfg.LENGTH_PRESETS[key]?.chapters || 15;
  store.app.readingPrefs.defaultLengthKey = key;
  save();
}

function migrateBooksInApp() {
  Object.keys(store.app.books || {}).forEach(id => {
    const b = store.app.books[id];
    if (!b.bookProfile) b.bookProfile = migrateLegacyTaste(b.taste);
    if (!b.readingLengthKey) {
      const t = b.totalChapters || 15;
      b.readingLengthKey = t >= 45 ? 'long' : t >= 25 ? 'medium' : 'short';
    }
    if (b.memoryBook) b.memoryBook = migrateMemoryBook(b.memoryBook);
    Object.assign(b, sanitizeStoredBook(b));
  });
}

function newBookId() {
  return 'book_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function bookSnapshot() {
  const snap = sanitizeStoredBook({
    id: store.state.id,
    bookProfile: store.state.bookProfile || defaultBookProfile(),
    readingLengthKey: store.state.readingLengthKey || 'short',
    totalChapters: store.state.totalChapters,
    book: store.state.book,
    chapters: store.state.chapters,
    eventLog: store.state.eventLog,
    storySynopsis: store.state.storySynopsis || '',
    memoryBook: store.state.memoryBook,
    lastReadChapter: store.state.lastReadChapter,
    createdAt: store.state.createdAt || Date.now(),
    parentBookId: store.state.parentBookId || null,
    seriesTitle: store.state.seriesTitle || store.state.book?.title || '',
    sequelIndex: store.state.sequelIndex || 1,
    rating: store.state.rating || 0,
    expandChapterList: !!store.state.expandChapterList,
    lastReadScroll: store.state.lastReadScroll || 0
  });
  return snap;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isBookComplete(snap) {
  const s = snap || bookSnapshot();
  return s.book && s.chapters?.length >= s.totalChapters;
}

function sanitizeFilename(name) {
  return (name || 'ספר').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80) || 'ספר';
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function proseToXhtml(text) {
  return text.split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => {
    if (p === '[***]' || p === '* * *') return '<hr/>';
    return `<p>${escapeXml(p)}</p>`;
  }).join('\n    ');
}

function exportBookHtml() {
  if (!store.state.chapters.length) {
    alert('אין פרקים לייצוא עדיין');
    return;
  }
  const title = store.state.book?.title || 'ספר';
  const complete = store.state.chapters.length >= store.state.totalChapters;
  const chaptersHtml = store.state.chapters.map(ch => `
    <section class="chapter">
      <h2>פרק ${ch.number}: ${escapeXml(ch.title)}</h2>
      ${proseToXhtml(ch.text)}
    </section>`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>${escapeXml(title)}</title>
<style>
  body { font-family: Georgia, 'Noto Serif Hebrew', serif; max-width: 40em; margin: 2rem auto; padding: 0 1rem; line-height: 1.8; }
  h1 { text-align: center; }
  h2 { margin-top: 2.5rem; color: #333; }
  p { text-indent: 1.5em; margin: 0 0 1em; }
  hr { border: none; text-align: center; margin: 2rem 0; }
  hr::before { content: "✦ ✦ ✦"; letter-spacing: 0.5em; color: #999; }
</style>
</head>
<body>
<h1>${escapeXml(title)}</h1>
<p style="text-align:center;color:#666">${escapeXml(store.state.book?.tagline || '')}</p>
${!complete ? '<p style="text-align:center;color:#a66"><em>ייצוא חלקי — הספר עדיין בהמשך</em></p>' : ''}
${chaptersHtml}
</body>
</html>`;

  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), sanitizeFilename(title) + '.html');
}

async function exportBookEpub() {
  if (!store.state.chapters.length) {
    alert('אין פרקים לייצוא עדיין');
    return;
  }
  if (typeof JSZip === 'undefined') {
    alert('ספריית EPUB לא נטענה — מוריד HTML במקום');
    exportBookHtml();
    return;
  }

  const zip = new JSZip();
  const title = store.state.book?.title || 'ספר';
  const uid = 'urn:uuid:' + (store.state.id || newBookId());
  const date = new Date().toISOString().slice(0, 10);

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS');
  const chapterMeta = [];

  store.state.chapters.forEach((ch, i) => {
    const id = `ch${i + 1}`;
    const href = `${id}.xhtml`;
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="he" dir="rtl">
<head>
  <title>${escapeXml(ch.title)}</title>
  <meta charset="UTF-8"/>
  <style>p { text-indent: 1.2em; margin: 0 0 0.9em; } hr { border: none; margin: 1.5em 0; }</style>
</head>
<body>
  <h1>פרק ${ch.number}: ${escapeXml(ch.title)}</h1>
  ${proseToXhtml(ch.text)}
</body>
</html>`;
    oebps.file(href, xhtml);
    chapterMeta.push({ id, href, title: `פרק ${ch.number}: ${ch.title}` });
  });

  const navLi = chapterMeta.map(c =>
    `<li><a href="${c.href}">${escapeXml(c.title)}</a></li>`).join('\n      ');
  oebps.file('nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="he" dir="rtl">
<head><title>תוכן עניינים</title><meta charset="UTF-8"/></head>
<body>
  <nav epub:type="toc"><h1>תוכן עניינים</h1><ol>${navLi}</ol></nav>
</body>
</html>`);

  const manifestItems = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    ...chapterMeta.map(c =>
      `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
  ].join('\n    ');
  const spineItems = chapterMeta.map(c => `<itemref idref="${c.id}"/>`).join('\n    ');

  oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${escapeXml(uid)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>he</dc:language>
    <dc:creator>ספריית האינסוף</dc:creator>
    <meta property="dcterms:modified">${date}T00:00:00Z</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`);

  try {
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    downloadBlob(blob, sanitizeFilename(title) + '.epub');
  } catch(e) {
    alert('שגיאה ביצירת EPUB: ' + e.message);
    exportBookHtml();
  }
}

function setBookRating(stars) {
  store.state.rating = stars;
  save();
  renderBookCompletePanel();
}

function renderBookCompletePanel() {
  const slot = document.getElementById('book-complete-slot');
  if (!slot) return;
  slot.innerHTML = '';
  if (!isBookComplete()) return;

  const panel = document.createElement('div');
  panel.id = 'book-complete-actions';
  panel.className = 'book-complete-actions';
  const seriesNote = store.state.sequelIndex > 1 ? ` · ספר ${store.state.sequelIndex} בסדרה` : '';
  const stars = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="rating-star ${(store.state.rating || 0) >= n ? 'on' : ''}" data-action="setBookRating" data-rating="${n}" title="${n} כוכבים">★</button>`
  ).join('');

  panel.innerHTML = `
    <h3>✦ הספר הושלם${seriesNote} ✦</h3>
    <p class="ui-muted" style="font-size:0.85rem;margin-bottom:0.5rem">איך היה?</p>
    <div class="rating-row">${stars}</div>
    <p class="ui-faint" style="font-size:0.78rem;margin-top:0.75rem">הורדה והמשך בעולם — למטה</p>`;

  slot.appendChild(panel);
}

function shouldRenderChapterInList(i, writtenCount, total, expanded) {
  if (expanded || total <= 12) return true;
  if (i < writtenCount) return true;
  if (i === writtenCount && writtenCount < total) return true;
  return false;
}

function renderLibraryActions() {
  const el = document.getElementById('library-actions');
  if (!el) return;
  el.innerHTML = '';
  if (!store.state.chapters.length && !isBookComplete()) return;

  const partial = store.state.chapters.length < store.state.totalChapters;
  const epubBtn = document.createElement('button');
  epubBtn.className = 'secondary-btn';
  epubBtn.textContent = partial ? '📥 הורד EPUB (עד כה)' : '📥 הורד EPUB';
  epubBtn.onclick = () => exportBookEpub();
  el.appendChild(epubBtn);

  const htmlBtn = document.createElement('button');
  htmlBtn.className = 'secondary-btn';
  htmlBtn.textContent = '📄 HTML';
  htmlBtn.onclick = () => exportBookHtml();
  el.appendChild(htmlBtn);

  if (isBookComplete()) {
    const sequelBtn = document.createElement('button');
    sequelBtn.className = 'secondary-btn';
    sequelBtn.textContent = '🌍 עוד סיפור באותו עולם';
    sequelBtn.onclick = () => promptSequelBook();
    el.appendChild(sequelBtn);
  }
}

function applyBookSnapshot(snap) {
  store.state = { ...createEmptyBookState(), ...snap, apiKey: store.app.apiKey, writing: false, generatingIdx: null };
  if (!store.state.bookProfile || (!store.state.bookProfile.genre && !store.state.bookProfile.hook && store.state.taste)) {
    store.state.bookProfile = migrateLegacyTaste(store.state.taste);
  }
  if (store.state.readingLengthKey && cfg.LENGTH_PRESETS[store.state.readingLengthKey]) {
    store.state.totalChapters = cfg.LENGTH_PRESETS[store.state.readingLengthKey].chapters;
  } else if (!store.state.totalChapters) {
    store.state.totalChapters = cfg.LENGTH_PRESETS.short.chapters;
  }
  const clean = sanitizeStoredBook({ book: store.state.book, chapters: store.state.chapters });
  if (clean.book) store.state.book = clean.book;
  if (clean.chapters) store.state.chapters = clean.chapters;
  ensureMemoryBook();
}


// --- storage.js ---
function openAppDb() {
  if (!store.idbPromise) {
    store.idbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(cfg.IDB_NAME, cfg.IDB_VERSION);
      req.onupgradeneeded = (e) => {
        if (!e.target.result.objectStoreNames.contains(cfg.IDB_STORE)) {
          e.target.result.createObjectStore(cfg.IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return store.idbPromise;
}

function idbRequestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbReadApp() {
  const db = await openAppDb();
  const tx = db.transaction(cfg.IDB_STORE, 'readonly');
  return idbRequestToPromise(tx.objectStore(cfg.IDB_STORE).get(cfg.STORAGE_KEY));
}

async function idbWriteApp(data) {
  const db = await openAppDb();
  const tx = db.transaction(cfg.IDB_STORE, 'readwrite');
  tx.objectStore(cfg.IDB_STORE).put(data, cfg.STORAGE_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function syncAppFromState() {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  if (store.state.apiKey) store.app.apiKey = store.state.apiKey;
  if (store.state.id) store.app.currentBookId = store.state.id;
}

function reportStorageError(e) {
  console.error('save failed', e);
  if (e.name === 'QuotaExceededError' || e.code === 22) {
    const msg = 'אין מספיק מקום באחסון — שחרר מקום או מחק ספרים מהמדף.';
    showError('library-error', msg);
    showError('welcome-error', msg);
  }
}

function reportLoadError(e) {
  console.error('load failed', e);
  let msg = 'שגיאה בטעינת הנתונים מהמכשיר.';
  if (e?.name === 'SyntaxError') {
    msg += ' הנתונים השמורים פגומים — אם יש לך גיבוי JSON, ייבא אותו דרך «גיבוי המדף».';
  } else if (e?.message) {
    msg += ' ' + e.message;
  }
  showError('welcome-error', msg);
  showError('library-error', msg);
}

function ensureMinimalAppShell() {
  if (!store.app.books) store.app.books = {};
  if (!store.app.readingPrefs) store.app.readingPrefs = { fontScale: 1, theme: 'dark', immersive: false };
}

async function flushSave() {
  syncAppFromState();
  try {
    await idbWriteApp(store.app);
    try { localStorage.removeItem(cfg.STORAGE_KEY); } catch (_) {}
  } catch (e) {
    reportStorageError(e);
    try {
      localStorage.setItem(cfg.STORAGE_KEY, JSON.stringify(store.app));
    } catch (e2) {
      reportStorageError(e2);
    }
  }
}

function save(opts = {}) {
  syncAppFromState();
  if (opts.immediate) {
    clearTimeout(store.saveTimer);
    return flushSave();
  }
  clearTimeout(store.saveTimer);
  store.saveTimer = setTimeout(flushSave, cfg.SAVE_DEBOUNCE_MS);
}

function migrateFromLegacyV1() {
  const v1 = localStorage.getItem(cfg.STORAGE_KEY_V1);
  if (!v1) return false;
  const old = JSON.parse(v1);
  store.app = { apiKey: old.apiKey || '', currentBookId: null, books: {}, readingPrefs: { fontScale: 1, theme: 'dark' } };
  if (old.book) {
    const id = newBookId();
    old.id = id;
    const taste = old.taste || 'hard-magic';
    old.storySynopsis = old.storySynopsis || '';
    store.app.books[id] = {
      id,
      bookProfile: migrateLegacyTaste(taste),
      readingLengthKey: (old.totalChapters || 15) >= 45 ? 'long' : (old.totalChapters || 15) >= 25 ? 'medium' : 'short',
      totalChapters: old.totalChapters,
      book: old.book, chapters: old.chapters || [], eventLog: old.eventLog || [],
      storySynopsis: old.storySynopsis, memoryBook: old.memoryBook,
      lastReadChapter: old.lastReadChapter || 0, createdAt: Date.now()
    };
    store.app.currentBookId = id;
  }
  migrateBooksInApp();
  try { localStorage.removeItem(cfg.STORAGE_KEY_V1); } catch (_) {}
  return true;
}

function applyLoadedAppData() {
  if (!store.app.books) store.app.books = {};
  if (!store.app.readingPrefs) store.app.readingPrefs = { fontScale: 1, theme: 'dark', immersive: false };
  if (!store.app.tasteProfiles?.length) store.app.tasteProfiles = cfg.DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  migrateBooksInApp();
  const ids = Object.keys(store.app.books);
  if (store.app.currentBookId && store.app.books[store.app.currentBookId]) {
    applyBookSnapshot(store.app.books[store.app.currentBookId]);
  } else if (ids.length) {
    applyBookSnapshot(store.app.books[ids[ids.length - 1]]);
    store.app.currentBookId = store.state.id;
  } else {
    store.state = createEmptyBookState();
    store.state.apiKey = store.app.apiKey || '';
  }
  store.state.apiKey = store.app.apiKey || store.state.apiKey || '';
  if (!store.app.readingPrefs?.theme) {
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    store.app.readingPrefs = store.app.readingPrefs || { fontScale: 1, immersive: false };
    store.app.readingPrefs.theme = prefersLight ? 'light' : 'dark';
  }
  if (!store.app.tasteProfiles?.length) store.app.tasteProfiles = cfg.DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  if (store.state.writing) { store.state.writing = false; save(); }
}

async function loadApp() {
  let loaded = false;
  try {
    if ('indexedDB' in window) {
      try {
        const fromIdb = await idbReadApp();
        if (fromIdb) {
          store.app = fromIdb;
          loaded = true;
        }
      } catch (e) {
        console.warn('IndexedDB read failed, falling back to localStorage', e);
      }
    }
    if (!loaded) {
      const raw = localStorage.getItem(cfg.STORAGE_KEY);
      if (raw) {
        store.app = JSON.parse(raw);
        loaded = true;
        if ('indexedDB' in window) {
          try {
            await idbWriteApp(store.app);
            localStorage.removeItem(cfg.STORAGE_KEY);
          } catch (e) {
            console.warn('IndexedDB migration failed', e);
          }
        }
      } else if (migrateFromLegacyV1()) {
        loaded = true;
        save({ immediate: true });
      }
    }
    if (loaded) applyLoadedAppData();
    else store.state = createEmptyBookState();
  } catch (e) {
    const preservedKey = store.app?.apiKey || store.state?.apiKey || '';
    ensureMinimalAppShell();
    if (loaded) {
      store.state = createEmptyBookState();
      store.state.apiKey = preservedKey;
      if (store.app.currentBookId && store.app.books[store.app.currentBookId]) {
        try { applyBookSnapshot(store.app.books[store.app.currentBookId]); } catch (_) {}
      }
    } else {
      store.app.apiKey = preservedKey;
      store.state = createEmptyBookState();
      store.state.apiKey = preservedKey;
    }
    reportLoadError(e);
  }
}


// --- prefs-export.js ---
function getStoryContextForPrompt() {
  let parts = [];
  if (store.state.storySynopsis) parts.push(`**עד כה בסיפור (סיכום):**\n${store.state.storySynopsis}`);
  const recent = store.state.eventLog?.slice(-3) || [];
  if (recent.length) parts.push(`**אירועים בפרקים האחרונים:**\n${recent.join('\n\n')}`);
  return parts.join('\n\n');
}

async function maybeCompressStorySynopsis() {
  const n = store.state.chapters.length;
  if (n < 5 || n % 5 !== 0) return;
  const prompt = `סכם את עלילת הספר עד כה ב-14-18 משפטים בעברית.
כלול: דמויות מרכזיות, קונפליקט, מטרות, תעלומות פתוחות, ומצב אחרון.
כתוב בנקודות קצרות. ללא הקדמה.

${store.state.storySynopsis ? 'סיכום קודם:\n' + store.state.storySynopsis + '\n\n' : ''}
יומן פרקים:
${store.state.eventLog.join('\n\n')}`;

  try {
    const synopsis = await callGeminiLite(prompt, '', 1500);
    if (synopsis?.trim()) store.state.storySynopsis = synopsis.trim();
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

function updateLandscapeToggleButton() {
  const btn = document.getElementById('landscape-toggle-btn');
  if (!btn || !screen.orientation) return;
  const isLandscape = (screen.orientation.type || '').startsWith('landscape');
  btn.textContent = isLandscape ? '⤒' : '⤡';
  btn.title = isLandscape ? 'חזרה לאורך' : 'קריאה לרוחב (לחיצה מפורשת)';
  btn.classList.toggle('landscape-on', isLandscape);
}

function applyReadingPrefs() {
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

function adjustFontSize(delta) {
  store.app.readingPrefs.fontScale = Math.min(1.4, Math.max(0.85, (store.app.readingPrefs.fontScale || 1) + delta));
  applyReadingPrefs();
  save();
}

function toggleTheme() {
  store.app.readingPrefs.theme = store.app.readingPrefs.theme === 'light' ? 'dark' : 'light';
  applyReadingPrefs();
  save();
}

function toggleReadingImmersive() {
  store.app.readingPrefs.immersive = !store.app.readingPrefs.immersive;
  applyReadingPrefs();
  save();
}

async function toggleWakeLock() {
  try {
    if (!('store.wakeLock' in navigator)) {
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

function updateWakeLockButton(on) {
  const btn = document.getElementById('wake-toggle-btn');
  if (!btn) return;
  btn.textContent = on ? '💤' : '💡';
  btn.title = on ? 'בטל מניעת נעילה' : 'מנע נעילת מסך';
}

async function releaseWakeLock() {
  if (store.wakeLock) {
    try { await store.wakeLock.release(); } catch (e) {}
    store.wakeLock = null;
    updateWakeLockButton(false);
  }
}

function getTasteProfiles() {
  if (!store.app.tasteProfiles?.length) store.app.tasteProfiles = cfg.DEFAULT_TASTE_PROFILES.map(p => ({ ...p }));
  return store.app.tasteProfiles;
}

function renderTasteProfiles() {
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

function applyTasteProfile(profileId) {
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

function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const online = navigator.onLine;
  if (banner) banner.style.display = online ? 'none' : 'flex';
  document.body.classList.toggle('has-offline-banner', !online);
}

function showInstallUi() {
  const banner = document.getElementById('store.app-install-banner');
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'block';
  if (banner && !localStorage.getItem('pwa-install-dismissed')) {
    banner.style.display = 'flex';
    document.body.classList.add('has-store.app-banner');
  }
}

function dismissInstallBanner() {
  localStorage.setItem('pwa-install-dismissed', '1');
  const banner = document.getElementById('store.app-install-banner');
  if (banner) banner.style.display = 'none';
  document.body.classList.remove('has-store.app-banner');
}

async function promptPwaInstall() {
  if (!store.deferredInstallPrompt) return;
  const ev = store.deferredInstallPrompt;
  store.deferredInstallPrompt = null;
  dismissInstallBanner();
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
  await ev.prompt();
  await ev.userChoice;
}

function showUpdateBanner(worker) {
  store.waitingSwWorker = worker;
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
  if (store.waitingSwWorker) {
    store.waitingSwWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  window.location.reload();
}

async function exportLibraryJson() {
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
}

function onImportLibraryFile(ev) {
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


// --- shelf.js ---
function onShelfFilterChange(v) { store.shelfFilter = v; renderShelf(); }
function onShelfSortChange(v) { store.shelfSort = v; renderShelf(); }

function shelfBookMatchesFilter(b) {
  const written = b.chapters?.length || 0;
  const total = b.totalChapters || 0;
  if (store.shelfFilter === 'complete') return isBookComplete(b);
  if (store.shelfFilter === 'reading') return written > 0 && !isBookComplete(b);
  if (store.shelfFilter === 'series') return (b.sequelIndex || 1) > 1 || !!b.parentBookId;
  return true;
}

function sortShelfIds(ids) {
  return ids.sort((a, b) => {
    const ba = store.app.books[a], bb = store.app.books[b];
    if (store.shelfSort === 'rating') return (bb.rating || 0) - (ba.rating || 0);
    if (store.shelfSort === 'title') {
      return (ba.book?.title || '').localeCompare(bb.book?.title || '', 'he');
    }
    return (bb.createdAt || 0) - (ba.createdAt || 0);
  });
}

function getContinueChapterIndex(b) {
  const written = b.chapters?.length || 0;
  if (!written) return -1;
  const last = b.lastReadChapter ?? 0;
  if (last + 1 < written) return last + 1;
  if (last < written) return last;
  return written - 1;
}

function shelfCount() {
  return Object.keys(store.app.books || {}).length;
}

function renderShelf() {
  const grid = document.getElementById('shelf-grid');
  if (!grid) return;
  const filterEl = document.getElementById('shelf-filter');
  const sortEl = document.getElementById('shelf-sort');
  if (filterEl) filterEl.value = store.shelfFilter;
  if (sortEl) sortEl.value = store.shelfSort;

  let ids = Object.keys(store.app.books).filter(id => shelfBookMatchesFilter(store.app.books[id]));
  ids = sortShelfIds(ids);

  if (!Object.keys(store.app.books).length) {
    grid.innerHTML = '<div class="shelf-empty">אין ספרים במדף — פתח ספר חדש להתחיל</div>';
    return;
  }
  if (!ids.length) {
    grid.innerHTML = '<div class="shelf-empty">אין ספרים בסינון זה — נסה סינון אחר</div>';
    return;
  }
  grid.innerHTML = '';
  ids.forEach(id => {
    const b = store.app.books[id];
    const written = b.chapters?.length || 0;
    const total = b.totalChapters || 0;
    const continueIdx = getContinueChapterIndex(b);
    const canContinue = continueIdx >= 0;
    const pct = total > 0 ? Math.round((written / total) * 100) : 0;
    const stars = b.rating ? '★'.repeat(b.rating) : '';

    const card = document.createElement('div');
    card.className = 'shelf-card';
    card.innerHTML = `
      <button type="button" class="shelf-card-main" style="flex:1;background:none;border:none;color:inherit;text-align:right;cursor:pointer;font:inherit;padding:0">
        <div class="shelf-card-title">${escapeHtml(b.book?.title || 'ספר ללא שם')}</div>
        <div class="shelf-card-meta">
          <span class="meta-pill">${written}/${total} · ${pct}%</span>
          ${isBookComplete(b) ? '<span class="meta-pill meta-done">הושלם</span>' : written ? '<span class="meta-pill">בתהליך</span>' : '<span class="meta-pill">חדש</span>'}
          ${(b.sequelIndex || 1) > 1 || b.parentBookId ? `<span class="meta-pill meta-series">סדרה ${b.sequelIndex || 1}</span>` : ''}
          <span class="meta-pill">${escapeHtml(genreDisplayLabel(getBookProfile(b)))}</span>
          ${stars ? `<span class="meta-pill">${stars}</span>` : ''}
        </div>
        ${canContinue ? `<div style="font-size:0.78rem;color:var(--gold);margin-top:0.35rem">↪ המשך מפרק ${continueIdx + 1}</div>` : ''}
      </button>
      <div class="shelf-card-actions">
        ${canContinue ? `<button type="button" class="shelf-continue-btn" data-continue="${id}">המשך קריאה</button>` : ''}
        <button type="button" class="read-tool-btn" title="מחק" data-delete="${id}">✕</button>
      </div>`;

    card.querySelector('.shelf-card-main').onclick = () => openBookFromShelf(id);
    const cont = card.querySelector('[data-continue]');
    if (cont) cont.onclick = (e) => continueBookFromShelf(id, e);
    card.querySelector('[data-delete]').onclick = (e) => deleteBookFromShelf(id, e);
    grid.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function continueBookFromShelf(id, ev) {
  if (ev) ev.stopPropagation();
  openBookFromShelf(id);
  const b = store.app.books[id];
  const idx = getContinueChapterIndex(b);
  if (idx >= 0) openChapter(idx);
}

function openBookFromShelf(id) {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  applyBookSnapshot(store.app.books[id]);
  store.app.currentBookId = id;
  store.state.apiKey = store.app.apiKey;
  save();
  renderLibrary();
  showScreen('library-screen');
}

function showShelf() {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  save();
  renderShelf();
  updateWelcomeShelfLink();
  showScreen('shelf-screen');
}

function openWelcomeNewBook() {
  if (store.state.book && store.state.id) {
    store.app.books[store.state.id] = bookSnapshot();
    save();
  }
  showScreen('welcome-screen');
  resetWelcomeWizard(1);
  updateWelcomeShelfLink();
  document.getElementById('create-btn').disabled = false;
}

function clearChapterGenerationQueue() {
  while (store.chapterGenQueue.length) {
    const job = store.chapterGenQueue.shift();
    job.rejects.forEach(r => r(new Error('בוטל — נפתח ספר חדש')));
  }
  store.chapterGenPumpActive = false;
  store.state.writing = false;
  store.state.generatingIdx = null;
}

/** ספר עצמאי חדש — מאפס store.state כדי שלא יישארו דמויות/זיכרון מהספר הקודם */
function prepareStateForNewStandaloneBook(profile, lengthKey, apiKey) {
  const previousBookId = store.state.book && store.state.id ? store.state.id : (store.app.currentBookId || null);
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();

  clearChapterGenerationQueue();

  const newId = newBookId();
  store.state = createEmptyBookState();
  store.state.id = newId;
  store.state.apiKey = apiKey;
  store.app.apiKey = apiKey;
  store.state.bookProfile = profile;
  store.state.readingLengthKey = lengthKey;
  store.state.totalChapters = cfg.LENGTH_PRESETS[lengthKey]?.chapters || 15;
  store.state.createdAt = Date.now();
  store.state.memoryBook = emptyMemoryBook();
  store.state.storySynopsis = '';
  store.state.eventLog = [];
  store.state.chapters = [];
  store.state.parentBookId = null;
  store.state.seriesTitle = '';
  store.state.sequelIndex = 1;
  store.app.currentBookId = store.state.id;
  markPendingCreation('blueprint', {
    kind: 'standalone',
    previousBookId,
    profile,
    readingLengthKey: lengthKey
  });
  return previousBookId;
}

function restoreBookAfterFailedCreation(failedId, previousBookId, apiKey) {
  clearPendingCreation();
  if (failedId) delete store.app.books[failedId];
  if (previousBookId && store.app.books[previousBookId]) {
    applyBookSnapshot(store.app.books[previousBookId]);
    store.app.currentBookId = previousBookId;
  } else {
    const ids = Object.keys(store.app.books || {});
    if (ids.length) {
      const id = ids[ids.length - 1];
      applyBookSnapshot(store.app.books[id]);
      store.app.currentBookId = id;
    } else {
      store.state = createEmptyBookState();
      store.state.apiKey = apiKey;
    }
  }
  save();
}


// --- creation-resume.js ---
// ===== יצירת ספר — שמירה והמשך אחרי יציאה מהאפליקציה =====
function startLoadingStatusRotation() {
  let si = 0;
  const el = document.getElementById('loading-status');
  if (el) el.textContent = cfg.LOADING_STATUS_MESSAGES[0];
  return setInterval(() => {
    si = (si + 1) % cfg.LOADING_STATUS_MESSAGES.length;
    if (el) el.textContent = cfg.LOADING_STATUS_MESSAGES[si];
  }, 2000);
}

function markPendingCreation(phase, extras = {}) {
  store.app.pendingCreation = {
    bookId: store.state.id,
    phase,
    kind: extras.kind || 'standalone',
    previousBookId: extras.previousBookId ?? null,
    parentBookId: extras.parentBookId ?? null,
    profile: extras.profile != null ? deepClone(extras.profile) : deepClone(store.state.bookProfile || defaultBookProfile()),
    readingLengthKey: store.state.readingLengthKey || extras.readingLengthKey || 'short',
    startedAt: store.app.pendingCreation?.startedAt || Date.now()
  };
  save();
}

function clearPendingCreation() {
  if (!store.app.pendingCreation) return;
  delete store.app.pendingCreation;
  save();
}

function abandonPendingCreationToLibrary() {
  const pending = store.app.pendingCreation;
  const bookId = pending?.bookId || store.state.id;
  clearPendingCreation();
  store.bookCreationInFlight = false;
  store.creationResumeRunning = false;
  store.state.writing = false;
  store.state.generatingIdx = null;
  clearChapterGenerationQueue();
  document.getElementById('create-btn').disabled = false;

  if (bookId && store.app.books[bookId]?.book) {
    applyBookSnapshot(store.app.books[bookId]);
    store.app.currentBookId = bookId;
    store.state.apiKey = store.app.apiKey || store.state.apiKey;
    save();
    renderLibrary();
    showScreen('library-screen');
    return;
  }
  if (bookId && store.app.books[bookId]) {
    delete store.app.books[bookId];
    save();
  }
  if (shelfCount() > 0) {
    renderShelf();
    showScreen('shelf-screen');
  } else {
    showScreen('welcome-screen');
  }
}

function cancelPendingBookCreation() {
  if (!confirm('לבטל את ההכנה ולחזור לספרייה? אפשר להמשיך לקרוא/לכתוב את הפרק הראשון משם.')) return;
  abandonPendingCreationToLibrary();
}

function expirePendingCreationIfStale() {
  const p = store.app.pendingCreation;
  if (!p?.startedAt) return false;
  if (Date.now() - p.startedAt <= cfg.PENDING_AUTO_RESUME_MS) return false;
  const bookId = p.bookId;
  clearPendingCreation();
  store.bookCreationInFlight = false;
  store.state.writing = false;
  store.state.generatingIdx = null;
  clearChapterGenerationQueue();
  document.getElementById('create-btn').disabled = false;
  if (bookId && store.app.books[bookId]) {
    applyBookSnapshot(store.app.books[bookId]);
    store.app.currentBookId = bookId;
    store.state.apiKey = store.app.apiKey || store.state.apiKey;
    save();
  }
  return true;
}

function sanitizePendingCreation() {
  if (expirePendingCreationIfStale()) return null;
  const p = store.app.pendingCreation;
  if (!p?.bookId || !p.phase) {
    clearPendingCreation();
    return null;
  }
  const snap = store.app.books[p.bookId];
  if (snap?.chapters?.length > 0) {
    clearPendingCreation();
    return null;
  }
  if (p.phase === 'chapter0' && !snap?.book) p.phase = 'blueprint';
  return p;
}

function applyPendingCreationState(pending, apiKey) {
  const snap = store.app.books[pending.bookId];
  if (snap) {
    applyBookSnapshot(snap);
    store.app.currentBookId = pending.bookId;
  } else {
    store.state = createEmptyBookState();
    store.state.id = pending.bookId;
    store.state.bookProfile = pending.profile || defaultBookProfile();
    store.state.readingLengthKey = pending.readingLengthKey || 'short';
    store.state.totalChapters = cfg.LENGTH_PRESETS[store.state.readingLengthKey]?.chapters || 15;
    store.state.createdAt = pending.startedAt || Date.now();
    store.state.memoryBook = emptyMemoryBook();
    store.app.currentBookId = pending.bookId;
  }
  store.state.apiKey = apiKey;
  store.app.apiKey = apiKey;
}

async function finishNewBookChapterZero(pending) {
  document.getElementById('loading-status').textContent = 'מכין את הפרק הראשון...';
  await generateChapterAt(0, { openAfter: true, useLoadingScreen: true });
  clearPendingCreation();
  save();
  document.getElementById('create-btn').disabled = false;
  if (pending?.kind === 'sequel') {
    document.getElementById('loading-title').textContent = 'פותח ספר חדש...';
  }
}

async function runResumeBlueprint(pending) {
  const apiKey = getStoredApiKey();
  if (!apiKey || !navigator.onLine) return false;

  applyPendingCreationState(pending, apiKey);
  store.app.currentBookId = pending.bookId;

  showScreen('loading-screen');
  const ltEl = document.getElementById('loading-title');
if (ltEl) ltEl.textContent =
    pending.kind === 'sequel' ? 'ממשיך לפתוח המשך...' : 'ממשיך ליצור את הספר...';
  document.getElementById('create-btn').disabled = true;

  const statusInterval = startLoadingStatusRotation();
  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');
  try {
    let bookData;
    if (pending.kind === 'sequel' && pending.parentBookId) {
      const parent = store.app.books[pending.parentBookId];
      if (!parent?.book) throw new Error('ספר המקור לא נמצא');
      bookData = normalizeBlueprint(await createSequelBlueprint(parent));
      store.state.memoryBook = deepClone(parent.memoryBook || emptyMemoryBook());
    } else {
      bookData = normalizeBlueprint(await createBookBlueprint());
      store.state.memoryBook = initMemoryBookFromBlueprint(bookData);
    }
    store.state.book = bookData;
    store.state.seriesTitle = bookData.title;
    store.app.books[store.state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: pending.kind,
      previousBookId: pending.previousBookId,
      parentBookId: pending.parentBookId,
      profile: pending.profile,
      readingLengthKey: pending.readingLengthKey
    });

    clearInterval(statusInterval);
    renderLibrary();
    await finishNewBookChapterZero(pending);
    return true;
  } catch (e) {
    clearInterval(statusInterval);
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    if (pending.kind === 'sequel' && pending.parentBookId && store.app.books[pending.parentBookId]) {
      delete store.app.books[pending.bookId];
      applyBookSnapshot(store.app.books[pending.parentBookId]);
      store.app.currentBookId = pending.parentBookId;
      save();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את יצירת הספר: ' + e.message);
    } else if (store.app.books[pending.bookId]?.book) {
      applyBookSnapshot(store.app.books[pending.bookId]);
      store.app.currentBookId = pending.bookId;
      save();
      renderLibrary();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את יצירת הספר: ' + e.message);
    } else {
      restoreBookAfterFailedCreation(pending.bookId, pending.previousBookId, apiKey);
      showScreen('welcome-screen');
      showError('welcome-error', 'לא הצלחנו להמשיך את יצירת הספר: ' + e.message);
    }
    return true;
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}

async function runResumeChapter0(pending) {
  const apiKey = getStoredApiKey();
  if (!apiKey || !navigator.onLine) return false;

  applyPendingCreationState(pending, apiKey);
  if (!store.state.book) return runResumeBlueprint(pending);

  showScreen('loading-screen');
  const ltEl = document.getElementById('loading-title');
if (ltEl) ltEl.textContent =
    pending.kind === 'sequel' ? 'ממשיך לפתוח המשך...' : 'ממשיך ליצור את הספר...';

  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');
  try {
    renderLibrary();
    await finishNewBookChapterZero(pending);
    return true;
  } catch (e) {
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    if (store.app.books[pending.bookId]?.book) {
      applyBookSnapshot(store.app.books[pending.bookId]);
      store.app.currentBookId = pending.bookId;
      save();
      renderLibrary();
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    } else if (pending.kind === 'sequel' && pending.parentBookId && store.app.books[pending.parentBookId]) {
      showScreen('library-screen');
      showError('library-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    } else {
      showScreen('welcome-screen');
      showError('welcome-error', 'לא הצלחנו להמשיך את הפרק הראשון: ' + e.message);
    }
    return true;
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}

async function tryResumePendingCreation() {
  if (store.creationResumeRunning || store.state.writing || store.bookCreationInFlight) return false;
  const pending = sanitizePendingCreation();
  if (!pending) return false;

  store.creationResumeRunning = true;
  try {
    if (pending.phase === 'blueprint') return await runResumeBlueprint(pending);
    if (pending.phase === 'chapter0') return await runResumeChapter0(pending);
    clearPendingCreation();
    return false;
  } finally {
    store.creationResumeRunning = false;
  }
}

function updateWelcomeShelfLink() {
  const link = document.getElementById('welcome-shelf-link');
  if (link) link.style.display = shelfCount() > 0 ? 'block' : 'none';
}

function startRandomBook() {
  const genreKeys = Object.keys(cfg.GENRES);
  const toneKeys = Object.keys(cfg.TONES);
  const profile = {
    ...defaultBookProfile(),
    genre: genreKeys[Math.floor(Math.random() * genreKeys.length)],
    tone: toneKeys[Math.floor(Math.random() * toneKeys.length)]
  };
  syncWelcomeUIFromProfile(profile, store.readingLengthKey);
  startBookCreation();
}

function getStoredApiKey() {
  return (document.getElementById('api-key-input')?.value.trim() || store.app.apiKey || store.state.apiKey || '').trim();
}

function updateApiKeyStatus() {
  const el = document.getElementById('api-key-status');
  if (!el) return;
  const key = getStoredApiKey();
  if (key.length > 8) {
    el.textContent = '✓ מפתח שמור במכשיר זה (מסתיים ב-…' + key.slice(-4) + ')';
    el.className = 'api-key-status saved';
  } else {
    el.textContent = 'טרם הוזן מפתח — נדרש לפני פתיחת ספר';
    el.className = 'api-key-status';
  }
}

function onApiKeyInput() {
  updateApiKeyStatus();
}

function saveApiKeyFromInput() {
  const key = document.getElementById('api-key-input')?.value.trim();
  if (!key) return;
  store.app.apiKey = key;
  store.state.apiKey = key;
  save();
  updateApiKeyStatus();
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  const btn = document.querySelector('.api-show-key-btn');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (btn) btn.textContent = show ? 'הסתר' : 'הצג';
}

function openWelcomeApiSettings() {
  if (store.state.book && store.state.id) {
    store.app.books[store.state.id] = bookSnapshot();
    save();
  }
  showScreen('welcome-screen');
  updateWelcomeShelfLink();
  document.getElementById('create-btn').disabled = false;
  syncWelcomeApiKeyField();
  setWelcomeWizardStep(3, { focusApi: true });
}

function setWritingStatus(msg) {
  const el = document.getElementById('writing-status-text');
  if (el) el.textContent = msg;
}

function setPreparingStatus(msg, useLoadingScreen) {
  if (useLoadingScreen) {
    const el = document.getElementById('loading-status');
    if (el) el.textContent = msg;
  } else {
    setWritingStatus(msg);
  }
}

function showReadingPreparing(show, msg) {
  const box = document.getElementById('reading-preparing');
  const text = document.getElementById('reading-preparing-text');
  if (!box) return;
  box.classList.toggle('active', show);
  if (msg && text) text.textContent = msg;
}

function waitForGeneration() {
  return new Promise(resolve => {
    const tick = () => {
      if (!store.state.writing) resolve();
      else setTimeout(tick, 400);
    };
    tick();
  });
}

function isReadingScreenActive() {
  return document.getElementById('reading-screen')?.classList.contains('active');
}

function parseJsonFromResponse(raw) {
  const cleaned = raw.replace(/`{3}json/gi, '').replace(/`{3}/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]); }
  catch(e) {
    try { return JSON.parse(cleaned); } catch(e2) { return null; }
  }
}

function blueprintMaxTokens(chapterCount) {
  return Math.min(16000, Math.max(6000, 3500 + chapterCount * 200));
}

function isBlueprintTruncated(finishReason) {
  return finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH';
}

function normalizeChapterOutlines(book, expectedCount) {
  const defaultPov = book.chapterOutlines?.[0]?.pov?.trim()
    || book.mainCharacters?.[0]?.name
    || 'הגיבור';
  const outlines = (book.chapterOutlines || []).slice(0, expectedCount).map((ch, i) => ({
    number: i + 1,
    title: sanitizeChapterTitle(ch.title, i + 1),
    summary: ((ch.summary || '').trim() || 'המשך ההרפתקה').slice(0, 400),
    pov: ((ch.pov || defaultPov).trim() || defaultPov)
  }));
  while (outlines.length < expectedCount) {
    const n = outlines.length + 1;
    outlines.push({
      number: n,
      title: `פרק ${n}`,
      summary: 'המשך ההרפתקה',
      pov: defaultPov
    });
  }
  book.chapterOutlines = outlines;
  book.title = sanitizeBookTitle(book.title);
  return book;
}

async function requestBookBlueprint(prompt, expectedCount) {
  const maxTokens = blueprintMaxTokens(expectedCount);
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, finishReason } = await callGeminiLiteRaw(prompt, '', maxTokens, { jsonMode: true });
      if (isBlueprintTruncated(finishReason)) {
        lastErr = new Error('תוכנית הספר נקטעה באמצע — מנסה שוב');
        continue;
      }
      const book = parseJsonFromResponse(text);
      if (!book?.title?.trim() || !book.chapterOutlines?.length) {
        lastErr = new Error('תשובת ה-AI לא כללה JSON תקין — נסה שוב');
        continue;
      }
      return normalizeChapterOutlines(book, expectedCount);
    } catch (e) {
      lastErr = e;
      if (e.message?.includes('הגעת למכסה') || e.modelNotFound) throw e;
    }
  }
  throw lastErr || new Error('לא הצלחנו ליצור תוכנית ספר — נסה שוב');
}

function emptyMemoryBook() {
  return { characters: [], locations: [], keyObjects: [], worldRules: [], openMysteries: [] };
}

function migrateMemoryBook(mb) {
  if (!mb) return emptyMemoryBook();
  const out = { ...emptyMemoryBook(), ...mb };
  if (!out.worldRules?.length && mb.magicRules?.length) {
    out.worldRules = mb.magicRules.map(r => ({
      rule: r.rule,
      establishedInChapter: r.establishedInChapter,
      notes: r.notes
    }));
  }
  if (!out.keyObjects?.length && mb.artifacts?.length) {
    out.keyObjects = mb.artifacts.map(a => ({
      name: a.name,
      description: a.description,
      owner: a.owner,
      status: a.status
    }));
  }
  return out;
}

function ensureMemoryBook() {
  if (!store.state.memoryBook) {
    store.state.memoryBook = store.state.book ? initMemoryBookFromBlueprint(store.state.book) : emptyMemoryBook();
  } else {
    store.state.memoryBook = migrateMemoryBook(store.state.memoryBook);
  }
}

function initMemoryBookFromBlueprint(book) {
  const b = normalizeBlueprint(book);
  return {
    characters: (b.mainCharacters || []).map(c => ({
      name: c.name,
      role: c.role || '',
      status: 'פעיל',
      notes: c.trait || ''
    })),
    locations: b.setting ? [{ name: 'הגדרה', description: b.setting, significance: 'בסיס' }] : [],
    keyObjects: [],
    worldRules: b.coreRules
      ? [{ rule: b.coreRules, establishedInChapter: 0, notes: 'כללי עולם' }]
      : [],
    openMysteries: []
  };
}

function formatMemoryBookForPrompt() {
  ensureMemoryBook();
  const mb = store.state.memoryBook;
  const fmt = (arr, lineFn) => (arr?.length ? arr.map(lineFn).join('\n') : '(ריק)');
  const objects = mb.keyObjects?.length ? mb.keyObjects : mb.artifacts;
  const rules = mb.worldRules?.length ? mb.worldRules : mb.magicRules;
  return `**ספר הזיכרון (עובדות מוסכמות — חובה לשמור על עקביות):**

דמויות:
${fmt(mb.characters, c => `- ${c.name} (${c.role}): ${c.status}. ${c.notes || ''}`)}

מקומות:
${fmt(mb.locations, l => `- ${l.name}: ${l.description}. ${l.significance || ''}`)}

חפצים ואובייקטים מרכזיים:
${fmt(objects, a => `- ${a.name}: ${a.description}. בעלים: ${a.owner || '?'}. ${a.status || ''}`)}

כללי עולם:
${fmt(rules, r => `- ${r.rule} (מוכר מפרק ${r.establishedInChapter || 0}). ${r.notes || ''}`)}

תעלומות ושאלות פתוחות:
${fmt(mb.openMysteries, m => `- ${m.question} [${m.status || 'פתוח'}, מפרק ${m.introducedChapter || '?'}]. רמזים: ${m.clues || ''}`)}`;
}


// --- screens.js ---
// ===== SCREEN MANAGEMENT =====
let welcomeWizardStep = 1;

const WELCOME_WIZARD_STEPS = 3;

function showScreen(id) {
  if (id !== 'reading-screen') {
    releaseWakeLock();
    document.body.classList.remove('reading-immersive');
    if (store.app.readingPrefs) store.app.readingPrefs.allowLandscape = false;
    lockAppOrientation();
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (!screen) return;
  screen.classList.add('active');
  window.scrollTo(0, 0);
  applyReadingPrefs();
  updateLandscapeToggleButton();
  if (id === 'welcome-screen') updateWelcomeWizardUI();
}

function showLibrary() {
  closeChapterDrawer();
  renderLibrary();
  showScreen('library-screen');
}

function validateWizardStep1() {
  const p = collectWelcomeProfile();
  const hasGenre = !!(p.genre && (p.genre !== 'other' || p.genreCustom?.trim()));
  const hasHook = !!p.hook?.trim();
  const hasAuthor = !!(p.author && (p.author !== 'other' || p.authorCustom?.trim()));
  const hasBookRef = !!(p.bookRef && (p.bookRef !== 'other' || p.bookRefCustom?.trim()));
  return hasGenre || hasHook || hasAuthor || hasBookRef;
}

function canSkipWelcomeWizard() {
  return !!getStoredApiKey() && validateWelcomeSelections();
}

function resetWelcomeWizard(step) {
  welcomeWizardStep = step || 1;
  const err = document.getElementById('welcome-error');
  if (err) err.style.display = 'none';
  updateWelcomeWizardUI();
}

function syncWelcomeApiKeyField() {
  const input = document.getElementById('api-key-input');
  const key = getStoredApiKey();
  if (input && key && !input.value.trim()) input.value = key;
  updateApiKeyStatus();
  refreshModelFallbackNotice('welcome-model-fallback-notice');
}

function updateWelcomeWizardUI() {
  for (let i = 1; i <= WELCOME_WIZARD_STEPS; i++) {
    const panel = document.getElementById(`wizard-step-${i}`);
    if (!panel) continue;
    const isActive = i === welcomeWizardStep;
    panel.classList.toggle('wizard-step-active', isActive);
    panel.hidden = !isActive;
    if (isActive) {
      panel.classList.remove('wizard-step-enter');
      void panel.offsetWidth;
      panel.classList.add('wizard-step-enter');
    }
  }

  document.querySelectorAll('.wizard-progress-step').forEach(btn => {
    const step = parseInt(btn.dataset.wizardStep, 10);
    const isActive = step === welcomeWizardStep;
    const isDone = step < welcomeWizardStep;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('done', isDone);
    btn.setAttribute('aria-current', isActive ? 'step' : 'false');
  });

  const skipBtn = document.getElementById('wizard-skip-to-create');
  if (skipBtn) {
    const showSkip = welcomeWizardStep < 3 && canSkipWelcomeWizard();
    skipBtn.style.display = showSkip ? 'inline-flex' : 'none';
  }

  const desc3 = document.getElementById('wizard-step-3-desc');
  if (desc3 && welcomeWizardStep === 3) {
    desc3.textContent = getStoredApiKey()
      ? 'המפתח שלך שמור במכשיר — אפשר לפתוח ספר מיד.'
      : 'הזינו מפתח Gemini חינמי — נשמר רק במכשיר שלכם.';
  }

  if (welcomeWizardStep === 3) syncWelcomeApiKeyField();
}

function setWelcomeWizardStep(step, { focusApi = false } = {}) {
  const next = Math.min(WELCOME_WIZARD_STEPS, Math.max(1, step));
  if (next > welcomeWizardStep && next > 1 && !validateWizardStep1()) {
    showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, סופר, ספר, או רעיון חופשי.');
    return false;
  }
  document.getElementById('welcome-error').style.display = 'none';
  welcomeWizardStep = next;
  updateWelcomeWizardUI();
  window.scrollTo(0, 0);
  if (focusApi && welcomeWizardStep === 3) {
    setTimeout(() => document.getElementById('api-key-input')?.focus(), 120);
  }
  return true;
}

function nextWizardStep() {
  if (welcomeWizardStep === 1) {
    if (!validateWizardStep1()) {
      showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, סופר, ספר, או רעיון חופשי.');
      return;
    }
    document.getElementById('welcome-error').style.display = 'none';
  }
  if (welcomeWizardStep < WELCOME_WIZARD_STEPS) {
    setWelcomeWizardStep(welcomeWizardStep + 1, { focusApi: welcomeWizardStep + 1 === 3 });
  }
}

function prevWizardStep() {
  if (welcomeWizardStep > 1) {
    document.getElementById('welcome-error').style.display = 'none';
    setWelcomeWizardStep(welcomeWizardStep - 1);
  }
}

function goToWizardStep(step) {
  const target = typeof step === 'number' ? step : parseInt(step, 10);
  if (!target || target < 1 || target > WELCOME_WIZARD_STEPS) return;
  if (target === welcomeWizardStep) return;
  if (target > 1 && !validateWizardStep1()) {
    showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, סופר, ספר, או רעיון חופשי.');
    return;
  }
  setWelcomeWizardStep(target, { focusApi: target === 3 });
}

function applyWelcomeDefaults() {
  const p = store.app.readingPrefs || {};
  if (p.activeProfile) applyTasteProfile(p.activeProfile);
  else {
    const lk = p.defaultLengthKey || 'short';
    store.readingLengthKey = lk;
    store.state.totalChapters = cfg.LENGTH_PRESETS[lk]?.chapters || 15;
    syncWelcomeUIFromProfile(defaultBookProfile(), lk);
  }
  document.querySelectorAll('.optional-input').forEach(el => { el.style.display = 'none'; });
  resetWelcomeWizard(1);
}


// --- api.js ---
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
    `• בדיקת שימוש ומגבלות: ${cfg.GEMINI_RATE_LIMITS_URL}\n` +
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
  if (store.app[appKey] === activeModelId) return;
  store.app[appKey] = activeModelId;
  save();
  refreshModelFallbackNotice();
}

function clearModelFallbackIfPrimary(appKey, primaryModel) {
  if (!store.app[appKey]) return;
  delete store.app[appKey];
  save();
  refreshModelFallbackNotice();
}

function refreshModelFallbackNotice() {
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

async function callGeminiRawOnce(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE, options = {}) {
  const priority = resolveGeminiPriority(options);
  return enqueueGeminiRequest(
    () => executeGeminiRawOnce(prompt, systemPrompt, maxTokens, retries, model, options),
    priority
  );
}

async function executeGeminiRawOnce(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE, options = {}) {
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
    const timeoutId = setTimeout(() => controller.abort(), cfg.GEMINI_FETCH_TIMEOUT_MS);
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
          || cfg.GEMINI_RATE_LIMIT_PAUSE_MS * (attempt + 1)
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

async function callGeminiRaw(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE) {
  if (model !== cfg.GEMINI_MODEL_PROSE) {
    return callGeminiRawOnce(prompt, systemPrompt, maxTokens, retries, model);
  }
  return callGeminiRawWithModelChain(
    cfg.GEMINI_PROSE_MODEL_CHAIN, 'proseModelFallback', cfg.GEMINI_MODEL_PROSE, prompt, systemPrompt, maxTokens, retries
  );
}

async function callGemini(prompt, systemPrompt, maxTokens = 8192, retries = 4, model = cfg.GEMINI_MODEL_PROSE) {
  const { text } = await callGeminiRaw(prompt, systemPrompt, maxTokens, retries, model);
  return text;
}

async function callGeminiLiteRaw(prompt, systemPrompt = '', maxTokens = 4096, options = {}) {
  return callGeminiRawWithModelChain(
    cfg.GEMINI_LITE_MODEL_CHAIN, 'liteModelFallback', cfg.GEMINI_MODEL_LITE, prompt, systemPrompt, maxTokens, 4, options
  );
}

async function callGeminiLite(prompt, systemPrompt = '', maxTokens = 4096, options = {}) {
  const { text } = await callGeminiLiteRaw(prompt, systemPrompt, maxTokens, options);
  return text;
}

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
  return countWords(text) >= cfg.MIN_CHAPTER_WORDS && endsWithCompleteSentence(text);
}

function chapterValidationError(text) {
  const words = countWords(text);
  if (words < cfg.MIN_CHAPTER_WORDS) return `הפרק קצר מדי (${words} מילים)`;
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


// --- book-create.js ---
// ===== BOOK CREATION =====
async function startBookCreation() {
  if (store.bookCreationInFlight || store.state.writing) return;
  if (!navigator.onLine) {
    showError('welcome-error', 'אין חיבור רשת — יצירת ספר חדש דורשת אינטרנט. אפשר לקרוא ספרים שכבר במדף.');
    return;
  }
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    setWelcomeWizardStep(3, { focusApi: true });
    showError('welcome-error', 'נדרש מפתח Gemini אישי. הזן מפתח בשלב 3, או קבל מפתח חינמי ב-Google AI Studio.');
    return;
  }

  const profile = collectWelcomeProfile();
  if (!validateWelcomeSelections(profile)) {
    resetWelcomeWizard(1);
    showError('welcome-error', 'בחר לפחות אחד: ז\'אנר, טון, סופר, ספר, או רעיון חופשי.');
    return;
  }

  const previousBookId = prepareStateForNewStandaloneBook(profile, store.readingLengthKey, apiKey);
  document.getElementById('create-btn').disabled = true;
  document.getElementById('welcome-error').style.display = 'none';
  showScreen('loading-screen');
  document.getElementById('loading-title').textContent = 'פותח ספר חדש...';

  const statusInterval = startLoadingStatusRotation();
  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');

  try {
    const bookData = normalizeBlueprint(await createBookBlueprint());
    store.state.book = bookData;
    store.state.memoryBook = initMemoryBookFromBlueprint(bookData);
    store.state.seriesTitle = bookData.title;
    store.app.books[store.state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: 'standalone',
      previousBookId,
      profile,
      readingLengthKey: store.readingLengthKey
    });

    clearInterval(statusInterval);
    renderLibrary();
    await finishNewBookChapterZero({ kind: 'standalone' });
  } catch(e) {
    clearInterval(statusInterval);
    restoreBookAfterFailedCreation(store.state.id, previousBookId, apiKey);
    document.getElementById('create-btn').disabled = false;
    showScreen('welcome-screen');
    showError('welcome-error', 'שגיאה ביצירת הספר: ' + e.message);
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}

async function createBookBlueprint() {
  const n = store.state.totalChapters;
  const brief = buildCreativeBrief(getBookProfile());
  const genreLabel = genreDisplayLabel(getBookProfile());

  const prompt = `צור תוכנית לספר בעברית עם ${n} פרקים.

**חשוב:** זהו ספר חדש ועצמאי לחלוטין — לא המשך לספר אחר, לא אותו עולם, לא אותן דמויות. צור עולם, דמויות ועלילה מקוריים לפי הבחירות בלבד.

${brief}

החזר JSON בלבד, ללא markdown, ללא הסברים:
{
  "title": "שם הספר",
  "tagline": "משפט תיאור קצר",
  "genre": "${genreLabel}",
  "setting": "הגדרת עולם/זירה (2 משפטים)",
  "coreRules": "כללי עולם, טכנולוגיה, או מערכת כוח — משפט אחד (רלוונטי לז'אנר)",
  "centralConflict": "קונפליקט מרכזי במשפט",
  "theme": "נושא מרכזי",
  "mainCharacters": [
    {"name": "שם", "role": "תפקיד", "trait": "תכונה"}
  ],
  "chapterOutlines": [
    {"number": 1, "title": "שם", "summary": "משפט אחד בלבד", "pov": "שם דמות"}
  ]
}

כללים קריטיים:
- chapterOutlines: בדיוק ${n} פרקים
- chapterOutlines[].title: שם ספרותי קצר בעברית — לא ברכות, לא הודעות מערכת, לא מספרי שגיאה
- summary: משפט אחד קצר לכל פרק
- mainCharacters: 3 דמויות
- התאם לז'אנר — לא כופה פנטזיה אם לא נבחר
- JSON בלבד`;

  return requestBookBlueprint(prompt, n);
}

async function createSequelBlueprint(parent) {
  const n = store.state.totalChapters;
  const pb = normalizeBlueprint(parent.book);
  const profile = getBookProfile(parent);
  const soft = isSoftSequelGenre(profile);
  const memoryJson = JSON.stringify(migrateMemoryBook(parent.memoryBook || {}), null, 2).slice(0, 6000);
  const synopsis = (parent.storySynopsis || parent.eventLog?.slice(-5).join('\n') || '').slice(0, 4000);
  const lastChapter = parent.chapters[parent.chapters.length - 1];
  const ending = lastChapter?.text?.slice(-1500) || '';
  const sequelMode = soft
    ? 'ספר חדש באותו עולם ודמויות — עלילה חדשה, תעלומה או קונפליקט חדש. אל תפתור מחדש את העלילה הקודמת.'
    : 'המשך ישיר של העלילה — לא רימייק.';

  const prompt = `צור תוכנית לספר המשך (ספר ${store.state.sequelIndex} בסדרה) בעברית, ${n} פרקים.
${sequelMode}

**ספר קודם:** ${pb.title}
**תגית:** ${pb.tagline || ''}
**הגדרה:** ${pb.setting || pb.world || ''}
**כללי עולם:** ${pb.coreRules || pb.magicSystem || ''}
**קונפליקט קודם (הושלם):** ${pb.centralConflict || '—'}

${buildCreativeBrief(profile)}

**סיכום העלילה עד כה:**
${synopsis}

**ספר זיכרון (עובדות מוסכמות — שמור עקביות):**
${memoryJson}

**סיום הספר הקודם:**
"...${ending}"

החזר JSON בלבד:
{
  "title": "שם הספר החדש (לא אותו שם)",
  "tagline": "משפט תיאור",
  "genre": "${genreDisplayLabel(profile)}",
  "setting": "אותה זירה/עולם בקצרה",
  "coreRules": "כללי עולם עקביים",
  "centralConflict": "קונפליקט חדש${soft ? ' — עלילה עצמאית' : ''}",
  "theme": "נושא",
  "mainCharacters": [{"name": "שם", "role": "תפקיד", "trait": "תכונה"}],
  "chapterOutlines": [{"number": 1, "title": "שם", "summary": "משפט אחד", "pov": "שם דמות"}]
}

כללים:
- chapterOutlines: בדיוק ${n} פרקים
- chapterOutlines[].title: שם ספרותי קצר בעברית — לא ברכות, לא הודעות מערכת, לא מספרי שגיאה
- mainCharacters: 3 דמויות
- JSON בלבד`;

  return requestBookBlueprint(prompt, n);
}

function promptSequelBook(sourceId) {
  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();

  const parent = sourceId ? store.app.books[sourceId] : bookSnapshot();
  if (!parent?.book) {
    alert('לא נמצא ספר מקור');
    return;
  }
  if (!isBookComplete(parent)) {
    alert('סיים קודם את כל פרקי הספר הנוכחי — ואז אפשר המשך בעולם הזה');
    return;
  }

  store.pendingSequelSourceId = parent.id;
  store.pendingSequelLengthKey = parent.readingLengthKey || 'short';

  const info = document.getElementById('sequel-parent-info');
  if (info) {
    const series = parent.seriesTitle || parent.book.title;
    const num = parent.sequelIndex || 1;
    const soft = isSoftSequelGenre(getBookProfile(parent));
    info.textContent = soft
      ? `עוד סיפור באותו עולם אחרי «${parent.book.title}» — ספר ${num + 1} בסדרה «${series}».`
      : `ממשיך את «${series}» (אחרי «${parent.book.title}») — ספר ${num + 1} בסדרה.`;
  }

  document.querySelectorAll('#sequel-length-options .length-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.length === store.pendingSequelLengthKey);
  });
  const err = document.getElementById('sequel-error');
  if (err) err.style.display = 'none';

  showScreen('sequel-screen');
}

function selectSequelLength(btn, key) {
  document.querySelectorAll('#sequel-length-options .length-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  store.pendingSequelLengthKey = key;
}

function cancelSequelSetup() {
  store.pendingSequelSourceId = null;
  if (store.state.book) showLibrary();
  else showShelf();
}

async function confirmSequelBook() {
  if (store.bookCreationInFlight || store.state.writing) return;
  if (!store.pendingSequelSourceId) {
    cancelSequelSetup();
    return;
  }
  const err = document.getElementById('sequel-error');
  if (err) err.style.display = 'none';
  await startSequelBook(store.pendingSequelSourceId, store.pendingSequelLengthKey);
}

async function startSequelBook(sourceId, lengthKey) {
  if (store.bookCreationInFlight || store.state.writing) return;
  const parent = store.app.books[sourceId] || bookSnapshot();
  if (!parent?.book || !isBookComplete(parent)) {
    showError('sequel-error', 'לא ניתן לפתוח המשך — הספר הקודם לא הושלם');
    return;
  }

  const apiKey = getStoredApiKey();
  if (!apiKey) {
    openWelcomeApiSettings();
    showError('sequel-error', 'נדרש מפתח API — חזור אחרי שהגדרת מפתח');
    return;
  }

  const parentMem = deepClone(parent.memoryBook || emptyMemoryBook());
  const parentSynopsis = parent.storySynopsis || parent.eventLog?.join('\n\n') || '';

  if (store.state.book && store.state.id) store.app.books[store.state.id] = bookSnapshot();
  clearChapterGenerationQueue();

  store.state = createEmptyBookState();
  store.state.id = newBookId();
  store.state.apiKey = apiKey;
  store.state.bookProfile = getBookProfile(parent);
  const lk = lengthKey || store.pendingSequelLengthKey || 'short';
  store.state.readingLengthKey = lk;
  store.state.totalChapters = cfg.LENGTH_PRESETS[lk]?.chapters || 15;
  store.pendingSequelSourceId = null;
  store.state.parentBookId = parent.id;
  store.state.seriesTitle = parent.seriesTitle || parent.book.title;
  store.state.sequelIndex = (parent.sequelIndex || 1) + 1;
  store.state.memoryBook = parentMem;
  store.state.storySynopsis = parentSynopsis;
  store.state.eventLog = [];
  store.state.chapters = [];
  store.app.currentBookId = store.state.id;
  markPendingCreation('blueprint', {
    kind: 'sequel',
    previousBookId: parent.id,
    parentBookId: parent.id,
    profile: store.state.bookProfile,
    readingLengthKey: lk
  });

  document.getElementById('create-btn').disabled = true;
  showScreen('loading-screen');
  document.getElementById('loading-title').textContent = 'פותח המשך בעולם הזה...';
  document.getElementById('loading-status').textContent = 'בונה על הסיפור הקודם...';
  store.bookCreationInFlight = true;
  setGeminiCallPriority('high');

  try {
    const bookData = normalizeBlueprint(await createSequelBlueprint(parent));
    store.state.book = bookData;
    store.state.memoryBook = parentMem;
    store.app.books[store.state.id] = bookSnapshot();
    markPendingCreation('chapter0', {
      kind: 'sequel',
      previousBookId: parent.id,
      parentBookId: parent.id,
      profile: store.state.bookProfile,
      readingLengthKey: lk
    });

    renderLibrary();
    await finishNewBookChapterZero({ kind: 'sequel' });
  } catch(e) {
    document.getElementById('create-btn').disabled = false;
    clearPendingCreation();
    delete store.app.books[store.state.id];
    applyBookSnapshot(parent);
    store.app.currentBookId = parent.id;
    save();
    showScreen('library-screen');
    showError('library-error', 'שגיאה ביצירת ספר המשך: ' + e.message);
  } finally {
    popGeminiCallPriority();
    store.bookCreationInFlight = false;
  }
}


// --- chapters.js ---
// ===== CHAPTER PIPELINE (מאחורי הקלעים) =====
function requestChapterGeneration(idx, opts = {}) {
  return new Promise((resolve, reject) => {
    const dup = store.chapterGenQueue.find(j => j.idx === idx);
    if (dup) {
      dup.resolves.push(resolve);
      dup.rejects.push(reject);
      pumpChapterGenQueue();
      return;
    }
    store.chapterGenQueue.push({ idx, opts, resolves: [resolve], rejects: [reject] });
    pumpChapterGenQueue();
  });
}

async function pumpChapterGenQueue() {
  if (store.chapterGenPumpActive) return;
  store.chapterGenPumpActive = true;
  try {
    while (store.chapterGenQueue.length) {
      const job = store.chapterGenQueue[0];
      if (store.state.writing && store.state.generatingIdx !== job.idx) {
        await waitForGeneration();
        continue;
      }
      try {
        await runGenerateChapterAt(job.idx, job.opts);
        job.resolves.forEach(r => r());
      } catch (e) {
        job.rejects.forEach(r => r(e));
      }
      store.chapterGenQueue.shift();
    }
  } finally {
    store.chapterGenPumpActive = false;
    if (store.chapterGenQueue.length) pumpChapterGenQueue();
  }
}

async function generateChapterAt(idx, opts = {}) {
  return requestChapterGeneration(idx, opts);
}

async function runGenerateChapterAt(idx, { background = false, openAfter = false, useLoadingScreen = false } = {}) {
  if (!navigator.onLine) {
    throw new Error('אין חיבור רשת — לא ניתן ליצור פרק חדש');
  }
  if (!store.state.book || idx >= store.state.totalChapters) return;
  if (idx < store.state.chapters.length) {
    if (openAfter) openChapter(idx);
    return;
  }
  if (store.state.writing) {
    if (background && store.state.generatingIdx === idx) return;
    await waitForGeneration();
    if (idx < store.state.chapters.length) {
      if (openAfter) openChapter(idx);
      if (background) notifyReadingChapterPipeline(idx, false);
      return;
    }
    if (store.state.writing) return;
  }

  ensureMemoryBook();
  setGeminiCallPriority(background ? 'low' : 'high');
  store.state.writing = true;
  store.state.generatingIdx = idx;
  const chapterNum = idx + 1;
  const outline = store.state.book.chapterOutlines[idx]
    || { title: `פרק ${chapterNum}`, summary: '', pov: '' };

  if (!background) {
    setWriteUiActive(true);
  } else {
    notifyReadingChapterPipeline(idx, true);
    updatePrepareNextButton();
  }

  try {
    setPreparingStatus(`מכין את פרק ${chapterNum}...`, useLoadingScreen);
    const plan = await planChapter(idx);

    setPreparingStatus(`ממשיך את הסיפור (פרק ${chapterNum})...`, useLoadingScreen);
    const onScene = (si, total) => {
      setPreparingStatus(`ממשיך את הסיפור (פרק ${chapterNum}, חלק ${si + 1}/${total})...`, useLoadingScreen);
    };

    let text = null;
    let lastWriteErr;
    for (let writeAttempt = 0; writeAttempt < 2; writeAttempt++) {
      try {
        text = await writeChapter(idx, plan, onScene);
        break;
      } catch (e) {
        lastWriteErr = e;
        if (writeAttempt < 1) {
          setPreparingStatus(`מנסה שוב לכתוב את פרק ${chapterNum}...`, useLoadingScreen);
        }
      }
    }
    if (!text) throw lastWriteErr;

    let validatedText = text;

    setPreparingStatus(`מוודא שהפרק ${chapterNum} מוכן...`, useLoadingScreen);
    let review = await reviewChapter(text, idx, plan);
    let fixAttempts = 0;
    while (!review.approved && fixAttempts < 2) {
      setPreparingStatus(`מלטש את פרק ${chapterNum}...`, useLoadingScreen);
      const candidate = await fixChapter(text, review, idx, plan);
      if (isChapterTextValid(candidate)) {
        text = candidate;
        validatedText = candidate;
      }
      review = await reviewChapter(text, idx, plan);
      fixAttempts++;
    }

    if (!isChapterTextValid(text)) {
      if (isChapterTextValid(validatedText)) {
        text = validatedText;
      } else {
        assertChapterTextValid(text);
      }
    }

    store.state.chapters.push({ title: sanitizeChapterTitle(outline.title, chapterNum), text, number: chapterNum });

    setPreparingStatus('כמעט מוכן...', useLoadingScreen);
    await updateMemoryBook(text, chapterNum, outline);
    const summary = await summarizeChapter(text, chapterNum, outline);
    if (!store.state.eventLog) store.state.eventLog = [];
    store.state.eventLog.push(`פרק ${chapterNum} (${outline.title}):\n${summary}`);
    await maybeCompressStorySynopsis();

    store.state.writing = false;
    store.state.generatingIdx = null;
    save();

    if (!background) setWriteUiActive(false);
    renderLibrary();

    if (openAfter) openChapter(idx);
    else if (isReadingScreenActive()) refreshReadingEndActions();

    notifyReadingChapterPipeline(idx, false);
    updatePrepareNextButton();
    popGeminiCallPriority();

  } catch(e) {
    popGeminiCallPriority();
    store.state.writing = false;
    store.state.generatingIdx = null;
    save();
    notifyReadingChapterPipeline(idx, false);
    updatePrepareNextButton();
    if (!background) {
      setWriteUiActive(false);
      if (useLoadingScreen) {
        showScreen('library-screen');
        showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
      } else {
        showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
      }
      showReadingPreparing(false);
    }
    throw e;
  }
}

function notifyReadingChapterPipeline(generatingIdx, active) {
  if (!isReadingScreenActive()) return;
  const cur = store.state.currentReadingChapter;
  if (cur == null || generatingIdx !== cur + 1) return;
  if (active) {
    showReadingPreparing(true, `מכין את פרק ${generatingIdx + 1}...`);
    renderReadingNav(cur);
  } else {
    showReadingPreparing(false);
    renderReadingNav(cur);
  }
}

function prefetchChapter(idx) {
  if (idx >= store.state.totalChapters || idx < store.state.chapters.length) return;
  updatePrepareNextButton();
  generateChapterAt(idx, { background: true }).catch((err) => {
    console.warn('prepare chapter', idx + 1, err);
    if (isReadingScreenActive() && store.state.currentReadingChapter === idx - 1) {
      showReadingPreparing(false);
      renderReadingNav(store.state.currentReadingChapter);
    }
    if (document.getElementById('library-screen')?.classList.contains('active')) {
      showError('library-error', err.message);
    }
    updatePrepareNextButton();
  });
}

function prepareNextChapter() {
  if (!store.state.book || !navigator.onLine) {
    if (!navigator.onLine) showError('library-error', 'אין חיבור רשת — לא ניתן להכין פרק');
    return;
  }
  const idx = store.state.chapters.length;
  if (idx >= store.state.totalChapters) return;
  if (store.state.writing) return;
  document.getElementById('library-error').style.display = 'none';
  prefetchChapter(idx);
}

function updatePrepareNextButton() {
  const btn = document.getElementById('prepare-next-btn');
  if (!btn) return;
  const written = store.state.chapters.length;
  const total = store.state.totalChapters;
  if (!store.state.book || written >= total || written === 0) {
    btn.style.display = 'none';
    return;
  }
  const nextIdx = written;
  const outline = store.state.book.chapterOutlines?.[nextIdx];
  const label = outline?.title || `פרק ${nextIdx + 1}`;
  if (store.state.writing && store.state.generatingIdx === nextIdx) {
    btn.style.display = 'flex';
    btn.disabled = true;
    btn.textContent = `⏳ מכין את "${label}" ברקע...`;
    return;
  }
  btn.style.display = 'flex';
  btn.disabled = !!store.state.writing;
  btn.textContent = `⚡ הכן את "${label}" מראש (אופציונלי)`;
}

function getReadingContinuationIndex() {
  if (isReadingScreenActive() && store.state.currentReadingChapter != null) {
    return store.state.currentReadingChapter;
  }
  return store.state.lastReadChapter ?? 0;
}

async function readNextChapter() {
  if (store.state.writing) await waitForGeneration();
  const written = store.state.chapters.length;
  if (written === 0) {
    try {
      await generateChapterAt(0, { openAfter: true });
    } catch (e) {
      showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
    }
    return;
  }
  const last = getReadingContinuationIndex();
  const nextToRead = last + 1;
  if (nextToRead < written) {
    openChapter(nextToRead);
    return;
  }
  if (nextToRead >= store.state.totalChapters) {
    openChapter(Math.min(last, written - 1));
    return;
  }
  try {
    await generateChapterAt(nextToRead, { openAfter: true });
  } catch (e) {
    showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
  }
}

async function continueFromChapter(currentIdx) {
  const nextIdx = currentIdx + 1;
  if (nextIdx >= store.state.totalChapters) return;

  if (nextIdx < store.state.chapters.length) {
    openChapter(nextIdx);
    return;
  }

  showReadingPreparing(true, `מכין את פרק ${nextIdx + 1}...`);
  try {
    if (store.state.writing && store.state.generatingIdx === nextIdx) {
      await waitForGeneration();
      if (nextIdx < store.state.chapters.length) openChapter(nextIdx);
    } else if (!store.state.writing) {
      await generateChapterAt(nextIdx, { openAfter: true });
    } else {
      await waitForGeneration();
      if (nextIdx < store.state.chapters.length) openChapter(nextIdx);
      else await generateChapterAt(nextIdx, { openAfter: true });
    }
  } catch(e) {
    showError('library-error', 'לא הצלחנו להכין את הפרק: ' + e.message);
  } finally {
    showReadingPreparing(false);
  }
}

function refreshReadingEndActions() {
  const idx = store.state.currentReadingChapter;
  if (idx == null) return;
  showReadingPreparing(false);
  renderReadingNav(idx);
}

async function planChapter(idx) {
  const book = normalizeBlueprint(store.state.book);
  const outline = book.chapterOutlines[idx];
  const memoryContext = formatMemoryBookForPrompt();
  const b = book;

  let priorContext = '';
  if (idx > 0) priorContext = getStoryContextForPrompt();

  const prompt = `תכנן את הפרק הבא לפני כתיבה. החזר JSON בלבד:
{
  "scenes": [{"goal": "מטרת הסצנה", "location": "מקום", "characters": ["שמות"], "beat": "מה קורה"}],
  "chapterGoal": "מטרת הפרק במשפט",
  "povFocus": "מה נקודת המבט חייבת להדגיש",
  "mysteryHooks": ["תעלומות/שאלות לפתח או להזכיר"],
  "continuityMust": ["עובדות שחייבות להופיע או להישמר"],
  "worldRulesUse": "איך כללי העולם/המערכת מופיעים בפרק"
}

**ספר:** ${book.title}
**ז'אנר:** ${book.genre || genreDisplayLabel()}
**הגדרה:** ${b.setting || b.world || '—'}
**כללי עולם:** ${b.coreRules || b.magicSystem || '—'}
**קונפליקט:** ${b.centralConflict || '—'}
**פרק ${outline.number}:** ${outline.title} — ${outline.summary}
**נקודת מבט:** ${outline.pov}

${memoryContext}

${priorContext}

3-4 סצנות. JSON בלבד.`;

  const { text } = await callGeminiLiteRaw(prompt, '', 2500, { jsonMode: true });
  const plan = parseJsonFromResponse(text);
  if (!plan?.scenes?.length) {
    return {
      scenes: [{ goal: outline.summary, location: '', characters: [outline.pov], beat: outline.summary }],
      chapterGoal: outline.summary,
      povFocus: outline.pov,
      mysteryHooks: [],
      continuityMust: [],
      worldRulesUse: book.coreRules || book.magicSystem || ''
    };
  }
  return plan;
}

async function reviewChapter(text, idx, plan) {
  const book = store.state.book;
  const outline = book.chapterOutlines[idx];
  const memoryContext = formatMemoryBookForPrompt();

  const prompt = `בדוק את הפרק מול התכנון וספר הזיכרון. החזר JSON בלבד:
{
  "approved": true/false,
  "score": 1-10,
  "issues": [{"type": "דמות|מקום|עולם|תעלומה|עלילה|סגנון", "description": "בעיה", "severity": "גבוה|בינוני|נמוך"}]
}

**פרק ${outline.number}:** ${outline.title}
**תכנון:**
${JSON.stringify(plan, null, 2)}

${memoryContext}

**סוף הפרק (חשוב לבדיקת סיום):**
${text.slice(-1200)}

**תחילת הפרק:**
${text.substring(0, 3500)}

approved=false אם הפרק נקטע באמצע משפט, חסר סיום, או קצר מ-${cfg.MIN_CHAPTER_WORDS} מילים.
approved=true רק אם אין בעיות severity גבוה, יש סיום מלא, והפרק תואם את התכנון וספר הזיכרון.`;

  const { text: reviewRaw } = await callGeminiLiteRaw(prompt, '', 2000, { jsonMode: true });
  const review = parseJsonFromResponse(reviewRaw) || { approved: true, score: 7, issues: [] };
  if (!review.issues) review.issues = [];

  if (!endsWithCompleteSentence(text)) {
    review.issues.push({ type: 'עלילה', description: 'הפרק נקטע באמצע — חסר סיום במשפט שלם', severity: 'גבוה' });
  }
  if (countWords(text) < cfg.MIN_CHAPTER_WORDS) {
    review.issues.push({ type: 'עלילה', description: `הפרק קצר מדי (${countWords(text)} מילים)`, severity: 'גבוה' });
  }

  if (review.approved === undefined) {
    review.approved = !review.issues.some(i => i.severity === 'גבוה');
  } else if (review.issues.some(i => i.severity === 'גבוה')) {
    review.approved = false;
  }
  return review;
}

async function fixChapter(text, review, idx, plan) {
  const book = store.state.book;
  const outline = book.chapterOutlines[idx];
  const baselineWords = countWords(text);
  const issues = review.issues || [];
  const hasTruncationIssue = issues.some(i =>
    i.severity === 'גבוה' && /נקטע|קצר מדי|סיום|חתוך/i.test(i.description || '')
  );

  if (hasTruncationIssue) {
    const ctx = buildChapterContext(idx, plan);
    const extended = await finalizeChapterEnding(text, idx, plan, ctx);
    if (isChapterTextValid(extended) && countWords(extended) >= baselineWords * 0.85) {
      return extended;
    }
  }

  const memoryContext = formatMemoryBookForPrompt();
  const issuesList = issues
    .map((i, n) => `${n + 1}. [${i.type}/${i.severity}] ${i.description}`)
    .join('\n');
  const chapterBody = text.length > 14000
    ? `${text.slice(0, 5000)}\n\n[...]\n\n${text.slice(-8000)}`
    : text;

  const style = buildStyleInstructions(getBookProfile());
  const prompt = `תקן את הפרק הבא לפי הבעיות שזוהו. שמור על אורך מלא (לפחות ${cfg.MIN_CHAPTER_WORDS} מילים) ומעברי [***].
${style}
אם הפרק נקטע — השלם אותו עד סיום מלא עם hook. סיים תמיד במשפט שלם.
אל תשנה אירועים שלא קשורים לתיקון. החזר את הפרק המלא בלבד — ללא כותרת, ללא הסברים.

**בעיות לתיקון:**
${issuesList || 'שיפור עקביות כללי'}

**תכנון הפרק:**
${JSON.stringify(plan, null, 2)}

${memoryContext}

**פרק לתיקון:**
${chapterBody}`;

  let { text: fixed, finishReason } = await callGeminiRaw(prompt, '', 12288);
  fixed = (fixed || '').trim();
  if (!fixed || fixed.length < 200) return text;

  fixed = await extendProse(
    fixed,
    'השלם את הפרק עד סיום מלא במשפט שלם, עם hook לפרק הבא.',
    cfg.MIN_CHAPTER_WORDS,
    cfg.PROSE_EXTEND_MAX_ROUNDS,
    6144,
    finishReason
  );

  if (!isChapterTextValid(fixed) || countWords(fixed) < baselineWords * 0.75) {
    return text;
  }
  return fixed;
}

async function updateMemoryBook(chapterText, chapterNum, outline) {
  ensureMemoryBook();
  const current = JSON.stringify(store.state.memoryBook, null, 2);

  const prompt = `עדכן את ספר הזיכרון של הספר על בסיס הפרק החדש.

ספר זיכרון נוכחי:
${current}

פרק ${chapterNum} — ${outline.title}:
${chapterText.substring(0, 6000)}

החזר JSON בלבד:
{
  "characters": [{"name":"","role":"","status":"","notes":""}],
  "locations": [{"name":"","description":"","significance":""}],
  "keyObjects": [{"name":"","description":"","owner":"","status":""}],
  "worldRules": [{"rule":"","establishedInChapter":0,"notes":""}],
  "openMysteries": [{"question":"","introducedChapter":0,"status":"פתוח|נפתר|בתהליך","clues":""}]
}

כללים: עדכן קיימים, הוסף חדשים, סמן תעלומות שנפתרו, אל תמחק עובדות חשובות מפרקים קודמים. JSON בלבד.`;

  try {
    const { text } = await callGeminiLiteRaw(prompt, '', 4000, { jsonMode: true });
    const updated = parseJsonFromResponse(text);
    if (updated?.characters) store.state.memoryBook = migrateMemoryBook(updated);
  } catch(e) {
    console.warn('updateMemoryBook failed:', e);
  }
}

// ===== SUMMARIZE CHAPTER (event log) =====
async function summarizeChapter(chapterText, chapterNum, outline) {
  const prompt = `קרא את הפרק הבא וסכם אותו ב-4-6 משפטים קצרים בעברית.
הסיכום חייב לכלול: אירועים מרכזיים שקרו, החלטות חשובות של דמויות, שינויים במצב העולם, וכל מידע שחיוני להמשך הסיפור.
כתוב בצורת נקודות: "- [אירוע]". ללא הקדמה, ללא סיכום כללי — רק עובדות.

פרק ${chapterNum} — ${outline.title}:
${chapterText.substring(0, 3000)}`;

  try {
    const summary = await callGeminiLite(prompt, '', 800);
    return summary.trim();
  } catch(e) {
    // Fallback: use first 200 chars
    return `פרק ${chapterNum}: ${chapterText.substring(0, 200)}...`;
  }
}

function buildChapterContext(idx, plan) {
  const book = store.state.book;
  const outline = book.chapterOutlines[idx];
  const memoryContext = formatMemoryBookForPrompt();

  let eventLogContext = '';
  if (idx > 0) eventLogContext = getStoryContextForPrompt();

  let lastChapterSnippet = '';
  if (idx > 0 && store.state.chapters.length > 0) {
    const last = store.state.chapters[store.state.chapters.length - 1];
    const lines = last.text.split('\n').filter(l => l.trim()).slice(-4).join(' ');
    lastChapterSnippet = `**שורות הסיום של הפרק הקודם:**\n"${lines.substring(0, 500)}..."`;
  }

  const b = normalizeBlueprint(book);
  const planContext = `**תכנון הפרק:**
מטרה: ${plan.chapterGoal || outline.summary}
מיקוד POV: ${plan.povFocus || outline.pov}
חובות עקביות: ${(plan.continuityMust || []).join('; ') || '—'}
תעלומות: ${(plan.mysteryHooks || []).join('; ') || '—'}
כללי עולם: ${plan.worldRulesUse || plan.magicUse || b.coreRules || b.magicSystem || '—'}
**הגדרת הספר:** ${b.setting || b.world || '—'}
**קונפליקט מרכזי:** ${b.centralConflict || '—'}`;

  return { book, outline, memoryContext, eventLogContext, lastChapterSnippet, planContext };
}

async function continueProse(existing, instruction, maxTokens = 4096) {
  const prompt = `המשך את הטקסט בעברית ספרותית — בדיוק מהנקודה שבה נעצר, בלי לחזור על פסקאות שכבר נכתבו.
${instruction}
סיים במשפט שלם (נקודה, סימן שאלה או קריאה).

**סוף הטקסט עד כה:**
"...${existing.trimEnd().slice(-2000)}"

כתוב המשך בלבד — פרוזה, ללא כותרות והסברים.`;

  const { text, finishReason } = await callGeminiRaw(prompt, '', maxTokens);
  return { text: text.trim(), finishReason };
}

async function extendProse(text, instruction, minWords, maxRounds = cfg.PROSE_EXTEND_MAX_ROUNDS, maxTokens = 4096, initialFinishReason = 'STOP') {
  let result = text.trim();
  let finishReason = initialFinishReason || 'STOP';
  for (let r = 0; r < maxRounds && isOutputTruncated(result, finishReason, minWords); r++) {
    const cont = await continueProse(result, instruction, maxTokens);
    if (!cont.text) break;
    result = mergeContinuation(result, cont.text);
    finishReason = cont.finishReason;
  }
  return result;
}

async function writeScene(idx, plan, sceneIndex, scene, priorInChapter, ctx, totalScenes) {
  const { book, outline, memoryContext, eventLogContext, lastChapterSnippet, planContext } = ctx;
  const isFirst = sceneIndex === 0;
  const isLast = sceneIndex === totalScenes - 1;
  const targetMin = isLast ? 500 : 400;
  const targetMax = isLast ? 700 : 600;

  const bridge = priorInChapter
    ? `**מה שכבר קרה בפרק הזה (אל תחזור על זה):**\n"...${priorInChapter.trimEnd().slice(-800)}..."\n\n`
    : '';

  const style = buildStyleInstructions(getBookProfile());
  const wordTarget = `⚠️ הנחיית אורך קריטית: כתוב בדיוק ${targetMin}–${targetMax} מילים לסצנה זו. ` +
  `כשאתה מתקרב ל-${targetMax} מילים — סיים את הסצנה באופן טבעי במשפט שלם. ` +
  `אל תיקטע באמצע משפט או דיאלוג.`;

const prompt = `${wordTarget}

${style}

**ספר:** ${book.title} | **פרק ${outline.number}:** ${outline.title} | **POV:** ${outline.pov}

${memoryContext}

${planContext}

${eventLogContext ? eventLogContext + '\n\n' : ''}${isFirst && lastChapterSnippet ? lastChapterSnippet + '\n\n' : ''}${bridge}**הסצנה הנוכחית (${sceneIndex + 1} מתוך ${totalScenes}):**
מקום: ${scene.location || 'לפי ההקשר'}
מטרה: ${scene.goal}
מה קורה: ${scene.beat}
דמויות: ${(scene.characters || []).join(', ') || outline.pov}

**הנחיות קריטיות:**
- כתוב רק את הסצנה הזו — בערך ${targetMin}-${targetMax} מילים (לא פחות מ-${targetMin})
- ${isFirst ? 'פתח באמצע פעולה — בלי הקדמת רקע ארוכה' : 'המשך ישירות מהחלק הקודם של הפרק'}
- ${isLast ? 'סיים את הסצנה ואת הפרק ב-hook חזק — במשפט סגור וברור' : 'סיים את הסצנה במשפט שלם, לפני המעבר לסצנה הבאה'}
- אל תכתוב [***] — המעבר יתווסף אוטומטית
- פרוזה בלבד, ללא כותרות`;

  let { text, finishReason } = await callGeminiRaw(prompt, '', 8192);
  text = text.trim();

  const tailInstr = isLast
    ? 'השלם את הסצנה האחרונה וסיים את הפרק ב-hook.'
    : 'השלם את הסצנה עד סיום טבעי.';
  text = await extendProse(text, tailInstr, targetMin - 80, cfg.PROSE_EXTEND_MAX_ROUNDS, 4096, finishReason);

  return text;
}

async function finalizeChapterEnding(fullText, idx, plan, ctx) {
  if (isChapterTextValid(fullText) && countWords(fullText) >= 1100) return fullText;

  const { outline } = ctx;
  let merged = await extendProse(
    fullText,
    `הפרק ${outline.number} ("${outline.title}") נקטע באמצע. כתוב את המשך וסיום הפרק בלבד — עוד 250-450 מילים, עם hook לפרק הבא.`,
    cfg.MIN_CHAPTER_WORDS,
    cfg.PROSE_EXTEND_MAX_ROUNDS,
    6144
  );
  if (!endsWithCompleteSentence(merged)) {
    merged = await extendProse(
      merged,
      'סיים במשפט אחד חזק וסגור — סיום הפרק.',
      cfg.MIN_CHAPTER_WORDS,
      2,
      4096
    );
  }
  return merged;
}

async function writeChapter(idx, plan, onSceneProgress) {
  const ctx = buildChapterContext(idx, plan);
  const { outline } = ctx;

  const scenes = plan.scenes?.length
    ? plan.scenes
    : [{ goal: outline.summary, beat: outline.summary, location: '', characters: [outline.pov] }];

  const parts = [];
  let priorInChapter = '';

  for (let i = 0; i < scenes.length; i++) {
    if (onSceneProgress) onSceneProgress(i, scenes.length);
    const sceneText = await writeScene(idx, plan, i, scenes[i], priorInChapter, ctx, scenes.length);
    if (i > 0) parts.push('[***]');
    parts.push(sceneText);
    priorInChapter = parts.join('\n\n');
  }

  let full = parts.join('\n\n').trim();
  full = await finalizeChapterEnding(full, idx, plan, ctx);
  assertChapterTextValid(full);
  return full;
}


// --- library.js ---
// ===== RENDER LIBRARY =====
function renderLibrary() {
  if (!store.state.book) return;

  const book = store.state.book;
  const writtenCount = store.state.chapters.length;
  const total = store.state.totalChapters;

  // Header
  document.getElementById('header-book-title').textContent = book.title;

  // Book info
  document.getElementById('book-title-main').textContent = book.title;
  const slot = document.getElementById('book-complete-slot');
  if (slot) slot.innerHTML = '';

  const expanded = !!store.state.expandChapterList;
  const toggle = document.getElementById('chapter-list-toggle');
  if (toggle) {
    if (total > 12) {
      toggle.style.display = 'inline';
      toggle.textContent = expanded ? 'הצג תמצית' : `הצג את כל ${total} הפרקים`;
      toggle.onclick = () => {
        store.state.expandChapterList = !expanded;
        save();
        renderLibrary();
      };
    } else {
      toggle.style.display = 'none';
    }
  }

  const seriesBadge = store.state.sequelIndex > 1
    ? `<span>📜 ספר ${store.state.sequelIndex} · ${escapeHtml(store.state.seriesTitle || book.title)}</span>` : '';

  document.getElementById('book-meta').innerHTML =
    `<span>📚 ${total} פרקים</span><span>✨ ${escapeHtml(genreDisplayLabel())}</span>` +
    `<span>👁 ${writtenCount} זמינים</span>${seriesBadge}`;
  document.getElementById('book-tagline').textContent = book.tagline || '';

  // Progress
  const pct = total > 0 ? Math.round((writtenCount / total) * 100) : 0;
  document.getElementById('progress-text').textContent = `${writtenCount} / ${total} זמינים`;
  document.getElementById('progress-fill').style.width = pct + '%';

  // Chapter list
  const list = document.getElementById('chapter-list');
  list.innerHTML = '';

  for (let i = 0; i < total; i++) {
    if (!shouldRenderChapterInList(i, writtenCount, total, expanded)) continue;

    const outline = book.chapterOutlines[i] || { title: `פרק ${i+1}`, summary: '', pov: '' };
    const isWritten = i < writtenCount;
    const isNext = i === writtenCount;

    const btn = document.createElement('button');
    btn.className = `chapter-item ${isWritten ? 'written' : isNext ? 'next-to-write' : 'locked'}`;

    const isPreparing = isNext && store.state.writing && store.state.generatingIdx === i;
    const statusLabel = isWritten ? '<span class="chapter-status done">✓</span>' :
                        isPreparing ? '<span class="chapter-status write">⏳</span>' :
                        isNext ? '<span class="chapter-status write">📖</span>' :
                        '<span class="chapter-status lock">🔒</span>';

    btn.innerHTML = `
      <span class="chapter-num">${i+1}</span>
      <div class="chapter-info">
        <div class="chapter-name">${isWritten || isNext ? escapeHtml(outline.title) : '???'}</div>
        <div class="chapter-hint">${isWritten ? `נקודת מבט: ${escapeHtml(outline.pov)}` : isPreparing ? 'בהכנה...' : isNext ? 'לחץ "המשך לקרוא"' : 'יקריא לאחר הפרקים הקודמים'}</div>
      </div>
      ${statusLabel}
    `;

    if (isWritten) {
      const capturedIdx = i;
      btn.onclick = () => openChapter(capturedIdx);
    } else if (isNext) {
      btn.onclick = () => readNextChapter();
    }

    list.appendChild(btn);
  }

  if (!expanded && total > 12) {
    const hiddenStart = writtenCount < total ? writtenCount + 1 : writtenCount;
    const hiddenCount = total - hiddenStart;
    if (hiddenCount > 0) {
      const compact = document.createElement('button');
      compact.type = 'button';
      compact.className = 'chapter-item compact-locked';
      compact.innerHTML = `<span class="chapter-hint" style="font-style:normal">🔒 עוד ${hiddenCount} פרקים ייפתחו בהמשך · לחץ להציג הכל</span>`;
      compact.onclick = () => {
        store.state.expandChapterList = true;
        save();
        renderLibrary();
      };
      list.appendChild(compact);
    }
  }

  if (!expanded && writtenCount < total) {
    requestAnimationFrame(() => {
      const nextEl = list.querySelector('.next-to-write');
      if (nextEl) nextEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  // Write next button
  const writeBtn = document.getElementById('write-next-btn');
  if (writtenCount >= total) {
    writeBtn.style.display = 'none';
    renderBookCompletePanel();
  } else {
    writeBtn.style.display = 'flex';
    writeBtn.disabled = store.state.writing;
    const last = store.state.lastReadChapter ?? -1;
    const hasUnread = last + 1 < writtenCount;
    if (writtenCount === 0) writeBtn.textContent = '📖 התחל לקרוא';
    else if (hasUnread) writeBtn.textContent = `↪ המשך מפרק ${last + 2}`;
    else writeBtn.textContent = '📖 המשך לקרוא';
  }

  updatePrepareNextButton();
  renderLibraryActions();
}


// --- reading.js ---
// ===== READING NAV =====
function closeChapterDrawer() {
  document.getElementById('chapter-drawer')?.classList.remove('open');
  document.getElementById('chapter-drawer-backdrop')?.classList.remove('open');
  const drawer = document.getElementById('chapter-drawer');
  if (drawer) drawer.setAttribute('aria-hidden', 'true');
}

function openChapterDrawer(currentIdx) {
  renderChapterDrawerList(currentIdx);
  document.getElementById('chapter-drawer')?.classList.add('open');
  document.getElementById('chapter-drawer-backdrop')?.classList.add('open');
  const drawer = document.getElementById('chapter-drawer');
  if (drawer) drawer.setAttribute('aria-hidden', 'false');
}

function renderChapterDrawerList(currentIdx) {
  const list = document.getElementById('chapter-drawer-list');
  if (!list) return;
  list.innerHTML = '';
  if (!store.state.chapters.length) {
    list.innerHTML = '<p class="ui-faint drawer-empty-msg">אין פרקים עדיין</p>';
    return;
  }
  store.state.chapters.forEach((ch, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'drawer-chapter-item' + (i === currentIdx ? ' current' : '');
    const outline = store.state.book?.chapterOutlines?.[i];
    btn.innerHTML = `
      <span class="drawer-chapter-num">${ch.number}</span>
      <span style="flex:1">
        <div style="font-weight:600">${escapeHtml(ch.title)}</div>
        ${outline?.pov ? `<div style="font-size:0.72rem;opacity:0.55;margin-top:0.15rem">${escapeHtml(outline.pov)}</div>` : ''}
      </span>
      ${i === currentIdx ? '<span style="font-size:0.75rem;color:var(--gold)">●</span>' : ''}`;
    btn.onclick = () => {
      closeChapterDrawer();
      openChapter(i);
    };
    list.appendChild(btn);
  });
  requestAnimationFrame(() => {
    const cur = list.querySelector('.drawer-chapter-item.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  });
}

function renderReadingNav(idx) {
  const prevBtn = document.getElementById('nav-prev-chapter');
  const nextBtn = document.getElementById('nav-next-chapter');
  const listBtn = document.getElementById('nav-chapter-list');
  if (!prevBtn || !nextBtn || !listBtn) return;

  const written = store.state.chapters.length;
  const isLastOutline = idx >= store.state.totalChapters - 1;

  prevBtn.disabled = idx <= 0;
  prevBtn.onclick = () => { if (idx > 0) openChapter(idx - 1); };

  listBtn.onclick = () => openChapterDrawer(idx);
  listBtn.title = `${written} פרקים זמינים`;

  if (idx + 1 < written) {
    nextBtn.disabled = false;
    nextBtn.textContent = 'פרק הבא ←';
    nextBtn.onclick = () => openChapter(idx + 1);
  } else if (isLastOutline) {
    nextBtn.disabled = true;
    nextBtn.textContent = 'סוף הספר';
    nextBtn.onclick = null;
  } else if (store.state.writing && store.state.generatingIdx === idx + 1) {
    nextBtn.disabled = true;
    nextBtn.textContent = 'בהכנה...';
    nextBtn.onclick = null;
  } else {
    nextBtn.disabled = false;
    nextBtn.textContent = 'המשך לקרוא ←';
    nextBtn.onclick = () => continueFromChapter(idx);
  }

  renderChapterDrawerList(idx);
}

// ===== OPEN CHAPTER =====
function openChapter(idx) {
  const chapter = store.state.chapters[idx];
  if (!chapter) return;

  store.state.currentReadingChapter = idx;
  store.state.lastReadChapter = idx;
  save();

  applyReadingPrefs();
  if ('store.wakeLock' in navigator && !store.wakeLock) {
    navigator.wakeLock.request('screen').then(wl => {
      store.wakeLock = wl;
      wl.addEventListener('release', () => { store.wakeLock = null; updateWakeLockButton(false); });
      updateWakeLockButton(true);
    }).catch(() => {});
  }

  document.getElementById('reading-chapter-label').textContent = `פרק ${chapter.number} מתוך ${store.state.totalChapters}`;
  document.getElementById('reading-chapter-num').textContent = `פרק ${chapter.number}`;
  document.getElementById('reading-chapter-title').textContent =
    sanitizeChapterTitle(chapter.title, chapter.number || idx + 1);

  // Epigraph from book outline
  const outline = store.state.book?.chapterOutlines?.[idx];
  document.getElementById('reading-chapter-epigraph').textContent =
    outline?.pov ? `נקודת מבט: ${outline.pov}` : '';

  // Format content
  const contentEl = document.getElementById('reading-chapter-content');
  const paragraphs = chapter.text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      if (p === '***' || p === '* * *') {
        return '<div class="chapter-divider">✦ ✦ ✦</div>';
      }
      return `<p>${escapeHtml(p)}</p>`;
    })
    .join('');

  contentEl.innerHTML = paragraphs;

  // End actions
  const endEl = document.getElementById('chapter-end-actions');
  endEl.innerHTML = '';

  showReadingPreparing(false);

  const isLast = idx === store.state.totalChapters - 1;

  if (isLast) {
    const doneMsg = document.createElement('div');
    doneMsg.className = 'end-of-book';
    doneMsg.textContent = isBookComplete() ? '✦ סוף הספר ✦' : '✦ סוף הפרק ✦';
    endEl.appendChild(doneMsg);
    if (isBookComplete()) {
      const row = document.createElement('div');
      row.className = 'complete-btn-row';
      row.style.marginTop = '1rem';
      [['📥 EPUB', () => exportBookEpub()], ['🌍 עוד סיפור באותו עולם', () => promptSequelBook()]]
        .forEach(([label, fn]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'secondary-btn';
          b.textContent = label;
          b.onclick = fn;
          row.appendChild(b);
        });
      endEl.appendChild(row);
    }
  }

  const backBtn = document.createElement('button');
  backBtn.className = 'back-to-library-btn';
  backBtn.textContent = 'חזרה לתוכן העניינים';
  backBtn.onclick = showLibrary;
  endEl.appendChild(backBtn);

  closeChapterDrawer();
  renderReadingNav(idx);
  showScreen('reading-screen');
  updateLandscapeToggleButton();
  const scrollY = (store.state.lastReadChapter === idx && store.state.lastReadScroll) ? store.state.lastReadScroll : 0;
  window.scrollTo(0, scrollY);

  let scrollSaveTimer;
  const onScroll = () => {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => {
      if (store.state.currentReadingChapter === idx) {
        store.state.lastReadScroll = window.scrollY;
        save();
      }
    }, 300);
  };
  window.removeEventListener('scroll', openChapter._scrollHandler);
  openChapter._scrollHandler = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
}


// --- utils.js ---
// ===== UTILS =====
function setWriteUiActive(active) {
  const writeBtn = document.getElementById('write-next-btn');
  const indicator = document.getElementById('writing-indicator');
  const errEl = document.getElementById('library-error');
  if (writeBtn) writeBtn.disabled = active;
  if (indicator) indicator.style.display = active ? 'flex' : 'none';
  if (active && errEl) errEl.style.display = 'none';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function deleteBookFromShelf(id, ev) {
  if (ev) ev.stopPropagation();
  if (!confirm('למחוק את הספר מהמדף?')) return;
  delete store.app.books[id];
  if (store.app.currentBookId === id) {
    const ids = Object.keys(store.app.books);
    if (ids.length) {
      applyBookSnapshot(store.app.books[ids[ids.length - 1]]);
      store.app.currentBookId = store.state.id;
    } else {
      store.state = createEmptyBookState();
      store.state.apiKey = store.app.apiKey;
      store.app.currentBookId = null;
    }
  }
  save();
  renderShelf();
  updateWelcomeShelfLink();
}

function enforceOrientationPolicy() {
  if (store.app.readingPrefs?.allowLandscape && isReadingScreenActive()) return;
  lockAppOrientation();
}


// --- init.js ---
function bootstrapAppScreens() {
  if (shelfCount() > 1) {
    renderShelf();
    showScreen('shelf-screen');
  } else if (store.state.book) {
    renderLibrary();
    showScreen('library-screen');
  } else if (shelfCount() === 1) {
    openBookFromShelf(Object.keys(store.app.books)[0]);
  } else {
    showScreen('welcome-screen');
  }
}


export {
  defaultBookProfile,
  migrateLegacyTaste,
  getBookProfile,
  genreDisplayLabel,
  looksLikeMetaOrErrorTitle,
  sanitizeChapterTitle,
  sanitizeBookTitle,
  sanitizeStoredBook,
  normalizeBlueprint,
  buildCreativeBrief,
  buildStyleInstructions,
  isSoftSequelGenre,
  selectChoice,
  collectWelcomeProfile,
  validateWelcomeSelections,
  syncWelcomeUIFromProfile,
  selectReadingLength,
  migrateBooksInApp,
  newBookId,
  bookSnapshot,
  deepClone,
  isBookComplete,
  sanitizeFilename,
  downloadBlob,
  escapeXml,
  proseToXhtml,
  exportBookHtml,
  exportBookEpub,
  setBookRating,
  renderBookCompletePanel,
  shouldRenderChapterInList,
  renderLibraryActions,
  applyBookSnapshot,
  openAppDb,
  idbRequestToPromise,
  idbReadApp,
  idbWriteApp,
  syncAppFromState,
  reportStorageError,
  reportLoadError,
  ensureMinimalAppShell,
  flushSave,
  save,
  migrateFromLegacyV1,
  applyLoadedAppData,
  loadApp,
  getStoryContextForPrompt,
  maybeCompressStorySynopsis,
  lockAppOrientation,
  unlockAppOrientation,
  toggleReadingLandscape,
  updateLandscapeToggleButton,
  applyReadingPrefs,
  adjustFontSize,
  toggleTheme,
  toggleReadingImmersive,
  toggleWakeLock,
  updateWakeLockButton,
  releaseWakeLock,
  getTasteProfiles,
  renderTasteProfiles,
  applyTasteProfile,
  updateOfflineBanner,
  showInstallUi,
  dismissInstallBanner,
  promptPwaInstall,
  showUpdateBanner,
  dismissUpdateBanner,
  applyAppUpdate,
  exportLibraryJson,
  onImportLibraryFile,
  onShelfFilterChange,
  onShelfSortChange,
  shelfBookMatchesFilter,
  sortShelfIds,
  getContinueChapterIndex,
  shelfCount,
  renderShelf,
  escapeHtml,
  continueBookFromShelf,
  openBookFromShelf,
  showShelf,
  openWelcomeNewBook,
  clearChapterGenerationQueue,
  prepareStateForNewStandaloneBook,
  restoreBookAfterFailedCreation,
  startLoadingStatusRotation,
  markPendingCreation,
  clearPendingCreation,
  abandonPendingCreationToLibrary,
  cancelPendingBookCreation,
  expirePendingCreationIfStale,
  sanitizePendingCreation,
  applyPendingCreationState,
  finishNewBookChapterZero,
  runResumeBlueprint,
  runResumeChapter0,
  tryResumePendingCreation,
  updateWelcomeShelfLink,
  startRandomBook,
  getStoredApiKey,
  updateApiKeyStatus,
  onApiKeyInput,
  saveApiKeyFromInput,
  toggleApiKeyVisibility,
  openWelcomeApiSettings,
  setWritingStatus,
  setPreparingStatus,
  showReadingPreparing,
  waitForGeneration,
  isReadingScreenActive,
  parseJsonFromResponse,
  blueprintMaxTokens,
  isBlueprintTruncated,
  normalizeChapterOutlines,
  requestBookBlueprint,
  emptyMemoryBook,
  migrateMemoryBook,
  ensureMemoryBook,
  initMemoryBookFromBlueprint,
  formatMemoryBookForPrompt,
  showScreen,
  showLibrary,
  validateWizardStep1,
  canSkipWelcomeWizard,
  resetWelcomeWizard,
  syncWelcomeApiKeyField,
  updateWelcomeWizardUI,
  setWelcomeWizardStep,
  nextWizardStep,
  prevWizardStep,
  goToWizardStep,
  applyWelcomeDefaults,
  setGeminiCallPriority,
  popGeminiCallPriority,
  resolveGeminiPriority,
  isDailyQuotaError,
  pruneGeminiRequestWindow,
  scheduleGeminiPause,
  showGeminiRateLimitStatus,
  waitForGeminiSlot,
  recordGeminiRequest,
  enqueueGeminiRequest,
  pumpGeminiRequestQueue,
  isQuotaApiError,
  quotaExceededError,
  normalizeApiError,
  isModelNotFoundError,
  setModelFallback,
  clearModelFallbackIfPrimary,
  refreshModelFallbackNotice,
  callGeminiRawOnce,
  executeGeminiRawOnce,
  callGeminiRawWithModelChain,
  callGeminiRaw,
  callGemini,
  callGeminiLiteRaw,
  callGeminiLite,
  countWords,
  endsWithCompleteSentence,
  isChapterTextValid,
  chapterValidationError,
  assertChapterTextValid,
  isOutputTruncated,
  mergeContinuation,
  startBookCreation,
  createBookBlueprint,
  createSequelBlueprint,
  promptSequelBook,
  selectSequelLength,
  cancelSequelSetup,
  confirmSequelBook,
  startSequelBook,
  requestChapterGeneration,
  pumpChapterGenQueue,
  generateChapterAt,
  runGenerateChapterAt,
  notifyReadingChapterPipeline,
  prefetchChapter,
  prepareNextChapter,
  updatePrepareNextButton,
  getReadingContinuationIndex,
  readNextChapter,
  continueFromChapter,
  refreshReadingEndActions,
  planChapter,
  reviewChapter,
  fixChapter,
  updateMemoryBook,
  summarizeChapter,
  buildChapterContext,
  continueProse,
  extendProse,
  writeScene,
  finalizeChapterEnding,
  writeChapter,
  renderLibrary,
  closeChapterDrawer,
  openChapterDrawer,
  renderChapterDrawerList,
  renderReadingNav,
  openChapter,
  setWriteUiActive,
  showError,
  deleteBookFromShelf,
  enforceOrientationPolicy,
  bootstrapAppScreens
};
