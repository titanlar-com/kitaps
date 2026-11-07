import { test, expect } from '@playwright/test';

// The redesign's application shell (docs/UI-REDESIGN.md, phase 2, 8 November 2026): the
// shortcuts count favourites and purchases, a marker slides under the chosen section, and the
// header lifts off the page once the page scrolls.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  // Two favourites, one of them purchased.
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kitapatlasi:states:v2', JSON.stringify({ goal: ['onemli', 'alindi'], meditations: ['onemli'] }));
  });
});

for (const width of [320, 390, 1280]) {
  test(`at ${width} px the shortcuts show how many favourites and purchases there are`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const favorites = page.locator('.header-favorites');
    const library = page.locator('.header-library');
    await expect(favorites).toHaveAccessibleName('Favoriler · 2 kitap');
    await expect(library).toHaveAccessibleName('Kitaplığım · 1 kitap');
    await expect(page.locator('.header-favorites-count .mantine-Indicator-indicator')).toHaveText('2');
    await expect(page.locator('.header-library-count .mantine-Indicator-indicator')).toHaveText('1');
    // The count is part of the name, so screen readers do not read it twice.
    await expect(page.locator('.header-favorites-count .mantine-Indicator-indicator')).toHaveAttribute('aria-hidden', 'true');
    // Nothing spills out of the page at this width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`at ${width} px a marker slides under the chosen section`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const marker = page.locator('.main-tabs-indicator');
    const under = async name => {
      const tab = await page.getByRole('tab', { name }).boundingBox();
      await expect.poll(async () => {
        const box = await marker.boundingBox();
        return box && Math.abs(box.x - tab.x) <= 1 && Math.abs(box.width - tab.width) <= 1 && Math.abs((box.y + box.height) - (tab.y + tab.height)) <= 1;
      }, { message: `the marker sits under ${name}` }).toBe(true);
    };
    await under('Kitaplar');
    await page.getByRole('tab', { name: 'Kümeler' }).click();
    await under('Kümeler');
  });
}

test('the header lifts off the page once the page scrolls, and settles back at the top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  const header = page.locator('.site-header');
  await expect(header).not.toHaveAttribute('data-scrolled', 'true');
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-scrolled', 'true');
  await expect.poll(() => header.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(header).not.toHaveAttribute('data-scrolled', 'true');
});
