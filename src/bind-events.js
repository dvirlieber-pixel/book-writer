const WITH_ELEMENT = new Set(['selectChoice', 'selectReadingLength', 'selectSequelLength']);
const WITH_NUMERIC_ARG = new Set(['adjustFontSize']);

export function bindEvents(App) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const fn = App[action];
    if (typeof fn !== 'function') return;

    if (WITH_ELEMENT.has(action)) fn(el);
    else if (WITH_NUMERIC_ARG.has(action)) fn(parseFloat(el.dataset.arg, 10));
    else if (action === 'setBookRating') fn(parseInt(el.dataset.rating, 10));
    else fn();
  });

  const apiKey = document.getElementById('api-key-input');
  if (apiKey) {
    apiKey.addEventListener('input', () => App.onApiKeyInput());
    apiKey.addEventListener('blur', () => App.saveApiKeyFromInput());
  }

  const shelfFilter = document.getElementById('shelf-filter');
  if (shelfFilter) {
    shelfFilter.addEventListener('change', () => App.onShelfFilterChange(shelfFilter.value));
  }

  const shelfSort = document.getElementById('shelf-sort');
  if (shelfSort) {
    shelfSort.addEventListener('change', () => App.onShelfSortChange(shelfSort.value));
  }

  const importFile = document.getElementById('import-library-file');
  if (importFile) {
    importFile.addEventListener('change', (e) => App.onImportLibraryFile(e));
  }
}
