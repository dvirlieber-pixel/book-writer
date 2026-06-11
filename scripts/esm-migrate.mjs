/**
 * js/*.js → src/*.js ES modules (store.* + cfg.* namespaces).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyDir = path.join(root, 'js');
const srcDir = path.join(root, 'src');

const CONST_NAMES = [
  'STORAGE_KEY_V1', 'STORAGE_KEY', 'IDB_NAME', 'IDB_VERSION', 'IDB_STORE',
  'GEMINI_FETCH_TIMEOUT_MS', 'SAVE_DEBOUNCE_MS', 'IMPORT_MAX_BYTES', 'EXPORT_FORMAT_VERSION',
  'GENRES', 'TONES', 'AUTHORS', 'BOOK_REFS', 'LENGTH_PRESETS',
  'GEMINI_MODEL_PROSE', 'GEMINI_MODEL_LITE', 'GEMINI_MODEL_FLASH_FALLBACK',
  'GEMINI_PROSE_MODEL_CHAIN', 'GEMINI_LITE_MODEL_CHAIN', 'GEMINI_MODEL_LABELS',
  'GEMINI_RATE_LIMITS_URL', 'DEFAULT_TASTE_PROFILES',
  'PENDING_AUTO_RESUME_MS', 'LOADING_STATUS_MESSAGES',
  'MIN_CHAPTER_WORDS', 'PROSE_EXTEND_MAX_ROUNDS'
];

const STORE_NAMES = [
  'app', 'state', 'welcomeDraft', 'readingLengthKey', 'idbPromise', 'saveTimer',
  'pendingSequelSourceId', 'pendingSequelLengthKey', 'deferredInstallPrompt',
  'waitingSwWorker', 'wakeLock', 'shelfFilter', 'shelfSort', 'chapterGenQueue',
  'chapterGenPumpActive', 'bookCreationInFlight', 'creationResumeRunning'
];

function stripBanner(s) {
  return s.replace(/^\/\/[^\n]*\n+/, '');
}

function exportFunctions(s) {
  return s
    .replace(/\basync function /g, 'export async function ')
    .replace(/\bfunction /g, 'export function ')
    .replace(/export export /g, 'export ');
}

function namespaceIdentifiers(s, names, prefix) {
  let out = s;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![.${prefix}])\\b${name}\\b`, 'g');
    out = out.replace(re, `${prefix}.${name}`);
  }
  return out;
}

function transformBody(body, { dropLines = [] } = {}) {
  for (const re of dropLines) body = body.replace(re, '');
  body = exportFunctions(body);
  body = namespaceIdentifiers(body, STORE_NAMES, 'store');
  body = namespaceIdentifiers(body, CONST_NAMES, 'cfg');
  return body;
}

function writeConstants() {
  let body = stripBanner(fs.readFileSync(path.join(legacyDir, 'config.js'), 'utf8'));
  body = body.replace(/\blet idbPromise[\s\S]*?let saveTimer = null;\n*/m, '');
  body = body.replace(/\bconst /g, 'export const ');
  // PENDING + LOADING from creation-resume
  const cr = fs.readFileSync(path.join(legacyDir, 'creation-resume.js'), 'utf8');
  const pending = cr.match(/const PENDING_AUTO_RESUME_MS[\s\S]*?];\n/);
  if (pending) body += '\n' + pending[0].replace('const ', 'export const ');
  const api = fs.readFileSync(path.join(legacyDir, 'api.js'), 'utf8');
  const minW = api.match(/const MIN_CHAPTER_WORDS[\s\S]*?PROSE_EXTEND_MAX_ROUNDS = \d+;\n/);
  if (minW) body += '\n' + minW[0].replace(/const /g, 'export const ');
  fs.writeFileSync(path.join(srcDir, 'constants.js'), `// App constants\n${body}\n`);
}

function writeBookModel() {
  const book = stripBanner(fs.readFileSync(path.join(legacyDir, 'book.js'), 'utf8'));
  const end = book.indexOf('export function getBookProfile');
  const end2 = book.indexOf('function getBookProfile');
  const cut = end >= 0 ? end : end2;
  const chunk = book.slice(0, cut > 0 ? cut : book.indexOf('function genreDisplayLabel'));
  let body = transformBody(chunk, {});
  fs.writeFileSync(
    path.join(srcDir, 'book-model.js'),
    `import * as cfg from './constants.js';\n\n${body}\n`
  );
}

