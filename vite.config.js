import { defineConfig } from 'vite';
import { resolve, join, relative, sep } from 'path';
import { createHash } from 'crypto';
import fs from 'fs';

/**
 * Fills BUILD_VERSION / BUILD_ASSETS in dist/sw.js: the version is a hash of every built
 * file (so any change gets a fresh cache), the assets are Vite's hashed bundles to precache.
 */
function swManifest() {
  let outDir;
  return {
    name: 'sw-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const files = [];
      const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p !== swPath) files.push(p);
      });
      walk(outDir);
      files.sort();

      const hash = createHash('sha256');
      files.forEach(f => hash.update(relative(outDir, f)).update(fs.readFileSync(f)));
      const version = hash.digest('hex').slice(0, 12);
      const assets = files
        .map(f => relative(outDir, f).split(sep).join('/'))
        .filter(p => p.startsWith('assets/'))
        .map(p => `./${p}`);

      let sw = fs.readFileSync(swPath, 'utf8');
      const before = sw;
      sw = sw.replace(/^const BUILD_VERSION = .*$/m, `const BUILD_VERSION = '${version}';`);
      sw = sw.replace(/^const BUILD_ASSETS = .*$/m, `const BUILD_ASSETS = ${JSON.stringify(assets)};`);
      if (sw === before) throw new Error('sw-manifest: BUILD_VERSION / BUILD_ASSETS placeholders not found in sw.js');
      fs.writeFileSync(swPath, sw);
    }
  };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join('; ');

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    }
  },
  server: {
    port: 5173,
    open: true
  },
  plugins: [
    swManifest(),
    {
      name: 'csp-production',
      transformIndexHtml(html, ctx) {
        if (!ctx.bundle) return html;
        const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
        return html.replace('<head>', `<head>\n${tag}`);
      }
    }
  ]
});
