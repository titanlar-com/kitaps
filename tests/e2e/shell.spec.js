import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// The redesign's application shell (docs/UI-REDESIGN.md, phase 2, 8 November 2026): the
// shortcuts count favourites and purchases, a marker slides under the chosen section, and the
// header lifts off the page once the page scrolls.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  // Two favourites, one of them purchased.
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kitapatlasi:states:v2', JSON.stringify({ goal: ['onemli', 'alindi'], meditations: ['onemli'] }));
  });
});

for (const width of [320, 390, 1280]) {
  test(`at ${width} px the shortcuts show how many favourites and purchases there are`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const favorites = page.locator('.header-favorites');
    const library = page.locator('.header-library');
    await expect(favorites).toHaveAccessibleName('Favoriler: 2 kitap');
    await expect(library).toHaveAccessibleName('Kitaplığım: 1 kitap');
    // The count is written inside the button, beside its icon (review of 8 November 2026: a badge
    // over the icon covered it with enlarged text).
    await expect(favorites.locator('.shortcut-count')).toHaveText('2');
    await expect(library.locator('.shortcut-count')).toHaveText('1');
    // The count is part of the name, so screen readers do not read it twice.
    await expect(favorites.locator('.shortcut-count')).toHaveAttribute('aria-hidden', 'true');
    // Nothing spills out of the page at this width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`at ${width} px a marker slides under the chosen section`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const marker = page.locator('.main-tabs-indicator');
    // Both boxes are read on every try: the tabs may still move while the font loads, and the
    // marker follows them (an early tab box made this check fail under load, 8 November 2026).
    const under = async name => {
      await expect.poll(async () => {
        const [tab, box] = [await page.getByRole('tab', { name }).boundingBox(), await marker.boundingBox()];
        return Boolean(tab && box) && Math.abs(box.x - tab.x) <= 1 && Math.abs(box.width - tab.width) <= 1 && Math.abs((box.y + box.height) - (tab.y + tab.height)) <= 1;
      }, { message: `the marker sits under ${name}` }).toBe(true);
    };
    await under('Kitaplar');
    await page.getByRole('tab', { name: 'Kümeler' }).click();
    await under('Kümeler');
  });
}

test('the header lifts off the page once the page scrolls, and settles back at the top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./');
  const header = page.locator('.site-header');
  await expect(header).not.toHaveAttribute('data-scrolled', 'true');
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-scrolled', 'true');
  await expect.poll(() => header.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(header).not.toHaveAttribute('data-scrolled', 'true');
});

// While the marker catches up with tabs that reflow (here: text enlarged as the page loads), it
// must never push the page sideways, not even for a frame (book-fairs and bookstores 200% tests).
test('at 320 px with 200% text the marker never pushes the page sideways while it settles', async ({ browser }) => {
  for (const url of ['./', './?view=fairs', './?view=bookstores']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; });
      window.__widest = 0;
      const sample = () => { window.__widest = Math.max(window.__widest, document.documentElement.scrollWidth - window.innerWidth); requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
    });
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__widest), `${url}: the widest overflow in any frame`).toBe(0);
    await context.close();
  }
});

// Review of 8 November 2026: a count must never cover its icon or run onto the next shortcut, at
// any text size, and a click on it is a click on its button.
test('a click on a count opens its shelf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('./');
  await page.locator('.header-favorites .shortcut-count').click();
  await expect(page).toHaveURL(/view=favorites/);
});

for (const text of ['100%', '150%', '200%']) {
  test(`at 320 px with ${text} text, long counts stay beside their icons and inside their buttons`, async ({ browser }) => {
    // 120 favourites and 150 purchases, from the catalogue's own ids.
    const ids = JSON.parse(fs.readFileSync(new URL('../../src/catalog.json', import.meta.url))).books.map(book => book.id);
    const states = Object.fromEntries(ids.slice(0, 150).map((id, index) => [id, index < 120 ? ['onemli', 'alindi'] : ['alindi']]));
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
    await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
    await context.addInitScript(([seed, size]) => {
      if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('kitapatlasi:states:v2', seed); }
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = size; });
    }, [JSON.stringify(states), text]);
    const page = await context.newPage();
    await page.goto('./');
    await expect(page.locator('.header-favorites')).toHaveAccessibleName('Favoriler: 120 kitap');
    await expect(page.locator('.header-favorites .shortcut-count')).toHaveText('120');
    await expect(page.locator('.header-library .shortcut-count')).toHaveText('150');
    const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
    const boxes = await page.evaluate(() => [...document.querySelectorAll('.header-shortcuts button')].map(button => ({
      button: button.getBoundingClientRect().toJSON(),
      icon: button.querySelector('svg')?.getBoundingClientRect().toJSON(),
      count: button.querySelector('.shortcut-count')?.getBoundingClientRect().toJSON(),
    })));
    for (const [index, { button, icon, count }] of boxes.entries()) {
      if (!count) continue;
      expect(overlap(count, icon), `count ${index} is beside its icon`).toBe(false);
      expect(count.x >= button.x - 0.5 && count.x + count.width <= button.x + button.width + 0.5, `count ${index} is inside its button`).toBe(true);
    }
    for (let index = 1; index < boxes.length; index += 1) {
      const [a, b] = [boxes[index - 1].button, boxes[index].button];
      expect(overlap(a, b), `shortcuts ${index - 1} and ${index} do not overlap`).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
}

