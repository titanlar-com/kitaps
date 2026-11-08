import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Phase 7 of docs/UI-REDESIGN.md: the filter sheet, the footer menu, the connect dialog and the
// toast. The file name ends in sync.spec so the project's WebKit and phone runs pick it up with
// the other sync and layout checks (playwright.config.js, layoutChecks).
const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_e2e_checks';

const isolate = context => Promise.all([
  context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY })),
  context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } })),
]);
test.beforeEach(async ({ context }) => { await isolate(context); });

const openFilters = async page => {
  await page.getByRole('button', { name: /^Filtreler/ }).first().click();
  await expect(page.locator('.filter-sheet .mantine-Drawer-body')).toBeVisible();
};
// A panel is measured once it has come to rest, however few frames the machine paints.
const atRest = (page, selector) => page.waitForFunction(root => {
  const element = document.querySelector(root);
  if (!element) return false;
  // A panel that is still fading in is not at rest even between two animation frames.
  if ([...element.querySelectorAll('.mantine-Modal-content, .mantine-Drawer-content')].some(panel => getComputedStyle(panel).opacity !== '1')) return false;
  return element.getAnimations({ subtree: true }).every(animation => animation.playState !== 'running' || animation.effect.getComputedTiming().iterations === Infinity);
}, selector);
const openFooterMenu = async page => {
  await page.locator('.footer-dock').click();
  await expect(page.getByRole('dialog', { name: 'Menü' })).toBeVisible();
};
const openSync = async page => {
  await openFooterMenu(page);
  await page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: 'Cihaz eşitleme' }).click();
  await expect(page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' })).toBeVisible();
};
const raiseToast = async page => {
  await page.locator('.book-card .cover-owned').first().click();
  await expect(page.locator('.library-toast')).toBeVisible();
  await page.locator('.library-toast').hover();
};
const PANELS = [
  ['the filter headings', '.filter-sheet .mantine-Drawer-content', openFilters],
  ['a filter heading', '.filter-sheet .mantine-Drawer-content', async page => { await openFilters(page); await page.getByRole('button', { name: /^Kategoriler/ }).click(); await expect(page.locator('.filter-choice').first()).toBeVisible(); await page.locator('.filter-choice input').first().check({ force: true }); }],
  ['the footer menu', '.footer-menu .mantine-Drawer-content', openFooterMenu],
  ['the connect dialog', '.sync-modal .mantine-Modal-content', openSync],
  ['the toast', '.library-toast', raiseToast],
];

/** Every readable text under a panel smaller than 14 px, and every corner over 5 px or pill. */
const designProblems = (page, root) => page.locator(root).evaluate(panel => {
  const found = [];
  const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
  const name = element => `${element.tagName.toLowerCase()}.${String(element.className?.baseVal ?? element.className).trim().split(/\s+/).slice(0, 3).join('.')}`;
  for (const element of [panel, ...panel.querySelectorAll('*')]) {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (box.width && box.height) {
      const radius = Math.max(...corners.map(corner => parseFloat(style[corner]) || 0));
      if (radius > 5.01) found.push(`${name(element)} radius ${radius}px`);
      if (corners.some(corner => style[corner].includes('%'))) found.push(`${name(element)} percent radius`);
      const short = Math.min(box.width, box.height);
      if (radius > 0 && 2 * radius >= short - .01) found.push(`${name(element)} pill ${radius}px on ${short.toFixed(1)}px`);
    }
    const ownText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (ownText && box.width > 1 && style.visibility !== 'hidden' && parseFloat(style.fontSize) < 13.99) found.push(`${name(element)} text ${style.fontSize}: "${element.textContent.trim().slice(0, 30)}"`);
  }
  return found;
});
const fitsPage = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const spills = (page, root) => page.locator(root).evaluate(container => {
  const edge = container.getBoundingClientRect().right + 1;
  return [...container.querySelectorAll('*')].filter(element => !element.matches('input') && (element.getBoundingClientRect().right > edge
    || (element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflowX !== 'visible'))).map(element => `${element.tagName}.${element.className}`);
});
// Keyboard mode starts only with Tab (src/focusMode.js).
const keyboardFocus = async (page, locator) => { await page.keyboard.press('Tab'); await locator.focus(); };
const hasBar = locator => locator.evaluate(element => {
  const holder = element.matches('input') ? element.closest('.filter-choice, .mantine-Input-wrapper, label') : element;
  const style = getComputedStyle(holder, '::after');
  return style.content !== 'none' && style.display !== 'none' && parseFloat(style.height) >= 2 && getComputedStyle(element).outlineStyle === 'none' && getComputedStyle(holder).boxShadow === 'none';
});

