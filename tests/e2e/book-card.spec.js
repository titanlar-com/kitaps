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

test('a narrow window has no preview, so it cannot widen the page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A touch screen has no hover.');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('./');
  await page.locator('.book-card .book-visual').first().hover();
  await page.locator('.book-card .book-visual').first().evaluate(element => new Promise(resolve => element.addEventListener('animationend', resolve, { once: true }) || requestAnimationFrame(resolve)));
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
