// Book model, profile, sanitize, snapshot
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
  const s = snap || state;
  if (s.bookProfile && (s.bookProfile.genre || s.bookProfile.tone || s.bookProfile.hook || s.bookProfile.author || s.bookProfile.bookRef)) {
    return { ...defaultBookProfile(), ...s.bookProfile };
  }
  if (s.taste) return migrateLegacyTaste(s.taste);
  return defaultBookProfile();
}

function genreDisplayLabel(profile) {
  const p = profile || getBookProfile();
  if (p.genre === 'other' && p.genreCustom?.trim()) return p.genreCustom.trim();
  return GENRES[p.genre]?.label || p.genre || 'ספרות בדיונית';
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
    const ref = p.bookRef === 'other' ? p.bookRefCustom?.trim() : BOOK_REFS[p.bookRef];
    if (ref) parts.push(`**השראה מספר:** ${ref}`);
  }
  if (p.author) {
    const auth = p.author === 'other' ? p.authorCustom?.trim() : AUTHORS[p.author];
    if (auth) parts.push(`**השראה מסופר:** ${auth}`);
  }
  if (p.tone) {
    const tone = p.tone === 'other' ? p.toneCustom?.trim() : TONES[p.tone];
    if (tone) parts.push(`**טון ואווירה:** ${tone}`);
  }
  if (p.genre) {
    const g = p.genre === 'other' ? p.genreCustom?.trim() : (GENRES[p.genre]?.blueprint || GENRES[p.genre]?.label);
    if (g) parts.push(`**ז'אנר:** ${g}`);
  }
  return parts.join('\n') || "ספר ספרותי בעברית — בחר את הז'אנר והטון לפי שיקולך.";
}

function buildStyleInstructions(profile) {
  const p = profile || getBookProfile();
  const lines = ['כתוב בעברית ספרותית, סוחפת, עם דיאלוג חי ותיאור ממוקד.'];
  if (p.author && p.author !== 'other' && AUTHORS[p.author]) {
    lines.push(`מבנה וקצב בהשראת: ${AUTHORS[p.author]} — לא חיקוי סגנון או דמויות.`);
  } else if (p.author === 'other' && p.authorCustom?.trim()) {
    lines.push(`השראה מסופר: ${p.authorCustom.trim()} — לא חיקוי.`);
  }
  if (p.tone && p.tone !== 'other' && TONES[p.tone]) lines.push(`טון: ${TONES[p.tone]}.`);
  else if (p.tone === 'other' && p.toneCustom?.trim()) lines.push(`טון: ${p.toneCustom.trim()}.`);
  if (p.genre && p.genre !== 'other' && GENRES[p.genre]) {
    lines.push(`ז'אנר: ${GENRES[p.genre].label} — ${GENRES[p.genre].blueprint}.`);
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
    welcomeDraft[group] = value;
  } else {
    welcomeDraft[group] = '';
  }
  const customId = { genre: 'genre-custom', tone: 'tone-custom', author: 'author-custom', bookRef: 'bookref-custom' }[group];
  const customEl = customId ? document.getElementById(customId) : null;
  if (customEl) customEl.style.display = welcomeDraft[group] === 'other' ? 'block' : 'none';
}

function collectWelcomeProfile() {
  const hook = document.getElementById('hook-input')?.value?.trim() || '';
  const genreCustom = document.getElementById('genre-custom')?.value?.trim() || '';
  const toneCustom = document.getElementById('tone-custom')?.value?.trim() || '';
  const authorCustom = document.getElementById('author-custom')?.value?.trim() || '';
  const bookRefCustom = document.getElementById('bookref-custom')?.value?.trim() || '';
  return {
    ...defaultBookProfile(),
    ...welcomeDraft,
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
  welcomeDraft = { ...defaultBookProfile(), ...p };
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
  const lk = lengthKey || readingLengthKey || 'short';
  readingLengthKey = lk;
  document.querySelectorAll('#length-presets .length-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.length === lk);
  });
}

