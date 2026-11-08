import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The bookstores page and its place in the header: four sections side by side on a phone and
// beside the wordmark on a wide screen (owner's request, 7 November 2026).
const data = JSON.parse(readFileSync(new URL('../../data/bookstores.json', import.meta.url), 'utf8'));
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const SECTIONS = ['Kitaplar', 'Sıram', 'Kümeler', 'Kitapçılar'];

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

// The tabs' boxes, and whether each label shows whole on one line.
const tabs = page => page.locator('.main-tabs .mantine-Tabs-tab').evaluateAll(nodes => nodes.map(node => {
  const box = node.getBoundingClientRect(); const label = node.querySelector('.mantine-Tabs-tabLabel');
  const line = parseFloat(getComputedStyle(label).lineHeight) || parseFloat(getComputedStyle(label).fontSize) * 1.5;
  return { name: label.textContent.trim(), top: Math.round(box.top), left: box.left, right: box.right, whole: label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().height <= line * 1.4 && box.right <= innerWidth + .5 };
}));

for (const width of [320, 360, 375, 390, 430, 575]) {
  test(`on a ${width} px phone the four sections sit side by side, each label whole`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const row = await tabs(page);
    expect(row.map(tab => tab.name)).toEqual(SECTIONS);
    expect(new Set(row.map(tab => tab.top)).size, 'one row').toBe(1);
    expect(row.filter(tab => !tab.whole).map(tab => tab.name), 'labels cut or wrapped').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
  });
}

for (const width of [896, 1024, 1280, 1920]) {
  test(`at ${width} px the four sections sit beside the wordmark`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const row = await tabs(page);
    expect(row.map(tab => tab.name)).toEqual(SECTIONS);
    expect(new Set(row.map(tab => tab.top)).size, 'one row').toBe(1);
    expect(row.filter(tab => !tab.whole).map(tab => tab.name)).toEqual([]);
    const brand = await page.locator('.brand-link').boundingBox();
    const shortcuts = await page.locator('.header-shortcuts').boundingBox();
    expect(row[0].left, 'after the wordmark').toBeGreaterThan(brand.x + brand.width);
    expect(row[3].right, 'before the shortcuts').toBeLessThanOrEqual(shortcuts.x);
    const header = await page.locator('.site-header').boundingBox();
    expect(header.height, 'the header keeps one row').toBeLessThan(90);
  });
}

test('the Kitapçılar tab opens the page with the day’s route and every store from the notes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Kitapçılar' }).click();
  await expect(page).toHaveURL(/[?&]view=bookstores\b/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
  // The plan in the owner's order: Beyoğlu on 7 November 2026, then Kanyon, Akmerkez and
  // Nişantaşı, then Kadıköy and İçerenköy, then a suggestion marked as one.
  const visits = page.locator('.bookstore-visit');
  await expect(visits.locator('h3')).toHaveText(data.plan.map(visit => visit.title));
  await expect(visits.first().locator('ol > li h4')).toHaveText(['Minoa Pera', 'Mephisto Beyoğlu', 'Homer Kitabevi']);
  await expect(visits.nth(1).locator('ol > li h4')).toHaveText(['Remzi Kitabevi Kanyon', 'D&R Kanyon', 'Remzi Kitabevi Akmerkez', 'Pandora Nişantaşı', 'Remzi Kitabevi Rumeli Caddesi']);
  await expect(visits.last()).toContainText('Öneri');
  // Every store has its own entry, closed ones in their own part of the page.
  for (const store of data.stores) await expect(page.locator(`#store-${store.id}`), store.id).toHaveCount(1);
  await expect(page.locator('.bookstores-closed #store-remzi-suadiye')).toHaveCount(1);
  // Map links search the store by name and address; outside links open in a new tab.
  const map = page.locator('#store-minoa-pera').getByRole('link', { name: /Haritada aç/ });
  await expect(map).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Minoa%20Pera/);
  for (const link of await page.locator('.bookstores-page a[href^="http"]').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  }
  // A topic sends the reader to the store's entry on the same page: the page scrolls and focus
  // moves to the entry's heading. The address keeps the page, since the app reads its hash as a route.
  await page.locator('.bookstore-topics').getByRole('link', { name: 'Türkmen Kitabevi' }).click();
  const heading = page.locator('#store-turkmen-beyazit h3');
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(page).toHaveURL(/[?&]view=bookstores$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
});

