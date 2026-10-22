import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const EMPTY_STATE = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const LARGE_TEXT = 'html{font-size:200%}';
const consoleErrors = page => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
};
// The live shared reading state must not decide what a test sees. Pages read it from the
// CDN and, on opening, from the API; both answer with an empty state here.
const isolate = context => Promise.all([
  context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY_STATE })),
  context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ json: { sha: 'empty', encoding: 'base64', content: Buffer.from(JSON.stringify(EMPTY_STATE)).toString('base64') } })),
]);
const pageFits = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
// The matches of `roots`, and every element inside them, whose content runs out of their own box.
// Form fields are not judged by their own text: they scroll it, or in WebKit a date field may let it
// run over (a known limit with wide fonts), so they are clipped while measuring. The cover marks
// overhang the cover on purpose, so they are pulled in.
const spilling = roots => roots.evaluateAll(elements => {
  const pullIn = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.cover-marks{right:0!important} input,textarea,select{overflow:hidden!important}' }));
  const found = elements.flatMap(element => [element, ...element.querySelectorAll('*')])
    .filter(node => !node.matches('input, textarea, select') && getComputedStyle(node).overflowX === 'visible' && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
    .map(node => `${node.className} "${node.textContent.trim().slice(0, 40)}"`);
  pullIn.remove();
  return found;
});
// Large-text checks run in the platform font and in a wide one: Ubuntu CI draws the interface in
// DejaVu Sans, which runs much wider than macOS's font, and Verdana stands in for it. WIDE_FONT
// is added once; useFont switches it on and off.
const fonts = { 'system UI font': false, 'wide font': true };
const useFont = (page, wide) => page.evaluate(on => document.documentElement.toggleAttribute('data-wide-font', on), wide);
const WIDE_FONT = ':root[data-wide-font]{--sans:Verdana,sans-serif!important;--mantine-font-family:Verdana,sans-serif!important}';
// Mantine's button and accordion labels hide what runs past them, so text cut off there is not overflow.
const clipped = root => root.evaluate(element => {
  const found = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(text);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
    for (let box = text.parentElement; box !== element.parentElement; box = box.parentElement) {
      const style = getComputedStyle(box);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const outer = box.getBoundingClientRect();
      const left = outer.left + box.clientLeft, top = outer.top + box.clientTop;
      if (rects.some(rect => rect.left < left - 1 || rect.right > left + box.clientWidth + 1 || rect.top < top - 1 || rect.bottom > top + box.clientHeight + 1)) {
        found.push(text.data.trim());
        break;
      }
    }
  }
  return found;
});
// Words broken across lines although they would fit on one: no wider than their closest `line` box,
// or than any line when none is given. Hyphens, dashes and slashes are ordinary break points.
const brokenWords = (texts, line) => texts.evaluateAll((elements, line) => elements.flatMap(element => {
  const width = line ? element.closest(line).clientWidth : Infinity;
  const found = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    for (const word of text.data.matchAll(/[^\s/\u2010-\u2014-]+/g)) {
      const range = document.createRange();
      range.setStart(text, word.index);
      range.setEnd(text, word.index + word[0].length);
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
      if (new Set(rects.map(rect => Math.round(rect.top))).size > 1 && rects.reduce((sum, rect) => sum + rect.width, 0) <= width) found.push(word[0]);
    }
  }
  return found;
}), line);

// Keyboard mode starts only with Tab (src/focusMode.js); a focus made after it shows the focus bar.
const keyboardFocus = async (page, locator) => { await page.keyboard.press('Tab'); await locator.focus(); };
// The bar drawn under a focused control (or under its field wrapper or option label), as a box.
const focusBar = locator => locator.evaluate(element => {
  const holder = element.matches('input, textarea, select') ? element.closest('.filter-choice, .mantine-Input-wrapper, label') : element;
  const style = getComputedStyle(holder, '::after');
  if (style.content === 'none' || style.display === 'none' || parseFloat(style.height) < 2) return null;
  const box = holder.getBoundingClientRect(); const bottom = box.bottom - parseFloat(style.bottom);
  return { top: bottom - parseFloat(style.height), bottom, left: box.left, right: box.right, outline: getComputedStyle(element).outlineStyle };
});

