import { test, expect } from '@playwright/test';

// The book card (docs/UI-REDESIGN.md, phase 3): a layer above the floor, with its actions lined up
// across a row, and a preview for a mouse that is never the only way to the information.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});
const paint = (page, name) => page.evaluate(token => { const probe = document.createElement('div'); probe.style.color = `var(${token})`; document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; }, name);

test('a card is a layer above the floor', async ({ page }) => {
  await page.goto('./');
  const card = page.locator('.book-card').first();
  await expect(card).toBeVisible();
  expect(await card.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(await paint(page, '--surface'));
});

test('the actions of the cards in a row stand on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await expect(page.locator('.book-card').nth(3)).toBeVisible();
  const bottoms = await page.locator('.book-card').evaluateAll(cards => cards.slice(0, 4).map(card => Math.round(card.querySelector('.book-actions').getBoundingClientRect().bottom)));
  expect(new Set(bottoms).size).toBe(1);
});

test('a mouse over a cover previews why to read the book, and the preview cannot block a click', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A touch screen has no hover.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await page.locator('.book-card .book-visual').first().hover();
  const preview = page.locator('.book-preview');
  await expect(preview).toBeVisible();
  expect((await preview.innerText()).length).toBeGreaterThan(20);
  expect(await preview.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  const sizes = await preview.evaluate(root => [...root.querySelectorAll('*')].filter(e => e.textContent.trim() && !e.children.length).map(e => parseFloat(getComputedStyle(e).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
});

test('a search that finds nothing gets the empty shelf and a way back', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Katalogda ara' }).fill('zzqqxxkitapyok');
  const empty = page.locator('.desk-empty');
  await expect(empty).toContainText('Bu seçimde kitap yok.');
  await empty.getByRole('button', { name: 'Filtreleri temizle' }).click();
  await expect(page.locator('.book-card').first()).toBeVisible();
});

test('from tablet width a card keeps its inset, and every action is a full touch target', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('./');
  const card = page.locator('.book-card').first();
  await expect(card).toBeVisible();
  expect(await card.evaluate(element => getComputedStyle(element).paddingTop)).toBe('10px');
  const heights = await card.locator('.book-actions .mantine-ActionIcon-root').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
});

test('only a cover on the screen shows a moving placeholder, and it stops once the cover is there', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/\/covers\//, async route => { await gate; await route.continue(); });
  await page.goto('./');
  await expect(page.locator('.book-card')).toHaveCount(24);
  const waiting = page.locator('.cover-skeleton');
  await expect(waiting.first()).toBeVisible();
  // Four columns, and no more than two rows fit a screen of this height.
  expect(await waiting.count()).toBeLessThanOrEqual(8);
  await release();
  await expect(waiting).toHaveCount(0);
  const loops = await page.evaluate(() => document.getAnimations().filter(animation => animation.effect.getComputedTiming().iterations === Infinity).length);
  expect(loops).toBe(0);
});

test('a narrow window has no preview, so it cannot widen the page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A touch screen has no hover.');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('./');
  await page.locator('.book-card .book-visual').first().hover();
  // Nothing to wait for when it is right: this is longer than the preview's own delay.
  await page.waitForTimeout(500);
  await expect(page.locator('.book-preview')).toHaveCount(0);
});

test('a card opens from the keyboard without any preview', async ({ page, browserName }) => {
  await page.goto('./');
  const title = page.locator('.book-card .title-button').first();
  await title.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.book-preview')).toHaveCount(0);
  test.info().annotations.push({ type: 'browser', description: browserName });
});
