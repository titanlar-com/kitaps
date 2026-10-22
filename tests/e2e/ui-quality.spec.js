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
// Views reached by an action rather than an address, measured after VIEWS.
const OPENED = {
  favorites: async page => { await page.goto('./?view=favorites'); },
  library: async page => { await page.goto('./?view=library'); },
  filters: async page => { await page.goto('./'); await page.getByRole('button', { name: /^Filtreler/ }).first().click(); await expect(page.locator('.filter-sheet .mantine-Drawer-body')).toBeVisible(); },
  toast: async page => { await page.goto('./'); await page.locator('.book-card .cover-owned').first().click(); await expect(page.locator('.library-toast')).toBeVisible(); await page.locator('.library-toast').hover(); },
  sync: async page => { await page.goto('./'); await page.locator('.book-card .cover-owned').first().click(); await page.locator('.sync-notice').getByRole('button', { name: 'Bu cihazı bağla' }).click(); await expect(page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' })).toBeVisible(); },
};

// Contrast helpers run in the page.
const measure = () => {
  const rgba = value => { const match = value.match(/rgba?\(([^)]+)\)/); if (!match) return null; const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }; };
  const luminance = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  // What shows behind a control: every translucent layer above the first opaque one, composited.
  const behind = element => {
    const layers = [];
    for (let node = element.parentElement; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let back = rgba(getComputedStyle(document.body).backgroundColor);
    if (!back || back.a < 1) back = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of layers.reverse()) back = { r: c.r * c.a + back.r * (1 - c.a), g: c.g * c.a + back.g * (1 - c.a), b: c.b * c.a + back.b * (1 - c.a), a: 1 };
    return back;
  };
  const shown = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && Number(style.opacity) > 0; };
  const weak = [];
  for (const element of new Set(document.querySelectorAll('.mantine-Button-root, .mantine-ActionIcon-root, button, [role="button"]'))) {
    if (!shown(element) || element.matches(':disabled, [data-disabled], [aria-disabled="true"]')) continue;
    const style = getComputedStyle(element); const own = rgba(style.backgroundColor); const back = behind(element);
    if (!own || own.a <= .5) continue; // a text-only control is identified by its text
    const fill = { r: own.r * own.a + back.r * (1 - own.a), g: own.g * own.a + back.g * (1 - own.a), b: own.b * own.a + back.b * (1 - own.a), a: 1 };
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
    for (const [name, open] of Object.entries(OPENED)) {
      await open(page);
      // The pointer leaves the control it pressed, so no hover colour is measured (the toast
      // keeps it, to stay open); entering panels finish their transition before colours are read.
      if (name !== 'toast') await page.mouse.move(1, 1);
      await page.waitForTimeout(400);
      const { weak, edges } = await page.evaluate(measure);
      expect(weak, `${name}: controls under 3:1`).toEqual([]);
      expect(edges, `${name}: accent edges on rounded corners`).toEqual([]);
      await page.evaluate(() => localStorage.clear());
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
  // Mantine's own fixed transitions (button inner, accordion items) take the tokens as well.
  for (const selector of ['.mantine-Button-inner', '.mantine-Accordion-item']) {
    const timing = await page.locator(selector).first().evaluate(element => { const style = getComputedStyle(element); return { duration: style.transitionDuration, curve: style.transitionTimingFunction }; });
    expect(timing.duration.split(',').map(value => value.trim()).every(value => value === '0.15s'), `${selector} ${timing.duration}`).toBe(true);
    expect(timing.curve.split(/,\s*(?=cubic|ease|linear|step)/).every(value => value === 'cubic-bezier(0.65, 0, 0.35, 1)'), `${selector} ${timing.curve}`).toBe(true);
  }
  const curve = await button.evaluate(element => getComputedStyle(element).transitionTimingFunction);
  expect(curve.split(',').length > 3 ? curve.split(/,\s*(?=cubic)/)[0] : curve).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  const before = await button.boundingBox();
  await page.mouse.down();
  const pressed = await button.boundingBox();
  // A press transition would only show once it has run; measure again after the longest token.
  await page.waitForTimeout(350);
  const held = await button.boundingBox();
  await page.mouse.up();
  expect(pressed.y, 'a pressed button does not move').toBe(before.y);
  expect([held.x, held.y, held.width, held.height], 'a held button keeps its place and size').toEqual([before.x, before.y, before.width, before.height]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await button.evaluate(element => getComputedStyle(element).transitionDuration)).toMatch(/^0s/);
});

