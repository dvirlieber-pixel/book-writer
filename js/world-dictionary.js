// World dictionary UI (memoryBook)
const WORLD_DICT_TABS = [
  { id: 'characters', label: 'דמויות', icon: '👤' },
  { id: 'locations', label: 'מקומות', icon: '📍' },
  { id: 'keyObjects', label: 'חפצים', icon: '⚔️' },
  { id: 'worldRules', label: 'כללי עולם', icon: '📜' },
  { id: 'openMysteries', label: 'תעלומות', icon: '❓' }
];

let worldDictActiveTab = 'characters';

function worldDictionaryEntryCount() {
  ensureMemoryBook();
  const mb = state.memoryBook;
  return (mb.characters?.length || 0)
    + (mb.locations?.length || 0)
    + (mb.keyObjects?.length || 0)
    + (mb.worldRules?.length || 0)
    + (mb.openMysteries?.length || 0);
}

function renderWorldDictionaryLibraryEntry() {
  const slot = document.getElementById('world-dict-library-slot');
  if (!slot || !state.book) return;

  ensureMemoryBook();
  const count = worldDictionaryEntryCount();
  const written = state.chapters?.length || 0;

  slot.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'world-dict-entry-btn';
  btn.dataset.action = 'openWorldDictionary';
  btn.innerHTML = `
    <span class="world-dict-entry-icon" aria-hidden="true">🌍</span>
    <span class="world-dict-entry-text">
      <strong>מילון העולם</strong>
      <span class="world-dict-entry-hint">${count ? `${count} רשומות` : 'דמויות, מקומות ותעלומות'}${written ? ` · עודכן לפי ${written} פרקים` : ''}</span>
    </span>
    <span class="world-dict-entry-chevron" aria-hidden="true">‹</span>`;
  slot.appendChild(btn);
}

function openWorldDictionary() {
  if (!state.book) return;
  ensureMemoryBook();
  const titleEl = document.getElementById('world-dict-book-title');
  if (titleEl) titleEl.textContent = state.book.title || '';
  renderWorldDictionaryTabs();
  renderWorldDictionaryContent();
  document.getElementById('world-dict-backdrop')?.classList.add('open');
  document.getElementById('world-dictionary-drawer')?.classList.add('open');
  const drawer = document.getElementById('world-dictionary-drawer');
  if (drawer) drawer.setAttribute('aria-hidden', 'false');
}

function closeWorldDictionary() {
  document.getElementById('world-dict-backdrop')?.classList.remove('open');
  document.getElementById('world-dictionary-drawer')?.classList.remove('open');
  const drawer = document.getElementById('world-dictionary-drawer');
  if (drawer) drawer.setAttribute('aria-hidden', 'true');
}

function selectWorldDictTab(tabId) {
  if (!WORLD_DICT_TABS.some(t => t.id === tabId)) return;
  worldDictActiveTab = tabId;
  renderWorldDictionaryTabs();
  renderWorldDictionaryContent();
}

function renderWorldDictionaryTabs() {
  const nav = document.getElementById('world-dict-tabs');
  if (!nav) return;
  ensureMemoryBook();
  const mb = state.memoryBook;

  nav.innerHTML = '';
  WORLD_DICT_TABS.forEach(tab => {
    const count = mb[tab.id]?.length || 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'world-dict-tab' + (worldDictActiveTab === tab.id ? ' active' : '');
    btn.dataset.action = 'selectWorldDictTab';
    btn.dataset.arg = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', worldDictActiveTab === tab.id ? 'true' : 'false');
    btn.innerHTML = `<span aria-hidden="true">${tab.icon}</span> ${tab.label}${count ? ` <span class="world-dict-tab-count">${count}</span>` : ''}`;
    nav.appendChild(btn);
  });
}

function renderWorldDictionaryOverview() {
  const book = state.book;
  if (!book) return '';
  const parts = [];
  if (book.setting?.trim()) {
    parts.push(`<div class="world-dict-overview-item"><span class="world-dict-overview-label">עולם</span>${escapeHtml(book.setting.trim())}</div>`);
  }
  if (book.centralConflict?.trim()) {
    parts.push(`<div class="world-dict-overview-item"><span class="world-dict-overview-label">קונפליקט</span>${escapeHtml(book.centralConflict.trim())}</div>`);
  }
  if (book.theme?.trim()) {
    parts.push(`<div class="world-dict-overview-item"><span class="world-dict-overview-label">נושא</span>${escapeHtml(book.theme.trim())}</div>`);
  }
  if (!parts.length) return '';
  return `<div class="world-dict-overview">${parts.join('')}</div>`;
}

