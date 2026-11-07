import { test, expect } from '@playwright/test';

// The footer bar (owner's request, 7 November 2026): fixed to the foot of the screen, it opens
// the whole menu as a sheet half the screen tall.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const ITEMS = ['Kitaplar', 'Sıram', 'Kümeler', 'Kitapçılar', 'Kitap fuarları', 'Notlar ve kaynaklar', 'Kızım için', 'Favoriler', /^Kitaplığım/, 'Çeviri rehberi', 'Cihaz eşitleme', 'Kitapları JSON indir'];

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

for (const width of [320, 390, 1280]) {
  test(`at ${width} px the footer bar stays at the foot of the screen and opens the menu half the screen tall`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    await expect(page.locator('.book-card').first()).toBeVisible();
    const bar = page.locator('.site-footer');
    const atFoot = async () => { const box = await bar.boundingBox(); return Math.abs(box.y + box.height - 800) <= 1; };
    expect(await atFoot(), 'at the foot of the screen').toBe(true);
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(400);
    expect(await atFoot(), 'still there after scrolling').toBe(true);
    expect((await page.locator('.footer-dock').boundingBox()).height).toBeGreaterThanOrEqual(44);

    await page.locator('.footer-dock').click();
    const sheet = page.getByRole('dialog', { name: 'Menü' });
    await expect(sheet).toBeVisible();
    // The sheet slides in; it is measured once it rests on the foot of the screen, however slow the machine.
    const content = page.locator('.footer-menu .mantine-Drawer-content');
    await expect.poll(async () => { const rest = await content.boundingBox(); return Math.round(rest.y + rest.height); }, { timeout: 5000 }).toBe(800);
    const box = await content.boundingBox();
    expect(Math.abs(box.height - 400), `half the screen: ${box.height}`).toBeLessThanOrEqual(2);
    for (const name of ITEMS) await expect(sheet.getByRole('button', { name, exact: typeof name === 'string' }), String(name)).toHaveCount(1);
    await expect(sheet).toContainText('Güncelleme:');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('a menu item opens its page and closes the sheet; Escape returns focus to the bar', async ({ page }) => {
  await page.goto('./');
  const dock = page.locator('.footer-dock');
  await dock.click();
  await page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: 'Kitapçılar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Menü' })).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]view=bookstores\b/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kitapçılar' })).toBeVisible();
  await expect(dock).toContainText('Kitapçılar');
  // The current section is marked in the menu. Opened from the keyboard, the sheet gives focus
  // back to the bar when it closes (Safari does not focus a button that is clicked).
  await page.keyboard.press('Tab');
  await dock.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: 'Kitapçılar', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Menü' })).toHaveCount(0);
  await expect(dock).toBeFocused();
});

test('the end of the page and the purchase toast stay clear of the footer bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('./');
  await expect(page.locator('.book-card').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(300);
  const bar = await page.locator('.site-footer').boundingBox();
  const last = await page.locator('.catalog-pagination').boundingBox();
  expect(last.y + last.height, 'the pagination ends above the bar').toBeLessThanOrEqual(bar.y);
  // Back to the top at once (the page scrolls smoothly), then mark a purchase to raise the toast.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.locator('.book-card .cover-owned').first().click();
  await expect(page.locator('.library-toast')).toBeVisible();
  const toast = await page.locator('.library-toast').boundingBox();
  expect(toast.y + toast.height, 'the toast sits above the bar').toBeLessThanOrEqual(bar.y);
});
