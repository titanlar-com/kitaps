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
  // Linux WebKit under load paints a few frames a second, and the sheet leaves in step with them.
  await expect(page.locator('.detail-drawer .mantine-Drawer-content')).toHaveCount(0, { timeout: 20000 });
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
  expect(await page.evaluate(() => Boolean(document.querySelector('.sync-modal .mantine-Modal-content')?.contains(document.activeElement))), 'focus starts in the dialog').toBe(true);
  await page.evaluate(() => {
    window.__focusLanded = null;
    document.addEventListener('focusin', event => { if (!event.target.closest('.sync-modal')) window.__focusLanded = { dialogStillThere: Boolean(document.querySelector('.sync-modal .mantine-Modal-content')) }; }, true);
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__focusLanded !== null);
  expect(await page.evaluate(() => window.__focusLanded)).toEqual({ dialogStillThere: true });
});

test('a filter sheet keeps the section on screen while it leaves', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.getByRole('button', { name: /^Filtreler/ }).click();
  await page.locator('.filter-section-link').first().click();
  const title = page.locator('.filter-sheet .mantine-Drawer-title');
  await expect(title).not.toHaveText('Filtreler');
  const section = await title.innerText();
  await page.waitForTimeout(400);
  await record(page, () => document.querySelector('.filter-sheet .mantine-Drawer-title')?.textContent ?? null);
  await page.keyboard.press('Escape');
  await expect(page.locator('.filter-sheet .mantine-Drawer-content')).toHaveCount(0);
  const titles = await page.evaluate(() => window.__frames.filter(Boolean));
  expect(titles.length).toBeGreaterThan(1);
  expect([...new Set(titles)]).toEqual([section]);
  // Opened again, it starts from the list of sections.
  await page.getByRole('button', { name: /^Filtreler/ }).click();
  await expect(title).toHaveText('Filtreler');
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
  const surface = await stage.evaluate(element => { const style = getComputedStyle(element, '::before'); return { opacity: style.opacity, background: style.backgroundColor }; });
  expect(surface.opacity).toBe('1');
  expect(surface.background).not.toBe('rgba(0, 0, 0, 0)');
  const before = await stage.boundingBox();
  await release();
  await expect(img).toHaveCSS('opacity', '1');
  expect(await stage.boundingBox()).toEqual(before);
  await expect.poll(() => stage.evaluate(element => getComputedStyle(element, '::before').opacity)).toBe('0');
  const properties = await img.evaluate(element => getComputedStyle(element).transitionProperty);
  expect(properties).toContain('opacity');
});

test('a hover that is taken back continues from where the cover is', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  // The lift is only for a real pointer, which a phone does not report.
  test.skip(!(await page.evaluate(() => matchMedia('(hover: hover)').matches)), 'no hover here');
  // A very slow lift: Linux WebKit went three seconds with only two or three frames while this ran,
  // so a reversal of about a second started and ended between two of them. What is checked does not
  // depend on the length.
  const card = page.locator('.book-card').first();
  const img = card.locator('.cover-stage img');
  // Before the slow lift goes in, because the cover's own fade runs on the same duration.
  await expect(img).toHaveCSS('opacity', '1', { timeout: 20000 });
  await page.addStyleTag({ content: ':root{--motion-move:60000ms}' });
  // The watcher is in place before the pointer arrives, so a busy machine cannot miss the lift.
  // It stops the lift halfway, then notes where the transition that replaces it starts. It runs on a
  // timer because asking for the animations does not need a frame, and frames may not come.
  await img.evaluate(element => {
    window.__halfway = null; window.__from = null;
    const transform = other => element.getAnimations().find(item => item.transitionProperty === 'transform' && item !== other);
    const until = found => { if (!found()) setTimeout(until, 20, found); };
    until(() => {
      const lift = transform();
      if (!lift) return false;
      lift.pause(); lift.currentTime = 30000;
      window.__halfway = getComputedStyle(element).transform;
      until(() => {
        const next = transform(lift);
        if (next) window.__from = next.effect.getKeyframes()[0].transform;
        return Boolean(next);
      });
      return true;
    });
  });
  await card.hover();
  await page.waitForFunction(() => window.__halfway !== null, null, { polling: 50 });
  const halfway = await page.evaluate(() => window.__halfway);
  expect(halfway).not.toBe('none');
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => window.__from !== null, null, { polling: 50 });
  const from = await page.evaluate(() => window.__from);
  const height = value => page.evaluate(text => new DOMMatrix(text).m42, value);
  expect(await height(from)).toBeCloseTo(await height(halfway), 3);
  expect(await height(halfway)).toBeLessThan(0);
  expect(await height(halfway)).toBeGreaterThan(-3);
});