function writeBook() {
  const book = stripBanner(fs.readFileSync(path.join(legacyDir, 'book.js'), 'utf8'));
  const start = book.indexOf('function getBookProfile');
  let body = book.slice(start);
  body = transformBody(body);
  // Fix exportBookEpub JSZip
  body = body.replace(/\btypeof JSZip === 'undefined'/, "typeof globalThis.JSZip === 'undefined'");
  body = body.replace(/\bnew JSZip\(\)/g, 'new globalThis.JSZip()');
  fs.writeFileSync(
    path.join(srcDir, 'book.js'),
    `import JSZip from 'jszip';\nimport * as cfg from './constants.js';\nimport * as store from './store.js';\nimport * as bookModel from './book-model.js';\n\nglobalThis.JSZip = JSZip;\n\n${body}\n`
  );
}

function writeStore() {
  const globals = stripBanner(fs.readFileSync(path.join(legacyDir, 'globals.js'), 'utf8'));
  let body = globals
    .replace(/\blet /g, 'export let ')
    .replace(/\bconst chapterGenQueue/g, 'export const chapterGenQueue')
    .replace(/defaultBookProfile\(\)/g, 'bookModel.defaultBookProfile()')
    .replace(/createEmptyBookState\(\)/g, 'bookModel.createEmptyBookState()');
  body = `import * as bookModel from './book-model.js';\n\nexport let creationResumeRunning = false;\n\n${body}\n`;
  fs.writeFileSync(path.join(srcDir, 'store.js'), body);
}

function writeModule(name) {
  let body = stripBanner(fs.readFileSync(path.join(legacyDir, name), 'utf8'));
  const drops = [];
  if (name === 'creation-resume.js') {
    drops.push(/^let creationResumeRunning = false;\n/m, /^const PENDING_AUTO_RESUME_MS[\s\S]*?];\n\n/m);
  }
  if (name === 'api.js') {
    drops.push(/^const MIN_CHAPTER_WORDS[\s\S]*?PROSE_EXTEND_MAX_ROUNDS = \d+;\n\n/m);
  }
  body = transformBody(body, { dropLines: drops });
  fs.writeFileSync(
    path.join(srcDir, name),
    `import * as cfg from './constants.js';\nimport * as store from './store.js';\n\n${body}\n`
  );
}

function writeMain() {
  const init = stripBanner(fs.readFileSync(path.join(legacyDir, 'init.js'), 'utf8'));
  let body = transformBody(init.replace(/\/\/ ===== INIT =====\n/, ''));
  const main = `import '../styles.css';
import * as cfg from './constants.js';
import * as store from './store.js';
import { loadApp, save, syncAppFromState, flushSave } from './storage.js';
import { showError } from './utils.js';
import { updateOfflineBanner, showInstallUi, dismissInstallBanner, releaseWakeLock, tryResumePendingCreation, updateLandscapeToggleButton, enforceOrientationPolicy } from './prefs-export.js';
import { lockAppOrientation, applyReadingPrefs, applyWelcomeDefaults, renderTasteProfiles, updateWelcomeShelfLink, getStoredApiKey, updateApiKeyStatus, refreshModelFallbackNotice, expirePendingCreationIfStale } from './creation-resume.js';
import { renderShelf, renderLibrary, showScreen, bootstrapAppScreens } from './register-screens.js';
import { registerGlobals } from './register-globals.js';

registerGlobals();

${body}
`;
  fs.writeFileSync(path.join(srcDir, 'main.js'), main);
}

