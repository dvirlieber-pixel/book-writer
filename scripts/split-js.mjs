import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const jsDir = path.join(root, 'js');

const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>\r?\n([\s\S]*?)<\/script>\r?\n<\/body>/);
if (!m) throw new Error('inline script not found');

const allLines = m[1].split(/\r?\n/);
const slice = (start, end) => allLines.slice(start - 2008, end - 2008 + 1).join('\n');

const parts = [
  {
    file: 'config.js',
    banner: '// Constants & presets',
    content: [slice(2009, 2055), slice(2073, 2091)].join('\n\n')
  },
  {
    file: 'book.js',
    banner: '// Book model, profile, sanitize, snapshot',
    content: slice(2093, 2610)
  },
  {
    file: 'globals.js',
    banner: '// Runtime mutable state (after book.js for hoisted helpers)',
    content: [slice(2019, 2020), slice(2057, 2071)].join('\n')
  },
  {
    file: 'storage.js',
    banner: '// IndexedDB & localStorage persistence',
    content: slice(2611, 2783)
  },
  {
    file: 'prefs-export.js',
    banner: '// Reading prefs, PWA banners, library import/export',
    content: slice(2785, 3088)
  },
  {
    file: 'shelf.js',
    banner: '// Shelf screen & navigation',
    content: slice(3089, 3283)
  },
  {
    file: 'creation-resume.js',
    banner: '// Pending creation, blueprint helpers, memory book',
    content: slice(3284, 3794)
  },
  {
    file: 'screens.js',
    banner: '// Screen routing',
    content: slice(3796, 3829)
  },
  {
    file: 'api.js',
    banner: '// Gemini API client',
    content: slice(3831, 4074)
  },
  {
    file: 'book-create.js',
    banner: '// New book & sequel creation',
    content: slice(4076, 4363)
  },
  {
    file: 'chapters.js',
    banner: '// Chapter generation pipeline',
    content: slice(4365, 5021)
  },
  {
    file: 'library.js',
    banner: '// Library screen rendering',
    content: slice(5023, 5148)
  },
  {
    file: 'reading.js',
    banner: '// Reading screen & chapter navigation',
    content: slice(5150, 5334)
  },
  {
    file: 'utils.js',
    banner: '// Shared UI helpers',
    content: slice(5336, 5374)
  },
  {
    file: 'init.js',
    banner: '// Bootstrap & event wiring',
    content: slice(5376, 5498)
  }
];

fs.mkdirSync(jsDir, { recursive: true });
for (const p of parts) {
  const body = `${p.banner}\n${p.content.trim()}\n`;
  fs.writeFileSync(path.join(jsDir, p.file), body, 'utf8');
}

const scriptTags = parts.map(p => `  <script src="js/${p.file}" defer></script>`).join('\n');
const styleMatch = html.match(/<style>\r?\n([\s\S]*?)<\/style>/);
if (styleMatch) {
  fs.writeFileSync(path.join(root, 'styles.css'), styleMatch[1].trim() + '\n', 'utf8');
}

let newHtml = html.replace(
  /<script>\r?\n[\s\S]*?<\/script>\r?\n<\/body>/,
  `${scriptTags}\n</body>`
);
if (styleMatch) {
  newHtml = newHtml.replace(
    /<style>\r?\n[\s\S]*?<\/style>/,
    '<link rel="stylesheet" href="styles.css">'
  );
}
fs.writeFileSync(htmlPath, newHtml, 'utf8');

console.log(`Wrote ${parts.length} JS files + styles.css and updated index.html`);
