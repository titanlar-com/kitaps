import { test, expect } from '@playwright/test';

// What the site really runs (docs/ADR-004-motion.md, K8). Source checks cannot see inside a
// library; this walks the real pages and reads every running animation from the browser, so a
// new component that brings its own curve or duration fails here.
const CURVE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const ALLOWED_MS = new Set([150, 200, 300, 1200]);
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  // A transition's curve is on its timing, an animation's on its keyframes (checked in Chromium and WebKit).
  await context.addInitScript(() => {
    const seen = new Map();
    const describe = node => node ? `${node.tagName?.toLowerCase()}.${String(node.className?.baseVal ?? node.className).trim().split(/\s+/).slice(0, 2).join('.')}` : '?';
    const sample = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect;
        if (!effect) continue;
        const name = animation.transitionProperty ?? animation.animationName ?? 'script';
        const easing = animation.transitionProperty ? effect.getTiming().easing : [...new Set(effect.getKeyframes().slice(0, -1).map(frame => frame.easing))].join(' | ');
        const duration = effect.getComputedTiming().duration;
        seen.set(`${describe(effect.target)}${effect.pseudoElement ?? ''} ${name} ${duration} ${easing}`, { name, duration, easing });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    window.__motionSeen = seen;
  });
});

// A transition reversed halfway takes only part of its time, as CSS specifies, so its duration is
// a fraction; whole numbers are what a stylesheet or a library wrote.
const offenders = page => page.evaluate(([curve, allowed]) => [...window.__motionSeen].filter(([, record]) => record.easing !== curve || (Number.isInteger(record.duration) && !allowed.includes(record.duration))).map(([key]) => key), [CURVE, [...ALLOWED_MS]]);
const seenCount = page => page.evaluate(() => window.__motionSeen.size);
const pause = page => page.waitForTimeout(450);

test('every animation met on a walk through the site uses the curve and a duration of the table', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  const card = page.locator('.book-card').first();
  await expect(card).toBeVisible();

  // Hover on a card, its controls and a hint.
  await card.hover(); await pause(page);
  await card.locator('.cover-owned').hover(); await pause(page);
  await page.mouse.move(0, 0); await pause(page);

  // The section marker.
  await page.locator('.main-tabs').getByRole('tab').nth(2).click(); await pause(page);
  await page.locator('.main-tabs').getByRole('tab').first().click(); await pause(page);
  await expect(page.locator('.book-card').first()).toBeVisible();

  // The switch, a sheet, its choices.
  await page.locator('.mantine-Switch-root').first().click(); await pause(page);
  await page.locator('.mantine-Switch-root').first().click(); await pause(page);
  await page.getByRole('button', { name: /^Filtreler/ }).click(); await pause(page);
  await page.keyboard.press('Escape'); await pause(page);

  // A book: the sheet, a section, the notice.
  await page.locator('.cover-open').first().click(); await pause(page);
  await page.getByRole('button', { name: 'Okuma kaydım ve kişisel notlarım' }).click(); await pause(page);
  await page.getByRole('button', { name: 'Satın alındı', exact: true }).click(); await pause(page);
  await page.keyboard.press('Escape'); await pause(page);

  // A dropdown, the footer menu, a dialog.
  await page.getByRole('combobox', { name: 'Kitapları sırala' }).click(); await pause(page);
  await page.keyboard.press('Escape'); await pause(page);
  await page.locator('.footer-dock').click(); await pause(page);
  await page.getByRole('button', { name: 'Cihaz eşitleme' }).click(); await pause(page);
  await page.keyboard.press('Escape'); await pause(page);

  const seen = await seenCount(page);
  const found = await offenders(page);

  expect(seen, 'the walk met animations').toBeGreaterThan(5);
  expect(found).toEqual([]);
});

test('a saved route\'s check box takes the control timing', async ({ page, context }) => {
  const route = { id: 'deneme', title: 'Deneme rotası', date: null, stops: [], note: '', done: false };
  // An unsent route: the empty shared file must not take it away.
  await context.addInitScript(value => localStorage.setItem('kitapatlasi:routes:pending:v1', value), JSON.stringify({ schemaVersion: 1, updatedAt: '2026-11-08T00:00:00.000Z', routes: { deneme: { updatedAt: '2026-11-08T00:00:00.000Z', value: route } } }));
  await page.goto('./?view=bookstores');
  const label = page.locator('.route-saved').getByText('Gezildi');
  await label.click(); await pause(page);
  await label.click(); await pause(page);
  expect(await seenCount(page), 'the box moved').toBeGreaterThan(1);
  expect(await offenders(page)).toEqual([]);
});
