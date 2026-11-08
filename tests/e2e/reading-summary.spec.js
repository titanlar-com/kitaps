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

// The owner, 8 November 2026: the band stood flush against the search field.
for (const width of [768, 1024, 1280]) {
  test(`at ${width} px the reading band keeps its distance from the search field and from what follows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(band(page)).toBeVisible();
    const boxes = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      return { search: box('.search-panel').bottom, top: box('.reading-summary').top, bottom: box('.reading-summary').bottom, next: box('.reading-route').top };
    });
    expect(boxes.top - boxes.search).toBeGreaterThanOrEqual(16);
    expect(boxes.next - boxes.bottom).toBeGreaterThanOrEqual(16);
  });
}

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

// Review of 8 November 2026.
for (const [width, height, shown] of [[844, 390, false], [915, 412, false], [767, 900, false], [768, 900, true]]) {
  test(`at ${width} x ${height} the catalogue ${shown ? 'opens with' : 'leaves out'} the band`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await expect(band(page)).toHaveCount(shown ? 1 : 0);
  });
}

test('a count taken with the keyboard leaves focus on the main content, not lost on the page', async ({ page, browserName }) => {
  // Safari moves Tab between fields only; Option+Tab reaches every control, as in ui-quality.spec.js.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await expect(band(page)).toBeVisible();
  // Reach the count with Tab, as a keyboard reader does, so keyboard mode is on.
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press(tab);
    if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Okunan: 1 kitap')) break;
  }
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Okunan: 1 kitap');
  await page.keyboard.press('Enter');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main-content');
  expect(await page.evaluate(() => document.documentElement.dataset.focusMode)).toBe('keyboard');
  expect(await page.evaluate(() => document.getElementById('main-content').matches(':focus-visible'))).toBe(true);
});

test('on Sıram the queue comes first and the band after it; its own count stays on the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./?view=queue');
  await expect(band(page)).toBeVisible();
  const first = await page.evaluate(() => {
    const summary = document.querySelector('.reading-summary');
    const queue = document.querySelector('.reading-queue, [aria-label="Okuma sıram"], .queue-list, .queue-empty');
    return Boolean(queue) && Boolean(queue.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(first, 'the queue precedes the band').toBe(true);
  const before = await page.evaluate(() => history.length);
  await band(page).getByRole('button', { name: /^Sıramda:/ }).click();
  expect(await page.evaluate(() => history.length)).toBe(before);
  await expect(page).toHaveURL(/view=queue/);
  // A pointer user sees something happen: the page goes back to the top of the queue.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('with purchases hidden, a reading-mark filter counts and lists the purchased books and says so', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await expect(page.locator('.purchases-note')).toHaveCount(0);
  await page.getByRole('button', { name: /^Filtreler/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Okuma durumum/ }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: /^Okundu/ }).check({ force: true });
  // The sheet's live count already includes the purchased read book.
  await expect(page.locator('.filter-result-total')).toHaveText('1 kitap eşleşiyor');
  // While the sheet closes, its live line never reads 0 (review, 8 November 2026).
  await page.evaluate(() => {
    window.__sheetTexts = [];
    const line = document.querySelector('.filter-result-total');
    new MutationObserver(() => window.__sheetTexts.push(line.textContent)).observe(line, { subtree: true, characterData: true, childList: true });
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Kitapları göster' }).click();
  await expect(page.locator('.filter-result-total')).toHaveCount(0);
  expect(await page.evaluate(() => window.__sheetTexts)).not.toContain('0 kitap eşleşiyor');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.purchases-note')).toHaveText('Satın aldığın kitaplar da listede, çünkü okuma işaretine göre süzdün.');
  // The note is announced with the result count.
  await expect(page.locator('.results-heading [role="status"] .purchases-note')).toHaveCount(1);
});
