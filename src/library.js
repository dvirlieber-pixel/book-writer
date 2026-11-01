// Library screen rendering
import { store } from './store.js';
import {
  genreDisplayLabel,
  renderBookCompletePanel,
  renderLibraryActions,
  shouldRenderChapterInList
} from './book.js';
import {
  readNextChapter,
  updatePrepareNextButton
} from './chapters.js';
import {
  openChapter
} from './reading.js';
import {
  save
} from './storage.js';
import {
  renderWorldDictionaryLibraryEntry
} from './world-dictionary.js';
import {
  refreshQuotaNotice
} from './quota.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

// ===== RENDER LIBRARY =====
export function renderLibrary() {
  refreshQuotaNotice();
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
    ? `<span>ספר ${store.state.sequelIndex} בסדרה ${escapeHtml(store.state.seriesTitle || book.title)}</span>` : '';

  document.getElementById('book-meta').innerHTML =
    `<span>${escapeHtml(genreDisplayLabel())}</span><span>${total} פרקים</span>${seriesBadge}`;
  document.getElementById('book-tagline').textContent = book.tagline || '';

  // Progress
  const pct = total > 0 ? Math.round((writtenCount / total) * 100) : 0;
  document.getElementById('progress-text').textContent = `${writtenCount} מתוך ${total} פרקים נכתבו`;
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
    const statusLabel = isWritten ? `<span class="chapter-status done" aria-label="נקרא">${icon('check')}</span>` :
                        isPreparing ? '<span class="chapter-status write is-busy">נכתב</span>' :
                        isNext ? '<span class="chapter-status write">הבא</span>' :
                        `<span class="chapter-status lock" aria-label="נעול">${icon('lock')}</span>`;

    btn.innerHTML = `
      <span class="chapter-num">${i+1}</span>
      <div class="chapter-info">
        <div class="chapter-name">${isWritten || isNext ? escapeHtml(outline.title) : 'פרק נעול'}</div>
        <div class="chapter-hint">${isWritten ? `מנקודת המבט של ${escapeHtml(outline.pov)}` : isPreparing ? 'נכתב עכשיו...' : isNext ? 'ייכתב כשתפתח אותו' : 'ייפתח אחרי הפרקים הקודמים'}</div>
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
      compact.innerHTML = `<span class="chapter-hint">ועוד ${hiddenCount} פרקים נעולים</span>`;
      compact.onclick = () => {
        store.state.expandChapterList = true;
        save();
        renderLibrary();
      };
      list.appendChild(compact);
    }
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
    if (writtenCount === 0) writeBtn.textContent = 'התחל לקרוא';
    else if (hasUnread) writeBtn.textContent = `המשך לפרק ${last + 2}`;
    else writeBtn.textContent = `קרא את פרק ${writtenCount + 1}`;
  }

  updatePrepareNextButton();
  renderLibraryActions();
  renderWorldDictionaryLibraryEntry();
}
