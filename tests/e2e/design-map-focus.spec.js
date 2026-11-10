import { test, expect } from '@playwright/test';

// Where the keyboard stands around the parts added by docs/UI-REDESIGN.md's map, and a cover that
// turns round in the air. These read the browser's own state and wait on events, not on time.
test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: {} }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const search = page => page.getByRole('textbox', { name: 'Kitap ya da bölüm ara' });
// How long a closing dialog may take to leave the page where frames are scarce (measured up to 4.4 s).
const FADE_OUT = 15_000;
// Chooses "Hızlı ara" in the footer menu without waiting for the quick search to appear.
const openFromFooterMenuOnly = async page => { await page.getByRole('button', { name: /Menü/ }).click(); await page.getByRole('button', { name: 'Hızlı ara' }).click(); };
const openFromFooter = async page => { await page.getByRole('button', { name: /Menü/ }).click(); await page.getByRole('button', { name: 'Hızlı ara' }).click(); await expect(search(page)).toBeFocused(); };

test('the quick search is a named dialog, and Escape returns the keyboard to where it was', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no Escape key.');
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.locator('.catalog-search input').focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Kitap ya da bölüm ara' })).toBeVisible();
  await expect(search(page)).toBeFocused();
  await page.keyboard.press('Escape');
  // The keyboard is back at once; the quick search then fades out, which takes CI's Linux WebKit,
  // painting a frame or two a second, two to five seconds.
  await expect(page.locator('.catalog-search input')).toBeFocused();
  await expect(search(page)).toHaveCount(0, { timeout: FADE_OUT });
});

test('opened from the footer menu a second time it keeps the keyboard, and gives it back to the footer bar', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no Escape key.');
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  for (let round = 0; round < 2; round += 1) {
    await openFromFooter(page);
    await page.waitForTimeout(350);
    await expect(search(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.footer-dock')).toBeFocused();
    await expect(search(page)).toHaveCount(0, { timeout: FADE_OUT });
  }
});

test('a book chosen in the quick search gives the keyboard back to the page when it closes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no Escape key.');
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.keyboard.press('Control+k');
  await search(page).fill('marcus aurelius');
  await page.locator('.mantine-Spotlight-action').first().click();
  await expect(page.locator('.detail-drawer .detail-content')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.detail-drawer .detail-content')).toHaveCount(0, { timeout: FADE_OUT });
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main-content');
});

test('over the footer menu neither shortcut reaches behind it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no shortcut keys.');
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.getByRole('button', { name: /Menü/ }).click();
  await expect(page.getByRole('button', { name: 'Hızlı ara' })).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.locator('.catalog-search input')).not.toBeFocused();
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  await expect(search(page)).toHaveCount(0);
});

// The quick search's code arrives a moment after it is first asked for (about 0.3 s on the live
// site). Whatever the reader does in that moment wins: after an Escape, or with a book opened on
// top, the quick search must not appear once its code is in. These hold the code back to make the
// moment as long as needed, and note every time the quick search shows.
const PALETTE_CODE = /\/CommandPalette-[^/]*\.js$/;
const holdPalette = async page => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(PALETTE_CODE, async route => { await held; await route.continue(); });
  await page.evaluate(() => {
    window.__paletteShown = 0;
    new MutationObserver(() => { if (document.querySelector('.mantine-Spotlight-search')) window.__paletteShown += 1; }).observe(document.body, { childList: true, subtree: true });
  });
  return async () => {
    const arrived = page.waitForResponse(PALETTE_CODE);
    release();
    await arrived;
    // Nothing on the page says the code has run and chosen to stay closed, so give it time.
    await page.waitForTimeout(1500);
  };
};
const paletteShown = page => page.evaluate(() => window.__paletteShown);

test('an Escape pressed before the quick search arrives keeps it from opening', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no Escape key.');
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  const release = await holdPalette(page);
  await page.locator('.catalog-search input').focus();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await release();
  expect(await paletteShown(page)).toBe(0);
  await expect(page.locator('.catalog-search input')).toBeFocused();
  // Asked again, it opens at once.
  await page.keyboard.press('Control+k');
  await expect(search(page)).toBeFocused();
});

test('a book opened before the quick search arrives is not covered by it', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  const release = await holdPalette(page);
  await openFromFooterMenuOnly(page);
  await page.locator('.book-card .cover-open').first().click();
  await expect(page.locator('.detail-drawer .detail-content')).toBeVisible();
  await release();
  expect(await paletteShown(page)).toBe(0);
  await page.getByRole('button', { name: 'Diğer işlemler' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
});

test('asked for from the footer menu, the quick search opens once its code is in', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  const release = await holdPalette(page);
  await openFromFooterMenuOnly(page);
  await expect(page.locator('.footer-menu .mantine-Drawer-content')).toHaveCount(0, { timeout: FADE_OUT });
  await release();
  await expect(search(page)).toBeVisible();
});

test('a filter chip shows the one focus bar and no ring around itself', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no Tab key.');
  await page.goto('./?status=finished&category=strategy');
  const chip = page.locator('.active-filters .mantine-Chip-input').first();
  await expect(chip).toBeAttached();
  // Safari's own Tab order may skip check boxes, so the key only turns the keyboard mode on.
  await page.keyboard.press('Tab');
  await chip.focus();
  await expect(chip).toBeFocused();
  const look = await chip.evaluate(input => { const label = input.nextElementSibling; const bar = getComputedStyle(label, '::after'); return { outline: getComputedStyle(label).outlineStyle, bar: bar.content, height: parseFloat(bar.height) }; });
  expect(look.outline).toBe('none');
  expect(look.bar).not.toBe('none');
  expect(look.height).toBeGreaterThanOrEqual(2);
});

test('a book closed and opened again in flight has one cover in the air, and it lands', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The close gesture is covered by the book sheet tests.');
  await page.goto('./?sort=title');
  const cover = page.locator('.book-card .cover-open img[data-loaded]').first();
  await expect(cover).toBeVisible();
  // The flight is slowed as it starts, so the reader's two steps surely land while it is in the air
  // even on CI's Linux WebKit, which paints few frames while the sheet opens.
  await page.evaluate(() => {
    window.__flights = 0;
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!node.matches?.('.cover-flight')) continue;
        window.__flights += 1;
        node.getAnimations()[0].playbackRate = 0.05;
      }
    }).observe(document.body, { childList: true });
  });
  await cover.click();
  await expect.poll(() => page.evaluate(() => window.__flights)).toBe(1);
  // Back only once the cover is a third of the way: turned round right after take-off it is home
  // again within a few frames, and the step forward would then rightly start a new flight.
  await page.waitForFunction(() => document.querySelector('.cover-flight')?.getAnimations()[0]?.currentTime > 100, null, { polling: 50 });
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/[?&]book=/);
  expect(await page.locator('.cover-flight').count()).toBeLessThanOrEqual(1);
  await expect(page.locator('.cover-flight')).toHaveCount(0, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__flights), 'the same cover turned round, no second one took off').toBe(1);
  await expect(page.locator('.cover-stage-detail[data-flying]')).toHaveCount(0);
});