function selectReadingLength(btn, key) {
  readingLengthKey = key;
  document.querySelectorAll('#length-presets .length-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.totalChapters = LENGTH_PRESETS[key]?.chapters || 15;
  app.readingPrefs.defaultLengthKey = key;
  save();
}

function migrateBooksInApp() {
  Object.keys(app.books || {}).forEach(id => {
    const b = app.books[id];
    if (!b.bookProfile) b.bookProfile = migrateLegacyTaste(b.taste);
    if (!b.readingLengthKey) {
      const t = b.totalChapters || 15;
      b.readingLengthKey = t >= 45 ? 'long' : t >= 25 ? 'medium' : 'short';
    }
    if (b.memoryBook) b.memoryBook = migrateMemoryBook(b.memoryBook);
    Object.assign(b, sanitizeStoredBook(b));
  });
}

function createEmptyBookState() {
  return {
    id: null,
    bookProfile: defaultBookProfile(),
    readingLengthKey: 'short',
    apiKey: '',
    totalChapters: 15,
    book: null,
    chapters: [],
    eventLog: [],
    storySynopsis: '',
    memoryBook: null,
    writing: false,
    generatingIdx: null,
    lastReadChapter: 0,
    currentReadingChapter: 0,
    createdAt: null,
    parentBookId: null,
    seriesTitle: '',
    sequelIndex: 1,
    rating: 0,
    expandChapterList: false,
    lastReadScroll: 0
  };
}

function newBookId() {
  return 'book_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function bookSnapshot() {
  const snap = sanitizeStoredBook({
    id: state.id,
    bookProfile: state.bookProfile || defaultBookProfile(),
    readingLengthKey: state.readingLengthKey || 'short',
    totalChapters: state.totalChapters,
    book: state.book,
    chapters: state.chapters,
    eventLog: state.eventLog,
    storySynopsis: state.storySynopsis || '',
    memoryBook: state.memoryBook,
    lastReadChapter: state.lastReadChapter,
    createdAt: state.createdAt || Date.now(),
    parentBookId: state.parentBookId || null,
    seriesTitle: state.seriesTitle || state.book?.title || '',
    sequelIndex: state.sequelIndex || 1,
    rating: state.rating || 0,
    expandChapterList: !!state.expandChapterList,
    lastReadScroll: state.lastReadScroll || 0
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
  if (!state.chapters.length) {
    alert('אין פרקים לייצוא עדיין');
    return;
  }
  const title = state.book?.title || 'ספר';
  const complete = state.chapters.length >= state.totalChapters;
  const chaptersHtml = state.chapters.map(ch => `
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
<p style="text-align:center;color:#666">${escapeXml(state.book?.tagline || '')}</p>
${!complete ? '<p style="text-align:center;color:#a66"><em>ייצוא חלקי — הספר עדיין בהמשך</em></p>' : ''}
${chaptersHtml}
</body>
</html>`;

  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), sanitizeFilename(title) + '.html');
}

async function exportBookEpub() {
  if (!state.chapters.length) {
    alert('אין פרקים לייצוא עדיין');
    return;
  }
  if (typeof JSZip === 'undefined') {
    alert('ספריית EPUB לא נטענה — מוריד HTML במקום');
    exportBookHtml();
    return;
  }

  const zip = new JSZip();
  const title = state.book?.title || 'ספר';
  const uid = 'urn:uuid:' + (state.id || newBookId());
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

  state.chapters.forEach((ch, i) => {
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
  state.rating = stars;
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
  const seriesNote = state.sequelIndex > 1 ? ` · ספר ${state.sequelIndex} בסדרה` : '';
  const stars = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="rating-star ${(state.rating || 0) >= n ? 'on' : ''}" onclick="setBookRating(${n})" title="${n} כוכבים">★</button>`
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
  if (!state.chapters.length && !isBookComplete()) return;

  const partial = state.chapters.length < state.totalChapters;
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
  state = { ...createEmptyBookState(), ...snap, apiKey: app.apiKey, writing: false, generatingIdx: null };
  if (!state.bookProfile || (!state.bookProfile.genre && !state.bookProfile.hook && state.taste)) {
    state.bookProfile = migrateLegacyTaste(state.taste);
  }
  if (state.readingLengthKey && LENGTH_PRESETS[state.readingLengthKey]) {
    state.totalChapters = LENGTH_PRESETS[state.readingLengthKey].chapters;
  } else if (!state.totalChapters) {
    state.totalChapters = LENGTH_PRESETS.short.chapters;
  }
  const clean = sanitizeStoredBook({ book: state.book, chapters: state.chapters });
  if (clean.book) state.book = clean.book;
  if (clean.chapters) state.chapters = clean.chapters;
  ensureMemoryBook();
}