test('the bookstores page keeps its text inside at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }));
  const page = await context.newPage();
  await page.goto('./?view=bookstores');
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
  const spilling = await page.locator('.bookstores-page').evaluate(root => [...root.querySelectorAll('h2, h3, p, dt, dd, a, li')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.trim().slice(0, 40)));
  expect(spilling).toEqual([]);
  // The four sections may share two rows at this size, but each stays on the screen.
  for (const tab of await tabs(page)) expect(tab.whole, tab.name).toBe(true);
  await context.close();
});

// Redesign, phase 6 (docs/UI-REDESIGN.md): the page as a reading desk of layered surfaces.
const WORDS = { open: 'Açık', closed: 'Kapandı', unverified: 'Doğrulanmadı' };
const openPage = async page => {
  await page.goto('./?view=bookstores');
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
};

test('each store says in words whether it is open, closed or unverified', async ({ page }) => {
  await openPage(page);
  for (const store of data.stores) await expect(page.locator(`#store-${store.id} .place-badge`), store.id).toHaveText(WORDS[store.status]);
});

test('a visit is an ordered timeline: its stops keep their order on square numbered bullets', async ({ page }) => {
  await openPage(page);
  for (const [index, visit] of data.plan.entries()) {
    const timeline = page.locator('.bookstore-visit').nth(index).locator('ol.mantine-Timeline-root');
    await expect(timeline.locator('> li.mantine-Timeline-item')).toHaveCount(visit.stops.length);
    await expect(timeline.locator('> li h4')).toHaveText(visit.stops.map(id => data.stores.find(store => store.id === id).name));
  }
  const bullets = await page.locator('.bookstore-visit').first().locator('.mantine-Timeline-itemBullet').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(); const style = getComputedStyle(node); const number = getComputedStyle(node, '::before');
    return { radius: parseFloat(style.borderTopLeftRadius), square: Math.abs(box.width - box.height) < .5, width: box.width, drawn: number.content, size: parseFloat(number.fontSize), numbers: number.fontVariantNumeric };
  }));
  for (const bullet of bullets) {
    expect(bullet.radius).toBeLessThanOrEqual(5);
    expect(bullet.square).toBe(true);
    expect(bullet.width).toBeGreaterThan(2 * bullet.radius);
    expect(bullet.drawn).toMatch(/counter/);
    expect(bullet.size).toBeGreaterThanOrEqual(14);
    expect(bullet.numbers).toContain('tabular-nums');
  }
});

test('the suggested routes keep their order on a timeline, and an either-or route stays a plain list', async ({ page }) => {
  await openPage(page);
  const cards = page.locator('.bookstore-route');
  for (const [index, route] of data.routes.entries()) {
    const names = route.stops.map(id => data.stores.find(store => store.id === id).name);
    if (route.either) await expect(cards.nth(index).locator('ul > li')).toHaveText(names);
    else await expect(cards.nth(index).locator('ol.mantine-Timeline-root > li')).toHaveText(names);
  }
});

test('a store\'s facts are a definition list, and its numbers are tabular', async ({ page }) => {
  await openPage(page);
  const store = data.stores.find(item => item.hours && item.transit && item.phone);
  const list = page.locator(`#store-${store.id} dl`);
  await expect(list.locator('dt')).toContainText(['Adres', 'Telefon', 'Saat', 'Ulaşım']);
  await expect(list.locator('dd').first()).toHaveText(store.address);
  expect(await list.locator('dd').first().evaluate(node => getComputedStyle(node).fontVariantNumeric)).toContain('tabular-nums');
});

test('a long note folds, opens and folds again, and its control is a real target', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openPage(page);
  const store = [...data.stores].sort((a, b) => (b.about + (b.caution ?? '')).length - (a.about + (a.caution ?? '')).length)[0];
  const card = page.locator(`#store-${store.id}`);
  const more = card.getByRole('button', { name: /devamını oku/i });
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  const height = await more.boundingBox();
  expect(height.height).toBeGreaterThanOrEqual(24);
  const clip = card.locator('.mantine-Spoiler-content');
  const folded = await clip.evaluate(node => node.clientHeight);
  await more.click();
  const less = card.getByRole('button', { name: /daralt/i });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => clip.evaluate(node => node.clientHeight)).toBeGreaterThan(folded);
  await less.click();
  await expect(card.getByRole('button', { name: /devamını oku/i })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => clip.evaluate(node => node.clientHeight)).toBe(folded);
});

