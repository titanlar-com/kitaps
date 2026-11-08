import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Sıram, Kümeler and the empty shelves (docs/UI-REDESIGN.md, phase 5). Dark walnut comes first. The
// file name ends in ui-quality so the WebKit and iPhone projects pick it up (playwright.config.js).
const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const QUEUE = ['goodtogreat', 'zerotoone', 'howtoreadabook'];
const seed = (context, personal, states = {}, scheme = 'dark') => context.addInitScript(([personal, states, scheme]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem('kitapatlasi:wood', 'ceviz');
  localStorage.setItem('kitapatlasi:color-scheme', scheme);
  localStorage.setItem('kitapatlasi:states:v2', JSON.stringify(states));
  localStorage.setItem('kitapatlasi:personal:v1', JSON.stringify(personal));
}, [personal, states, scheme]);
test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const filled = { queue: QUEUE, reading: { goodtogreat: { page: 40, totalPages: 320 } } };
const pageFits = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const order = page => page.locator('.reading-queue > li').evaluateAll(rows => rows.map(row => row.dataset.bookId));
// Readable text under 14 CSS px, inside the given part of the page.
const smallText = (page, selector) => page.locator(selector).evaluateAll(roots => roots.flatMap(root => [...root.querySelectorAll('*')].filter(element => {
  const own = [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
  const box = element.getBoundingClientRect();
  return own && box.width > 1 && box.height > 1 && parseFloat(getComputedStyle(element).fontSize) < 14;
}).map(element => `${element.className} ${getComputedStyle(element).fontSize}`)));
// Text that runs out of its own box.
const spilling = (page, selector) => page.locator(selector).evaluateAll(roots => roots.flatMap(root => [root, ...root.querySelectorAll('*')])
  .filter(node => !node.matches('.visually-hidden') && getComputedStyle(node).overflowX === 'visible' && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
  .map(node => `${node.className} "${node.textContent.trim().slice(0, 40)}"`));
const violations = async page => {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(() => window.axe.run(document.querySelector('#main-content'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  return result.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`);
};
// Keyboard mode on, then focus on the control; the same way a Tab reaches it. WebKit's own Tab only
// reaches form fields, so the mode is opened with the key and focus is placed directly.
const focusByKeyboard = async (page, locator) => {
  await page.keyboard.press('Tab');
  await expect(page.locator('html')).toHaveAttribute('data-focus-mode', 'keyboard');
  await locator.focus();
  await expect(locator).toBeFocused();
};
const focusBar = locator => locator.evaluate(element => {
  const after = getComputedStyle(element, '::after'); const own = getComputedStyle(element);
  return { content: after.content, position: after.position, height: parseFloat(after.height), outline: own.outlineStyle, ring: own.boxShadow };
});

test.describe('Sıram', () => {
  for (const width of [320, 360, 390, 768, 1280]) {
    test(`at ${width} px the queue fits the screen and keeps its order`, async ({ page, context }) => {
      await seed(context, filled);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./?view=queue');
      await expect(page.locator('.reading-queue > li')).toHaveCount(3);
      expect(await order(page)).toEqual(QUEUE);
      expect(await pageFits(page), 'no page overflow').toBe(true);
      expect(await spilling(page, '.reading-queue')).toEqual([]);
      expect(await smallText(page, '.queue-desk')).toEqual([]);
    });
  }

  test('the move buttons reorder at once and keep the keyboard on the moved book', async ({ page, context }) => {
    await seed(context, filled);
    await page.goto('./?view=queue');
    const row = page.locator('.reading-queue > li').first();
    const title = await row.locator('.title-button').textContent();
    expect(title.length).toBeGreaterThan(0);
    const down = page.getByRole('button', { name: `${title}: sırada aşağı taşı` });
    await focusByKeyboard(page, down);
    await page.keyboard.press('Enter');
    await expect.poll(() => order(page)).toEqual(['zerotoone', 'goodtogreat', 'howtoreadabook']);
    await expect(down).toBeFocused();
    await expect(page.locator('.queue-status')).toHaveText(`${title} 2. sıraya taşındı.`);
    // The order is written to the reader's own record, and stays after a reload.
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kitapatlasi:personal:v1')).queue)).toEqual(['zerotoone', 'goodtogreat', 'howtoreadabook']);
    await page.reload();
    await expect.poll(() => order(page)).toEqual(['zerotoone', 'goodtogreat', 'howtoreadabook']);
  });

  test('a book reaching the end hands the keyboard to the arrow that still works', async ({ page, context }) => {
    await seed(context, filled);
    await page.goto('./?view=queue');
    const second = page.locator('.reading-queue > li').nth(1);
    const title = await second.locator('.title-button').textContent();
    const up = page.getByRole('button', { name: `${title}: sırada yukarı taşı` });
    await focusByKeyboard(page, up);
    await page.keyboard.press('Enter');
    await expect(up).toBeDisabled();
    await expect(page.getByRole('button', { name: `${title}: sırada aşağı taşı` })).toBeFocused();
  });

  test('the keyboard focus bar shows under a move button, and nothing surrounds it', async ({ page, context }) => {
    await seed(context, filled);
    await page.goto('./?view=queue');
    const control = page.locator('.reading-queue > li').nth(1).getByRole('button', { name: /sırada yukarı taşı$/ });
    await focusByKeyboard(page, control);
    const bar = await focusBar(control);
    expect(bar.content).not.toBe('none');
    expect(bar.position).toBe('absolute');
    expect(bar.height).toBeGreaterThanOrEqual(2);
    expect(bar.outline).toBe('none');
    expect(bar.ring).toBe('none');
  });

  test('the next book stands on a lighter layer than the rest, and no row wears a frame', async ({ page, context }) => {
    await seed(context, filled);
    await page.goto('./?view=queue');
    const looks = await page.locator('.reading-queue > li').evaluateAll(rows => rows.map(row => { const style = getComputedStyle(row); return { background: style.backgroundColor, border: style.borderTopWidth }; }));
    const tones = await page.evaluate(() => { const probe = name => { const node = document.body.appendChild(document.createElement('div')); node.style.backgroundColor = `var(${name})`; const value = getComputedStyle(node).backgroundColor; node.remove(); return value; }; return { first: probe('--surface-2'), rest: probe('--surface') }; });
    expect(looks[0].background).toBe(tones.first);
    expect(looks[1].background).toBe(tones.rest);
    expect(looks.map(look => look.border)).toEqual(['0px', '0px', '0px']);
  });

  test('at 200% text on a 320 px phone everything still fits', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
    await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: {} }));
    await seed(context, filled);
    const page = await context.newPage();
    await page.goto('./?view=queue');
    await expect(page.locator('.reading-queue > li')).toHaveCount(3);
    await page.addStyleTag({ content: 'html{font-size:200%}' });
    expect(await pageFits(page)).toBe(true);
    expect(await spilling(page, '.reading-queue')).toEqual([]);
    const small = await page.locator('.queue-row button').evaluateAll(buttons => buttons.filter(button => button.getClientRects().length && Math.min(button.offsetWidth, button.offsetHeight) < 44).map(button => button.getAttribute('aria-label') || button.textContent));
    expect(small).toEqual([]);
    await context.close();
  });

  test('an empty queue offers its next step, and it opens the catalogue', async ({ page, context }) => {
    await seed(context, { queue: [], reading: {} });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('./?view=queue');
    await expect(page.getByRole('heading', { level: 2, name: 'Bir sonraki kitabına yer aç.' })).toBeVisible();
    expect(await pageFits(page)).toBe(true);
    expect(await smallText(page, '.queue-desk')).toEqual([]);
    await page.getByRole('button', { name: 'Kitap seç' }).click();
    await expect(page.locator('.book-card').first()).toBeVisible();
    expect(page.url()).not.toContain('view=queue');
  });

  for (const scheme of ['dark', 'light']) {
    test(`a full queue has no accessibility violations, ${scheme} theme`, async ({ page, context }) => {
      await seed(context, filled, { goodtogreat: ['okunuyor'] }, scheme);
      await page.goto('./?view=queue');
      await expect(page.locator('.reading-queue > li')).toHaveCount(3);
      expect(await violations(page)).toEqual([]);
    });

    test(`an empty queue has no accessibility violations, ${scheme} theme`, async ({ page, context }) => {
      await seed(context, { queue: [], reading: {} }, {}, scheme);
      await page.goto('./?view=queue');
      await expect(page.locator('.desk-empty')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }
});

test.describe('Kümeler', () => {
  const read = { goodtogreat: ['okundu'], zerotoone: ['okundu'] };

  for (const [width, columns] of [[320, 1], [360, 1], [390, 1], [768, 2], [1280, 3]]) {
    test(`at ${width} px the collections stand in ${columns} column${columns > 1 ? 's' : ''} and fit the screen`, async ({ page, context }) => {
      await seed(context, { queue: [], reading: {} }, read);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./?view=collections');
      const cards = page.locator('.collection-card');
      await expect(cards.first()).toBeVisible();
      const lefts = await cards.evaluateAll(all => new Set(all.map(card => Math.round(card.getBoundingClientRect().left))).size);
      expect(lefts).toBe(columns);
      expect(await pageFits(page), 'no page overflow').toBe(true);
      expect(await spilling(page, '.collections-accordion')).toEqual([]);
      expect(await smallText(page, '.collections-accordion')).toEqual([]);
    });
  }

  test('a cover preview keeps the 2:3 frame and shows the whole cover', async ({ page, context }) => {
    await seed(context, { queue: [], reading: {} });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./?view=collections');
    const frame = page.locator('.collection-covers .mantine-Avatar-root').first();
    await expect(frame).toBeVisible();
    const look = await frame.evaluate(element => { const box = element.getBoundingClientRect(); const image = element.querySelector('img'); return { ratio: box.width / box.height, fit: image && getComputedStyle(image).objectFit, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) }; });
    expect(Math.abs(look.ratio - 2 / 3)).toBeLessThan(0.02);
    expect(look.fit).toBe('contain');
    expect(look.radius).toBeLessThanOrEqual(5);
  });

  test('a read book moves the bar, and the bar has square ends', async ({ page, context }) => {
    await seed(context, { queue: [], reading: {} }, read);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./?view=collections');
    const bars = page.locator('.collection-card').getByRole('progressbar');
    await expect(bars.first()).toBeAttached();
    const values = await bars.evaluateAll(all => all.map(bar => Number(bar.getAttribute('aria-valuenow'))));
    expect(values.some(value => value > 0), 'some collection shows reading').toBe(true);
    const radius = await page.locator('.collection-card .mantine-Progress-root').first().evaluate(element => parseFloat(getComputedStyle(element).borderTopLeftRadius));
    expect(radius).toBeLessThanOrEqual(5);
    await expect(page.locator('.collection-read-share').first()).toHaveCSS('font-variant-numeric', 'tabular-nums');
  });

  test('a card opens the books of its collection', async ({ page, context }) => {
    await seed(context, { queue: [], reading: {} });
    await page.goto('./?view=collections');
    const first = page.locator('.collection-card').first();
    await first.getByRole('button', { name: /^Bu kümedeki kitaplar/ }).click();
    await expect(page).toHaveURL(/collection=time/);
    await expect(page.locator('.book-card').first()).toBeVisible();
  });

  test('the keyboard opens a card\'s details and the focus bar shows on it', async ({ page, context }) => {
    await seed(context, { queue: [], reading: {} });
    await page.goto('./?view=collections');
    const control = page.locator('.collection-card .mantine-Accordion-control').first();
    await focusByKeyboard(page, control);
    const bar = await focusBar(control);
    expect(bar.content).not.toBe('none');
    expect(bar.outline).toBe('none');
    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.collection-card').first().locator('.subset-button').first()).toBeVisible();
  });

  test('a search that finds nothing offers a way back, and the page fits at 320 px', async ({ page, context }) => {
    await seed(context, { queue: [], reading: {} });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('./?view=collections');
    await page.getByRole('textbox', { name: 'Kümeler arasında ara' }).fill('zzzz');
    await expect(page.getByRole('heading', { level: 2, name: 'Bu aramayla eşleşen küme yok.' })).toBeVisible();
    expect(await pageFits(page)).toBe(true);
    await page.getByRole('button', { name: 'Aramayı temizle' }).click();
    await expect(page.locator('.collection-card').first()).toBeVisible();
  });

  for (const scheme of ['dark', 'light']) {
    test(`the collections have no accessibility violations, ${scheme} theme`, async ({ page, context }) => {
      await seed(context, { queue: [], reading: {} }, read, scheme);
      await page.goto('./?view=collections');
      await expect(page.locator('.collection-card').first()).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }
});

test.describe('the empty shelves', () => {
  for (const [address, heading] of [['./?view=favorites', 'Henüz favori kitap yok.'], ['./?view=library', 'Kitaplığın ilk kitabını bekliyor.']]) {
    test(`${address} says what to do next, fits 320 px and passes axe`, async ({ page, context }) => {
      await seed(context, { queue: [], reading: {} });
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(address);
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
      expect(await pageFits(page)).toBe(true);
      expect(await smallText(page, '.desk-empty')).toEqual([]);
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Kataloğa git' }).click();
      await expect(page.locator('.book-card').first()).toBeVisible();
    });
  }

  test('with a book on it the shelf shows the catalogue grid as it is', async ({ page, context }) => {
    await seed(context, { queue: [], reading: {} }, { goodtogreat: ['onemli'] });
    await page.goto('./?view=favorites');
    await expect(page.locator('.books-grid .book-card')).toHaveCount(1);
    await expect(page.locator('.desk-empty')).toHaveCount(0);
  });
});