test('the shared state is read from GitHub in a real browser, without CORS errors', async ({ page }) => {
  const errors = consoleErrors(page);
  await page.goto('./?view=notes');
  // The API answers a fresh read; when GitHub's anonymous limit is used up, the CDN copy does.
  await expect(page.getByText(/GitHub durumu salt okunur olarak güncel|GitHub durumu okundu\. Bağlı olmayan cihaz GitHub’ın önbellek kopyasını okur|Değişiklikler cihazda kuyrukta/)).toBeVisible({ timeout: 20_000 });
  expect(errors.filter(text => /CORS|Access-Control|Failed to fetch/i.test(text))).toEqual([]);
});

test('the catalog opens sorted by reading priority with the compact summary', async ({ page }) => {
  const errors = consoleErrors(page);
  // GitHub's anonymous request limit must not decide whether the console stays clean.
  await isolate(page.context());
  await page.goto('./');
  await expect(page.locator('.book-card')).toHaveCount(24);
  const toggle = page.getByRole('button', { name: /Okuma önceliğine göre sıralı/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.header-children svg circle')).toHaveCount(3);
  const badge = page.locator('.reading-priority-badge').first();
  await expect(badge).toContainText('#1');
  // Only the score is set off by a divider; nothing is drawn before the rank.
  await expect(badge.locator('.priority-rank')).toHaveCSS('border-left-width', '0px');
  await expect(badge.locator('.priority-score')).toHaveCSS('border-left-width', '1px');
  await page.getByRole('combobox', { name: 'Sayfa başına kitap' }).click();
  await expect(page.getByRole('option')).toHaveText(['24 / sayfa', '48 / sayfa', '96 / sayfa', '192 / sayfa', '384 / sayfa']);
  expect(errors).toEqual([]);
});

test('a phone shows book titles on the first screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('./');
  const title = page.locator('.book-card .title-button').first();
  await expect(title).toBeVisible();
  const box = await title.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(812);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test('marking a book as purchased changes neither its score nor its explanation', async ({ page }) => {
  // The live shared state could already mark this book; start from an empty one.
  await isolate(page.context());
  await page.goto('./?book=good-to-great-by-jim-collins');
  const card = page.locator('.reading-priority-card');
  await expect(card).toBeVisible();
  const before = await card.innerText();
  await page.getByRole('button', { name: 'Satın alındı', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Satın alındı', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await card.innerText()).toBe(before);
  expect(before).not.toMatch(/sahip olunan/i);
});

test('a Turkish original is not labelled as an unverified translation', async ({ page }) => {
  await page.goto('./?book=fadis-by-gulten-dayioglu');
  await expect(page.getByRole('heading', { name: 'Baskı bilgisi' })).toBeVisible();
  await expect(page.getByText(/Türkçe baskı doğrulanamadı/)).toHaveCount(0);
  await expect(page.getByText(/Özgün baskı · Amazon/)).toHaveCount(0);
});

test('the per-page control shows its whole label on a 320 px phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  await page.goto('./?page-size=384');
  const control = page.getByRole('combobox', { name: 'Sayfa başına kitap' });
  await expect(control).toHaveValue('384 / sayfa');
  expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await context.close();
});

// WCAG 1.4.4 and 1.4.10: with the root text doubled, a 320 px phone scrolls the catalog only vertically.
test('the catalog reflows at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  await isolate(context);
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.locator('.book-card')).toHaveCount(24);
  await page.addStyleTag({ content: LARGE_TEXT });
  // The cards are checked in the wide font too: CI draws them in a font much wider than macOS's.
  await page.addStyleTag({ content: WIDE_FONT });
  for (const [font, wide] of Object.entries(fonts)) {
    await useFont(page, wide);
    expect(await pageFits(page), `horizontal overflow in the ${font}`).toBe(true);
    expect(await spilling(page.locator('.catalog-pagination, .books-grid')), font).toEqual([]);
  }
  await useFont(page, false);
  expect(await page.locator('.main-tabs').evaluate(list => list.scrollWidth <= list.clientWidth), 'a section tab is out of view').toBe(true);
  // The per-page control is as wide as its label, and every pagination control keeps a 44 px target.
  const perPage = page.getByRole('combobox', { name: 'Sayfa başına kitap' });
  expect(await perPage.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const control of await page.locator('.catalog-pagination :is(a, button, input):visible').all()) {
    const box = await control.boundingBox();
    expect(Math.min(box.width, box.height), await control.evaluate(element => element.getAttribute('aria-label') || element.textContent)).toBeGreaterThanOrEqual(44);
  }
  const onScreen = async locator => {
    const box = await locator.boundingBox();
    return box.x >= 0 && box.x + box.width <= 320;
  };
  // A tooltip wraps on the screen instead of running past it.
  await page.locator('.book-card .reading-priority-badge').first().hover();
  const tooltip = page.locator('.mantine-Tooltip-tooltip');
  await expect(tooltip).toBeVisible();
  expect(await onScreen(tooltip)).toBe(true);
  expect(await pageFits(page), 'horizontal overflow with a tooltip').toBe(true);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  // The purchase toast keeps its close button on the screen.
  await page.locator('.book-card .cover-owned').first().click();
  const toast = page.locator('.library-toast');
  await expect(toast).toBeVisible();
  expect(await onScreen(toast.getByRole('button', { name: 'Bildirimi kapat' }))).toBe(true);
  expect(await spilling(toast)).toEqual([]);
  await toast.getByRole('button', { name: 'Bildirimi kapat' }).click();
  // The page jump opens inside the screen and wraps its field and button.
  await page.getByRole('button', { name: 'Sayfaya git' }).click();
  const jump = page.locator('.mantine-Popover-dropdown').filter({ has: page.locator('.pagination-jump') });
  await expect(jump).toBeVisible();
  expect(await onScreen(jump)).toBe(true);
  expect(await spilling(jump)).toEqual([]);
  await page.keyboard.press('Escape');
  // The longest page size shows its whole label too. It is chosen with the keyboard: a pointer
  // click can miss an option while the dropdown above the field is still being placed.
  await perPage.focus();
  await page.keyboard.press('ArrowDown');
  const options = page.getByRole('option');
  await expect(options.first()).toBeVisible();
  const longest = (await options.last().textContent()).trim();
  for (let step = await options.count(); step > 1; step--) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(perPage).toHaveValue(longest);
  await expect(page).toHaveURL(/page-size=/);
  expect(await perPage.evaluate(element => element.scrollWidth <= element.clientWidth), await perPage.inputValue()).toBe(true);
  // A search without results keeps its button on the screen too.
  await page.goto('./?q=zzzz');
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.addStyleTag({ content: LARGE_TEXT });
  expect(await pageFits(page), 'horizontal overflow without results').toBe(true);
  expect(await spilling(page.locator('.empty-state'))).toEqual([]);
  await context.close();
});

// The Kümeler tab with enlarged text. The wide font stands in for the Linux UI fonts on CI; where
// Verdana is missing it falls back to the default sans, which is wide as well.
test.describe('the Kümeler tab', () => {
  const smallTargets = root => root.locator('button').evaluateAll(buttons => buttons
    .filter(button => button.getClientRects().length)
    .filter(button => Math.min(button.offsetWidth, button.offsetHeight) < 44)
    .map(button => `${button.textContent.trim()} ${button.offsetWidth}×${button.offsetHeight}`));

  // Each collection is opened in turn and checked in both fonts. With 30 collections this is slow on
  // CI's WebKit phone profile, hence the longer time limit.
  test('the collections reflow at 320 px with 200% text', async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    await isolate(context);
    const page = await context.newPage();
    await page.goto('./?view=collections');
    const accordion = page.locator('.collections-accordion');
    const items = accordion.locator('.mantine-Accordion-item');
    await expect(items.first()).toBeVisible();
    await page.addStyleTag({ content: LARGE_TEXT });
    await page.addStyleTag({ content: WIDE_FONT });
    // Mantine animates a panel's height for 200 ms and drops its fixed height when the transition
    // ends. A 1 ms transition keeps those steps, so the panels open the same way, only faster.
    await page.addStyleTag({ content: '.collections-accordion .mantine-Accordion-panel{transition-duration:1ms!important}' });
    for (const [font, wide] of Object.entries(fonts)) {
      await useFont(page, wide);
      expect(await pageFits(page), `${font}: horizontal overflow`).toBe(true);
      expect(await spilling(accordion), font).toEqual([]);
      expect(await clipped(accordion), font).toEqual([]);
      // Once a title would have too little room beside its mark, the mark moves above it.
      expect(await brokenWords(accordion.locator('.mantine-Accordion-control p'), '.mantine-Accordion-label'), font).toEqual([]);
    }
    for (let index = 0; index < await items.count(); index++) {
      const item = items.nth(index);
      const control = item.locator('.mantine-Accordion-control');
      const panel = item.locator('.mantine-Accordion-panel');
      // Opened from the keyboard, so the sticky header, tall at 200%, never takes the pointer's click.
      await control.focus();
      await page.keyboard.press('Enter');
      await expect(control).toHaveAttribute('aria-expanded', 'true');
      // The panel has finished opening once Mantine drops its fixed height and hidden overflow.
      await expect.poll(() => panel.evaluate(element => getComputedStyle(element).overflow), { intervals: [20] }).toBe('visible');
      for (const [font, wide] of Object.entries(fonts)) {
        await useFont(page, wide);
        const name = `${font}, collection ${index + 1}`;
        expect(await pageFits(page), `${name}: horizontal overflow`).toBe(true);
        expect(await spilling(item), name).toEqual([]);
        expect(await clipped(item), name).toEqual([]);
        expect(await smallTargets(item), name).toEqual([]);
        expect(await brokenWords(panel.locator('.mantine-Button-label'), '.mantine-Button-label'), name).toEqual([]);
        // The main button keeps its default side insets, so even "kümedeki" stays whole.
        expect(await brokenWords(item.getByRole('button', { name: 'Bu kümedeki kitaplar' }).locator('.mantine-Button-label')), name).toEqual([]);
      }
    }
    await context.close();
  });

  // The mark moves above a title only when the title would have less than 8em beside it: never at
  // 100% or 125% text on a 320 px phone, and at 200% text below 482 px.
  test('collection titles keep whole words beside their mark up to 200% text', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    await isolate(context);
    const page = await context.newPage();
    await page.goto('./?view=collections');
    const accordion = page.locator('.collections-accordion');
    await expect(accordion.locator('.mantine-Accordion-item').first()).toBeVisible();
    await page.addStyleTag({ content: WIDE_FONT });
    const markAbove = () => accordion.locator('.mantine-Accordion-label').first().evaluate(label => {
      const [mark, title] = label.querySelector('.mantine-Group-root').children;
      return title.getBoundingClientRect().top >= mark.getBoundingClientRect().bottom;
    });
    for (const [size, width, above] of [['100%', 320, false], ['125%', 320, false], ['200%', 481, true], ['200%', 482, false], ['200%', 483, false]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, size);
      for (const [font, wide] of Object.entries(fonts)) {
        await useFont(page, wide);
        const name = `${size} text, ${width} px, ${font}`;
        expect(await markAbove(), name).toBe(above);
        expect(await pageFits(page), `${name}: horizontal overflow`).toBe(true);
        expect(await brokenWords(accordion.locator('.mantine-Accordion-control p'), '.mantine-Accordion-label'), name).toEqual([]);
      }
    }
    await context.close();
  });
});

