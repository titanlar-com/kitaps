import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The owner's standing interface rules (AGENT.md) and WCAG 2.2 AA, measured in a real browser:
// no control melts into its surface, no curved accent edge, no ring around a focused control,
// a visible keyboard focus bar that only Tab turns on, and one motion curve.
const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const isolate = context => Promise.all([
  context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY })),
  context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ json: { sha: 'empty', encoding: 'base64', content: Buffer.from(JSON.stringify(EMPTY)).toString('base64') } })),
]);
const VIEWS = { catalog: './', book: './?book=good-to-great-by-jim-collins', notes: './?view=notes', queue: './?view=queue', collections: './?view=collections' };

// Contrast helpers run in the page.
const measure = () => {
  const rgba = value => { const match = value.match(/rgba?\(([^)]+)\)/); if (!match) return null; const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }; };
  const luminance = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const behind = element => { for (let node = element.parentElement; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c && c.a > .5) return c; } return rgba(getComputedStyle(document.body).backgroundColor); };
  const shown = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0; };
  const weak = [];
  for (const element of new Set(document.querySelectorAll('.mantine-Button-root, .mantine-ActionIcon-root, button, [role="button"]'))) {
    if (!shown(element) || element.matches(':disabled, [data-disabled], [aria-disabled="true"]')) continue;
    const style = getComputedStyle(element); const fill = rgba(style.backgroundColor); const back = behind(element);
    if (!fill || fill.a <= .5) continue; // a text-only control is identified by its text
    const border = parseFloat(style.borderTopWidth) > 0 && rgba(style.borderTopColor)?.a > .5 ? ratio(rgba(style.borderTopColor), back) : 0;
    if (Math.max(ratio(fill, back), border) < 3) weak.push((element.getAttribute('aria-label') || element.textContent).trim().slice(0, 40));
  }
  const edges = [];
  for (const element of document.querySelectorAll('body *')) {
    if (!shown(element)) continue;
    const style = getComputedStyle(element);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ side, width: parseFloat(style[`border${side}Width`]), color: style[`border${side}Color`] }));
    const radius = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(corner => parseFloat(style[`border${corner}Radius`]));
    for (const line of sides.filter(entry => entry.width >= 2 && sides.some(other => other.side !== entry.side && (other.width < entry.width || other.color !== entry.color)))) {
      const corners = { Top: [0, 1], Right: [1, 2], Bottom: [2, 3], Left: [3, 0] }[line.side];
      if (corners.some(index => radius[index] > 0)) edges.push(`${element.className} · ${line.side}`);
    }
    if (/inset/.test(style.boxShadow) && radius.some(value => value > 0)) edges.push(`${element.className} · inset shadow`);
    // An edge line drawn as a pseudo-element must sit where the box has no radius.
    if (element.matches('[data-edge]')) {
      const side = element.dataset.edge;
      const corners = { start: [0, 3], end: [1, 2], top: [0, 1], bottom: [2, 3] }[side];
      if (corners.some(index => radius[index] > 0)) edges.push(`${element.className} · edge ${side} on a rounded corner`);
    }
  }
  return { weak, edges };
};

const openSections = async page => {
  for (const control of await page.locator('.mantine-Drawer-content .mantine-Accordion-control[aria-expanded="false"]').all()) await control.click({ timeout: 2000 }).catch(() => {});
};

for (const colorScheme of ['light', 'dark']) {
  test(`controls keep a 3:1 boundary and no accent edge follows a curve, ${colorScheme} theme`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme });
    await isolate(context);
    const page = await context.newPage();
    for (const [name, url] of Object.entries(VIEWS)) {
      await page.goto(url);
      await expect(page.locator('#main-content')).toBeVisible();
      if (name === 'book') { await expect(page.locator('.mantine-Drawer-content .edition-summary')).toBeVisible(); await openSections(page); }
      if (name === 'notes') await expect(page.getByRole('heading', { name: 'Birleşimin kapsamı' })).toBeVisible();
      const { weak, edges } = await page.evaluate(measure);
      expect(weak, `${name}: controls under 3:1`).toEqual([]);
      expect(edges, `${name}: accent edges on rounded corners`).toEqual([]);
    }
    await context.close();
  });

  test(`axe finds no WCAG 2.2 AA violation, ${colorScheme} theme, desktop and 320 px`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'axe runs once, in Chromium; the other engines run the measured checks.');
    test.slow();
    for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 800 }]) {
      const context = await browser.newContext({ colorScheme, viewport });
      await isolate(context);
      const page = await context.newPage();
      for (const [name, url] of Object.entries(VIEWS)) {
        await page.goto(url);
        await expect(page.locator('#main-content')).toBeVisible();
        if (name === 'book') { await expect(page.locator('.mantine-Drawer-content .edition-summary')).toBeVisible(); await openSections(page); }
        if (name === 'notes') await expect(page.getByRole('heading', { name: 'Birleşimin kapsamı' })).toBeVisible();
        await page.addScriptTag({ content: axeSource });
        const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }))
          .violations.map(item => `${item.id}: ${item.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`));
        expect(violations, `${name} at ${viewport.width} px`).toEqual([]);
      }
      await context.close();
    }
  });
}

