/**
 * Builds src/app.js — single bundled module from legacy js/*.js (load order).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyDir = path.join(root, 'js');

const ORDER = [
  'book.js', 'storage.js', 'prefs-export.js', 'shelf.js', 'creation-resume.js',
  'screens.js', 'api.js', 'book-create.js', 'chapters.js', 'library.js', 'world-dictionary.js', 'reading.js', 'utils.js'
];

const CONST_NAMES = [
  'STORAGE_KEY_V1', 'STORAGE_KEY', 'IDB_NAME', 'IDB_VERSION', 'IDB_STORE',
  'GEMINI_FETCH_TIMEOUT_MS', 'GEMINI_MIN_REQUEST_GAP_MS', 'GEMINI_MAX_REQUESTS_PER_MINUTE',
  'GEMINI_RATE_LIMIT_PAUSE_MS', 'SAVE_DEBOUNCE_MS', 'IMPORT_MAX_BYTES', 'EXPORT_FORMAT_VERSION',
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
    .replace(/\basync function /g, 'async function ')
    .replace(/\bfunction /g, 'function ');
}

function ns(s, names, prefix) {
  let out = s;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    // Spread: ...welcomeDraft → ...store.welcomeDraft (lookbehind skips dotted forms)
    out = out.replace(
      new RegExp(`\\.\\.\\.\\s*\\b${name}\\b`, 'g'),
      `...${prefix}.${name}`
    );
    // Skip object literal keys (e.g. readingLengthKey: 'short')
    out = out.replace(
      new RegExp(`(?<![.${prefix}])\\b${name}\\b(?!\\s*:)`, 'g'),
      `${prefix}.${name}`
    );
  }
  return out;
}

// Build constants.js
let cfgBody = stripBanner(fs.readFileSync(path.join(legacyDir, 'config.js'), 'utf8'));
cfgBody = cfgBody.replace(/\blet idbPromise[\s\S]*?let saveTimer = null;\n*/m, '');
const cr = fs.readFileSync(path.join(legacyDir, 'creation-resume.js'), 'utf8');
const api = fs.readFileSync(path.join(legacyDir, 'api.js'), 'utf8');
cfgBody = cfgBody.replace(/\bconst /g, 'export const ');
const pending = cr.match(/const PENDING_AUTO_RESUME_MS = [^;]+;\n/);
if (pending) cfgBody += '\n' + pending[0].replace('const ', 'export const ');
const loadingMsgs = cr.match(/const LOADING_STATUS_MESSAGES = \[[\s\S]*?\];\n/);
if (loadingMsgs) cfgBody += '\n' + loadingMsgs[0].replace('const ', 'export const ');
const minW = api.match(/const MIN_CHAPTER_WORDS[\s\S]*?PROSE_EXTEND_MAX_ROUNDS = \d+;\n/);
if (minW) cfgBody += '\n' + minW[0].replace(/const /g, 'export const ');

fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'constants.js'), `// App constants\n${cfgBody}\n`);

// book-model.js — minimal init helpers (hand-maintained shape; only write if missing)
const bookModelPath = path.join(root, 'src', 'book-model.js');
if (!fs.existsSync(bookModelPath)) {
  const bookLegacy = stripBanner(fs.readFileSync(path.join(legacyDir, 'book.js'), 'utf8'));
  const createFn = bookLegacy.match(/function createEmptyBookState\(\)[\s\S]*?^}/m)?.[0]
    .replace('function createEmptyBookState', 'export function createEmptyBookState') || '';
  const defaultFn = bookLegacy.match(/function defaultBookProfile\(\)[\s\S]*?^}/m)?.[0]
    .replace('function defaultBookProfile', 'export function defaultBookProfile') || '';
  fs.writeFileSync(bookModelPath, `${defaultFn}\n\n${createFn}\n`);
}

// store.js — hand-maintained (single mutable object for ESM)

// app.js body from all legacy files except config, globals, init
let body = '';
for (const file of ORDER) {
  let chunk = stripBanner(fs.readFileSync(path.join(legacyDir, file), 'utf8'));
  if (file === 'book.js') {
    chunk = chunk.replace(/function createEmptyBookState\(\)[\s\S]*?^}\n\n/m, '');
  }
  if (file === 'creation-resume.js') {
    chunk = chunk.replace(/^let creationResumeRunning = false;\n/m, '');
    chunk = chunk.replace(/^const PENDING_AUTO_RESUME_MS[\s\S]*?];\n\n/m, '');
    chunk = chunk.replace(/^const LOADING_STATUS_MESSAGES[\s\S]*?];\n\n/m, '');
  }
  if (file === 'api.js') {
    chunk = chunk.replace(/^const MIN_CHAPTER_WORDS[\s\S]*?PROSE_EXTEND_MAX_ROUNDS = \d+;\n\n/m, '');
  }
  body += `\n// --- ${file} ---\n${chunk}\n`;
}

body = exportFunctions(body);
body = ns(body, STORE_NAMES, 'store');
body = ns(body, CONST_NAMES, 'cfg');
body = body.replace(/\btypeof JSZip === 'undefined'/g, "typeof JSZip === 'undefined'");
body = body.replace(/\bnew JSZip\(\)/g, 'new JSZip()');

// bootstrapAppScreens from init.js (not in ORDER)
const initLegacy = stripBanner(fs.readFileSync(path.join(legacyDir, 'init.js'), 'utf8'));
const bootstrapFn = initLegacy.match(/function bootstrapAppScreens\(\)[\s\S]*?^}/m)?.[0] || '';
if (bootstrapFn) body += `\n// --- init.js ---\n${ns(ns(bootstrapFn, STORE_NAMES, 'store'), CONST_NAMES, 'cfg')}\n`;

const exports = [];
const fnRe = /(?:async )?function ([A-Za-z0-9_]+)\(/g;
let m;
while ((m = fnRe.exec(body))) exports.push(m[1]);
const uniqueExports = [...new Set([...exports, 'bootstrapAppScreens'])];

const appJs = `import JSZip from 'jszip';
import * as cfg from './constants.js';
import { store } from './store.js';
import * as bookModel from './book-model.js';

const createEmptyBookState = bookModel.createEmptyBookState;

${body}

export {
${uniqueExports.map(e => `  ${e}`).join(',\n')}
};
`;

fs.writeFileSync(path.join(root, 'src', 'app.js'), appJs);

// main.js
fs.writeFileSync(path.join(root, 'src', 'main.js'), `import '../styles.css';
import * as App from './app.js';
import { bindEvents } from './bind-events.js';
import { boot } from './boot.js';

bindEvents(App);
boot(App);
`);

// boot.js is hand-maintained in src/boot.js

// Remove old split modules
for (const f of fs.readdirSync(path.join(root, 'src'))) {
  if (['book.js', 'storage.js', 'prefs-export.js', 'shelf.js', 'creation-resume.js', 'screens.js',
    'api.js', 'book-create.js', 'chapters.js', 'library.js', 'reading.js', 'utils.js',
    'bootstrap.js', 'register-screens.js'].includes(f)) {
    fs.unlinkSync(path.join(root, 'src', f));
  }
}

console.log('Built src/app.js + main.js');
