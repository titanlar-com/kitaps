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

// The owner, 8 November 2026: a count has a border before the pointer comes, at 50% opacity.
test('a count shows a half-transparent border at rest and a solid one under the pointer, without moving', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A touch screen has no hover.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  const count = band(page).getByRole('button', { name: /^Sıramda/ });
  await expect(count).toBeVisible();
  const border = () => count.evaluate(element => { const style = getComputedStyle(element); return { width: style.borderTopWidth, style: style.borderTopStyle, colour: style.borderTopColor }; });
  const alpha = colour => { const match = colour.match(/\/\s*([\d.]+)\)$/) || colour.match(/rgba\([^)]*,\s*([\d.]+)\)$/); return match ? Number(match[1]) : 1; };
  const rest = await border();
  expect(rest.width).toBe('1px');
  expect(rest.style).toBe('solid');
  expect(alpha(rest.colour)).toBeCloseTo(0.5, 2);
  const before = await count.boundingBox();
  await count.hover();
  await expect.poll(async () => alpha((await border()).colour)).toBe(1);
  expect(await count.boundingBox()).toEqual(before);
});

// The owner, 8 November 2026: the labels go under the icons, which saves room at every width.
const rowLayout = page => page.evaluate(() => {
  const stats = [...document.querySelectorAll('.reading-summary-stat')];
  const list = document.querySelector('.reading-summary-stats');
  return {
    labelsBelow: stats.every(stat => { const icon = stat.querySelector('.reading-summary-icon').getBoundingClientRect(); const label = stat.querySelector('.reading-summary-label').getBoundingClientRect(); return label.top >= icon.bottom && Math.abs(label.left - icon.left) <= 1; }),
    valueBeside: stats.every(stat => { const icon = stat.querySelector('.reading-summary-icon').getBoundingClientRect(); const value = stat.querySelector('.reading-summary-value').getBoundingClientRect(); return value.left >= icon.right && value.top < icon.bottom; }),
    pageFits: document.documentElement.scrollWidth <= window.innerWidth,
    listScrolls: list.scrollWidth > list.clientWidth + 1,
  };
});
// The owner, 8 November 2026: on a small screen the counts take two rows, three above two, and
// nothing is cut off at the edge.
const rows = page => page.evaluate(() => {
  const tops = new Map();
  for (const stat of document.querySelectorAll('.reading-summary-stat')) { const top = Math.round(stat.getBoundingClientRect().top); tops.set(top, (tops.get(top) ?? 0) + 1); }
  return [...tops.values()];
});
for (const [width, expected] of [[320, [3, 2]], [360, [3, 2]], [390, [3, 2]], [430, [3, 2]], [576, [5]], [768, [5]], [1024, [5]], [1280, [5]], [1920, [5]]]) {
  test(`at ${width} px the counts stand ${expected.join(' over ')}, whole and with their labels under the icons`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(band(page)).toBeVisible();
    expect(await rows(page)).toEqual(expected);
    const row = await rowLayout(page);
    expect(row.labelsBelow).toBe(true);
    expect(row.valueBeside).toBe(true);
    expect(row.pageFits).toBe(true);
    expect(row.listScrolls, 'nothing is cut off and scrolled').toBe(false);
    // The rows reach both edges of the band, so no gap is left at the end of the second one.
    const edges = await page.evaluate(() => { const list = document.querySelector('.reading-summary-stats').getBoundingClientRect(); const stats = [...document.querySelectorAll('.reading-summary-stat')].map(stat => stat.getBoundingClientRect()); return { first: Math.abs(stats[0].left - list.left), last: Math.abs(stats[4].right - list.right) }; });
    expect(edges.first).toBeLessThanOrEqual(1);
    expect(edges.last).toBeLessThanOrEqual(1);
  });
}

// Seen on 9 November 2026 at about 800 px: "Okuyorum" and "Kitaplığım" broke inside the word.
for (const width of [320, 390, 768, 800, 900, 1024, 1280]) {
  test(`at ${width} px no count label breaks inside a word`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(band(page)).toBeVisible();
    const lines = await page.locator('.reading-summary-label').evaluateAll(labels => labels.map(label => {
      const range = document.createRange();
      range.selectNodeContents(label);
      return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size;
    }));
    expect(lines).toEqual([1, 1, 1, 1, 1]);
  });
}

