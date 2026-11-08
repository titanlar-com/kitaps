import { test, expect } from '@playwright/test';

// What the address and the back button do (ADR 003, phase 7b). Pinned on the page as it was before
// it was bound to the Navigator, and kept: the binding must not change any of it.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: route.request().url().includes('routes.json') ? { schemaVersion: 1, updatedAt: EMPTY.updatedAt, routes: {} } : EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const entries = page => page.evaluate(() => history.length);
const address = page => page.evaluate(() => location.search + location.hash);
const firstTitle = page => page.locator('.books-grid .book-card .title-button').first();
const sheet = page => page.locator('.detail-drawer');
const sheetBack = page => sheet(page).getByRole('button', { name: 'Önceki kitaba dön' });
const openFirstBook = async page => {
  await firstTitle(page).click();
  await expect(sheet(page).getByRole('heading').first()).toBeVisible();
  await expect.poll(() => address(page)).toContain('book=');
};
const closeSheet = page => sheet(page).getByRole('button', { name: 'Kapat' }).first().click();
const openRelated = async page => {
  const related = sheet(page).locator('.related-card .title-button').first();
  await related.scrollIntoViewIfNeeded();
  await related.click();
};

test('a book opened from the catalogue is a history entry, and closing it goes back', async ({ page }) => {
  await page.goto('./?sort=title');
  await expect(firstTitle(page)).toBeVisible();
  const before = await entries(page);
  await openFirstBook(page);
  expect(await entries(page)).toBe(before + 1);
  await closeSheet(page);
  await expect.poll(() => address(page)).toBe('?sort=title');
  await expect(sheet(page)).toBeHidden();
  expect(await entries(page)).toBe(before + 1);
  await page.goForward();
  await expect.poll(() => address(page)).toContain('book=');
  await expect(sheet(page).getByRole('heading').first()).toBeVisible();
  // Reached with the forward button, it is closed where it stands: the entry stays.
  const again = await entries(page);
  await closeSheet(page);
  await expect.poll(() => address(page)).toBe('?sort=title');
  await expect(sheet(page)).toBeHidden();
  expect(await entries(page)).toBe(again);
});

test('the back button closes an open book', async ({ page }) => {
  await page.goto('./?sort=title');
  await expect(firstTitle(page)).toBeVisible();
  await openFirstBook(page);
  await page.goBack();
  await expect.poll(() => address(page)).toBe('?sort=title');
  await expect(sheet(page)).toBeHidden();
});

test('going from book to book stays in one entry, and the sheet walks back along them', async ({ page }) => {
  await page.goto('./?sort=title');
  await expect(firstTitle(page)).toBeVisible();
  await openFirstBook(page);
  const first = await address(page);
  const before = await entries(page);
  await expect(sheetBack(page)).toHaveCount(0);
  await openRelated(page);
  await expect.poll(() => address(page)).not.toBe(first);
  expect(await entries(page)).toBe(before);
  await sheetBack(page).click();
  await expect.poll(() => address(page)).toBe(first);
  await expect(sheetBack(page)).toHaveCount(0);
});

