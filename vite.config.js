import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

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
  if (id.includes('@mantine')) return 'mantine';
  if (id.includes('@tabler')) return 'icons';
  return undefined;
};

export default defineConfig(({ mode }) => {
  // `npm run export` builds one self-contained HTML file; the site is split.
  const standalone = mode === 'standalone';
  return {
    base: './',
    plugins: [
      react(),
      ...(standalone ? [viteSingleFile()] : [{
        // The page's text waits for the Latin Outfit file; preloading it starts the download with
        // the HTML instead of after the stylesheet. The standalone file carries its font inline.
        name: 'preload-interface-font',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler(html, ctx) {
            const font = Object.keys(ctx.bundle || {}).find(name => /outfit-latin-wght-normal[^/]*\.woff2$/.test(name));
            return font ? html.replace('</head>', `<link rel="preload" href="./${font}" as="font" type="font/woff2" crossorigin>\n</head>`) : html;
          }
        }
      }]),
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
