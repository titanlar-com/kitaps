import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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
    await expect(favorites).toHaveAccessibleName('Favoriler: 2 kitap');
    await expect(library).toHaveAccessibleName('Kitaplığım: 1 kitap');
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

// While the marker catches up with tabs that reflow (here: text enlarged as the page loads), it
// must never push the page sideways, not even for a frame (book-fairs and bookstores 200% tests).
test('at 320 px with 200% text the marker never pushes the page sideways while it settles', async ({ browser }) => {
  for (const url of ['./', './?view=fairs', './?view=bookstores']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; });
      window.__widest = 0;
      const sample = () => { window.__widest = Math.max(window.__widest, document.documentElement.scrollWidth - window.innerWidth); requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
    });
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__widest), `${url}: the widest overflow in any frame`).toBe(0);
    await context.close();
  }
});

// Review of 8 November 2026: the badge sits on its button, so it must not take the click, and a
// long count must not run onto the next button.
test('a click on a counter badge opens its shelf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('./');
  const badge = await page.locator('.header-favorites-count .mantine-Indicator-indicator').boundingBox();
  await page.mouse.click(badge.x + badge.width / 2, badge.y + badge.height / 2);
  await expect(page).toHaveURL(/view=favorites/);
});

test('at 320 px long counts stay on their own button', async ({ browser }) => {
  // 120 favourites and 150 purchases, from the catalogue's own ids.
  const ids = JSON.parse(fs.readFileSync(new URL('../../src/catalog.json', import.meta.url))).books.map(book => book.id);
  const states = Object.fromEntries(ids.slice(0, 150).map((id, index) => [id, index < 120 ? ['onemli', 'alindi'] : ['alindi']]));
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  await context.addInitScript(seed => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('kitapatlasi:states:v2', seed); } }, JSON.stringify(states));
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.locator('.header-favorites')).toHaveAccessibleName('Favoriler: 120 kitap');
  await expect(page.locator('.header-favorites-count .mantine-Indicator-indicator')).toHaveText('99+');
  const badge = await page.locator('.header-favorites-count .mantine-Indicator-indicator').boundingBox();
  const next = await page.locator('.header-library').boundingBox();
  expect(badge.x + badge.width, 'the favourites badge ends before the library button').toBeLessThanOrEqual(next.x + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test('in forced colours the section marker takes the system highlight', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates forced colours in Chromium only.');
  const context = await browser.newContext({ forcedColors: 'active', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('./');
  const colours = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.background = 'Highlight';
    const highlight = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { highlight, marker: getComputedStyle(document.querySelector('.main-tabs-indicator'), '::before').backgroundColor };
  });
  expect(colours.marker).toBe(colours.highlight);
  await context.close();
});
