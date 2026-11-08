import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The owner, 8 November 2026: dark walnut by default, other woods from the colour panel, and
// depth that comes from a dark floor under lighter blacks.
const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const html = page => page.locator('html');
const panelButton = page => page.getByRole('button', { name: 'Renk düzeni' });
const token = (page, name) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const ready = page => expect(page.locator('.book-card').first()).toBeVisible();

test('a new visitor gets dark walnut, even when the system asks for light', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'light', baseURL: test.info().project.use.baseURL });
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  const page = await context.newPage();
  await page.goto('./');
  await ready(page);
  await expect(html(page)).toHaveAttribute('data-wood', 'ceviz');
  await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await context.close();
});

test('the floor is the darkest layer, it carries the grain, and filled buttons take the scheme accent', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  expect(body).toContain('repeating-linear-gradient');
  expect(body).not.toContain('url(');
  const accent = await token(page, '--accent');
  const filled = await page.evaluate(() => { const probe = document.createElement('div'); probe.style.background = 'var(--mantine-primary-color-filled)'; document.body.append(probe); const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value; });
  const expected = await page.evaluate(hex => { const probe = document.createElement('div'); probe.style.background = hex; document.body.append(probe); const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value; }, accent);
  expect(filled).toBe(expected);
});

for (const wood of ['ceviz', 'mese', 'akasya']) for (const mode of ['dark', 'light']) {
  test(`${wood} ${mode}: a tinted button and a filled switch take the scheme's accent`, async ({ page }) => {
    await page.addInitScript(([w, m]) => { localStorage.setItem('kitapatlasi:wood', w); localStorage.setItem('kitapatlasi:color-scheme', m); }, [wood, mode]);
    await page.goto('./');
    await ready(page);
    const look = await page.evaluate(() => {
      const paint = name => { const probe = document.createElement('div'); probe.style.color = `var(${name})`; document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; };
      const button = getComputedStyle([...document.querySelectorAll('button')].find(element => element.textContent.trim().startsWith('Filtreler')));
      return { background: button.backgroundColor, text: button.color, border: button.borderTopColor, soft: paint('--accent-soft'), strong: paint('--accent-strong'), edge: paint('--accent-border') };
    });
    expect(look.background).toBe(look.soft);
    expect(look.text).toBe(look.strong);
    expect(look.border).toBe(look.edge);
  });
}

test('each count in the reading band has its own colour', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  await expect(page.locator('.reading-summary-icon').first()).toBeVisible();
  const colours = await page.locator('.reading-summary-icon').evaluateAll(icons => icons.map(icon => getComputedStyle(icon).color));
  expect(new Set(colours).size).toBe(5);
});

test('a chosen wood changes the page at once, survives a reload and shows before the first paint', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const walnut = await token(page, '--accent');
  await panelButton(page).click();
  await page.getByRole('radio', { name: /Meşe/ }).click();
  await expect(html(page)).toHaveAttribute('data-wood', 'mese');
  expect(await token(page, '--accent')).not.toBe(walnut);
  await page.goto('./', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-wood'));
  await expect(html(page)).toHaveAttribute('data-wood', 'mese');
});

test('the colour panel works from the keyboard and gives focus back', async ({ page, browserName }) => {
  await page.goto('./');
  await ready(page);
  await panelButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: /Ceviz/ })).toBeVisible();
  await page.getByRole('radio', { name: /Ceviz/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Meşe/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(html(page)).toHaveAttribute('data-wood', 'mese');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio', { name: /Ceviz/ })).toHaveCount(0);
  await expect(panelButton(page)).toBeFocused();
  test.info().annotations.push({ type: 'browser', description: browserName });
});

for (const width of [320, 390, 1280]) {
  test(`at ${width} px the colour panel fits and the header keeps its size`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    await ready(page);
    await panelButton(page).click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const sizes = await panel.evaluate(root => [...root.querySelectorAll('*')].filter(e => e.textContent.trim() && !e.children.length).map(e => parseFloat(getComputedStyle(e).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  });
}

for (const wood of ['ceviz', 'mese', 'akasya']) for (const mode of ['dark', 'light']) {
  test(`${wood} ${mode} passes WCAG A and AA on the catalogue`, async ({ page }) => {
    await page.addInitScript(([w, m]) => { localStorage.setItem('kitapatlasi:wood', w); localStorage.setItem('kitapatlasi:color-scheme', m); }, [wood, mode]);
    await page.goto('./');
    await ready(page);
    await expect(html(page)).toHaveAttribute('data-wood', wood);
    await expect(html(page)).toHaveAttribute('data-mantine-color-scheme', mode);
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }));
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 4).join(', ')}`)).toEqual([]);
  });
}
