import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { motionCss } from './src/motion.js';

const notices = ['FONT-LICENSES.txt']
  .map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n\n');
const catalog = JSON.parse(readFileSync(new URL('src/catalog.json', import.meta.url), 'utf8'));

// Libraries that change rarely get their own long-lived chunks, and the
// catalog data gets one of its own, so a code fix and a data update each
// invalidate only what changed.
const vendorChunk = id => {
  if (id.endsWith('/src/catalog.json')) return 'catalog';
  if (!id.includes('node_modules')) return undefined;
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
  // The quick search loads when it is asked for, so its package stays out of the first load.
  if (id.includes('@mantine/spotlight')) return undefined;
  if (id.includes('@mantine')) return 'mantine';
  if (id.includes('@tabler')) return 'icons';
  return undefined;
};

// The screenshots (tests/visual) are taken of a frozen cut of the data, so a new book moves nothing.
const FROZEN_DATA = [
  [/.*\/catalog\.json$/, 'tests/fixtures/characterization/catalog.json'],
  [/.*\/data\/bookstores\.json$/, 'tests/fixtures/visual/bookstores.json'],
  [/.*\/data\/book-fairs\.json$/, 'tests/fixtures/visual/book-fairs.json'],
].map(([find, file]) => ({ find, replacement: new URL(file, import.meta.url).pathname }));

export default defineConfig(({ mode }) => {
  // `npm run export` builds one self-contained HTML file; the site is split.
  const standalone = mode === 'standalone';
  return {
    base: './',
    resolve: { alias: process.env.KITAPLIK_FROZEN_DATA === '1' ? FROZEN_DATA : [] },
    plugins: [
      react(),
      ...(standalone ? [viteSingleFile()] : []),
      // The motion values reach the first response before any script or stylesheet (ADR 004).
      { name: 'motion-tokens', transformIndexHtml: html => html.replace('</head>', `<style>${motionCss()}</style></head>`) },
      {
        name: 'include-third-party-notices',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            return html
              .replaceAll('__BOOK_COUNT__', String(catalog.books.length))
              .replace('</head>', `<!-- Third-party notices\n${notices.replaceAll('--', '—')}\n-->\n</head>`);
          }
        }
      }
    ],
    build: standalone
      ? { outDir: 'dist-standalone' }
      // The catalog chunk is data (about 1.1 MB, 200 KB compressed), not code.
      : { chunkSizeWarningLimit: 1300, rollupOptions: { output: { manualChunks: vendorChunk } } },
  };
});
