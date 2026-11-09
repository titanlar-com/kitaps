import { defineConfig, devices } from '@playwright/test';

// The screenshots of the screens (ADR 003, K11). They are taken of a build with a frozen cut of
// the data (`npm run test:visual`), and compared only on the Linux image named in
// scripts/visual-linux.sh and .github/workflows/pages.yml, because fonts render differently
// elsewhere. A change meant to be seen is recorded with scripts/visual-linux.sh update.
const port = Number(process.env.VISUAL_PORT) || 4619;

export default defineConfig({
  testDir: 'tests/visual',
  outputDir: 'test-results/visual',
  snapshotPathTemplate: 'tests/visual/baselines/{projectName}/{arg}{ext}',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: 'line',
  // WebKit needs longer than the default to settle on a large wood-textured page.
  expect: { timeout: 40_000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixels: 10 } },
  use: { baseURL: `http://127.0.0.1:${port}/`, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', reducedMotion: 'reduce', colorScheme: 'dark' },
  webServer: { command: `npx vite preview --outDir dist-visual --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}/`, reuseExistingServer: false, timeout: 60_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 } },
  ],
});
