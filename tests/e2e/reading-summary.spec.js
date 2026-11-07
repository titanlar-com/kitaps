import { test, expect } from '@playwright/test';

// The reading band (docs/UI-REDESIGN.md, phase 3). On a tablet or a computer the catalogue opens
// with it; a phone keeps its first screen for book titles (site.spec.js), so there the band sits
// at the top of Sıram, the reader's own page, where it shows at every width.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kitapatlasi:states:v2', JSON.stringify({ goal: ['alindi', 'okundu'], meditations: ['onemli', 'okunuyor'] }));
  });
});

const band = page => page.getByRole('region', { name: 'Okuma özetim' });

for (const [width, onCatalogue] of [[320, false], [390, false], [768, true], [1280, true]]) {
  test(`at ${width} px the catalogue ${onCatalogue ? 'opens with' : 'leaves out'} the reading band, and Sıram shows it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await expect(band(page)).toHaveCount(onCatalogue ? 1 : 0);
    await page.getByRole('tab', { name: 'Sıram' }).click();
    await expect(band(page)).toBeVisible();
    await expect(band(page).getByRole('button', { name: 'Okunan: 1 kitap' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('a count in the band opens its shelf', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await band(page).getByRole('button', { name: 'Kitaplığım: 1 kitap' }).click();
  await expect(page).toHaveURL(/view=library/);
  await page.goto('./');
  await band(page).getByRole('button', { name: 'Okuyorum: 1 kitap' }).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card .title-button')).toContainText('Kendime Düşünceler');
  // A read book that was purchased is listed too, although purchases are hidden while browsing.
  await page.goto('./');
  await band(page).getByRole('button', { name: 'Okunan: 1 kitap' }).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
});
