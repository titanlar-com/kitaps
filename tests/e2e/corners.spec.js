import { test, expect } from '@playwright/test';

// Owner's rule of 8 November 2026: no corner anywhere is rounder than 5 px, the library's own
// components and drawn parts (pseudo-elements) included.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kitapatlasi:states:v2', JSON.stringify({ goal: ['onemli', 'alindi', 'okundu'], meditations: ['okunuyor'] }));
    localStorage.setItem('kitapatlasi:personal:v1', JSON.stringify({ queue: ['meditations'], reading: { meditations: { page: 10, totalPages: 100 } } }));
  });
});

const roundCorners = page => page.evaluate(() => {
  const found = new Set();
  const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
  const name = element => `${element.tagName.toLowerCase()}.${String(element.className?.baseVal ?? element.className).trim().split(/\s+/).slice(0, 3).join('.')}`;
  for (const element of document.querySelectorAll('body *')) {
    for (const pseudo of [null, '::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (pseudo && style.content === 'none') continue;
      for (const corner of corners) {
        const value = style[corner];
        if (value === '0px') continue;
        if (value.includes('%') || value.split(' ').some(part => parseFloat(part) > 5.01)) found.add(`${name(element)}${pseudo ?? ''} ${corner} ${value}`);
      }
      // A small corner on a thin box still makes a pill: two radii that meet across its short side
      // (review of 8 November 2026).
      if (!pseudo) {
        const box = element.getBoundingClientRect();
        const short = Math.min(box.width, box.height);
        const radius = Math.max(...corners.map(corner => parseFloat(style[corner]) || 0));
        if (short > 0 && radius > 0 && 2 * radius >= short - 0.01) found.add(`${name(element)} is a pill: radius ${radius}px on a ${short.toFixed(1)}px side`);
      }
    }
  }
  return [...found];
});

const PAGES = [
  ['the catalogue', './', null],
  ['a book', './?book=good-to-great-by-jim-collins', null],
  // A collapsed section hides its bar (a 0 px box); the reading section is opened before the scan.
  ['a book with reading progress', './?book=meditations-by-marcus-aurelius', page => page.getByRole('button', { name: 'Okuma kaydım ve kişisel notlarım' }).click()],
  ['the priority summary', './', page => page.getByRole('button', { name: /Okuma önceliğine göre sıralı/ }).click()],
  ['the queue', './?view=queue', null],
  ['the collections', './?view=collections', null],
  ['the owned shelf', './?view=library', null],
  ['the bookstores', './?view=bookstores', null],
  ['the fairs', './?view=fairs', null],
  ['the filters', './', page => page.getByRole('button', { name: /^Filtreler/ }).click()],
  ['the footer menu', './', page => page.locator('.footer-dock').click()],
];
for (const width of [320, 390, 1280]) {
  for (const [what, url, open] of PAGES) {
    test(`at ${width} px no corner on ${what} is rounder than 5 px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(page.locator('main')).toBeVisible();
      // A page that loads on demand is scanned once it has arrived.
      await expect(page.locator('.page-loading')).toHaveCount(0);
      if (open) { await open(page); await page.waitForTimeout(400); }
      expect(await roundCorners(page)).toEqual([]);
    });
  }
}
