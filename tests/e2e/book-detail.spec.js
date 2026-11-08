import { test, expect } from '@playwright/test';

// The book page (docs/UI-REDESIGN.md, phase 4).
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const BOOK = './?book=good-to-great-by-jim-collins';
test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});
const luminance = locator => locator.evaluate(element => { const [r, g, b] = getComputedStyle(element).backgroundColor.match(/[\d.]+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; });
const seeded = (context, reading) => context.addInitScript(value => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('kitapatlasi:personal:v1', JSON.stringify(value)); }, { queue: [], reading });

test('the sheet is a layer above the page and its panels a layer above the sheet', async ({ page }) => {
  await page.goto(BOOK);
  const sheet = page.locator('.detail-drawer .mantine-Drawer-content');
  await expect(page.locator('.detail-hero')).toBeVisible();
  const floor = await page.evaluate(() => { const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; });
  const drawer = await luminance(sheet);
  const panel = await luminance(page.locator('.detail-actions'));
  expect(drawer).toBeGreaterThan(floor);
  expect(panel).toBeGreaterThan(drawer);
});

test('the actions come right after the heading, before the edition details', async ({ page }) => {
  await page.goto(BOOK);
  await expect(page.locator('.detail-actions')).toBeVisible();
  const order = await page.locator('.detail-content').evaluate(root => [...root.children].map(child => child.className));
  const hero = order.findIndex(name => name.includes('detail-hero'));
  const actions = order.findIndex(name => name.includes('detail-actions'));
  const edition = order.findIndex(name => name.includes('edition-summary'));
  expect(actions).toBe(hero + 1);
  expect(edition).toBeGreaterThan(actions);
});

test('the facts under the title are a labelled list', async ({ page }) => {
  await page.goto(BOOK);
  const item = page.locator('.detail-heading .mantine-DataList-item', { hasText: 'İlk yayın' });
  await expect(item).toContainText('2001');
});

test('a book being read shows its progress and history above the fold of the page', async ({ context, page }) => {
  await seeded(context, { 'goodtogreat': { startedAt: '2026-01-02', finishedAt: '2026-02-03', page: 75, totalPages: 300, why: '', apply: '' } });
  await page.goto(BOOK);
  const journey = page.locator('.reading-journey');
  await expect(journey).toContainText('75 / 300 sayfa');
  await expect(journey).toContainText('%25');
  await expect(journey).toContainText('2 Ocak 2026');
  const bars = await journey.locator('.mantine-Timeline-itemBullet, .mantine-Progress-root').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).borderTopLeftRadius)));
  expect(Math.max(...bars)).toBeLessThanOrEqual(5);
});

test('a book not started shows no empty progress block', async ({ page }) => {
  await page.goto(BOOK);
  await expect(page.locator('.detail-actions')).toBeVisible();
  await expect(page.locator('.reading-journey')).toHaveCount(0);
});

test('the purchase notice leaves the buttons next to the one just pressed free, on a phone too', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: test.info().project.use.baseURL });
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  const page = await context.newPage();
  await page.goto(BOOK);
  await page.getByRole('button', { name: 'Satın alındı', exact: true }).click();
  await expect(page.locator('.library-toast')).toBeVisible();
  await expect(page.locator('.library-toast')).toHaveCSS('opacity', '1');
  const next = page.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' });
  const covered = await next.evaluate(button => { const box = button.getBoundingClientRect(); const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return !button.contains(top); });
  expect(covered).toBe(false);
  await context.close();
});

for (const width of [320, 390, 1280]) {
  test(`at ${width} px the book page stays inside the sheet with readable text`, async ({ context, page }) => {
    await seeded(context, { 'goodtogreat': { startedAt: '2026-01-02', finishedAt: '', page: 75, totalPages: 300, why: '', apply: '' } });
    await page.setViewportSize({ width, height: 800 });
    await page.goto(BOOK);
    await expect(page.locator('.reading-journey')).toBeVisible();
    const check = await page.locator('.detail-drawer .mantine-Drawer-content').evaluate(sheet => {
      const box = sheet.getBoundingClientRect();
      const over = [...sheet.querySelectorAll('.detail-content *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > box.right + 0.5; }).length;
      const sizes = [...sheet.querySelectorAll('.detail-content *')].filter(e => e.children.length === 0 && e.textContent.trim() && e.getClientRects().length).map(e => parseFloat(getComputedStyle(e).fontSize));
      return { over, smallest: Math.min(...sizes) };
    });
    expect(check.over).toBe(0);
    expect(check.smallest).toBeGreaterThanOrEqual(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
