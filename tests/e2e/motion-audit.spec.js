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
  // Every transition and animation announces itself when it starts, so a slow machine that paints
  // few frames misses none. What it runs is read from its computed style at that moment.
  await context.addInitScript(() => {
    const seen = new Map();
    const SURFACES = ['detail-drawer', 'filter-sheet', 'sync-modal', 'library-toast'];
    const list = value => value.split(/,\s*(?![^()]*\))/);
    const ms = value => parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    const describe = node => `${node.tagName?.toLowerCase()}.${String(node.className?.baseVal ?? node.className).trim().split(/\s+/).slice(0, 2).join('.')}`;
    const note = (event, name, loop, entry) => {
      const holder = event.target.closest?.(SURFACES.map(item => `.${item}`).join(', '));
      const surface = holder ? SURFACES.find(item => holder.classList.contains(item)) : null;
      seen.set(`${surface ?? ''} ${describe(event.target)}${event.pseudoElement} ${name} ${entry.duration} ${entry.delay} ${entry.easing}`, { ...entry, loop, surface });
    };
    document.addEventListener('transitionrun', event => {
      const style = getComputedStyle(event.target, event.pseudoElement || undefined);
      const names = list(style.transitionProperty);
      const [durations, delays, easings] = [style.transitionDuration, style.transitionDelay, style.transitionTimingFunction].map(list);
      // A shorthand such as border-color starts its longhands; a name that cannot be matched is judged by every entry.
      const index = names.findIndex(item => item === 'all' || item === event.propertyName || event.propertyName.startsWith(`${item}-`));
      for (const at of index >= 0 ? [index] : names.keys()) note(event, event.propertyName, false, { duration: ms(durations[at % durations.length]), delay: ms(delays[at % delays.length]), easing: easings[at % easings.length] });
    }, true);
    document.addEventListener('animationstart', event => {
      const style = getComputedStyle(event.target, event.pseudoElement || undefined);
      const at = Math.max(0, list(style.animationName).indexOf(event.animationName));
      const value = text => { const items = list(text); return items[at % items.length]; };
      note(event, event.animationName, value(style.animationIterationCount) === 'infinite', { duration: ms(value(style.animationDuration)), delay: ms(value(style.animationDelay)), easing: value(style.animationTimingFunction) });
    }, true);
    window.__motionSeen = seen;
  });
});

// Only the loading bars have a delay: each runs one step ahead of the next.
const offenders = page => page.evaluate(([curve, allowed, step]) => [...window.__motionSeen].filter(([, record]) => {
  const delay = record.loop ? record.delay <= 0 && Number.isInteger(record.delay / step) : record.delay === 0;
  return record.easing !== curve || !allowed.includes(record.duration) || !delay;
}).map(([key]) => key), [CURVE, [...ALLOWED_MS], 120]);
const surfaces = page => page.evaluate(() => [...new Set([...window.__motionSeen.values()].map(record => record.surface).filter(Boolean))].sort());
const seenCount = page => page.evaluate(() => window.__motionSeen.size);
const pause = page => page.waitForTimeout(450);

for (const width of [1280, 320]) {
  test(`every animation met on a walk through the site at ${width} px uses the curve and a duration of the table`, async ({ page }) => {
    test.slow();
    const wide = width === 1280;
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const card = page.locator('.book-card').first();
    await expect(card).toBeVisible();

    if (wide) {
      // Hover on a card, its controls and a hint.
      await card.hover(); await pause(page);
      await card.locator('.cover-owned').hover(); await pause(page);
      await page.mouse.move(0, 0); await pause(page);

      // The section marker.
      await page.locator('.main-tabs').getByRole('tab').nth(2).click(); await pause(page);
      await page.locator('.main-tabs').getByRole('tab').first().click(); await pause(page);
      await expect(page.locator('.book-card').first()).toBeVisible();
    }

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

    // The colour panel.
    await page.getByRole('button', { name: 'Renk düzeni' }).click(); await pause(page);
    if (wide) { await page.locator('.wood-card').nth(1).hover(); await pause(page); }
    await page.locator('.wood-card').nth(1).click(); await pause(page);
    await page.keyboard.press('Escape'); await pause(page);

    // Every large surface really moved: one that stops animating would otherwise go unnoticed.
    expect(await surfaces(page)).toEqual(['detail-drawer', 'filter-sheet', 'library-toast', 'sync-modal']);
    expect(await offenders(page)).toEqual([]);
  });
}

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
