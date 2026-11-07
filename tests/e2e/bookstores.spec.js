import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The bookstores page and its place in the header: four sections side by side on a phone and
// beside the wordmark on a wide screen (owner's request, 7 November 2026).
const data = JSON.parse(readFileSync(new URL('../../data/bookstores.json', import.meta.url), 'utf8'));
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const SECTIONS = ['Kitaplar', 'Sıram', 'Kümeler', 'Kitapçılar'];

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

// The tabs' boxes, and whether each label shows whole on one line.
const tabs = page => page.locator('.main-tabs .mantine-Tabs-tab').evaluateAll(nodes => nodes.map(node => {
  const box = node.getBoundingClientRect(); const label = node.querySelector('.mantine-Tabs-tabLabel');
  const line = parseFloat(getComputedStyle(label).lineHeight) || parseFloat(getComputedStyle(label).fontSize) * 1.5;
  return { name: label.textContent.trim(), top: Math.round(box.top), left: box.left, right: box.right, whole: label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().height <= line * 1.4 && box.right <= innerWidth + .5 };
}));

for (const width of [320, 360, 375, 390, 430, 575]) {
  test(`on a ${width} px phone the four sections sit side by side, each label whole`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const row = await tabs(page);
    expect(row.map(tab => tab.name)).toEqual(SECTIONS);
    expect(new Set(row.map(tab => tab.top)).size, 'one row').toBe(1);
    expect(row.filter(tab => !tab.whole).map(tab => tab.name), 'labels cut or wrapped').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
  });
}

for (const width of [896, 1024, 1280, 1920]) {
  test(`at ${width} px the four sections sit beside the wordmark`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const row = await tabs(page);
    expect(row.map(tab => tab.name)).toEqual(SECTIONS);
    expect(new Set(row.map(tab => tab.top)).size, 'one row').toBe(1);
    expect(row.filter(tab => !tab.whole).map(tab => tab.name)).toEqual([]);
    const brand = await page.locator('.brand-link').boundingBox();
    const shortcuts = await page.locator('.header-shortcuts').boundingBox();
    expect(row[0].left, 'after the wordmark').toBeGreaterThan(brand.x + brand.width);
    expect(row[3].right, 'before the shortcuts').toBeLessThanOrEqual(shortcuts.x);
    const header = await page.locator('.site-header').boundingBox();
    expect(header.height, 'the header keeps one row').toBeLessThan(90);
  });
}

test('the Kitapçılar tab opens the page with the day’s route and every store from the notes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Kitapçılar' }).click();
  await expect(page).toHaveURL(/[?&]view=bookstores\b/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
  // The route walked on 7 November 2026, in order.
  const visit = page.locator('.bookstore-visit');
  await expect(visit.getByRole('heading', { level: 2 })).toContainText('7 Kasım 2026');
  await expect(visit.locator('ol > li h3')).toHaveText(['Minoa Pera', 'Mephisto Beyoğlu', 'Homer Kitabevi']);
  // Every store has its own entry, closed ones in their own part of the page.
  for (const store of data.stores) await expect(page.locator(`#store-${store.id}`), store.id).toHaveCount(1);
  await expect(page.locator('.bookstores-closed #store-remzi-suadiye')).toHaveCount(1);
  // Map links search the store by name and address; outside links open in a new tab.
  const map = page.locator('#store-minoa-pera').getByRole('link', { name: /Haritada aç/ });
  await expect(map).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Minoa%20Pera/);
  for (const link of await page.locator('.bookstores-page a[href^="http"]').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  }
  // A topic sends the reader to the store's entry on the same page: the page scrolls and focus
  // moves to the entry's heading. The address keeps the page, since the app reads its hash as a route.
  await page.locator('.bookstore-topics').getByRole('link', { name: 'Türkmen Kitabevi' }).click();
  const heading = page.locator('#store-turkmen-beyazit h3');
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(page).toHaveURL(/[?&]view=bookstores$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
});

test('the bookstores page keeps its text inside at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }));
  const page = await context.newPage();
  await page.goto('./?view=bookstores');
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
  const spilling = await page.locator('.bookstores-page').evaluate(root => [...root.querySelectorAll('h2, h3, p, dt, dd, a, li')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim().slice(0, 40)));
  expect(spilling).toEqual([]);
  // The four sections may share two rows at this size, but each stays on the screen.
  for (const tab of await tabs(page)) expect(tab.whole, tab.name).toBe(true);
  await context.close();
});
