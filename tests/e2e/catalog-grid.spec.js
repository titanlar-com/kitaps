import { test, expect } from '@playwright/test';

// The owner's fixed rule (AGENTS.md): the catalog shows 2 columns on phones, 3 on tablets
// and 4 from desktop up, never 5, and a full page of 24 books ends on a full row.
const LAYOUTS = [[320, 2], [360, 2], [375, 2], [390, 2], [575, 2], [576, 3], [768, 3], [895, 3], [896, 4], [1024, 4], [1152, 4], [1280, 4], [1440, 4], [1920, 4], [2560, 4]];

test('the catalog grid keeps the owner’s column counts and a full last row at every width', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.books-grid > .book-card')).toHaveCount(24);
  for (const [width, columns] of LAYOUTS) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.books-grid').evaluate(grid => {
      const boxes = [...grid.children].map(card => card.getBoundingClientRect());
      const tops = boxes.map(box => Math.round(box.top));
      const lastTop = Math.max(...tops);
      return {
        tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
        columns: new Set(boxes.map(box => Math.round(box.left))).size,
        lastRow: tops.filter(top => top === lastTop).length,
      };
    });
    expect(layout, `${width}px wide`).toEqual({ tracks: columns, columns, lastRow: columns });
  }
});

// A phone held sideways stays at 2 columns, up to a tall flip phone's width; a tablet, an upright
// screen or a window wider than 1040 px does not. The edges of the rule are checked on both sides.
const SIDEWAYS = [[568, 320, 2], [667, 375, 2], [844, 390, 2], [932, 430, 2], [1005, 411, 2], [1039, 496, 2], [1041, 496, 4], [1039, 497, 4], [1024, 768, 4], [1180, 820, 4], [1280, 480, 4], [768, 1024, 3]];

test('a phone held sideways keeps 2 columns, tablets and wide windows do not', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.books-grid > .book-card')).toHaveCount(24);
  for (const [width, height, columns] of SIDEWAYS) {
    await page.setViewportSize({ width, height });
    const tracks = await page.locator('.books-grid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(tracks, `${width}×${height}`).toBe(columns);
  }
});

test('a larger page of 48 books also ends on a full row', async ({ page }) => {
  await page.goto('./?page-size=48');
  await expect(page.locator('.books-grid > .book-card')).toHaveCount(48);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const lastRow = await page.locator('.books-grid').evaluate(grid => {
      const tops = [...grid.children].map(card => Math.round(card.getBoundingClientRect().top));
      return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length, cards: tops.filter(top => top === Math.max(...tops)).length };
    });
    expect(lastRow.cards, `${width}px wide`).toBe(lastRow.columns);
  }
});

// A cover that arrives late must not move the page. The covers are held back until the cards
// and the footer have been measured; once every cover has loaded, nothing may have moved.
// The owner's choice: a cover taller than 2:3 is shown whole inside the 2:3 frame, with the
// frame's surface beside it; it is neither cut nor made narrower, and the frame never grows.
const EMPTY_STATE = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const COVER_WIDTHS = [320, 360, 375, 390, 768, 1280];
const isolate = page => Promise.all([
  page.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY_STATE })),
  page.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: {} })),
]);
// Each frame that is not 2:3, or whose cover reaches past it, and how many covers taller
// than 2:3 fill the frame from edge to edge.
const frames = stages => stages.evaluateAll(list => {
  const problems = [];
  let tallFilled = 0;
  for (const stage of list) {
    const frame = stage.getBoundingClientRect(), image = stage.querySelector('img'), name = stage.getAttribute('aria-label') || stage.className;
    if (Math.abs(frame.height - frame.width * 1.5) > 1) problems.push(`${name}: frame ${Math.round(frame.width)}×${Math.round(frame.height)}`);
    if (!image) continue;
    const cover = image.getBoundingClientRect();
    if (cover.top < frame.top - 1 || cover.bottom > frame.bottom + 1 || cover.left < frame.left - 1 || cover.right > frame.right + 1) problems.push(`${name}: cover ${Math.round(cover.width)}×${Math.round(cover.height)} outside the frame`);
    if (image.naturalHeight / image.naturalWidth > 1.52 && Math.abs(cover.height - frame.height) <= 1 && Math.abs(cover.width - frame.width) <= 1) tallFilled++;
  }
  return { problems, tallFilled };
});

test('covers that load late leave the cards and the footer where they were', async ({ page }) => {
  // The shared reading state could add a line to a card while the covers load.
  await isolate(page);
  let held = [], holding = true;
  await page.route('**/covers/**', route => holding ? held.push(route) : route.continue());
  const layout = () => page.evaluate(() => {
    const place = element => { const box = element.getBoundingClientRect(); return { top: box.top + scrollY, height: box.height }; };
    return { cards: [...document.querySelectorAll('.books-grid > .book-card')].map(place), footer: place(document.querySelector('.site-footer')) };
  });
  const covers = page.locator('.books-grid img');
  for (const width of COVER_WIDTHS) {
    held = []; holding = true;
    await page.setViewportSize({ width, height: 800 });
    // A held cover may delay the load event, so the page counts as ready once its cards are there.
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.books-grid > .book-card')).toHaveCount(24);
    // WebKit settles document.fonts.ready only after the load event, which a held cover can delay,
    // so the test waits for the font faces themselves: the interface font in, none still loading.
    await expect.poll(() => page.evaluate(() => [...document.fonts].some(face => face.family.includes('Outfit') && face.status === 'loaded') && [...document.fonts].every(face => face.status !== 'loading')), { message: `${width}px: fonts load` }).toBe(true);
    expect(await covers.evaluateAll(images => images.filter(image => image.naturalWidth > 0).length), `${width}px: no cover has arrived yet`).toBe(0);
    const before = await layout();
    holding = false;
    await Promise.all(held.map(route => route.continue()));
    // Load every cover now, not only those near the screen.
    await covers.evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
    await expect.poll(() => covers.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), { message: `${width}px: every cover loads` }).toBe(true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await layout();
    const moved = [...before.cards.map((card, i) => [`card ${i + 1}`, card, after.cards[i]]), ['footer', before.footer, after.footer]]
      .filter(([, was, now]) => Math.abs(was.top - now.top) > 1 || Math.abs(was.height - now.height) > 1)
      .map(([name, was, now]) => `${name}: top ${Math.round(was.top)} → ${Math.round(now.top)}, height ${Math.round(was.height)} → ${Math.round(now.height)}`);
    expect(moved, `${width}px wide`).toEqual([]);
    const framed = await frames(page.locator('.books-grid .cover-stage'));
    expect(framed.problems, `${width}px wide`).toEqual([]);
    // The first page holds several covers taller than 2:3 (Psiko 101, Strateji: Bir Tarih).
    expect(framed.tallFilled, `${width}px: tall covers fill their frame`).toBeGreaterThan(0);
  }
});

test('the book sheet shows a cover taller than 2:3 whole inside its 2:3 frame', async ({ page }) => {
  await isolate(page);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    // Çalıkuşu's cover is 720 × 1312, the tallest in the catalog.
    await page.goto('./?book=calikusu');
    const stage = page.locator('.cover-stage-detail');
    await expect.poll(() => stage.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await frames(stage), `${width}px wide`).toEqual({ problems: [], tallFilled: 1 });
  }
});
