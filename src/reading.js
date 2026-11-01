// Reading screen & chapter navigation
import { store } from './store.js';
import {
  promptSequelBook
} from './book-create.js';
import {
  exportBookEpub,
  isBookComplete,
  sanitizeChapterTitle
} from './book.js';
import {
  continueFromChapter,
  generateChapterAt
} from './chapters.js';
import {
  showReadingPreparing
} from './creation-resume.js';
import {
  applyReadingPrefs,
  updateLandscapeToggleButton,
  updateWakeLockButton
} from './prefs-export.js';
import {
  showLibrary,
  showScreen
} from './screens.js';
import {
  recordLastReadingSession
} from './shelf.js';
import {
  save
} from './storage.js';
import { countWords } from './api.js';
import { escapeHtml } from './utils.js';

// ===== READING NAV =====
export function closeChapterDrawer() {
  document.getElementById('chapter-drawer')?.classList.remove('open');
  document.getElementById('chapter-drawer-backdrop')?.classList.remove('open');
  const drawer = document.getElementById('chapter-drawer');
  if (drawer) drawer.setAttribute('aria-hidden', 'true');
}

export function openChapterDrawer(currentIdx) {
  renderChapterDrawerList(currentIdx);
  document.getElementById('chapter-drawer')?.classList.add('open');
  document.getElementById('chapter-drawer-backdrop')?.classList.add('open');
  const drawer = document.getElementById('chapter-drawer');
  if (drawer) drawer.setAttribute('aria-hidden', 'false');
}

export function renderChapterDrawerList(currentIdx) {
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

export function renderReadingNav(idx) {
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

function isDividerLine(p) {
  return p === '[***]' || p === '***' || p === '* * *';
}

function chapterParagraphs(text) {
  return text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
}

function fillChapterHeading(idx, title) {
  const number = idx + 1;
  document.getElementById('reading-chapter-label').textContent = `פרק ${number} מתוך ${store.state.totalChapters}`;
  document.getElementById('reading-chapter-num').textContent = `פרק ${number}`;
  document.getElementById('reading-chapter-title').textContent = sanitizeChapterTitle(title, number);
  const outline = store.state.book?.chapterOutlines?.[idx];
  document.getElementById('reading-chapter-epigraph').textContent =
    outline?.pov ? `נקודת מבט: ${outline.pov}` : '';
}

// ===== LIVE CHAPTER (streamed while it is written) =====
// The text arrives in bursts; it is revealed at an even pace a few characters a frame,
// faster when far behind, so it reads as being written rather than jumping in blocks.
const live = {
  idx: null,
  target: '',
  shown: 0,
  frame: 0,
  done: false,
  nodes: [],
  caret: null
};

export function isLiveChapterShown(idx) {
  return live.idx === idx && !!document.getElementById('reading-screen')?.classList.contains('active');
}

export function showLiveChapter(idx) {
  stopLiveChapter();
  live.idx = idx;
  window.removeEventListener('scroll', openChapter._scrollHandler);
  closeChapterDrawer();
  showReadingPreparing(false);

  const outline = store.state.book?.chapterOutlines?.[idx];
  fillChapterHeading(idx, outline?.title || '');
  const contentEl = document.getElementById('reading-chapter-content');
  contentEl.innerHTML = '';
  contentEl.classList.add('live-writing');
  live.caret = document.createElement('span');
  live.caret.className = 'live-caret';
  live.caret.setAttribute('aria-hidden', 'true');

  document.getElementById('chapter-end-actions').innerHTML = `
    <div class="live-status" role="status">
      <span class="live-quill" aria-hidden="true">✒</span>
      <span class="live-status-text">הפרק נכתב עכשיו — אפשר כבר לקרוא</span>
    </div>`;

  const prevBtn = document.getElementById('nav-prev-chapter');
  const nextBtn = document.getElementById('nav-next-chapter');
  const listBtn = document.getElementById('nav-chapter-list');
  if (prevBtn) {
    prevBtn.disabled = idx <= 0;
    prevBtn.onclick = () => { if (idx > 0) openChapter(idx - 1); };
  }
  if (listBtn) listBtn.onclick = () => openChapterDrawer(idx - 1);
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.onclick = null;
    nextBtn.classList.add('live-progress');
    nextBtn.textContent = '✒ נכתב...';
  }

  showScreen('reading-screen');
  updateLandscapeToggleButton();
}

export function updateLiveChapter(idx, text) {
  if (live.idx !== idx) return;
  // The writer restarted or trimmed a half sentence: reveal again from the shared start
  let common = 0;
  const max = Math.min(live.shown, text.length);
  while (common < max && text.charCodeAt(common) === live.target.charCodeAt(common)) common++;
  live.shown = common;
  live.target = text;
  const nextBtn = document.getElementById('nav-next-chapter');
  if (nextBtn) nextBtn.textContent = `✒ נכתב · ${countWords(text).toLocaleString('he-IL')} מילים`;
  if (!live.frame) live.frame = requestAnimationFrame(revealLiveText);
}

function revealLiveText() {
  live.frame = 0;
  if (live.idx == null) return;
  const backlog = live.target.length - live.shown;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) live.shown = live.target.length;
  else if (backlog > 0) live.shown += Math.max(2, Math.ceil(backlog * 0.06));
  renderLiveParagraphs(live.target.slice(0, live.shown));
  if (live.shown < live.target.length) live.frame = requestAnimationFrame(revealLiveText);
  else if (live.done) live.caret?.remove();
}

