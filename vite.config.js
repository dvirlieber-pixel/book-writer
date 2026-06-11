import { defineConfig } from 'vite';
import { resolve } from 'path';

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
