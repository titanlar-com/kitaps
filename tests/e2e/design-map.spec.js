import { test, expect } from '@playwright/test';

// The parts of docs/UI-REDESIGN.md that a real browser has to prove.
test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: {} }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const firstCard = page => page.locator('.book-card').first();

test('the page frame is an AppShell and keeps its three landmarks', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.mantine-AppShell-root')).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  const header = await page.locator('.site-header').evaluate(node => getComputedStyle(node).position);
  expect(header).toBe('sticky');
  const footer = await page.locator('.site-footer').evaluate(node => getComputedStyle(node).position);
  expect(footer).toBe('fixed');
  expect(await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight)).toBe(true);
});

test('the slash key reaches the search field, on a Turkish keyboard too', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no shortcut keys.');
  await page.goto('./');
  await expect(firstCard(page)).toBeVisible();
  await expect(page.locator('.catalog-search .mantine-Kbd-root')).toBeVisible();
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', shiftKey: true, bubbles: true })));
  await expect(page.locator('.catalog-search input')).toBeFocused();
  await page.keyboard.type('a/b');
  await expect(page.locator('.catalog-search input')).toHaveValue('a/b');
});

test('Ctrl K opens the quick search and a book opens from it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no shortcut keys; the footer menu opens it there.');
  await page.goto('./');
  await expect(firstCard(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('textbox', { name: 'Kitap ya da bölüm ara' });
  await expect(input).toBeFocused();
  await input.fill('marcus aurelius');
  await page.locator('.mantine-Spotlight-action').first().click();
  await expect(page.locator('.detail-drawer .detail-content')).toBeVisible();
  await expect(page).toHaveURL(/book=|kitap\//);
});

test('the footer menu opens the quick search on a phone too', async ({ page }) => {
  await page.goto('./');
  await expect(firstCard(page)).toBeVisible();
  await page.getByRole('button', { name: /Menü/ }).click();
  await page.getByRole('button', { name: 'Hızlı ara' }).click();
  await expect(page.getByRole('textbox', { name: 'Kitap ya da bölüm ara' })).toBeFocused();
});

test('the book page shows where it stands, and its first step closes it', async ({ page }) => {
  await page.goto('./');
  await firstCard(page).locator('.title-button').click();
  const crumbs = page.getByRole('navigation', { name: 'Konum' });
  await expect(crumbs).toBeVisible();
  await expect(crumbs.getByRole('button', { name: 'Kitaplar' })).toBeVisible();
  await crumbs.getByRole('button', { name: 'Kitaplar' }).click();
  await expect(page.locator('.detail-drawer .detail-content')).toHaveCount(0);
});

test('Escape closes the more menu and leaves the book open', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no Escape key.');
  await page.goto('./');
  await firstCard(page).locator('.title-button').click();
  await page.getByRole('button', { name: 'Diğer işlemler' }).click();
  await expect(page.getByRole('menuitem', { name: 'Bağlantıyı kopyala' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Bağlantıyı kopyala' })).toHaveCount(0);
  await expect(page.locator('.detail-drawer .detail-content')).toBeVisible();
});

test('the back-to-top button sits above the footer bar, and takes the reader back', async ({ page }) => {
  await page.goto('./');
  await expect(firstCard(page)).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 2000, behavior: 'instant' }));
  const button = page.getByRole('button', { name: 'Başa dön' });
  await expect(button).toBeVisible();
  const [top, dock] = await Promise.all([button.boundingBox(), page.locator('.site-footer').boundingBox()]);
  expect(top.y + top.height).toBeLessThanOrEqual(dock.y);
  await button.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(button).toHaveCount(0);
});

test('the notes page lists its parts, and a part scrolls clear of the header', async ({ page }) => {
  await page.goto('./?view=notes');
  const toc = page.locator('.notes-contents');
  await expect(toc).toBeVisible();
  await page.locator('.notes-contents').getByText('Tam veri ve kaynaklar').click();
  const heading = page.locator('[data-toc="Tam veri ve kaynaklar"]');
  await expect.poll(async () => { const [box, header] = await Promise.all([heading.boundingBox(), page.locator('.site-header').boundingBox()]); return box.y >= header.y + header.height - 1; }).toBe(true);
  await page.locator('.mantine-Accordion-control').first().click();
  await expect(page.locator('.markdown.mantine-Typography-root').first()).toBeVisible();
});

test.describe('the cover flight', () => {
  const flight = page => page.evaluate(() => {
    const ghost = document.querySelector('.cover-flight');
    if (!ghost) return null;
    const [animation] = ghost.getAnimations();
    const timing = animation?.effect.getTiming();
    return timing ? { duration: timing.duration, easing: timing.easing, hidden: ghost.getAttribute('aria-hidden') } : null;
  });
  const waitForFlight = page => page.waitForFunction(() => document.querySelector('.cover-flight')?.getAnimations().length > 0, null, { polling: 'raf' });
  const openFirstWithCover = async page => { await page.locator('.book-card .cover-open img[data-loaded]').first().click(); };

  test('a cover flies from its card into the book, on the sheet\'s time and curve, and is gone after', async ({ page }) => {
    await page.goto('./?sort=title');
    await expect(page.locator('.book-card .cover-open img[data-loaded]').first()).toBeVisible();
    const waiting = waitForFlight(page);
    await openFirstWithCover(page);
    await waiting;
    expect(await flight(page)).toEqual({ duration: 300, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', hidden: 'true' });
    await expect(page.locator('.detail-drawer .detail-content')).toBeVisible();
    await expect(page.locator('.cover-flight')).toHaveCount(0);
    await expect(page.locator('.cover-stage-detail[data-flying]')).toHaveCount(0);
  });

  test('it flies back when the book closes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The close gesture is covered by the book sheet tests.');
    await page.goto('./?sort=title');
    await expect(page.locator('.book-card .cover-open img[data-loaded]').first()).toBeVisible();
    await openFirstWithCover(page);
    await expect(page.locator('.cover-flight')).toHaveCount(0);
    await expect(page.locator('.cover-stage-detail img[data-loaded]')).toBeVisible();
    const waiting = waitForFlight(page);
    await page.keyboard.press('Escape');
    await waiting;
    await expect(page.locator('.cover-flight')).toHaveCount(0);
  });

  test('with reduced motion nothing flies', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto('./?sort=title');
    await expect(page.locator('.book-card .cover-open img[data-loaded]').first()).toBeVisible();
    await page.evaluate(() => { window.__flew = false; new MutationObserver(() => { if (document.querySelector('.cover-flight')) window.__flew = true; }).observe(document.body, { childList: true }); });
    await page.locator('.book-card .cover-open img[data-loaded]').first().click();
    await expect(page.locator('.detail-drawer .detail-content')).toBeVisible();
    expect(await page.evaluate(() => window.__flew)).toBe(false);
    await context.close();
  });
});
