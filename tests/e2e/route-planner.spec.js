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
  // The moved stop keeps the focus, and the move is announced.
  await expect(page.locator('.route-planner :focus')).toHaveAttribute('aria-label', /^Minoa Pera: /);
  await expect(planner(page).getByRole('status')).toContainText('Minoa Pera');
  expect(await order(page)).toEqual(['Homer Kitabevi', 'Remzi Kitabevi Kanyon', 'Minoa Pera', 'Remzi Kitabevi Akmerkez']);

  // The date first: on a phone its native picker can take the next tap, so the name is typed last.
  await planner(page).getByLabel('Tarih').fill('2026-11-14');
  await planner(page).getByRole('textbox', { name: 'Rota adı' }).fill('Deneme rotası');
  await expect(planner(page).getByRole('button', { name: 'Rotayı kaydet' })).toBeEnabled();
  await planner(page).getByRole('button', { name: 'Rotayı kaydet' }).click();
  await expect(planner(page).getByRole('textbox', { name: 'Rota adı' })).toBeFocused();
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
  // Deleting asks first, because the route is gone from every device.
  await expect(saved.getByRole('button', { name: 'Vazgeç' })).toBeFocused();
  await saved.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(saved.getByRole('button', { name: 'Deneme rotası: sil' })).toBeFocused();
  await saved.getByRole('button', { name: 'Deneme rotası: sil' }).click();
  await saved.getByRole('button', { name: 'Evet, sil' }).click();
  await expect(page.getByRole('heading', { name: 'Kaydettiğin rotalar' })).toBeFocused();
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

// Redesign, phase 6 (docs/UI-REDESIGN.md): three steps above the form and timelines for the stops.
const steps = page => planner(page).locator('.mantine-Stepper-step');
const currentStep = page => steps(page).evaluateAll(nodes => nodes.findIndex(node => node.getAttribute('aria-current') === 'step'));

test('the steps follow the draft and never take the keyboard', async ({ page }) => {
  await page.goto('./?view=bookstores');
  await expect(steps(page)).toHaveCount(3);
  await expect.poll(() => currentStep(page)).toBe(0);
  await pick(page, ['Minoa Pera', 'Homer Kitabevi']);
  await expect.poll(() => currentStep(page)).toBe(1);
  await planner(page).getByRole('textbox', { name: 'Rota adı' }).fill('Deneme rotası');
  await expect.poll(() => currentStep(page)).toBe(2);
  // A finished step shows its check mark in the accent's own ink.
  const icon = planner(page).locator('.mantine-Stepper-stepIcon').first();
  await expect(icon).toHaveAttribute('data-completed', 'true');
  await expect(steps(page).first()).toHaveAttribute('tabindex', '-1');
  expect(await planner(page).locator('button.mantine-Stepper-step').count(), 'the steps are not controls').toBe(0);
  const colour = await planner(page).locator('.mantine-Stepper-stepCompletedIcon').first().evaluate(node => getComputedStyle(node).color);
  const ink = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--accent-ink)'; document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; });
  expect(colour).toBe(ink);
  // Giving the draft up starts the steps again.
  await planner(page).getByRole('button', { name: 'Vazgeç' }).click();
  await expect.poll(() => currentStep(page)).toBe(0);
});

for (const width of [320, 1280]) {
  test(`at ${width} px the steps are square, stay inside the form and are at least 14 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./?view=bookstores');
    await expect(steps(page)).toHaveCount(3);
    const report = await planner(page).evaluate(root => {
      const form = root.querySelector('.route-draft').getBoundingClientRect();
      return {
        icons: [...root.querySelectorAll('.mantine-Stepper-stepIcon')].map(node => { const box = node.getBoundingClientRect(); return { radius: parseFloat(getComputedStyle(node).borderTopLeftRadius), width: box.width, square: Math.abs(box.width - box.height) < .5 }; }),
        outside: [...root.querySelectorAll('.mantine-Stepper-step')].filter(node => { const box = node.getBoundingClientRect(); return box.left < form.left - .5 || box.right > form.right + .5; }).length,
        small: [...root.querySelectorAll('.mantine-Stepper-stepLabel, .mantine-Stepper-stepIcon')].filter(node => parseFloat(getComputedStyle(node).fontSize) < 14).length,
        scroll: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    for (const icon of report.icons) { expect(icon.radius).toBeLessThanOrEqual(5); expect(icon.square).toBe(true); expect(icon.width).toBeGreaterThan(2 * icon.radius); }
    expect(report.outside).toBe(0);
    expect(report.small).toBe(0);
    expect(report.scroll).toBe(true);
  });
}

test('the steps stay on the page at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }));
  const page = await context.newPage();
  await page.goto('./?view=bookstores');
  await expect(steps(page)).toHaveCount(3);
  const inside = await steps(page).evaluateAll(nodes => nodes.every(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }));
  expect(inside).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
  await context.close();
});

test('a draft and a saved route both show their stops as an ordered timeline', async ({ page }) => {
  await page.goto('./?view=bookstores');
  await pick(page, ['Minoa Pera', 'Homer Kitabevi']);
  await expect(planner(page).locator('.route-draft-stops.mantine-Timeline-root > li')).toHaveCount(2);
  await planner(page).getByRole('textbox', { name: 'Rota adı' }).fill('Zaman çizgisi');
  await planner(page).getByRole('button', { name: 'Rotayı kaydet' }).click();
  await expect(planner(page).getByRole('status')).toContainText('bu cihazda saklandı');
  const saved = page.locator('.route-saved').filter({ hasText: 'Zaman çizgisi' });
  await expect(saved.locator('ol.mantine-Timeline-root > li')).toHaveText(['Minoa Pera', 'Homer Kitabevi']);
  // Marked as walked, every stop of the route is drawn as done.
  await expect(saved.locator('.mantine-Timeline-item[data-active]')).toHaveCount(0);
  await saved.getByRole('checkbox', { name: 'Gezildi' }).check();
  await expect(saved.locator('.mantine-Timeline-item[data-active]')).toHaveCount(2);
});
