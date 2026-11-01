// Inline stroke icons for toolbar and status controls (replaces emoji, which render differently per OS)
const PATHS = {
  back: '<path d="M9 6l6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  textSmaller: '<path d="M4 18l5-12 5 12M5.7 14h6.6M16 12h5"/>',
  textLarger: '<path d="M3 18l5-12 5 12M4.7 14h6.6M15 12h6M18 9v6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  rotate: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 3h4M13 21h4"/>',
  rotateBack: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 9v4M21 11v4"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
}

/** Fills every [data-icon] placeholder in the static markup */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
}