// The page numbers replace the compact "Sayfa x / y" only when the bar has room for them at the current text size.
// At the default size the bar switches at 400 and 640 px screens; that assumes the 8 px phone
// gutter and overlay scrollbars, as in headless browsers.
test('page numbers appear only when the pagination has room for them', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await isolate(context);
  const page = await context.newPage();
  await page.goto('./');
  const chevron = page.getByRole('button', { name: 'Sayfaya git' }).locator('.mantine-Button-section');
  const numbers = page.locator('.pagination-desktop');
  const compact = page.locator('.pagination-mobile');
  await expect(chevron).toBeHidden();
  await page.setViewportSize({ width: 401, height: 900 });
  await expect(chevron).toBeVisible();
  await page.setViewportSize({ width: 639, height: 900 });
  await expect(compact).toBeVisible();
  await expect(numbers).toBeHidden();
  await page.setViewportSize({ width: 640, height: 900 });
  await expect(numbers).toBeVisible();
  await expect(compact).toBeHidden();
  // With 150% text a 1280 px screen still has room for the page numbers.
  await page.addStyleTag({ content: 'html{font-size:150%}' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(numbers).toBeVisible();
  expect(await pageFits(page), '1280 px, 150% text').toBe(true);
  expect(await spilling(page.locator('.catalog-pagination')), '1280 px, 150% text').toEqual([]);
  await page.addStyleTag({ content: LARGE_TEXT });
  for (const width of [640, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await pageFits(page), `${width} px, 200% text`).toBe(true);
    expect(await spilling(page.locator('.catalog-pagination')), `${width} px, 200% text`).toEqual([]);
  }
  await context.close();
});

test('the book sheet keeps its text inside its boxes at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  await isolate(context);
  const page = await context.newPage();
  // Management carries a caution with a 13-digit ISBN, a word that cannot wrap at a space.
  for (const book of ['good-to-great-by-jim-collins', 'fadis-by-gulten-dayioglu', 'management-by-peter-f-drucker']) {
    await page.goto(`./?book=${book}`);
    const sheet = page.locator('.mantine-Drawer-content');
    await expect(sheet.locator('.reading-priority-card')).toBeVisible();
    // Open every section one at a time. One sits inside another's panel and shows only once that
    // panel opens, and a click on a section that is still moving can be lost, so each click is
    // repeated until its own section reports it is open.
    const controls = sheet.locator('.mantine-Accordion-control');
    for (let index = 0; index < await controls.count(); index++) {
      const control = controls.nth(index);
      await expect(async () => {
        if (await control.getAttribute('aria-expanded') === 'false') await control.click({ timeout: 2_000 });
        await expect(control).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
    }
    await expect(sheet.locator('.mantine-Accordion-control[aria-expanded="false"]')).toHaveCount(0);
    await page.addStyleTag({ content: LARGE_TEXT });
    await page.addStyleTag({ content: WIDE_FONT });
    for (const [font, wide] of Object.entries(fonts)) {
      await useFont(page, wide);
      // The sheet scrolls on its own, so it is checked apart from the page.
      expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth), `${book}: the sheet scrolls sideways in the ${font}`).toBe(true);
      expect(await spilling(sheet.locator('.reading-priority-card, .edition-summary, .detail-sections')), `${book}, ${font}`).toEqual([]);
    }
  }
  await context.close();
});