// The owner, 8 November 2026: the band stood flush against the search field.
for (const width of [768, 1024]) {
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

// The owner, 9 November 2026: on a computer the search row and the band are one row, and the
// search field gives up the room it did not need.
const barBoxes = page => page.evaluate(() => {
  const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const field = document.querySelector('.catalog-search .mantine-Input-input');
  const style = getComputedStyle(field);
  const pen = document.createElement('canvas').getContext('2d');
  pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return {
    search: box('.catalog-search .mantine-Input-input'), filter: box('.search-tools .mantine-Button-root'), sort: box('.search-tools .mantine-Input-input'),
    share: box('.reading-summary-share'), count: box('.reading-summary-stat'), counts: box('.reading-summary-stats'), next: box('.reading-route'),
    placeholderRoom: field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - pen.measureText(field.placeholder).width,
    pageFits: document.documentElement.scrollWidth <= window.innerWidth,
  };
});
for (const width of [1200, 1280, 1440, 1920]) {
  test(`at ${width} px the search, its tools and the counts are one row`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'A phone stacks them.');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(band(page)).toBeVisible();
    const row = await barBoxes(page);
    const middle = box => (box.top + box.bottom) / 2;
    for (const part of [row.filter, row.sort, row.share, row.count]) expect(Math.abs(middle(part) - middle(row.search))).toBeLessThanOrEqual(2);
    for (const part of [row.filter, row.sort, row.count]) expect(Math.abs(part.height - row.search.height)).toBeLessThanOrEqual(1);
    expect(row.search.right).toBeLessThanOrEqual(row.filter.left);
    expect(row.filter.right).toBeLessThanOrEqual(row.sort.left);
    expect(row.sort.right).toBeLessThanOrEqual(row.share.left);
    expect(row.share.right).toBeLessThanOrEqual(row.counts.left);
    expect(row.search.width).toBeLessThanOrEqual(320);
    expect(row.placeholderRoom, 'the whole hint shows in the narrower field').toBeGreaterThanOrEqual(0);
    expect(row.next.top - row.count.bottom).toBeGreaterThanOrEqual(16);
    expect(row.pageFits).toBe(true);
    expect(await rows(page)).toEqual([5]);
  });
}

for (const width of [1024, 1199]) {
  test(`at ${width} px the band stays under the search row, as there is no room for both`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'A phone is checked above.');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(band(page)).toBeVisible();
    const row = await barBoxes(page);
    expect(row.count.top).toBeGreaterThan(row.search.bottom);
  });
}

// The owner, 8 November 2026: a reader waits only where the site says it is working. A new device
// has no marks of its own, so until the saved ones arrive a 0 would be a wrong number.
const holdingTheRead = async (browser, seed) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', async route => {
    if (route.request().url().includes('routes.json')) return route.fulfill({ status: 404, json: {} });
    const answer = await held;
    return answer === 'fail' ? route.abort() : route.fulfill({ json: EMPTY });
  });
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  if (seed) await context.addInitScript(() => localStorage.setItem('kitapatlasi:states:v2', JSON.stringify({ goal: ['alindi'] })));
  const page = await context.newPage();
  await page.goto('./');
  await expect(band(page)).toBeVisible();
  return { context, page, release };
};

test('on a new device the counts wait for the saved marks instead of showing 0', async ({ browser }) => {
  const { context, page, release } = await holdingTheRead(browser, false);
  await expect(band(page).getByRole('button', { name: 'Kitaplığım: yükleniyor' })).toBeVisible();
  await expect(band(page).locator('.reading-summary-wait')).toHaveCount(6);
  await expect(band(page).locator('.reading-summary-value')).toHaveCount(0);
  release('ok');
  await expect(band(page).getByRole('button', { name: 'Kitaplığım: 0 kitap' })).toBeVisible();
  await expect(band(page).locator('.reading-summary-wait')).toHaveCount(0);
  await context.close();
});

test('a device that has its own marks shows them while the read is under way', async ({ browser }) => {
  const { context, page, release } = await holdingTheRead(browser, true);
  await expect(band(page).getByRole('button', { name: 'Kitaplığım: 1 kitap' })).toBeVisible();
  await expect(band(page).locator('.reading-summary-wait')).toHaveCount(0);
  release('ok');
  await context.close();
});

test('a read that fails ends the wait', async ({ browser }) => {
  const { context, page, release } = await holdingTheRead(browser, false);
  await expect(band(page).locator('.reading-summary-wait').first()).toBeVisible();
  release('fail');
  await expect(band(page).getByRole('button', { name: 'Kitaplığım: 0 kitap' })).toBeVisible({ timeout: 20_000 });
  await context.close();
});

// The owner, 8 November 2026: with the labels under the icons the band fits a phone too.
for (const width of [320, 390, 768, 1280]) {
  test(`at ${width} px the catalogue opens with the reading band, and Sıram shows it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await expect(band(page)).toHaveCount(1);
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
for (const [width, height, shown] of [[844, 390, true], [915, 412, true], [767, 900, true], [768, 900, true]]) {
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
  await expect(page.locator('.filter-result-total')).toHaveCount(0, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__sheetTexts)).not.toContain('0 kitap eşleşiyor');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.purchases-note')).toHaveText('Satın aldığın kitaplar da listede, çünkü okuma işaretine göre süzdün.');
  // The note is announced with the result count.
  await expect(page.locator('.results-heading [role="status"] .purchases-note')).toHaveCount(1);
});