test('the note\'s control keeps clear of what follows it at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }));
  const page = await context.newPage();
  await openPage(page);
  const control = page.locator('.bookstore .mantine-Spoiler-control').first();
  await expect(control).toBeVisible();
  const overlaps = await control.evaluate(node => {
    const box = node.getBoundingClientRect(); const next = node.closest('.mantine-Spoiler-root').nextElementSibling?.getBoundingClientRect();
    return next ? box.bottom > next.top + .5 : false;
  });
  expect(overlaps).toBe(false);
  await context.close();
});

test('the topics table scrolls inside its own box at 320 px and the page stays still', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openPage(page);
  const scroller = page.locator('.bookstore-topics .mantine-ScrollArea-viewport');
  const table = page.locator('.bookstore-topics table');
  await expect(table.locator('thead th')).toHaveText(['Konu', 'Nereye gidilir', 'Neden']);
  await expect(table.locator('tbody tr')).toHaveCount(data.topics.length);
  const wide = await scroller.evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth, body: document.documentElement.scrollWidth, screen: innerWidth }));
  expect(wide.scroll, 'the table is wider than its box').toBeGreaterThan(wide.client);
  expect(wide.body, 'the page does not scroll sideways').toBeLessThanOrEqual(wide.screen);
  // No word is cut: the columns keep a readable width and the first one never breaks inside a word.
  const cells = await table.locator('tbody tr > :first-child').evaluateAll(nodes => nodes.map(node => { const style = getComputedStyle(node); return [style.wordBreak, style.overflowWrap, node.getBoundingClientRect().width]; }));
  for (const [wordBreak, overflowWrap, width] of cells) { expect(wordBreak).not.toBe('break-all'); expect(overflowWrap).not.toBe('anywhere'); expect(width).toBeGreaterThanOrEqual(150); }
  // A keyboard reaches the box itself, so the last column can be read without a pointer.
  await expect(scroller).toHaveAttribute('tabindex', '0');
  await expect(scroller).toHaveAttribute('role', 'region');
  await scroller.focus();
  await expect(scroller).toBeFocused();
  if (browserName === 'chromium') {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => scroller.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  }
});

test('the table\'s box shows the keyboard bar along its top and no frame around it', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openPage(page);
  const scroller = page.locator('.bookstore-topics .mantine-ScrollArea-viewport');
  await page.locator('.bookstore-topics tbody a').first().focus();
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');
  await expect(scroller).toBeFocused();
  const drawn = await scroller.evaluate(node => { const style = getComputedStyle(node); const bar = getComputedStyle(node, '::before'); return { content: bar.content, height: parseFloat(bar.height), outline: style.outlineStyle, shadow: style.boxShadow, border: parseFloat(style.borderTopWidth) }; });
  expect(drawn.content).not.toBe('none');
  expect(drawn.height).toBe(3);
  expect(drawn.outline).toBe('none');
  expect(drawn.shadow).toBe('none');
  expect(drawn.border).toBe(0);
});

for (const width of [320, 360, 375, 390, 768, 1280]) {
  test(`at ${width} px the page keeps its text readable, its width and its depth without a frame`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => { localStorage.setItem('kitapatlasi:wood', 'ceviz'); localStorage.setItem('kitapatlasi:color-scheme', 'dark'); });
    await openPage(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
    const report = await page.locator('.bookstores-page').evaluate(root => {
      const small = new Set();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const node = walker.currentNode; if (!node.textContent.trim() || !node.parentElement.getClientRects().length || node.parentElement.closest('.visually-hidden')) continue; if (parseFloat(getComputedStyle(node.parentElement).fontSize) < 14) small.add(node.textContent.trim().slice(0, 30)); }
      const nested = root.querySelectorAll('.mantine-Card-root .mantine-Card-root').length;
      const framed = [...root.querySelectorAll('.mantine-Card-root')].filter(card => parseFloat(getComputedStyle(card).borderTopWidth) > 0).length;
      return { small: [...small], nested, framed };
    });
    expect(report.small, 'text under 14 px').toEqual([]);
    expect(report.nested, 'no card inside a card').toBe(0);
    expect(report.framed, 'cards stand apart by tone').toBe(0);
    // Depth comes from tone: the floor is darker than the panel that sits on it.
    const tone = await page.evaluate(() => {
      const lum = value => { const [r, g, b] = value.match(/[\d.]+/g).map(Number); return .2126 * r + .7152 * g + .0722 * b; };
      return { floor: lum(getComputedStyle(document.body).backgroundColor), panel: lum(getComputedStyle(document.querySelector('.bookstore')).backgroundColor) };
    });
    expect(tone.panel).toBeGreaterThan(tone.floor);
  });
}