// LARGE_TEXT, with WIDE_FONT ready, in place before the page first renders, as with a browser's own
// font size setting. The toast and the book sheet switch layout with em container queries, and
// Chromium does not always re-evaluate those when the root size of an open page changes.
const enlargeTextFromStart = context => context.addInitScript(text => {
  const add = () => document.documentElement.append(Object.assign(document.createElement('style'), { textContent: text }));
  if (document.documentElement) add();
  else new MutationObserver((_, observer) => { if (document.documentElement) { observer.disconnect(); add(); } }).observe(document, { childList: true });
}, LARGE_TEXT.replace('html', 'html:root') + WIDE_FONT);
// Waits for the fonts and for running transitions, such as an accordion opening and its chevron turning.
const settled = page => page.evaluate(() => document.fonts.ready.then(() => Promise.all(document.getAnimations()
  .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
  .map(animation => animation.finished.catch(() => {})))));
const onScreen = async locator => {
  const box = await locator.boundingBox();
  const { width, height } = locator.page().viewportSize();
  return box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height;
};
// A field shows its whole value: its text does not run past its box.
const showsWholeValue = locator => locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1);
// The value a select shows, whether its field is an input or a button.
const shownValue = locator => locator.evaluate(element => (element.value || element.textContent).trim());

test('long select values wrap instead of being cut off at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  await isolate(context);
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.addStyleTag({ content: LARGE_TEXT + WIDE_FONT });
  await settled(page);
  const sort = page.getByRole('combobox', { name: 'Kitapları sırala' });
  for (const [font, wide] of Object.entries(fonts)) {
    await useFont(page, wide);
    expect(await showsWholeValue(sort), `${font}: the sort value is cut off`).toBe(true);
    expect(await clipped(sort), font).toEqual([]);
    expect(await shownValue(sort), font).toBe('Okuma önceliği');
  }
  // One focus indicator: a bar under the field, nothing around it.
  await page.getByRole('button', { name: /^Filtreler/ }).focus();
  await page.keyboard.press('Tab');
  await expect(sort).toBeFocused();
  await expect(sort).toHaveCSS('outline-style', 'none');
  await expect(sort).toHaveCSS('box-shadow', 'none');
  expect(await focusBar(sort), 'a focus bar under the sort field').not.toBeNull();
  // The keyboard opens the options, moves through them and picks one; Space opens, Escape closes.
  await page.keyboard.press('ArrowDown');
  await expect(sort).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('option', { selected: true })).toHaveText('Okuma önceliği');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(sort).toHaveText('En çok kesişen');
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await expect(page).toHaveURL(/sort=shared/);
  await page.keyboard.press('Space');
  await expect(sort).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  // The pointer: a click opens the list, a second click closes it, and an option picks its value.
  await sort.click();
  await expect(sort).toHaveAttribute('aria-expanded', 'true');
  await sort.click();
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await sort.click();
  await page.getByRole('option', { name: 'Okuma önceliği' }).click();
  await expect(sort).toHaveText('Okuma önceliği');
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await expect(sort).toBeFocused();
  expect(await pageFits(page)).toBe(true);
  // The related-books select in the book sheet shows the whole label of its chosen option.
  await page.goto('./?book=good-to-great-by-jim-collins');
  const related = page.getByRole('combobox', { name: 'Önerilerin konusu veya kümesi' });
  await expect(related).toBeVisible();
  await page.addStyleTag({ content: LARGE_TEXT + WIDE_FONT });
  await settled(page);
  for (const [font, wide] of Object.entries(fonts)) {
    await useFont(page, wide);
    expect(await showsWholeValue(related), `${font}: the related-books value is cut off`).toBe(true);
    expect(await clipped(related), font).toEqual([]);
  }
  await related.focus();
  await page.keyboard.press('ArrowDown');
  const chosen = (await page.getByRole('option', { selected: true }).textContent()).trim();
  await page.keyboard.press('Escape');
  await expect(related).toHaveAttribute('aria-expanded', 'false');
  expect(await shownValue(related)).toBe(chosen);
  await context.close();
});

