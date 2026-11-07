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
    localStorage.setItem('kitapatlasi:personal:v1', JSON.stringify({ queue: ['meditations'], reading: {} }));
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
    }
  }
  return [...found];
});

const PAGES = [
  ['the catalogue', './', null],
  ['a book', './?book=good-to-great-by-jim-collins', null],
  ['the queue', './?view=queue', null],
  ['the collections', './?view=collections', null],
  ['the owned shelf', './?view=library', null],
  ['the bookstores', './?view=bookstores', null],
  ['the fairs', './?view=fairs', null],
  ['the filters', './', page => page.getByRole('button', { name: /^Filtreler/ }).click()],
  ['the footer menu', './', page => page.locator('.footer-dock').click()],
];
for (const width of [390, 1280]) {
  for (const [what, url, open] of PAGES) {
    test(`at ${width} px no corner on ${what} is rounder than 5 px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(page.locator('main')).toBeVisible();
      if (open) { await open(page); await page.waitForTimeout(400); }
      expect(await roundCorners(page)).toEqual([]);
    });
  }
}
