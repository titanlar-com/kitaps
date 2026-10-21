import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const BOOK = './?book=good-to-great-by-jim-collins';
const SECOND_BOOK = './?book=goal';
const EMPTY_STATE = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

// The live shared reading state must not decide what these tests see.
async function isolate(context) {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY_STATE }));
  await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
}

test.beforeEach(async ({ context }) => { await isolate(context); });

// Marks the open book as purchased and read from its own page.
async function markPurchasedAndRead(page) {
  await page.getByRole('button', { name: 'Satın alındı', exact: true }).click();
  await page.getByRole('button', { name: 'Okuma kaydım ve kişisel notlarım' }).click();
  await page.getByRole('button', { name: 'Okundu', exact: true }).click();
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('read and purchased books show ribbons and a half-grey cover on the book page, the card and the queue', async ({ page }) => {
  await page.goto(BOOK);
  const hero = page.locator('.detail-hero');
  await expect(hero.locator('.cover-stage img')).toBeVisible();
  await expect(hero.locator('.state-ribbon')).toHaveCount(0);
  await expect(hero.locator('.cover-stage img')).toHaveCSS('filter', 'none');

  await markPurchasedAndRead(page);
  await expect(hero.locator('.state-ribbon')).toHaveText(['Okundu', 'Satın alındı']);
  await expect(hero.locator('.cover-stage img')).toHaveCSS('filter', 'grayscale(0.5)');
  // The ribbons are drawn for the eye; screen readers hear the marks right after the title.
  await expect(hero.locator('.state-ribbons')).toHaveAttribute('aria-hidden', 'true');
  await expect(hero.locator('.detail-heading .visually-hidden')).toHaveText('Durum: Okundu, Satın alındı.');
  await page.locator('.detail-actions').getByRole('button', { name: /Sırama ekle/ }).click();

  await page.goto('./?view=library');
  const card = page.locator('.book-card[data-book-id="goodtogreat"]');
  await expect(card.locator('.state-ribbon')).toHaveText(['Okundu', 'Satın alındı']);
  await expect(card.locator('.cover-stage img')).toHaveCSS('filter', 'grayscale(0.5)');
  await expect(card.locator('.book-card-body .visually-hidden')).toHaveText('Durum: Okundu, Satın alındı.');
  // The ribbon replaces the card's former "Okundu" badge rather than repeating it.
  await expect(card.locator('.book-state-badges')).toHaveCount(0);

  await page.goto('./?view=queue');
  await expect(page.locator('.queue-cover .cover-stage img').first()).toHaveCSS('filter', 'grayscale(0.5)');

  // A book without the marks keeps a full-colour cover and no ribbon.
  await page.goto('./');
  const other = page.locator('.book-card:not([data-book-id="goodtogreat"])').first();
  await expect(other).toBeVisible();
  await expect(other.locator('.state-ribbon')).toHaveCount(0);
  await expect(other.locator('.cover-stage img, .cover-placeholder').first()).toHaveCSS('filter', 'none');

  // Clearing "Okundu" removes its ribbon and the grey everywhere; "Satın alındı" stays.
  await page.goto(BOOK);
  await page.getByRole('button', { name: 'Okuma kaydım ve kişisel notlarım' }).click();
  await page.getByRole('button', { name: 'Okundu', exact: true }).click();
  await expect(hero.locator('.state-ribbon')).toHaveText(['Satın alındı']);
  await expect(hero.locator('.cover-stage img')).toHaveCSS('filter', 'none');
  await page.goto('./?view=library');
  await expect(card.locator('.state-ribbon')).toHaveText(['Satın alındı']);
  await expect(card.locator('.cover-stage img')).toHaveCSS('filter', 'none');
});

test('ribbons never overlap the priority badge or leave the page, at any width or text size', async ({ page }) => {
  await page.goto(BOOK);
  await markPurchasedAndRead(page);
  await page.goto(SECOND_BOOK);
  await page.getByRole('button', { name: 'Satın alındı', exact: true }).click();
  await page.goto('./?view=library');
  const cards = page.locator('.book-card');
  await expect(cards).toHaveCount(2);

  const check = async label => {
    const width = page.viewportSize().width;
    for (const card of await cards.all()) {
      const badge = await card.locator('.reading-priority-badge').boundingBox();
      for (const ribbon of await card.locator('.state-ribbon').all()) {
        const box = await ribbon.boundingBox();
        expect(overlaps(box, badge), `${label}: ribbon meets the badge`).toBe(false);
        expect(box.x + box.width, `${label}: ribbon leaves the page`).toBeLessThanOrEqual(width);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: horizontal overflow`).toBe(true);
  };
  // Every column change of the grid, one pixel either side, and the phone widths.
  for (const width of [320, 360, 375, 390, 575, 576, 577, 895, 896, 897, 1151, 1152, 1153, 1194, 1195, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`${width} px`);
  }
  await page.addStyleTag({ content: 'html{font-size:125%}' });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`${width} px, 125% text`);
  }
  // WCAG 1.4.12 text spacing.
  await page.addStyleTag({ content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}' });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`${width} px, text spacing`);
  }
  await page.addStyleTag({ content: 'html{font-size:200%}' });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`${width} px, 200% text`);
  }
});

test('on the book page the ribbons stay on the cover and clear of the title, even with 200% text', async ({ page }) => {
  await page.goto(BOOK);
  await markPurchasedAndRead(page);
  const hero = page.locator('.detail-hero');
  const check = async label => {
    const cover = await hero.locator('.detail-cover-block').boundingBox();
    const title = await hero.locator('h2').boundingBox();
    for (const ribbon of await hero.locator('.state-ribbon').all()) {
      const box = await ribbon.boundingBox();
      expect(box.x, `${label}: ribbon starts left of the cover`).toBeGreaterThanOrEqual(cover.x - 0.5);
      expect(overlaps(box, title), `${label}: ribbon meets the title`).toBe(false);
      expect(box.x + box.width, `${label}: ribbon leaves the page`).toBeLessThanOrEqual(page.viewportSize().width);
    }
  };
  for (const width of [320, 360, 375, 390, 767, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`${width} px`);
  }
  await page.addStyleTag({ content: 'html{font-size:200%}' });
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`${width} px, 200% text`);
  }
});

test('keyboard focus on a marked cover keeps its focus ring clear of the ribbons', async ({ page }) => {
  await page.goto(BOOK);
  await markPurchasedAndRead(page);
  await page.goto('./?view=library');
  const card = page.locator('.book-card[data-book-id="goodtogreat"]');
  const cover = card.locator('.cover-open');
  await expect(card.locator('.state-ribbon')).toHaveCount(2);
  // A key press first, so the browser treats the following focus as keyboard focus.
  await page.keyboard.press('Shift');
  await cover.focus();
  expect(await cover.evaluate(element => element.matches(':focus-visible'))).toBe(true);
  await expect(cover).toHaveCSS('outline-style', 'solid');
  const coverBox = await cover.boundingBox();
  for (const ribbon of await card.locator('.state-ribbon').all()) {
    const box = await ribbon.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(coverBox.x + coverBox.width + 0.5);
  }
});

test('in forced colours each ribbon keeps an outline', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates forced colours in Chromium only.');
  const context = await browser.newContext({ forcedColors: 'active' });
  await isolate(context);
  const page = await context.newPage();
  await page.goto(BOOK);
  await markPurchasedAndRead(page);
  await page.goto('./?view=library');
  const ribbon = page.locator('.book-card[data-book-id="goodtogreat"] .state-ribbon').first();
  await expect(ribbon).toHaveCSS('border-top-style', 'solid');
  await context.close();
});

for (const colorScheme of ['light', 'dark']) {
  test(`ribbons keep WCAG A/AA in the ${colorScheme} theme`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme });
    await isolate(context);
    const page = await context.newPage();
    await page.goto(BOOK);
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', colorScheme);
    await markPurchasedAndRead(page);
    for (const path of ['./?view=library', BOOK]) {
      await page.goto(path);
      await expect(page.locator('.state-ribbon').first()).toBeVisible();
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`));
      expect(violations, `${colorScheme} ${path}`).toEqual([]);
    }
    await context.close();
  });
}