test.describe('filter choices stay in the address', () => {
  test('a heading and a choice show up in the address, again in the sheet after a reload, and leave with Temizle', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await openFilters(page);
    await page.getByRole('group', { name: 'Konu' }).getByRole('button', { name: /^Kategoriler/ }).click();
    const first = page.locator('.filter-choice input').first();
    const label = await first.evaluate(input => input.closest('.filter-choice').textContent.trim());
    await first.check({ force: true });
    await expect(page.locator('.filter-result-selection')).toHaveText('1 seçim');
    await page.getByRole('button', { name: 'Filtre başlıklarına dön' }).click();
    await page.getByRole('group', { name: 'Okuma kayıtlarım' }).getByRole('button', { name: /^Okuma durumum/ }).click();
    await page.getByRole('checkbox', { name: 'Favori' }).check({ force: true });
    await expect(page.locator('.filter-result-selection')).toHaveText('2 seçim');
    await page.getByRole('button', { name: 'Kitapları göster' }).click();
    await expect(page).toHaveURL(/[?&]category=/);
    await expect(page).toHaveURL(/[?&]status=/);

    await page.reload();
    await openFilters(page);
    const heading = page.getByRole('group', { name: 'Konu' }).getByRole('button', { name: new RegExp(`^Kategoriler: ${label}`) });
    await expect(heading.locator('.filter-section-count')).toHaveText('1');
    await expect(page.getByRole('group', { name: 'Okuma kayıtlarım' }).locator('.filter-group-count')).toHaveText('1 seçim');
    await heading.click();
    await expect(page.locator('.filter-fieldset legend')).toContainText('1 seçili');
    await expect(page.getByRole('checkbox', { name: label })).toBeChecked();

    await page.locator('.filter-sheet-footer').getByRole('button', { name: 'Temizle', exact: true }).click();
    await expect(page.locator('.filter-result-selection')).toHaveCount(0);
    await page.getByRole('button', { name: 'Kitapları göster' }).click();
    await expect(page).not.toHaveURL(/[?&](?:category|status)=/);
  });

  test('closing the sheet without applying leaves the address alone', async ({ page }) => {
    await page.goto('./');
    await openFilters(page);
    await page.getByRole('button', { name: /^Kategoriler/ }).click();
    await page.locator('.filter-choice input').first().check({ force: true });
    await page.getByRole('button', { name: 'Filtreleri uygulamadan kapat' }).click();
    await expect(page.locator('.filter-sheet .mantine-Drawer-content')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]category=/);
  });
});

test.describe('the device connection steps', () => {
  test('four numbered steps follow what really happened, and nothing is written from the field', async ({ page }) => {
    await page.goto('./');
    await openSync(page);
    const dialog = page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' });
    const steps = dialog.getByRole('list', { name: 'Bu cihazı bağla' }).getByRole('listitem');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect(steps.nth(0).getByRole('link', { name: /hazır ayarlarla oluştur/ })).toHaveAttribute('target', '_blank');

    const field = dialog.getByLabel('İnce ayarlı (fine-grained) GitHub anahtarı');
    await expect(field).toHaveAttribute('type', 'password');
    await field.fill(TOKEN);
    await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step');
    await expect(steps.nth(0).locator('[data-completed]').first()).toBeVisible();
    expect(await page.evaluate(token => document.body.innerText.includes(token), TOKEN)).toBe(false);
    expect(await page.evaluate(token => JSON.stringify(localStorage).includes(token), TOKEN)).toBe(false);
    await field.fill('');
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
  });

  test('the keyboard reaches the link and the field in order, each with a bar under it and nothing around it', async ({ page, browserName }) => {
    await page.goto('./');
    await openSync(page);
    const dialog = page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' });
    await atRest(page, '.sync-modal .mantine-Modal-content');
    const link = dialog.getByRole('link', { name: /hazır ayarlarla oluştur/ });
    await keyboardFocus(page, link);
    expect(await hasBar(link), 'a bar under the link').toBe(true);
    // WebKit reaches a link with Tab only when the system setting or Alt says so.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    const field = dialog.getByLabel('İnce ayarlı (fine-grained) GitHub anahtarı');
    await expect(field).toBeFocused();
    expect(await hasBar(field), 'a bar under the field').toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('keyboard', () => {
  test('the filter sheet goes down and back with Tab, Enter, Space and Escape, always with a bar and never a ring', async ({ page }) => {
    await page.goto('./');
    await keyboardFocus(page, page.getByRole('button', { name: /^Filtreler/ }).first());
    await page.keyboard.press('Enter');
    await expect(page.locator('.filter-sheet .mantine-Drawer-title')).toBeFocused();
    const row = page.locator('.filter-section-link').first();
    await row.focus();
    expect(await hasBar(row), 'a bar under the heading row').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('.filter-sheet .mantine-Drawer-title')).toBeFocused();
    const option = page.locator('.filter-choice input').first();
    await option.focus();
    expect(await hasBar(option), 'a bar under the option').toBe(true);
    await page.keyboard.press('Space');
    await expect(option).toBeChecked();
    await expect(page.locator('.filter-fieldset legend')).toContainText('1 seçili');
    await page.keyboard.press('Escape');
    await expect(page.locator('.filter-sheet .mantine-Drawer-content')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Filtreler/ }).first()).toBeFocused();
  });

  test('a footer menu item shows the bar, and Enter opens its page', async ({ page }) => {
    await page.goto('./');
    await keyboardFocus(page, page.locator('.footer-dock'));
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Menü' });
    await atRest(page, '.footer-menu .mantine-Drawer-content');
    const item = sheet.getByRole('button', { name: 'Kitapçılar', exact: true });
    await item.focus();
    expect(await hasBar(item), 'a bar under the item').toBe(true);
    await page.keyboard.press('Enter');
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]view=bookstores\b/);
  });
});

