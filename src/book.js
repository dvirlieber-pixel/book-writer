// Book model, profile, sanitize, snapshot
import JSZip from 'jszip';
import * as cfg from './constants.js';
import { store } from './store.js';
import { defaultBookProfile, createEmptyBookState } from './book-model.js';
import {
  promptSequelBook
} from './book-create.js';
import {
  ensureMemoryBook,
  migrateMemoryBook
} from './creation-resume.js';
import {
  save
} from './storage.js';
import { escapeHtml } from './utils.js';
import { styleGuideText } from './blueprint.js';

export function migrateLegacyTaste(taste) {
  const map = {
    'hard-magic': { genre: 'fantasy', tone: 'classic', author: 'sanderson' },
    mystery: { genre: 'mystery', tone: 'classic' },
    war: { genre: 'historical', tone: 'action' },
    character: { genre: 'romance', tone: 'philosophical' }
  };
  return { ...defaultBookProfile(), ...(map[taste] || { genre: 'fantasy', tone: 'classic', author: 'sanderson' }) };
}

export function getBookProfile(snap) {
  const s = snap || store.state;
  if (s.bookProfile && (s.bookProfile.genre || s.bookProfile.tone || s.bookProfile.hook || s.bookProfile.author || s.bookProfile.bookRef)) {
    return { ...defaultBookProfile(), ...s.bookProfile };
  }
  if (s.taste) return migrateLegacyTaste(s.taste);
  return defaultBookProfile();
}

export function genreDisplayLabel(profile) {
  const p = profile || getBookProfile();
  if (p.genre === 'other' && p.genreCustom?.trim()) return p.genreCustom.trim();
  return cfg.GENRES[p.genre]?.label || p.genre || 'ספרות בדיונית';
}

export function looksLikeMetaOrErrorTitle(title) {
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

export function sanitizeChapterTitle(title, number) {
  const t = (title || '').trim();
  return looksLikeMetaOrErrorTitle(t) ? `פרק ${number}` : t;
}

export function sanitizeBookTitle(title) {
  const t = (title || '').trim();
  return looksLikeMetaOrErrorTitle(t) ? 'ספר חדש' : t;
}

export function sanitizeStoredBook(snap) {
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

export function normalizeBlueprint(book) {
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

export function buildCreativeBrief(profile) {
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

export function buildStyleInstructions(profile) {
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
  const bookStyle = styleGuideText(store.state.book);
  if (bookStyle) lines.push(`**דף הסגנון של הספר (שמור עליו לאורך כל הספר):**\n${bookStyle}`);
  lines.push('אל תחזור על פסקאות שכבר נכתבו. סיים תמיד במשפט שלם.');
  return lines.join('\n');
}

export function isSoftSequelGenre(profile) {
  const g = (profile || getBookProfile()).genre;
  return g === 'mystery' || g === 'horror';
}

export function selectChoice(btn) {
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

export function collectWelcomeProfile() {
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

export function validateWelcomeSelections(profile) {
  const p = profile || collectWelcomeProfile();
  const hasGenre = !!(p.genre && (p.genre !== 'other' || p.genreCustom?.trim()));
  const hasTone = !!(p.tone && (p.tone !== 'other' || p.toneCustom?.trim()));
  const hasAuthor = !!(p.author && (p.author !== 'other' || p.authorCustom?.trim()));
  const hasBookRef = !!(p.bookRef && (p.bookRef !== 'other' || p.bookRefCustom?.trim()));
  const hasHook = !!p.hook?.trim();
  return hasGenre || hasTone || hasAuthor || hasBookRef || hasHook;
}

export function syncWelcomeUIFromProfile(profile, lengthKey) {
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

export function selectReadingLength(btn, key) {
  store.readingLengthKey = key;
  document.querySelectorAll('#length-presets .length-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  store.state.totalChapters = cfg.LENGTH_PRESETS[key]?.chapters || 15;
  store.app.readingPrefs.defaultLengthKey = key;
  save();
}

export function migrateBooksInApp() {
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

export function newBookId() {
  return 'book_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function bookSnapshot() {
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

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function isBookComplete(snap) {
  const s = snap || bookSnapshot();
  return s.book && s.chapters?.length >= s.totalChapters;
}

export function sanitizeFilename(name) {
  return (name || 'ספר').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80) || 'ספר';
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function proseToXhtml(text) {
  return text.split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => {
    if (p === '[***]' || p === '***' || p === '* * *') return '<hr/>';
    return `<p>${escapeHtml(p)}</p>`;
  }).join('\n    ');
}

export function exportBookHtml() {
  if (!store.state.chapters.length) {
    alert('אין פרקים לייצוא עדיין');
    return;
  }
  const title = store.state.book?.title || 'ספר';
  const complete = store.state.chapters.length >= store.state.totalChapters;
  const chaptersHtml = store.state.chapters.map(ch => `
    <section class="chapter">
      <h2>פרק ${ch.number}: ${escapeHtml(ch.title)}</h2>
      ${proseToXhtml(ch.text)}
    </section>`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title)}</title>
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
<h1>${escapeHtml(title)}</h1>
<p style="text-align:center;color:#666">${escapeHtml(store.state.book?.tagline || '')}</p>
${!complete ? '<p style="text-align:center;color:#a66"><em>ייצוא חלקי — הספר עדיין בהמשך</em></p>' : ''}
${chaptersHtml}
</body>
</html>`;

  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), sanitizeFilename(title) + '.html');
}

export async function exportBookEpub() {
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
  <title>${escapeHtml(ch.title)}</title>
  <meta charset="UTF-8"/>
  <style>p { text-indent: 1.2em; margin: 0 0 0.9em; } hr { border: none; margin: 1.5em 0; }</style>
</head>
<body>
  <h1>פרק ${ch.number}: ${escapeHtml(ch.title)}</h1>
  ${proseToXhtml(ch.text)}
</body>
</html>`;
    oebps.file(href, xhtml);
    chapterMeta.push({ id, href, title: `פרק ${ch.number}: ${ch.title}` });
  });

  const navLi = chapterMeta.map(c =>
    `<li><a href="${c.href}">${escapeHtml(c.title)}</a></li>`).join('\n      ');
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
    <dc:identifier id="uid">${escapeHtml(uid)}</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
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

export function setBookRating(stars) {
  store.state.rating = stars;
  save();
  renderBookCompletePanel();
}

export function renderBookCompletePanel() {
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

export function shouldRenderChapterInList(i, writtenCount, total, expanded) {
  if (expanded || total <= 12) return true;
  if (i < writtenCount) return true;
  if (i === writtenCount && writtenCount < total) return true;
  return false;
}

export function renderLibraryActions() {
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

export function applyBookSnapshot(snap) {
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