function renderWorldDictionaryContent() {
  const el = document.getElementById('world-dict-content');
  if (!el) return;

  ensureMemoryBook();
  const mb = state.memoryBook;
  const overview = renderWorldDictionaryOverview();
  const items = mb[worldDictActiveTab] || [];
  const tabMeta = WORLD_DICT_TABS.find(t => t.id === worldDictActiveTab);

  let body = '';
  if (!items.length) {
    body = `<p class="world-dict-empty">${worldDictEmptyMessage(worldDictActiveTab)}</p>`;
  } else if (worldDictActiveTab === 'characters') {
    body = items.map(c => `
      <article class="world-dict-card">
        <div class="world-dict-card-head">
          <h3 class="world-dict-card-title">${escapeHtml(c.name || 'ללא שם')}</h3>
          ${c.role ? `<span class="world-dict-pill">${escapeHtml(c.role)}</span>` : ''}
          ${c.status ? `<span class="world-dict-pill status">${escapeHtml(c.status)}</span>` : ''}
        </div>
        ${c.notes?.trim() ? `<p class="world-dict-card-body">${escapeHtml(c.notes.trim())}</p>` : ''}
      </article>`).join('');
  } else if (worldDictActiveTab === 'locations') {
    body = items.map(l => `
      <article class="world-dict-card">
        <h3 class="world-dict-card-title">${escapeHtml(l.name || 'מקום')}</h3>
        ${l.description?.trim() ? `<p class="world-dict-card-body">${escapeHtml(l.description.trim())}</p>` : ''}
        ${l.significance?.trim() ? `<p class="world-dict-card-meta">${escapeHtml(l.significance.trim())}</p>` : ''}
      </article>`).join('');
  } else if (worldDictActiveTab === 'keyObjects') {
    body = items.map(o => `
      <article class="world-dict-card">
        <div class="world-dict-card-head">
          <h3 class="world-dict-card-title">${escapeHtml(o.name || 'חפץ')}</h3>
          ${o.status ? `<span class="world-dict-pill">${escapeHtml(o.status)}</span>` : ''}
        </div>
        ${o.description?.trim() ? `<p class="world-dict-card-body">${escapeHtml(o.description.trim())}</p>` : ''}
        ${o.owner ? `<p class="world-dict-card-meta">בעלים: ${escapeHtml(o.owner)}</p>` : ''}
      </article>`).join('');
  } else if (worldDictActiveTab === 'worldRules') {
    body = items.map(r => `
      <article class="world-dict-card">
        <p class="world-dict-card-body rule">${escapeHtml(r.rule || '')}</p>
        <p class="world-dict-card-meta">${r.establishedInChapter ? `מוכר מפרק ${r.establishedInChapter}` : ''}${r.notes?.trim() ? ` · ${escapeHtml(r.notes.trim())}` : ''}</p>
      </article>`).join('');
  } else if (worldDictActiveTab === 'openMysteries') {
    body = items.map(m => `
      <article class="world-dict-card mystery">
        <p class="world-dict-card-body">${escapeHtml(m.question || m.description || '')}</p>
        <div class="world-dict-card-head">
          ${m.status ? `<span class="world-dict-pill status">${escapeHtml(m.status)}</span>` : ''}
          ${m.introducedChapter != null ? `<span class="world-dict-pill">מפרק ${m.introducedChapter}</span>` : ''}
        </div>
        ${m.clues?.trim() ? `<p class="world-dict-card-meta">רמזים: ${escapeHtml(m.clues.trim())}</p>` : ''}
      </article>`).join('');
  }

  el.innerHTML = `
    ${overview}
    <h3 class="world-dict-section-title">${tabMeta?.icon || ''} ${tabMeta?.label || ''}</h3>
    <div class="world-dict-cards">${body}</div>`;
}

function worldDictEmptyMessage(tabId) {
  const written = state.chapters?.length || 0;
  if (!written) return 'העולם יתמלא בהמשך — אחרי הפרק הראשון יופיעו כאן פרטים חדשים.';
  const map = {
    characters: 'עדיין אין דמויות מתועדות — יתעדכן עם התקדמות הסיפור.',
    locations: 'טרם נרשמו מקומות — יתגלו בפרקים הבאים.',
    keyObjects: 'אין חפצים מרכזיים מתועדים עדיין.',
    worldRules: 'כללי העולם יופיעו כאן עם התפתחות העלילה.',
    openMysteries: 'אין תעלומות פתוחות כרגע — אולי זה הסימן שהכול ברור… לעת עתה.'
  };
  return map[tabId] || 'אין רשומות בקטגוריה זו.';
}
