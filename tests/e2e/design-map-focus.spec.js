import { test, expect } from '@playwright/test';

// Where the keyboard stands around the parts added by docs/UI-REDESIGN.md's map, and a cover that
// turns round in the air. These read the browser's own state and wait on events, not on time.
test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: {} }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const search = page => page.getByRole('textbox', { name: 'Kitap ya da bölüm ara' });
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
  await expect(search(page)).toHaveCount(0);
  await expect(page.locator('.catalog-search input')).toBeFocused();
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
    await expect(search(page)).toHaveCount(0);
    await expect(page.locator('.footer-dock')).toBeFocused();
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
  await expect(page.locator('.detail-drawer .detail-content')).toHaveCount(0);
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
  const flying = page.waitForFunction(() => document.querySelector('.cover-flight')?.getAnimations().length > 0, null, { polling: 'raf' });
  await cover.click();
  await flying;
  await page.goBack();
  await page.goForward();
  expect(await page.locator('.cover-flight').count()).toBeLessThanOrEqual(1);
  await expect(page.locator('.cover-flight')).toHaveCount(0);
  await expect(page.locator('.cover-stage-detail[data-flying]')).toHaveCount(0);
});