// Eight widths, two date states and two fonts make this slow on CI's WebKit, hence the longer time limit.
test('the reading dates and the edition source fit the book sheet at every width with 200% text', async ({ browser }) => {
  test.slow();
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  await isolate(context);
  await enlargeTextFromStart(context);
  const page = await context.newPage();
  await page.goto('./?book=good-to-great-by-jim-collins');
  const sheet = page.locator('.mantine-Drawer-content');
  await expect(sheet.locator('.reading-priority-card')).toBeVisible();
  // Opened from the keyboard, so the sheet's sticky header, tall at 200%, never takes the click.
  const open = async () => {
    for (const name of ['Okuma kaydım ve kişisel notlarım', 'Baskının kaynakları ve kontrol notları']) {
      const control = sheet.getByRole('button', { name });
      if (await control.getAttribute('aria-expanded') === 'true') continue;
      await control.focus();
      await page.keyboard.press('Enter');
      await expect(control).toHaveAttribute('aria-expanded', 'true');
    }
    await settled(page);
  };
  const dates = sheet.locator('.reading-fields input[type=date]');
  // A date field cuts its date off when it is narrower than its natural width.
  const cutOff = () => dates.evaluateAll(inputs => inputs.filter(input => {
    const natural = Object.assign(input.cloneNode(), { tabIndex: -1 });
    natural.style.cssText = 'position:absolute;visibility:hidden;width:auto!important;min-width:0!important;max-width:none!important';
    input.after(natural);
    const needed = natural.getBoundingClientRect().width;
    natural.remove();
    return needed > input.getBoundingClientRect().width + 0.5;
  }).map(input => input.labels[0]?.textContent));
  for (const width of [320, 360, 375, 390, 640, 667, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await open();
    await expect(dates).toHaveCount(2);
    for (const value of ['', '2026-10-04']) {
      for (const input of await dates.all()) await input.fill(value);
      for (const [font, wide] of Object.entries(fonts)) {
        await useFont(page, wide);
        const state = `${width} px, ${font}, ${value ? 'filled' : 'empty'}`;
        expect(await cutOff(), state).toEqual([]);
        // Only a date's width differs between the two states, so the rest of the sheet is checked once.
        if (!value) continue;
        expect(await spilling(sheet.locator('.edition-guide, .discovery-panel, .detail-actions')), state).toEqual([]);
        expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth), `${state}: the sheet scrolls sideways`).toBe(true);
      }
    }
  }
  await expect(sheet.locator('.edition-guide .source-link').first()).toBeVisible();
  await context.close();
});