// Covers are replaced by their placeholders when the images fail; the placeholder text in small
// covers must not fall under 14 px either.
test('no readable text is smaller than 14 CSS px when the covers do not load', async ({ page }) => {
  await isolate(page.context());
  await page.route(/\.(jpe?g|png|webp|avif)(\?.*)?$/, route => route.fulfill({ status: 404, body: '' }));
  for (const url of ['./', './?book=good-to-great-by-jim-collins', './?view=queue']) {
    await page.goto(url);
    await expect(page.locator('#main-content')).toBeVisible();
    if (url.includes('book=')) {
      // The small covers load lazily; bring one into view so its request is made and fails.
      await page.locator('.mantine-Drawer-content .related-cover').first().scrollIntoViewIfNeeded();
      await expect(page.locator('.mantine-Drawer-content .related-cover .cover-placeholder').first()).toBeAttached();
      // So the queue, measured next, has a cover of its own.
      await page.locator('.detail-actions').getByRole('button', { name: /Sırama ekle/ }).click();
    }
    if (url.includes('queue')) await expect(page.locator('.queue-cover .cover-placeholder').first()).toBeAttached();
    const small = await page.evaluate(() => [...document.querySelectorAll('.cover-placeholder *')].filter(element => {
      const own = [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
      const box = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return own && box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && parseFloat(style.fontSize) < 14;
    }).map(element => `${element.className} ${getComputedStyle(element).fontSize}`));
    expect([...new Set(small)], url).toEqual([]);
  }
});

// The keyboard focus indicator of every stop Tab reaches: drawn only in keyboard mode, no frame
// around the control, not cut off by a panel or the window, not covered by other content, at least
// 3:1 against what is behind it, and a bar rather than a frame (2 to 8 px tall).
const barOf = () => {
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  const root = document.documentElement;
  const name = (element.getAttribute('aria-label') || element.textContent || element.className).trim().slice(0, 40);
  const holders = [element, element.parentElement, element.closest('.filter-choice, .mantine-Input-wrapper'), element.closest('label')].filter(Boolean);
  const after = node => { const style = getComputedStyle(node, '::after'); return style.content === 'none' || style.display === 'none' ? '' : `${style.height} ${style.backgroundColor} ${style.bottom}`; };
  const own = () => { const style = getComputedStyle(element); return { frame: `${style.outlineStyle} ${style.outlineWidth} | ${style.boxShadow} | ${style.borderTopColor} ${style.borderRightColor} ${style.borderBottomColor} ${style.borderLeftColor} ${style.borderTopWidth}`, deco: `${style.textDecorationLine} ${style.textDecorationThickness} ${style.textDecorationColor}` }; };
  const before = () => { const style = getComputedStyle(element, '::before'); return style.content === 'none' || style.display === 'none' ? '' : `${style.height} ${style.backgroundColor}`; };
  const snap = () => ({ after: holders.map(after), ...own(), before: before() });
  const on = snap(); const mode = root.dataset.focusMode; delete root.dataset.focusMode; const off = snap(); root.dataset.focusMode = mode;
  const ring = getComputedStyle(element).outlineStyle !== 'none' || on.frame !== off.frame;
  const rgba = value => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const luminance = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const composite = (x, y, skip) => { const layers = []; for (const node of document.elementsFromPoint(x, y)) { if (node === skip) continue; const c = rgba(getComputedStyle(node).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let back = { r: 255, g: 255, b: 255, a: 1 }; for (const c of layers.reverse()) back = { r: c.r * c.a + back.r * (1 - c.a), g: c.g * c.a + back.g * (1 - c.a), b: c.b * c.a + back.b * (1 - c.a), a: 1 }; return back; };
  const ratio = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (high + .05) / (low + .05); };
  // Whether the point shows the holder's own bar: the bar is made hit-testable for a moment.
  const shows = (holder, x, y) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    let probe = document.getElementById('bar-probe');
    if (!probe) { probe = document.createElement('style'); probe.id = 'bar-probe'; probe.textContent = '[data-bar-probe]::after{pointer-events:auto!important}'; document.head.append(probe); }
    holder.setAttribute('data-bar-probe', '');
    const hit = document.elementFromPoint(x, y);
    holder.removeAttribute('data-bar-probe');
    return Boolean(hit) && (hit === holder || holder.contains(hit));
  };
  const index = on.after.findIndex((value, i) => value && value !== off.after[i]);
  if (index < 0) {
    // A link in running text is marked by a thick underline on every line instead.
    if (on.deco !== off.deco && /underline/.test(on.deco)) {
      const style = getComputedStyle(element); const line = element.getClientRects()[0];
      const hit = document.elementFromPoint(line.left + 2, line.top + line.height / 2);
      return { name, ring, height: parseFloat(style.textDecorationThickness), width: line.width, clippedBy: null, covered: !(hit && (hit === element || element.contains(hit))), onScreen: line.bottom <= innerHeight && line.top >= 0, contrast: ratio(rgba(style.textDecorationColor), composite(line.left + 2, line.top + line.height / 2)) };
    }
    // The main content and a scrolling panel draw their bar along their top (::before, sticky).
    if (on.before && on.before !== off.before && element.matches('#main-content, .mantine-Drawer-body')) return { name, ring, panel: true };
    return { name, ring, missing: true };
  }
  const holder = holders[index]; const style = getComputedStyle(holder, '::after'); const box = holder.getBoundingClientRect(); const holderStyle = getComputedStyle(holder);
  const bar = { left: box.left + parseFloat(holderStyle.borderLeftWidth) + parseFloat(style.left), top: box.top + parseFloat(holderStyle.borderTopWidth) + parseFloat(style.top), width: parseFloat(style.width), height: parseFloat(style.height) };
  bar.right = bar.left + bar.width; bar.bottom = bar.top + bar.height;
  let clippedBy = null;
  for (let node = holder; node && node !== root; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const r = node.getBoundingClientRect();
    const x = cs.overflowX === 'visible' ? [bar.left, bar.right] : [Math.max(bar.left, r.left), Math.min(bar.right, r.right)];
    const y = cs.overflowY === 'visible' ? [bar.top, bar.bottom] : [Math.max(bar.top, r.top), Math.min(bar.bottom, r.bottom)];
    if (Math.max(0, x[1] - x[0]) * Math.max(0, y[1] - y[0]) < bar.width * bar.height * .95) { clippedBy = node.className || node.tagName; break; }
  }
  const x = bar.left + bar.width / 2, y = bar.top + bar.height / 2;
  const onScreen = bar.top >= -.5 && bar.bottom <= innerHeight + .5;
  return { name, ring, height: bar.height, width: bar.width, clippedBy, onScreen, covered: onScreen && !clippedBy && !shows(holder, x, y), contrast: ratio(rgba(style.backgroundColor), composite(Math.min(innerWidth - 1, Math.max(0, x)), Math.min(innerHeight - 1, Math.max(0, y)))) };
};
const problemsOf = (where, bar) => {
  const found = [];
  if (bar.ring) found.push(`${where} · ${bar.name}: a frame around the control`);
  if (bar.missing) found.push(`${where} · ${bar.name}: no focus indicator`);
  if (bar.missing || bar.panel) return found;
  if (bar.clippedBy) found.push(`${where} · ${bar.name}: cut off by ${bar.clippedBy}`);
  if (!bar.onScreen) found.push(`${where} · ${bar.name}: outside the window`);
  if (bar.covered) found.push(`${where} · ${bar.name}: covered by other content`);
  if (bar.height > 8 || bar.height < 2) found.push(`${where} · ${bar.name}: ${bar.height}px tall`);
  if (bar.contrast < 3) found.push(`${where} · ${bar.name}: ${bar.contrast.toFixed(2)}:1`);
  return found;
};
// The page scrolls smoothly to a focused control; Firefox starts a frame or two late.
const settle = page => page.evaluate(() => new Promise(done => { let last = '', still = 0; const start = performance.now(); const tick = () => { const now = [scrollY, ...[...document.querySelectorAll('.mantine-Drawer-body, .mantine-Drawer-content, .mantine-Modal-content')].map(node => node.scrollTop)].join(); still = now === last ? still + 1 : 0; last = now; if ((still >= 6 && performance.now() - start > 150) || performance.now() - start > 2500) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));

for (const [colorScheme, width] of [['light', 320], ['dark', 1280]]) {
  test(`every keyboard stop shows its focus bar whole and at 3:1, ${colorScheme} theme at ${width} px`, async ({ browser, browserName }) => {
    test.setTimeout(420_000);
    const context = await browser.newContext({ colorScheme, viewport: { width, height: 800 } });
    await isolate(context);
    const page = await context.newPage();
    // Safari's Tab reaches form fields only; Option+Tab reaches every control.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const views = [
      ['catalog', async () => { await page.goto('./'); await expect(page.locator('.book-card').first()).toBeVisible(); }, 45],
      ['book', async () => { await page.goto('./?book=good-to-great-by-jim-collins'); await expect(page.locator('.mantine-Drawer-content .edition-summary')).toBeVisible(); }, 35],
      ['collections', async () => { await page.goto('./?view=collections'); await expect(page.locator('#main-content')).toBeVisible(); }, 25],
      ['notes', async () => { await page.goto('./?view=notes'); await expect(page.getByRole('heading', { name: 'Birleşimin kapsamı' })).toBeVisible(); }, 25],
      ['queue', async () => { await page.goto('./?view=queue'); await expect(page.locator('#main-content')).toBeVisible(); }, 15],
      ['favorites', () => OPENED.favorites(page), 15],
      ['filters', () => OPENED.filters(page), 20],
      // A long option list scrolls inside the sheet as Tab moves down it.
      ['filter options', async () => { await OPENED.filters(page); await page.locator('.filter-section-link').first().click(); await expect(page.locator('.filter-choice').first()).toBeVisible(); }, 30],
      // The toast is last in the page, and a Tab to a control under it closes it at once; so the walk
      // starts on its close button, moves to "Geri al" and comes back.
      ['toast', async () => { await OPENED.toast(page); await page.locator('.library-toast-close').focus(); }, [tab, browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab']],
      ['sync', () => OPENED.sync(page), 25],
    ];
    const problems = [];
    let measured = 0;
    for (const [view, open, stops] of views) {
      await open();
      await page.waitForTimeout(300);
      for (const key of Array.isArray(stops) ? stops : Array(stops).fill(tab)) {
        await page.keyboard.press(key);
        await settle(page);
        const bar = await page.evaluate(barOf);
        if (!bar) continue;
        measured++;
        problems.push(...problemsOf(view, bar));
      }
      await page.evaluate(() => localStorage.clear());
    }
    expect([...new Set(problems)]).toEqual([]);
    expect(measured, 'enough stops were measured').toBeGreaterThan(120);
    await context.close();
  });
}

// Programmatic focus keeps the indicator (AGENT.md): the skip link's target, a sheet's title and
// the sync status that takes focus after connecting.
test('focus moved by the page keeps a visible indicator in keyboard mode', async ({ page, browserName }) => {
  await isolate(page.context());
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.goto('./?view=queue');
  await expect(page.locator('#main-content')).toBeVisible();
  await page.keyboard.press(tab);
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const header = await page.locator('.site-header').evaluate(node => node.getBoundingClientRect().height);
  const main = await page.locator('#main-content').evaluate(node => { const style = getComputedStyle(node, '::before'); return { content: style.content, position: style.position, top: parseFloat(style.top), height: parseFloat(style.height) }; });
  expect(main.content, 'the main content shows a bar').not.toBe('none');
  expect(main.position).toBe('sticky');
  expect(Math.abs(main.top - header), 'the bar sits just under the sticky header').toBeLessThan(1);
  expect(main.height).toBeGreaterThanOrEqual(2);
  // The filter sheet's title takes focus when the sheet opens from the keyboard.
  await page.goto('./');
  const filters = page.getByRole('button', { name: /^Filtreler/ }).first();
  await page.keyboard.press(tab);
  await filters.focus();
  await page.keyboard.press('Enter');
  const title = page.locator('.filter-sheet .mantine-Drawer-title');
  await expect(title).toBeFocused();
  // Measured once the sheet has finished sliding in.
  await page.waitForTimeout(400);
  await settle(page);
  expect(problemsOf('sheet title', await page.evaluate(barOf))).toEqual([]);
  // The sync status takes focus after a successful connect; it must not clip its bar.
  await page.keyboard.press('Escape');
  await OPENED.sync(page);
  const status = page.locator('.sync-modal [role="status"]').first();
  await page.keyboard.press(tab);
  await status.focus();
  await page.waitForTimeout(400);
  await settle(page);
  expect(problemsOf('sync status', await page.evaluate(barOf))).toEqual([]);
});

test('in forced colours a hidden option input keeps its bar, edge lines keep their meaning and the active tab is highlighted', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates forced colours in Chromium only.');
  await isolate(page.context());
  // Without images every cover shows its placeholder, whose spine is an edge line.
  await page.route(/\.(jpe?g|png|webp|avif)(\?.*)?$/, route => route.fulfill({ status: 404, body: '' }));
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('./');
  await expect(page.locator('.book-card .cover-placeholder').first()).toBeVisible();
  // The system colours as this browser resolves them.
  const system = await page.evaluate(() => Object.fromEntries(['CanvasText', 'Highlight'].map(name => { const probe = document.createElement('div'); probe.style.cssText = `forced-color-adjust:none;background:${name}`; document.body.append(probe); const value = getComputedStyle(probe).backgroundColor; probe.remove(); return [name, value]; })));
  const line = locator => locator.evaluate(node => getComputedStyle(node, '::before').backgroundColor);
  expect(await line(page.locator('.book-card .cover-placeholder').first()), 'a placeholder spine').toBe(system.CanvasText);
  const tabs = await page.locator('.main-tabs .mantine-Tabs-tab').evaluateAll(nodes => nodes.map(node => ({ active: node.hasAttribute('data-active'), line: getComputedStyle(node, '::before').backgroundColor })));
  expect(tabs.filter(tab => tab.active).map(tab => tab.line), 'the active tab').toEqual([system.Highlight]);
  expect(tabs.filter(tab => !tab.active).every(tab => tab.line === 'rgba(0, 0, 0, 0)'), 'the other tabs have no line').toBe(true);
  // The filter sheet opened from the keyboard: its title has the outline, a hidden option input its bar.
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: /^Filtreler/ }).first().focus();
  await page.keyboard.press('Enter');
  const title = page.locator('.filter-sheet .mantine-Drawer-title');
  await expect(title).toBeFocused();
  await expect(title).toHaveCSS('outline-style', 'solid');
  await expect(title).toHaveCSS('outline-width', '2px');
  await page.locator('.filter-section-link').first().click();
  const option = page.locator('.filter-choice input').first();
  await expect(option).toBeAttached();
  await page.keyboard.press('Tab');
  await option.focus();
  const bar = await option.evaluate(input => { const style = getComputedStyle(input.closest('.filter-choice'), '::after'); return { shown: style.content !== 'none' && style.display !== 'none' && parseFloat(style.height) >= 2, color: style.backgroundColor }; });
  expect(bar.shown, 'the option shows a focus bar').toBe(true);
  expect(bar.color).toBe(system.CanvasText);
});
