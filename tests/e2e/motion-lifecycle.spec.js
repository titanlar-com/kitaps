import { test, expect } from '@playwright/test';

// State changes at once and the picture finishes its movement (docs/ADR-004-motion.md, K6).
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

// Records one reading per frame until the page is left.
const record = (page, read) => page.evaluate(source => {
  const reading = new Function(`return (${source})()`);
  window.__frames = [];
  const tick = () => { window.__frames.push(reading()); requestAnimationFrame(tick); };
  tick();
}, read.toString());

test('a closing book keeps its pages until the sheet has gone, and they can no longer be used', async ({ page }) => {
  await page.goto('./?book=goal');
  const content = page.locator('.detail-content');
  await expect(content.locator('h2')).toBeVisible();
  await page.waitForTimeout(400);
  await record(page, () => { const drawer = document.querySelector('.detail-drawer .mantine-Drawer-content'); const shown = document.querySelector('.detail-content'); return { search: location.search, drawer: Boolean(drawer), shown: Boolean(shown?.querySelector('h2')), inert: Boolean(shown?.inert) }; });
  await page.keyboard.press('Escape');
  await expect(page.locator('.detail-drawer .mantine-Drawer-content')).toHaveCount(0);
  const closing = (await page.evaluate(() => window.__frames)).filter(frame => frame.drawer && !frame.search.includes('book='));
  expect(closing.length, 'frames while the sheet leaves').toBeGreaterThan(1);
  expect(closing.filter(frame => !frame.shown || !frame.inert)).toEqual([]);
});

test('closing the sync dialog gives focus back without waiting for its exit', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.locator('.footer-dock').click();
  await page.getByRole('button', { name: 'Cihaz eşitleme' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  await record(page, () => { const modal = document.querySelector('.sync-modal .mantine-Modal-content'); return { modal: Boolean(modal), inside: Boolean(modal?.contains(document.activeElement)), root: document.querySelector('.sync-modal') !== null }; });
  await page.keyboard.press('Escape');
  await expect(page.locator('.sync-modal .mantine-Modal-content')).toHaveCount(0);
  const frames = await page.evaluate(() => window.__frames);
  const firstOutside = frames.findIndex(frame => !frame.inside);
  const lastModal = frames.map(frame => frame.modal).lastIndexOf(true);
  expect(firstOutside).toBeGreaterThan(-1);
  expect(firstOutside, 'focus leaves while the dialog is still leaving').toBeLessThan(lastModal);
});

test('a cover stays clear until it has loaded, then fades in, in a frame that does not change size', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/\/covers\//, async route => { await gate; await route.continue(); });
  await page.goto('./');
  const stage = page.locator('.cover-stage').first();
  await expect(stage).toBeVisible();
  const img = stage.locator('img');
  await expect(img).toHaveCSS('opacity', '0');
  // The frame shows a quiet surface meanwhile, so the shelf is not full of holes.
  expect(await stage.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  const before = await stage.boundingBox();
  await release();
  await expect(img).toHaveCSS('opacity', '1');
  expect(await stage.boundingBox()).toEqual(before);
  const properties = await img.evaluate(element => getComputedStyle(element).transitionProperty);
  expect(properties).toContain('opacity');
});

test('a hover that is taken back continues from where the cover is', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone has no hover');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  const card = page.locator('.book-card').first();
  const img = card.locator('.cover-stage img');
  await expect(img).toHaveCSS('opacity', '1');
  await card.hover();
  // Stops the lift halfway, so the reading does not depend on how busy the machine is.
  const halfway = await img.evaluate(element => { const lift = element.getAnimations().find(item => item.transitionProperty === 'transform'); lift.pause(); lift.currentTime = 100; return getComputedStyle(element).transform; });
  expect(halfway).not.toBe('none');
  await page.mouse.move(0, 0);
  const from = await img.evaluate(element => element.getAnimations().find(item => item.transitionProperty === 'transform')?.effect.getKeyframes()[0].transform);
  const height = value => page.evaluate(text => new DOMMatrix(text).m42, value);
  expect(await height(from)).toBeCloseTo(await height(halfway), 3);
  expect(await height(halfway)).toBeLessThan(0);
  expect(await height(halfway)).toBeGreaterThan(-3);
});
