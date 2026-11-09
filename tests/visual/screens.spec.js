import { test, expect } from '@playwright/test';

// What each screen looks like, on a frozen cut of the data and a fixed day (ADR 003, K11). A
// difference here is a change someone can see. If it is meant, it is recorded and reviewed.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
// One flat 2:3 cover for every book: the frame and the layout are what is compared here. It is
// 40 px wide because a smaller one reports a natural width of 0 at a high srcset density.
const COVER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAA8CAIAAACb22+3AAAAOElEQVR4nO3NQQkAAAgEsMtlJKOY2hgiDPZfputExGKxWCwWi8VisVgsFovFYrFYLBaLxWLxp3gBeN4P5pt/+joAAAAASUVORK5CYII=', 'base64');
const SIZES = [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]];
const BOOK = 'competitivestrategy';

const SCREENS = [
  { name: 'catalog', url: './?sort=title', ready: '.book-card' },
  { name: 'catalog-filtered', url: './?sort=title&q=strateji', ready: '.book-card' },
  { name: 'book', url: `./?sort=title&book=${BOOK}`, ready: '.detail-actions' },
  { name: 'filters', url: './?sort=title', ready: '.book-card', open: page => page.getByRole('button', { name: /^Filtreler/ }).click(), settled: '.filter-sheet-footer' },
  { name: 'queue', url: './?view=queue', ready: 'main h1' },
  { name: 'collections', url: './?view=collections', ready: 'main h1' },
  { name: 'bookstores', url: './?view=bookstores', ready: 'main h1' },
  { name: 'fairs', url: './?view=fairs', ready: 'main h1' },
  { name: 'favorites-empty', url: './?view=favorites', ready: 'main h1' },
];

test.beforeEach(async ({ page, context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  await context.route('**/covers/**', route => route.fulfill({ contentType: 'image/png', body: COVER }));
  await page.clock.setFixedTime(new Date('2026-11-09T10:00:00+03:00'));
});

const settle = async (page, selector) => {
  await expect(page.locator(selector).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.cover-skeleton:visible, .reading-summary-wait')).toHaveCount(0);
  // Covers in view have arrived, so none of them is caught on its way in.
  await page.waitForFunction(() => [...document.images].filter(image => image.getBoundingClientRect().top < innerHeight && image.getBoundingClientRect().bottom > 0).every(image => image.complete && image.naturalWidth > 0));
};

for (const [size, viewport] of SIZES) {
  for (const screen of SCREENS) {
    test(`${screen.name} on a ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(screen.url);
      await settle(page, screen.ready);
      if (screen.open) {
        await screen.open(page);
        await settle(page, screen.settled);
      }
      await expect(page).toHaveScreenshot(`${screen.name}-${size}.png`);
    });
  }
}

test('the catalogue in the light theme', async ({ page }) => {
  // A first visit clears the colour choice, so the wood is set too, as a returning reader has it.
  await page.addInitScript(() => { localStorage.setItem('kitapatlasi:wood', 'ceviz'); localStorage.setItem('kitapatlasi:color-scheme', 'light'); });
  await page.setViewportSize(SIZES[0][1]);
  await page.goto('./?sort=title');
  await settle(page, '.book-card');
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light');
  await expect(page).toHaveScreenshot('catalog-light-desktop.png');
});