test('titles keep whole words and move their controls below them at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  await isolate(context);
  const page = await context.newPage();
  const views = [
    { path: './', box: '.reading-route', title: '.reading-route .mantine-Text-root:first-child', text: '.reading-route>div', controls: '.reading-route .mantine-Button-root' },
    { path: './?q=zzzz', box: '.results-heading', title: '.results-heading h1', text: '.results-heading>div:first-child', controls: '.results-heading>div:last-child' },
  ];
  for (const { path, box, title, text, controls } of views) {
    await page.goto(path);
    await expect(page.locator(controls)).toBeVisible();
    await settled(page);
    // At the default size the controls stay beside the title.
    const beside = await page.locator(controls).boundingBox();
    const column = await page.locator(text).boundingBox();
    expect(beside.y < column.y + column.height && beside.x >= column.x + column.width, `${path}: the controls left the title's row at 100%`).toBe(true);
    await page.addStyleTag({ content: LARGE_TEXT + WIDE_FONT });
    await settled(page);
    for (const [font, wide] of Object.entries(fonts)) {
      await useFont(page, wide);
      expect(await brokenWords(page.locator(title), box), `${path}, ${font}`).toEqual([]);
      const below = await page.locator(controls).boundingBox();
      const textBox = await page.locator(text).boundingBox();
      expect(below.y >= textBox.y + textBox.height - 1, `${path}, ${font}: the controls stayed beside the title`).toBe(true);
      expect(below.x >= 0 && below.x + below.width <= 320, `${path}, ${font}: the controls run off the screen`).toBe(true);
      expect(await spilling(page.locator(box)), `${path}, ${font}`).toEqual([]);
      expect(await pageFits(page), `${path}, ${font}`).toBe(true);
    }
  }
  await context.close();
});