function writeRegisterGlobals() {
  const handlers = [
    'applyAppUpdate', 'dismissUpdateBanner', 'promptPwaInstall', 'dismissInstallBanner',
    'selectChoice', 'selectReadingLength', 'toggleApiKeyVisibility', 'startBookCreation',
    'startRandomBook', 'showShelf', 'toggleTheme', 'openWelcomeApiSettings', 'openWelcomeNewBook',
    'exportLibraryJson', 'onImportLibraryFile', 'onShelfFilterChange', 'onShelfSortChange',
    'selectSequelLength', 'confirmSequelBook', 'cancelSequelSetup', 'cancelPendingBookCreation',
    'readNextChapter', 'prepareNextChapter', 'showLibrary', 'adjustFontSize',
    'toggleReadingLandscape', 'toggleReadingImmersive', 'toggleWakeLock', 'closeChapterDrawer',
    'onApiKeyInput', 'saveApiKeyFromInput', 'setBookRating', 'deleteBookFromShelf'
  ];
  const imports = `import * as book from './book.js';
import * as storage from './storage.js';
import * as prefs from './prefs-export.js';
import * as shelf from './shelf.js';
import * as creation from './creation-resume.js';
import * as screens from './screens.js';
import * as bookCreate from './book-create.js';
import * as chapters from './chapters.js';
import * as library from './library.js';
import * as reading from './reading.js';
import * as utils from './utils.js';
`;
  const map = {
    selectChoice: 'book.selectChoice', selectReadingLength: 'book.selectReadingLength',
    setBookRating: 'book.setBookRating', exportLibraryJson: 'prefs.exportLibraryJson',
    onImportLibraryFile: 'prefs.onImportLibraryFile', toggleTheme: 'prefs.toggleTheme',
    adjustFontSize: 'prefs.adjustFontSize', toggleReadingImmersive: 'prefs.toggleReadingImmersive',
    toggleWakeLock: 'prefs.toggleWakeLock', toggleReadingLandscape: 'prefs.toggleReadingLandscape',
    updateOfflineBanner: 'prefs.updateOfflineBanner', showInstallUi: 'prefs.showInstallUi',
    dismissInstallBanner: 'prefs.dismissInstallBanner', promptPwaInstall: 'prefs.promptPwaInstall',
    showUpdateBanner: 'prefs.showUpdateBanner', dismissUpdateBanner: 'prefs.dismissUpdateBanner',
    applyAppUpdate: 'prefs.applyAppUpdate', releaseWakeLock: 'prefs.releaseWakeLock',
    enforceOrientationPolicy: 'prefs.enforceOrientationPolicy',
    onShelfFilterChange: 'shelf.onShelfFilterChange', onShelfSortChange: 'shelf.onShelfSortChange',
    showShelf: 'shelf.showShelf', continueBookFromShelf: 'shelf.continueBookFromShelf',
    openBookFromShelf: 'shelf.openBookFromShelf', openWelcomeNewBook: 'shelf.openWelcomeNewBook',
    getStoredApiKey: 'creation.getStoredApiKey', onApiKeyInput: 'creation.onApiKeyInput',
    saveApiKeyFromInput: 'creation.saveApiKeyFromInput', toggleApiKeyVisibility: 'creation.toggleApiKeyVisibility',
    openWelcomeApiSettings: 'creation.openWelcomeApiSettings', startRandomBook: 'creation.startRandomBook',
    cancelPendingBookCreation: 'creation.cancelPendingBookCreation', startBookCreation: 'bookCreate.startBookCreation',
    confirmSequelBook: 'bookCreate.confirmSequelBook', cancelSequelSetup: 'bookCreate.cancelSequelSetup',
    selectSequelLength: 'bookCreate.selectSequelLength', promptSequelBook: 'bookCreate.promptSequelBook',
    showScreen: 'screens.showScreen', showLibrary: 'screens.showLibrary', applyWelcomeDefaults: 'screens.applyWelcomeDefaults',
    readNextChapter: 'chapters.readNextChapter', prepareNextChapter: 'chapters.prepareNextChapter',
    renderLibrary: 'library.renderLibrary', closeChapterDrawer: 'reading.closeChapterDrawer',
    showError: 'utils.showError', deleteBookFromShelf: 'utils.deleteBookFromShelf', save: 'storage.save'
  };
  const lines = handlers.map(h => {
    const path = map[h] || `/* TODO ${h} */ null`;
    return `  ${h}: ${path.includes('TODO') ? 'undefined' : path},`;
  });
  fs.writeFileSync(
    path.join(srcDir, 'register-globals.js'),
    `${imports}\nexport function registerGlobals() {\n  Object.assign(window, {\n${lines.join('\n')}\n  });\n}\n`
  );
}

function writeRegisterScreens() {
  fs.writeFileSync(
    path.join(srcDir, 'register-screens.js'),
    `export { renderShelf } from './shelf.js';
export { renderLibrary } from './library.js';
export { showScreen, showLibrary } from './screens.js';
export { bootstrapAppScreens } from './bootstrap.js';
`
  );
}

function writeBootstrap() {
  const init = fs.readFileSync(path.join(legacyDir, 'init.js'), 'utf8');
  const m = init.match(/function bootstrapAppScreens\(\)[\s\S]*?^}/m);
  let fn = m ? m[0] : '';
  fn = exportFunctions(namespaceIdentifiers(namespaceIdentifiers(fn, STORE_NAMES, 'store'), CONST_NAMES, 'cfg'));
  fs.writeFileSync(
    path.join(srcDir, 'bootstrap.js'),
    `import * as store from './store.js';\nimport { renderShelf, openBookFromShelf, shelfCount } from './shelf.js';\nimport { renderLibrary } from './library.js';\nimport { showScreen } from './screens.js';\n\n${fn}\n`
  );
}

fs.mkdirSync(srcDir, { recursive: true });
writeConstants();
writeBookModel();
writeStore();
writeBook();
for (const f of fs.readdirSync(legacyDir)) {
  if (f.endsWith('.js') && !['config.js', 'globals.js', 'init.js', 'book.js'].includes(f)) {
    writeModule(f);
  }
}
writeBootstrap();
writeRegisterGlobals();
writeRegisterScreens();
writeMain();
console.log('ESM migration complete → src/');
