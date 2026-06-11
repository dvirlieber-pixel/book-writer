import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');

html = html.replace(/\s+onclick="selectChoice\(this\)"/g, ' data-action="selectChoice"');
html = html.replace(/\s+onclick="selectReadingLength\(this, '[^']+'\)"/g, ' data-action="selectReadingLength"');
html = html.replace(/\s+onclick="selectSequelLength\(this, '[^']+'\)"/g, ' data-action="selectSequelLength"');
html = html.replace(/\s+onclick="adjustFontSize\((-?[\d.]+)\)"/g, ' data-action="adjustFontSize" data-arg="$1"');
html = html.replace(/\s+onclick="([a-zA-Z][a-zA-Z0-9]*)\(\)"/g, ' data-action="$1"');
html = html.replace(/\s+oninput="onApiKeyInput\(\)"/g, '');
html = html.replace(/\s+onblur="saveApiKeyFromInput\(\)"/g, '');
html = html.replace(/\s+onchange="onShelfFilterChange\(this\.value\)"/g, '');
html = html.replace(/\s+onchange="onShelfSortChange\(this\.value\)"/g, '');
html = html.replace(/\s+onchange="onImportLibraryFile\(event\)"/g, '');
html = html.replace(
  /<input type="file" accept="application\/json,\.json"/,
  '<input type="file" id="import-library-file" accept="application/json,.json"'
);

fs.writeFileSync(file, html);
console.log('Stripped inline handlers from index.html');