test('no readable text is smaller than 14 CSS px', async ({ page }) => {
  await isolate(page.context());
  for (const url of [...Object.values(VIEWS), './?view=library']) {
    await page.goto(url);
    await expect(page.locator('#main-content')).toBeVisible();
    if (url.includes('book=')) { await expect(page.locator('.mantine-Drawer-content .edition-summary')).toBeVisible(); await openSections(page); }
    const small = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
      if (element.closest('.visually-hidden')) return false;
      const own = [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
      const box = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return own && box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && parseFloat(style.fontSize) < 14;
    }).map(element => `${element.className} ${getComputedStyle(element).fontSize} "${element.textContent.trim().slice(0, 24)}"`));
    expect([...new Set(small)], url).toEqual([]);
  }
});

// What the focused control draws: its outline, its shadow, and the bar under it (or its wrapper).
const focusLook = page => page.evaluate(() => {
  const element = document.activeElement;
  const style = getComputedStyle(element);
  const holder = element.matches('input, textarea, select') ? element.closest('.mantine-Input-wrapper, label') : element;
  const bar = holder ? getComputedStyle(holder, '::after') : null;
  return {
    mode: document.documentElement.dataset.focusMode || null,
    outline: style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0 ? 'none' : `${style.outlineStyle} ${style.outlineWidth}`,
    shadow: style.boxShadow,
    bar: bar && bar.content !== 'none' && bar.display !== 'none' ? { height: parseFloat(bar.height), color: bar.backgroundColor } : null,
  };
});

test('keyboard focus is a bar under the control that only Tab turns on, never a ring', async ({ page }) => {
  await isolate(page.context());
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.focusMode || null)).toBeNull();
  // Typing, arrows and Escape in a field do not turn keyboard mode on.
  const search = page.getByRole('textbox', { name: 'Katalogda ara' });
  await search.click();
  await search.pressSequentially('drucker');
  for (const key of ['ArrowLeft', 'ArrowRight', 'Escape']) await page.keyboard.press(key);
  expect((await focusLook(page)).mode).toBeNull();
  expect((await focusLook(page)).bar).toBeNull();
  // Tab turns it on: the next control shows a straight bar and nothing around it. Safari moves
  // Tab through form fields only and passes through the page itself at the end of the cycle;
  // those stops have no control to mark.
  let checked = 0;
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press(step % 3 === 2 ? 'Shift+Tab' : 'Tab');
    const look = await focusLook(page);
    expect(look.mode).toBe('keyboard');
    if (await page.evaluate(() => document.activeElement === document.body)) continue;
    expect(look.outline).toBe('none');
    expect(look.shadow === 'none' || !/0px 0px 0px/.test(look.shadow), `shadow ${look.shadow}`).toBe(true);
    expect(look.bar?.height, 'a visible focus bar').toBeGreaterThanOrEqual(2);
    checked++;
  }
  expect(checked).toBeGreaterThanOrEqual(3);
  // A pointer press turns the mode off and leaves focus and the keyboard alone.
  const toggle = page.locator('.theme-toggle');
  await toggle.click();
  expect((await focusLook(page)).mode).toBeNull();
  await toggle.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.documentElement.dataset.mantineColorScheme)).toBe('light');
});

test('in forced colours the keyboard focus is a 2px CanvasText outline, and pointer focus has none', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates forced colours in Chromium only.');
  await isolate(page.context());
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.locator('.theme-toggle').click();
  expect((await focusLook(page)).outline).toBe('none');
  await page.keyboard.press('Tab');
  const look = await focusLook(page);
  expect(look.outline).toBe('solid 2px');
  expect(look.bar).toBeNull();
});

test('controls move with the contract curve, never jump when pressed, and keep still with reduced motion', async ({ page }) => {
  await isolate(page.context());
  await page.goto('./?book=good-to-great-by-jim-collins');
  const button = page.locator('.detail-actions').getByRole('button', { name: 'Favori', exact: true });
  await expect(button).toBeVisible();
  const curve = await button.evaluate(element => getComputedStyle(element).transitionTimingFunction);
  expect(curve.split(',').length > 3 ? curve.split(/,\s*(?=cubic)/)[0] : curve).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  const before = await button.boundingBox();
  await page.mouse.down();
  const pressed = await button.boundingBox();
  await page.mouse.up();
  expect(pressed.y, 'a pressed button does not move').toBe(before.y);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await button.evaluate(element => getComputedStyle(element).transitionDuration)).toMatch(/^0s/);
});
