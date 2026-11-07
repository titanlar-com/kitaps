import { test, expect } from '@playwright/test';

// The header (owner's request, 7 November 2026): the logo area keeps a plain mark and no
// "Kitaplık" text, and a switch left of the shortcuts, "Satın aldıklarımı gösterme", is on by
// default and takes purchased books out of the catalogue.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const BOOK = './?book=good-to-great-by-jim-collins';

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const toggle = page => page.getByRole('switch', { name: 'Satın aldıklarımı gösterme' });
// A finger or a mouse presses the switch's track; the input itself is invisible under it.
const press = page => page.locator('.header-switch .mantine-Switch-track').click();
const shown = page => page.locator('.results-heading [role="status"]').textContent().then(text => Number(text.match(/^(\d+)/)[1]));

for (const width of [320, 390, 1280]) {
  test(`at ${width} px the logo area has no text and the switch sits left of the shortcuts, on`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    const brand = page.locator('.brand-link');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText('');
    await expect(brand).toHaveAccessibleName('Kitaplık · filtresiz ana sayfa');
    await expect(brand.locator('svg')).toBeVisible();
    await expect(toggle(page)).toBeChecked();
    const switchBox = await page.locator('.header-switch').boundingBox();
    const shortcuts = await page.locator('.header-shortcuts').boundingBox();
    expect(switchBox.x + switchBox.width, 'left of the shortcuts').toBeLessThanOrEqual(shortcuts.x + 0.5);
    expect(Math.abs((switchBox.y + switchBox.height / 2) - (shortcuts.y + shortcuts.height / 2)), 'on the same row').toBeLessThan(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('purchased books leave the catalogue while the switch is on, and the choice is remembered', async ({ page }) => {
  await page.goto('./');
  const total = await shown(page);
  await page.goto(BOOK);
  await page.getByRole('button', { name: 'Satın alındı', exact: true }).click();
  await page.goto('./?q=Good%20to%20Great');
  await expect(page.locator('.book-card[data-book-id="goodtogreat"]')).toHaveCount(0);
  await page.goto('./');
  expect(await shown(page)).toBe(total - 1);
  // Off: the purchased book is back, and stays back after a reload.
  await press(page);
  await expect(toggle(page)).not.toBeChecked();
  expect(await shown(page)).toBe(total);
  await page.reload();
  await expect(toggle(page)).not.toBeChecked();
  expect(await shown(page)).toBe(total);
  // The owned shelf shows its books whatever the switch says.
  await press(page);
  await page.goto('./?view=library');
  await expect(page.locator('.book-card[data-book-id="goodtogreat"]')).toHaveCount(1);
});
