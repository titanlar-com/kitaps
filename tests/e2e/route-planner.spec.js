import { test, expect } from '@playwright/test';

// The route planner on the Kitapçılar page (owner's request, 7 November 2026): pick stores, let
// the planner order them by distance, name and date the route, and save it. Without a GitHub key
// the route stays on this device; with one it is written to routes.json in kitaps-state.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_e2e_checks';
const TOKEN_KEY = 'kitapatlasi:github-state:token:v1';

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ status: route.request().url().includes('routes.json') ? 404 : 200, json: route.request().url().includes('routes.json') ? { message: 'Not Found' } : EMPTY }));
  await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const planner = page => page.locator('.route-planner');
const pick = async (page, names) => {
  const field = planner(page).getByRole('combobox', { name: 'Kitapçılar' });
  for (const name of names) {
    await field.click();
    await field.fill(name.split(' ')[0]);
    await page.getByRole('option', { name, exact: true }).click();
  }
  await page.keyboard.press('Escape');
};
const order = page => planner(page).locator('.route-draft-stops li .route-draft-name').allTextContents();

test('stores are ordered by distance from the first one, and a saved route stays on this device without a key', async ({ page }) => {
  await page.goto('./?view=bookstores');
  await expect(planner(page)).toBeVisible();
  await pick(page, ['Homer Kitabevi', 'Remzi Kitabevi Kanyon', 'Minoa Pera', 'Remzi Kitabevi Akmerkez']);
  expect(await order(page)).toEqual(['Homer Kitabevi', 'Remzi Kitabevi Kanyon', 'Minoa Pera', 'Remzi Kitabevi Akmerkez']);
  await planner(page).getByRole('button', { name: 'Sırayı yakınlığa göre düzenle' }).click();
  expect(await order(page)).toEqual(['Homer Kitabevi', 'Minoa Pera', 'Remzi Kitabevi Kanyon', 'Remzi Kitabevi Akmerkez']);
  await expect(planner(page)).toContainText(/yaklaşık \d+(,\d)? km/);
  // A stop can still be moved by hand.
  await planner(page).getByRole('button', { name: 'Minoa Pera: aşağı taşı' }).click();
  expect(await order(page)).toEqual(['Homer Kitabevi', 'Remzi Kitabevi Kanyon', 'Minoa Pera', 'Remzi Kitabevi Akmerkez']);

  // The date first: on a phone its native picker can take the next tap, so the name is typed last.
  await planner(page).getByLabel('Tarih').fill('2026-11-14');
  await planner(page).getByRole('textbox', { name: 'Rota adı' }).fill('Deneme rotası');
  await expect(planner(page).getByRole('button', { name: 'Rotayı kaydet' })).toBeEnabled();
  await planner(page).getByRole('button', { name: 'Rotayı kaydet' }).click();
  await expect(planner(page).getByRole('status')).toContainText('bu cihazda saklandı');
  const saved = page.locator('.route-saved').filter({ hasText: 'Deneme rotası' });
  await expect(saved).toContainText('14 Kasım 2026');
  await expect(saved.locator('ol li')).toHaveText(['Homer Kitabevi', 'Remzi Kitabevi Kanyon', 'Minoa Pera', 'Remzi Kitabevi Akmerkez']);

  // It is still there after a reload, and it can be marked as walked and deleted.
  await page.reload();
  await expect(saved).toHaveCount(1);
  await saved.getByRole('checkbox', { name: 'Gezildi' }).check();
  await expect(saved.getByRole('checkbox', { name: 'Gezildi' })).toBeChecked();
  await saved.getByRole('button', { name: 'Deneme rotası: sil' }).click();
  await expect(page.locator('.route-saved').filter({ hasText: 'Deneme rotası' })).toHaveCount(0);
});

test('the planner suggests the next route from stores no plan visits yet', async ({ page }) => {
  await page.goto('./?view=bookstores');
  await planner(page).getByRole('button', { name: 'Sıradaki rotayı öner' }).click();
  const stops = await order(page);
  expect(stops.length).toBeGreaterThanOrEqual(2);
  for (const name of ['Minoa Pera', 'Mephisto Beyoğlu', 'Homer Kitabevi', 'Remzi Kitabevi Kanyon', 'İmge Kitabevi Kadıköy']) expect(stops).not.toContain(name);
});

test('with a GitHub key the route is written to routes.json in kitaps-state', async ({ page, context }) => {
  const writes = [];
  await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/contents/routes.json**', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      writes.push(body);
      return route.fulfill({ status: 201, json: { content: { sha: 'new' }, commit: { sha: 'c1' } } });
    }
    return route.fulfill({ status: 404, json: { message: 'Not Found' } });
  });
  await context.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
  await page.goto('./?view=bookstores');
  await pick(page, ['Türkmen Kitabevi', 'D&R Galataport']);
  await planner(page).getByRole('textbox', { name: 'Rota adı' }).fill('Yarımada');
  await planner(page).getByRole('button', { name: 'Rotayı kaydet' }).click();
  await expect(planner(page).getByRole('status')).toContainText('GitHub’a kaydedildi');
  expect(writes).toHaveLength(1);
  expect(writes[0].message).toBe('Update reading routes');
  const file = JSON.parse(Buffer.from(writes[0].content, 'base64').toString('utf8'));
  const route = Object.values(file.routes)[0].value;
  expect(route.title).toBe('Yarımada');
  expect(route.stops).toEqual(['turkmen-beyazit', 'dr-galataport']);
});
