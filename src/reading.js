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
  continueFromChapter
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

// ===== OPEN CHAPTER =====
export function openChapter(idx) {
  const chapter = store.state.chapters[idx];
  if (!chapter) return;

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
      if (p === '[***]' || p === '***' || p === '* * *') {
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