test('in forced colours the section marker takes the system highlight', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates forced colours in Chromium only.');
  const context = await browser.newContext({ forcedColors: 'active', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('./');
  const colours = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.background = 'Highlight';
    const highlight = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { highlight, marker: getComputedStyle(document.querySelector('.main-tabs-indicator'), '::before').backgroundColor };
  });
  expect(colours.marker).toBe(colours.highlight);
  await context.close();
});

// Review of 8 November 2026: counts must not add a header row on the narrowest phone, must not
// make the open shortcut grow, keep a gap from their icons, and read as Turkish numbers.
const seedStates = async (browser, states, viewport = { width: 320, height: 568 }) => {
  const context = await browser.newContext({ viewport });
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  await context.addInitScript(seed => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('kitapatlasi:states:v2', seed); } }, JSON.stringify(states));
  return context;
};
const catalogIds = () => JSON.parse(fs.readFileSync(new URL('../../src/catalog.json', import.meta.url))).books.map(book => book.id);

test('at 320 px the header is as tall with counts as without them', async ({ browser }) => {
  const ids = catalogIds();
  const heights = {};
  for (const count of [0, 1, 12, 150]) {
    const context = await seedStates(browser, Object.fromEntries(ids.slice(0, count).map(id => [id, ['onemli', 'alindi']])));
    const page = await context.newPage();
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    heights[count] = Math.round((await page.locator('.site-header').boundingBox()).height);
    await context.close();
  }
  expect(heights[1], 'one').toBe(heights[0]);
  expect(heights[12], 'twelve').toBe(heights[0]);
  expect(heights[150], 'a hundred and fifty').toBe(heights[0]);
});

test('the open shortcut keeps its size, and a count keeps a gap from its icon', async ({ browser }) => {
  const context = await seedStates(browser, { goal: ['onemli', 'alindi'], meditations: ['onemli'] }, { width: 1280, height: 800 });
  const page = await context.newPage();
  await page.goto('./');
  const favorites = page.locator('.header-favorites');
  const before = await favorites.boundingBox();
  const gap = await favorites.evaluate(button => button.querySelector('.shortcut-count').getBoundingClientRect().left - button.querySelector('svg').getBoundingClientRect().right);
  expect(gap, 'the count stands apart from the icon').toBeGreaterThanOrEqual(2);
  await favorites.click();
  await expect(favorites).toHaveAttribute('aria-current', 'page');
  const after = await favorites.boundingBox();
  expect(Math.round(after.width)).toBe(Math.round(before.width));
  await context.close();
});

test('a count reads as a Turkish number', async ({ browser }) => {
  const ids = catalogIds();
  const context = await seedStates(browser, Object.fromEntries(ids.map(id => [id, ['alindi']])), { width: 1280, height: 800 });
  const page = await context.newPage();
  await page.goto('./');
  const shown = new Intl.NumberFormat('tr-TR').format(ids.length);
  await expect(page.locator('.header-library .shortcut-count')).toHaveText(shown);
  await expect(page.locator('.header-library')).toHaveAccessibleName(`Kitaplığım: ${shown} kitap`);
  await context.close();
});

// Review of 8 November 2026: from 56em the tabs join the first header row; counts must not push
// anything onto a new row there either.
for (const width of [895, 896, 912, 1023, 1024]) {
  test(`at ${width} px the header keeps its height with counts of 150 and every book`, async ({ browser }) => {
    const ids = catalogIds();
    const heights = [];
    for (const count of [0, 150, ids.length]) {
      const context = await seedStates(browser, Object.fromEntries(ids.slice(0, count).map(id => [id, ['onemli', 'alindi']])), { width, height: 800 });
      const page = await context.newPage();
      await page.goto('./');
      // With every book purchased and hidden the catalogue is empty, so the page and its fonts are awaited instead.
      await expect(page.locator('#main-content')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (count) await expect(page.locator('.header-library .shortcut-count')).toHaveText(new Intl.NumberFormat('tr-TR').format(count));
      heights.push(Math.round((await page.locator('.site-header').boundingBox()).height));
      await context.close();
    }
    expect(heights[1]).toBe(heights[0]);
    expect(heights[2]).toBe(heights[0]);
  });
}

test('on a phone every shortcut icon has one size, with or without a count', async ({ browser }) => {
  const context = await seedStates(browser, { goal: ['onemli', 'alindi'] });
  const page = await context.newPage();
  await page.goto('./');
  const sizes = await page.locator('.header-shortcuts button svg').evaluateAll(icons => icons.map(icon => Math.round(icon.getBoundingClientRect().width)));
  expect(new Set(sizes).size, `icon widths ${sizes}`).toBe(1);
  await context.close();
});