test('the back button forgets the books walked through, so the next book starts a new walk', async ({ page }) => {
  await page.goto('./?sort=title');
  await expect(firstTitle(page)).toBeVisible();
  await openFirstBook(page);
  await openRelated(page);
  await expect(sheetBack(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toBeHidden();
  await openFirstBook(page);
  await expect(sheetBack(page)).toHaveCount(0);
});

test('a book opened from an address is closed in place, without leaving the site', async ({ page }) => {
  await page.goto('./?sort=title');
  await expect(firstTitle(page)).toBeVisible();
  await openFirstBook(page);
  const direct = await address(page);
  await page.goto(`./${direct}`);
  await expect(sheet(page).getByRole('heading').first()).toBeVisible();
  const before = await entries(page);
  await closeSheet(page);
  await expect.poll(() => address(page)).toBe('?sort=title');
  expect(await entries(page)).toBe(before);
});

test('sorting and filtering change the address in place; a new page is an entry the back button undoes', async ({ page }) => {
  await page.goto('./');
  await expect(firstTitle(page)).toBeVisible();
  const before = await entries(page);
  await page.getByRole('textbox', { name: 'Katalogda ara' }).fill('strateji');
  await expect.poll(() => address(page)).toBe('?q=strateji');
  expect(await entries(page)).toBe(before);
  await page.getByRole('textbox', { name: 'Katalogda ara' }).fill('');
  await expect.poll(() => address(page)).toBe('');
  await page.getByRole('combobox', { name: 'Kitapları sırala' }).click();
  await page.getByRole('option', { name: 'Yazar · A–Z' }).click();
  await expect.poll(() => address(page)).toBe('?sort=author');
  expect(await entries(page)).toBe(before);
  await page.getByRole('combobox', { name: 'Kitapları sırala' }).click();
  await page.getByRole('option', { name: 'Yazar · A–Z' }).click();
  await expect.poll(() => address(page)).toBe('?sort=author');
  expect(await entries(page)).toBe(before);
  await page.goto('./?sort=title');
  await expect(firstTitle(page)).toBeVisible();
  const listed = await entries(page);
  await page.locator('a[href*="page=2"]').first().click();
  await expect.poll(() => address(page)).toBe('?sort=title&page=2');
  expect(await entries(page)).toBe(listed + 1);
  await page.goBack();
  await expect.poll(() => address(page)).toBe('?sort=title');
});

test('an address past the last page and an old shared address are corrected in place', async ({ page }) => {
  await page.goto('./?sort=title');
  await expect(firstTitle(page)).toBeVisible();
  await page.goto('./?sort=title&page=9999');
  await expect(firstTitle(page)).toBeVisible();
  await expect.poll(() => address(page)).toMatch(/^\?sort=title&page=\d{2,3}$/);
  const entriesAfter = await entries(page);
  expect(await address(page)).not.toContain('9999');
  await page.goto('./#overview');
  await expect.poll(() => address(page)).toBe('?view=collections');
  expect(await entries(page)).toBe(entriesAfter + 1);
});

test('the header switch and the brand keep their rules', async ({ page }) => {
  await page.goto('./?q=strateji&sort=title');
  await expect(firstTitle(page)).toBeVisible();
  const before = await entries(page);
  const hide = page.getByRole('switch', { name: 'Satın aldıklarımı gösterme' });
  await expect(hide).toBeChecked();
  await hide.uncheck({ force: true });
  expect(await address(page)).toBe('?q=strateji&sort=title');
  expect(await entries(page)).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('kitaplik:hide-owned:v1'))).toBe('off');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Satın aldıklarımı gösterme' })).not.toBeChecked();
  await page.locator('.brand-link').click();
  await expect.poll(() => address(page)).toBe('');
  await page.goBack();
  await expect.poll(() => address(page)).toBe('?q=strateji&sort=title');
});

test('the pages that carry their own data load it only when they are opened', async ({ page }) => {
  const requested = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  const lazy = name => requested.filter(path => new RegExp(`/assets/${name}-[^/]+\\.js$`).test(path));
  await page.goto('./');
  await expect(firstTitle(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  for (const name of ['BookstoresPage', 'BookFairsPage', 'NotesPage']) expect(lazy(name), name).toEqual([]);
  await page.goto('./?view=bookstores');
  await expect(page.getByRole('heading', { name: 'Kitapçılar', level: 1 })).toBeVisible();
  expect(lazy('BookstoresPage')).toHaveLength(1);
  expect(lazy('NotesPage')).toEqual([]);
  // The names above are real: each page's chunk is asked for when its page opens.
  await page.goto('./?view=fairs');
  await expect.poll(() => lazy('BookFairsPage').length).toBe(1);
  await page.goto('./?view=notes');
  await expect.poll(() => lazy('NotesPage').length).toBe(1);
});

test('each way to another page is one history entry', async ({ page }) => {
  await page.goto('./');
  await expect(firstTitle(page)).toBeVisible();
  const stepsTo = async (act, expected) => {
    const before = await entries(page);
    await act();
    await expect.poll(() => address(page)).toMatch(expected);
    expect(await entries(page), String(expected)).toBe(before + 1);
  };
  await stepsTo(() => page.getByRole('tab', { name: 'Sıram' }).click(), /^\?view=queue$/);
  await stepsTo(() => page.getByRole('tab', { name: 'Kümeler' }).click(), /^\?view=collections$/);
  await stepsTo(() => page.locator('.collection-books-button').first().click(), /^\?collection=/);
  await stepsTo(() => page.locator('.header-favorites').click(), /^\?view=favorites$/);
  await stepsTo(() => page.locator('.header-library').click(), /^\?view=library$/);
  await stepsTo(() => page.locator('.header-children').click(), /^\?category=children$/);
  await page.locator('.footer-dock').click();
  await stepsTo(() => page.locator('.footer-menu').getByRole('button', { name: 'Kitap fuarları' }).click(), /view=fairs/);
});