function renderLiveParagraphs(visible) {
  const contentEl = document.getElementById('reading-chapter-content');
  const paras = chapterParagraphs(visible);
  // A divider still arriving ("[**") is not shown until it is complete
  const lastPara = paras[paras.length - 1];
  if (lastPara && /^\[?[*\s]*\]?$/.test(lastPara) && !isDividerLine(lastPara)) paras.pop();

  paras.forEach((p, i) => {
    const kind = isDividerLine(p) ? 'divider' : 'p';
    const node = live.nodes[i];
    if (node && node.kind === kind && node.text === p) return;
    if (node && kind === 'p' && node.kind === 'p') {
      node.el.firstChild.nodeValue = p;
      node.text = p;
      return;
    }
    live.nodes.splice(i).forEach(n => n.el.remove());
    const el = document.createElement(kind === 'divider' ? 'div' : 'p');
    if (kind === 'divider') {
      el.className = 'chapter-divider live-new';
      el.textContent = '✦ ✦ ✦';
    } else {
      el.className = 'live-new';
      el.appendChild(document.createTextNode(p));
    }
    contentEl.appendChild(el);
    live.nodes.push({ kind, text: p, el });
  });
  live.nodes.splice(paras.length).forEach(n => n.el.remove());
  const last = live.nodes[live.nodes.length - 1];
  if (last?.kind === 'p' && live.caret && live.caret.parentNode !== last.el) last.el.appendChild(live.caret);
}

/** Writing is over; the chapter is being filed (memory, summary) */
export function setLiveChapterStatus(idx, message) {
  if (live.idx !== idx) return;
  live.done = true;
  if (live.shown >= live.target.length) live.caret?.remove();
  const text = document.querySelector('#chapter-end-actions .live-status-text');
  if (text) text.textContent = message;
}

export function showLiveChapterError(idx, message) {
  if (live.idx !== idx) return;
  const partial = !!live.target;
  stopLiveChapter();
  const endEl = document.getElementById('chapter-end-actions');
  endEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'live-status live-error';
  box.setAttribute('role', 'alert');
  box.textContent = partial
    ? `הכתיבה נעצרה באמצע — ${message}`
    : `לא הצלחנו לכתוב את הפרק — ${message}`;
  const row = document.createElement('div');
  row.className = 'complete-btn-row';
  const actions = [
    ['נסה שוב', 'secondary-btn', () => generateChapterAt(idx, { openAfter: true }).catch(() => {})],
    ['חזרה לתוכן העניינים', 'back-to-library-btn', showLibrary]
  ];
  actions.forEach(([label, className, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    b.onclick = fn;
    row.appendChild(b);
  });
  endEl.append(box, row);
  const nextBtn = document.getElementById('nav-next-chapter');
  if (nextBtn) nextBtn.textContent = 'הכתיבה נעצרה';
}

export function stopLiveChapter() {
  if (live.frame) cancelAnimationFrame(live.frame);
  live.caret?.remove();
  Object.assign(live, { idx: null, target: '', shown: 0, frame: 0, done: false, nodes: [], caret: null });
  document.getElementById('reading-chapter-content')?.classList.remove('live-writing');
  document.getElementById('nav-next-chapter')?.classList.remove('live-progress');
}

// ===== OPEN CHAPTER =====
/** `keepScroll`: the chapter is already on screen (written live) — stay where the reader is */
export function openChapter(idx, { keepScroll = false } = {}) {
  const chapter = store.state.chapters[idx];
  if (!chapter) return;
  const keptScrollY = window.scrollY;
  stopLiveChapter();

  // A saved scroll position belongs to the chapter it was saved in
  const resumeScroll = store.state.lastReadChapter === idx ? (store.state.lastReadScroll || 0) : 0;
  store.state.currentReadingChapter = idx;
  store.state.lastReadChapter = idx;
  recordLastReadingSession(store.state.id, idx);
  save();

  applyReadingPrefs();
  if ('wakeLock' in navigator && !store.wakeLock) {
    navigator.wakeLock.request('screen').then(wl => {
      store.wakeLock = wl;
      wl.addEventListener('release', () => { store.wakeLock = null; updateWakeLockButton(false); });
      updateWakeLockButton(true);
    }).catch(() => {});
  }

  fillChapterHeading(idx, chapter.title);

  // Format content
  const contentEl = document.getElementById('reading-chapter-content');
  const paragraphs = chapterParagraphs(chapter.text)
    .map(p => (isDividerLine(p) ? '<div class="chapter-divider">✦ ✦ ✦</div>' : `<p>${escapeHtml(p)}</p>`))
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
  const scrollY = keepScroll ? keptScrollY : resumeScroll;
  store.state.lastReadScroll = scrollY;
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