test('the purchase toast keeps its title words whole at 320 px with 200% text', async ({ browser }) => {
  // The message column is at least as wide as the title's longest word, as drawn.
  const roomForWords = title => title.evaluate(element => {
    const text = element.firstChild;
    const widest = Math.max(...[...text.data.matchAll(/\S+/g)].map(word => {
      const range = document.createRange();
      range.setStart(text, word.index);
      range.setEnd(text, word.index + word[0].length);
      return [...range.getClientRects()].reduce((sum, rect) => sum + rect.width, 0);
    }));
    return widest <= element.closest('.library-toast-message').clientWidth + 0.5;
  });
  // At the default size the icon and the close button sit beside the title.
  const plain = await browser.newContext({ viewport: { width: 320, height: 900 } });
  await isolate(plain);
  const page = await plain.newPage();
  await page.goto('./');
  await page.locator('.book-card .cover-owned').first().click();
  const plainToast = page.locator('.library-toast');
  await expect(plainToast).toBeVisible();
  const [icon, heading, close] = await Promise.all([plainToast.locator('.library-toast-icon'), plainToast.locator('strong'), plainToast.getByRole('button', { name: 'Bildirimi kapat' })].map(locator => locator.boundingBox()));
  expect(heading.x >= icon.x + icon.width && close.x >= heading.x + heading.width && close.y < heading.y + heading.height, 'the toast left its row layout at 100%').toBe(true);
  await plain.close();
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  await isolate(context);
  await enlargeTextFromStart(context);
  const large = await context.newPage();
  await large.goto('./');
  const owned = large.locator('.book-card .cover-owned').first();
  const toast = large.locator('.library-toast');
  for (const text of ['Kitaplığa eklendi', 'Kitaplıktan çıkarıldı']) {
    // Pressed from the keyboard, so the site header, tall at 200%, never takes the click.
    await owned.focus();
    await large.keyboard.press('Enter');
    await expect(toast).toBeVisible();
    // Focus inside the toast keeps it from closing itself while it is measured.
    await toast.getByRole('button', { name: 'Geri al' }).focus();
    await settled(large);
    for (const [font, wide] of Object.entries(fonts)) {
      await useFont(large, wide);
      expect(await roomForWords(toast.locator('strong')), `${font}: the message column is narrower than a word of the title`).toBe(true);
      expect(await brokenWords(toast.locator('strong'), '.library-toast-message'), `${font}: ${text}`).toEqual([]);
      expect(await spilling(toast), `${font}: ${text}`).toEqual([]);
      for (const name of ['Bildirimi kapat', 'Geri al']) expect(await onScreen(toast.getByRole('button', { name })), `${font}: ${name}`).toBe(true);
    }
    await expect(toast.locator('strong')).toHaveText(text);
    await toast.getByRole('button', { name: 'Bildirimi kapat' }).click();
    await expect(toast).toBeHidden();
  }
  await context.close();
});