test.describe('touch', () => {
  test('a finger opens a heading, picks a choice and reaches a menu item, and no focus bar appears', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
    await isolate(context);
    const page = await context.newPage();
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await page.getByRole('button', { name: /^Filtreler/ }).first().tap();
    await atRest(page, '.filter-sheet .mantine-Drawer-content');
    const row = page.locator('.filter-section-link').first();
    await row.tap();
    const option = page.locator('.filter-choice').first();
    await atRest(page, '.filter-sheet .mantine-Drawer-content');
    expect((await option.boundingBox()).height, 'the option is large enough for a finger').toBeGreaterThanOrEqual(44);
    await option.tap();
    await expect(option.locator('input')).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.dataset.focusMode ?? null)).toBeNull();
    expect(await hasBar(option.locator('input'))).toBe(false);
    await page.getByRole('button', { name: 'Filtreleri uygulamadan kapat' }).tap();
    await expect(page.locator('.filter-sheet .mantine-Drawer-content')).toHaveCount(0);

    await page.locator('.footer-dock').tap();
    const sheet = page.getByRole('dialog', { name: 'Menü' });
    await atRest(page, '.footer-menu .mantine-Drawer-content');
    const item = sheet.getByRole('button', { name: 'Kümeler', exact: true });
    expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await item.tap();
    await expect(page).toHaveURL(/[?&]view=collections\b/);
    await context.close();
  });
});

for (const width of [320, 1280]) {
  test.describe(`at ${width} px`, () => {
    for (const [name, root, open] of PANELS) {
      test(`${name}: text, corners, page width and contrast keep the rules`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('./');
        await expect(page.locator('.book-card').first()).toBeVisible();
        await open(page);
        await atRest(page, root);
        expect(await designProblems(page, root)).toEqual([]);
        expect(await fitsPage(page), 'the page does not run sideways').toBe(true);
        await page.addScriptTag({ content: axeSource });
        const violations = await page.evaluate(async selector => (await window.axe.run(selector, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => `${item.id}: ${item.nodes.map(node => node.target).join(' | ')}`), root);
        expect(violations).toEqual([]);
      });
    }
  });
}

