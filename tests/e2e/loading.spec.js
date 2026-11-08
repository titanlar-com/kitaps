import { test, expect } from '@playwright/test';

// The owner, 8 November 2026: a loading state keeps the reader on the site while it works.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

// Holds matching requests until the returned function is called.
async function hold(page, pattern) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(pattern, async route => { await gate; await route.continue(); });
  return release;
}

test('the first screen says the site is loading until the catalogue arrives', async ({ page }) => {
  const release = await hold(page, /assets\/catalog-.*\.js/);
  await page.goto('./', { waitUntil: 'commit' });
  const status = page.locator('#first-load');
  await expect(status).toBeVisible();
  await expect(status).toContainText('Kitaplık hazırlanıyor…');
  const size = await status.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeGreaterThanOrEqual(14);
  await release();
  await expect(page.locator('.book-card').first()).toBeVisible();
  await expect(status).toHaveCount(0);
});

test('a page that loads on demand shows the indicator with square bars until it arrives', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  const release = await hold(page, /assets\/BookstoresPage-.*\.js/);
  await page.goto('./?view=bookstores', { waitUntil: 'commit' });
  const status = page.getByRole('status').filter({ hasText: 'Kitapçılar yükleniyor…' });
  await expect(status).toBeVisible();
  const loader = status.locator('.mantine-Loader-root');
  await expect(loader).toBeVisible();
  // Its bars are under 4 px wide, so Mantine's 2 px corners would make them pills (owner's rule 5).
  const radii = await loader.evaluate(root => [root, ...root.querySelectorAll('*')].map(element => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0));
  expect(Math.max(...radii)).toBe(0);
  await release();
  await expect(status).toHaveCount(0);
});