// The compact book sheet starts below 16em of sheet width and the stacked toast below 17em of
// screen width: 512 and 544 px with 200% text.
test('the sheet and the toast turn compact just below their limits with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 513, height: 900 } });
  await isolate(context);
  await enlargeTextFromStart(context);
  const page = await context.newPage();
  await page.goto('./?book=good-to-great-by-jim-collins');
  const section = page.locator('.detail-sections .mantine-Accordion-item').first();
  await expect(section).toBeVisible();
  for (const [width, compact] of [[513, false], [512, false], [511, true]]) {
    await page.setViewportSize({ width, height: 900 });
    // A compact section has no card frame, only its top divider.
    await expect.poll(() => section.evaluate(element => getComputedStyle(element).borderLeftWidth === '0px'), `${width} px`).toBe(compact);
  }
  await page.goto('./');
  await page.setViewportSize({ width: 545, height: 900 });
  const owned = page.locator('.book-card .cover-owned').first();
  await owned.focus();
  await page.keyboard.press('Enter');
  const toast = page.locator('.library-toast');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Geri al' }).focus();
  for (const [width, stacked] of [[545, false], [544, false], [543, true]]) {
    await page.setViewportSize({ width, height: 900 });
    // Stacked, the title starts below the icon instead of beside it.
    await expect.poll(async () => {
      const [icon, title] = await Promise.all([toast.locator('.library-toast-icon').boundingBox(), toast.locator('strong').boundingBox()]);
      return title.y >= icon.y + icon.height;
    }, `${width} px`).toBe(stacked);
  }
  await context.close();
});

test('the phone sheet grip shows its whole focus bar inside the sheet', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('./?book=good-to-great-by-jim-collins');
  const grip = page.locator('.sheet-grip');
  await expect(grip).toBeVisible();
  await keyboardFocus(page, grip);
  // The bar must sit inside the sheet, whose edges clip anything outside them.
  const bar = await focusBar(grip);
  expect(bar, 'a focus bar under the grip').not.toBeNull();
  const sheet = await page.locator('.mantine-Drawer-content').boundingBox();
  expect(bar.top >= sheet.y && bar.bottom <= sheet.y + sheet.height).toBe(true);
  await expect(grip).toHaveCSS('outline-style', 'none');
  await context.close();
});

test('books can be filtered by the day they were added to the library', async ({ page }) => {
  const catalog = JSON.parse(readFileSync(new URL('../../src/catalog.json', import.meta.url), 'utf8'));
  const latest = catalog.books.map(book => book.addedAt).sort().at(-1);
  const count = catalog.books.filter(book => book.addedAt === latest).length;
  const label = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${latest}T00:00:00Z`));
  await page.goto(`./?added=${latest}`);
  await expect(page.locator('.results-heading [role="status"]')).toHaveText(new RegExp(`^${count} eser\\b`));
  await page.getByRole('button', { name: /^Filtreler/ }).click();
  await page.getByRole('button', { name: /Eklenme tarihi/ }).click();
  const option = page.getByRole('checkbox', { name: `${label} · ${count} kitap` });
  await expect(option).toBeChecked();
  // The hidden checkbox's keyboard focus bar is drawn under the whole option, nothing around it.
  await keyboardFocus(page, option);
  await expect(page.locator('.filter-choice').filter({ has: option })).toHaveCSS('outline-style', 'none');
  expect(await focusBar(option), 'a focus bar under the option').not.toBeNull();
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('.filter-sheet .mantine-Drawer-content') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => item.id));
  expect(violations).toEqual([]);
  await page.keyboard.press('Escape');
  // The active day shows above the results and can be removed there.
  const chip = page.getByRole('button', { name: new RegExp(`Eklenme · ${label}`) });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.locator('.results-heading [role="status"]')).toHaveText(new RegExp(`^${catalog.books.length} eser\\b`));
  await expect(page).not.toHaveURL(/added=/);
  const book = catalog.books.find(item => item.addedAt === latest);
  await page.goto(`./?book=${book.id}`);
  await expect(page.locator('.detail-heading')).toContainText(`Kitaplığa eklendi · ${label}`);
});

test('page state lives in the URL and survives a reload', async ({ page }) => {
  await page.goto('./?page=5');
  await expect(page.locator('.pagination-page-status')).toContainText('5');
  await page.reload();
  await expect(page.locator('.pagination-page-status')).toContainText('5');
});

for (const colorScheme of ['light', 'dark']) {
  test(`no WCAG A/AA violations on the catalog and a book page (${colorScheme})`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    for (const path of ['./', './?book=good-to-great-by-jim-collins']) {
      await page.goto(path);
      await page.locator('.book-card').first().waitFor();
      if (path.includes('book=')) await page.locator('.reading-priority-card').waitFor();
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`));
      expect(violations, `${colorScheme} ${path}`).toEqual([]);
    }
    await context.close();
  });
}