test.describe('layers', () => {
  // The default scheme is dark walnut: the floor is the darkest layer and each layer above it lighter.
  const layer = (page, selector, property = 'backgroundColor') => page.locator(selector).first().evaluate((element, name) => getComputedStyle(element)[name], property);
  const token = (page, name) => page.evaluate(variable => {
    const probe = document.body.appendChild(Object.assign(document.createElement('div'), { style: `background:var(${variable})` }));
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, name);

  test('panels and sheets sit on a layer above the floor, with no frame', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await openFilters(page);
    await atRest(page, '.filter-sheet .mantine-Drawer-content');
    expect(await layer(page, '.filter-sheet .mantine-Drawer-content')).toBe(await token(page, '--surface'));
    expect(await layer(page, '.filter-sheet-footer')).toBe(await token(page, '--surface-2'));
    expect(await layer(page, '.filter-section-link', 'borderBottomWidth')).toBe('0px');
    await page.keyboard.press('Escape');
    await expect(page.locator('.filter-sheet .mantine-Drawer-content')).toHaveCount(0);

    await openFooterMenu(page);
    await atRest(page, '.footer-menu .mantine-Drawer-content');
    expect(await layer(page, '.footer-menu .mantine-Drawer-content')).toBe(await token(page, '--surface'));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Menü' })).toHaveCount(0);

    await openSync(page);
    await atRest(page, '.sync-modal .mantine-Modal-content');
    expect(await layer(page, '.sync-modal .mantine-Modal-content')).toBe(await token(page, '--surface'));
    expect(await layer(page, '.sync-modal .mantine-Modal-header')).toBe(await token(page, '--surface'));
  });

  test('the toast is the top layer, with a shadow and no border', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await raiseToast(page);
    await atRest(page, '.library-toast');
    expect(await layer(page, '.library-toast')).toBe(await token(page, '--surface-3'));
    expect(await layer(page, '.library-toast', 'borderTopWidth')).toBe('0px');
    expect(await layer(page, '.library-toast', 'boxShadow')).not.toBe('none');
  });
});

test.describe('at 320 px with 200% text', () => {
  const enlarge = context => context.addInitScript(() => {
    const add = () => document.head.append(Object.assign(document.createElement('style'), { textContent: 'html{font-size:200%}' }));
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add, { once: true });
  });
  const large = async (browser, baseURL) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 320, height: 720 } });
    await isolate(context);
    await enlarge(context);
    const page = await context.newPage();
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    return { context, page };
  };

  test('the filter sheet keeps its words inside and its actions on the screen', async ({ browser, baseURL }) => {
    const { context, page } = await large(browser, baseURL);
    await page.getByRole('button', { name: /^Filtreler/ }).first().evaluate(button => button.click());
    await atRest(page, '.filter-sheet .mantine-Drawer-content');
    expect(await spills(page, '.filter-sheet .mantine-Drawer-content')).toEqual([]);
    await page.locator('.filter-section-link').first().click();
    await expect(page.locator('.filter-choice').first()).toBeVisible();
    await atRest(page, '.filter-sheet .mantine-Drawer-content');
    expect(await spills(page, '.filter-sheet .mantine-Drawer-content')).toEqual([]);
    expect(await fitsPage(page)).toBe(true);
    await context.close();
  });

  test('the connect dialog keeps its steps, field and buttons inside', async ({ browser, baseURL }) => {
    const { context, page } = await large(browser, baseURL);
    await page.locator('.footer-dock').evaluate(button => button.click());
    await page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: 'Cihaz eşitleme' }).evaluate(button => button.click());
    await atRest(page, '.sync-modal .mantine-Modal-content');
    expect(await spills(page, '.sync-modal .mantine-Modal-content')).toEqual([]);
    expect(await fitsPage(page)).toBe(true);
    await context.close();
  });

  test('the footer menu keeps every item whole', async ({ browser, baseURL }) => {
    const { context, page } = await large(browser, baseURL);
    await page.locator('.footer-dock').evaluate(button => button.click());
    await atRest(page, '.footer-menu .mantine-Drawer-content');
    expect(await spills(page, '.footer-menu .mantine-Drawer-content')).toEqual([]);
    const cut = await page.locator('.footer-menu-item').evaluateAll(items => items.filter(item => item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1).map(item => item.textContent));
    expect(cut).toEqual([]);
    await context.close();
  });
});

test('going back from a filter section returns the focus to that section', async ({ page }) => {
  await page.goto('./');
  await openFilters(page);
  const links = page.locator('.filter-section-link');
  await expect(links.first()).toBeVisible();
  const second = links.nth(1);
  const name = await second.getAttribute('aria-label') ?? await second.innerText();
  await second.click();
  await page.getByRole('button', { name: 'Filtre başlıklarına dön' }).click();
  await expect(links.nth(1)).toBeFocused();
  expect((await links.nth(1).getAttribute('aria-label')) ?? await links.nth(1).innerText()).toBe(name);
});

test('at 320 px with 200% text the footer bar stays one row high', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./?view=notes');
  await expect(page.locator('.footer-dock')).toBeVisible();
  await page.addStyleTag({ content: 'html{font-size:200%}' });
  const dock = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-height')));
  await expect.poll(() => page.locator('.footer-dock').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(dock);
});
