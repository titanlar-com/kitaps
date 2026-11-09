import { test, expect } from '@playwright/test';

// The shared state lives in the public titanlar-com/kitaps-state repository. Every request to
// it is answered here, so no test reads or writes the real file. The token is a test value.
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_e2e_checks';
const TOKEN_KEY = 'kitapatlasi:github-state:token:v1';
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const BOOK = { id: 'goodtogreat', slug: 'good-to-great-by-jim-collins' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT',
  'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type, If-None-Match, X-GitHub-Api-Version',
  'Access-Control-Expose-Headers': 'ETag, X-OAuth-Scopes, X-RateLimit-Remaining, X-RateLimit-Reset',
};
const base64 = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

const fakes = [];
// The state repository has one address. A request anywhere else on GitHub (an old owner's
// path, say) is refused before it reaches the real service, and fails the test.
test.afterEach(() => {
  for (const github of fakes.splice(0)) expect(github.elsewhere, 'GitHub requests outside titanlar-com/kitaps-state').toEqual([]);
});

/** One fake GitHub shared by every device in a test. The CDN copy can be made to lag,
 * as the real one does for up to five minutes. */
// refuseKey: GitHub answers every request made with the key with 401, as for an expired key.
function fakeGitHub({ canWrite = true, cdnLags = false, refuseKey = false } = {}) {
  const github = { file: structuredClone(EMPTY), sha: 'sha-0', puts: [], commits: [], probes: 0, elsewhere: [] };
  fakes.push(github);
  github.attach = async context => {
    // Registered first, so the state repository's own routes below take precedence.
    await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, route => {
      github.elsewhere.push(`${route.request().method()} ${route.request().url()}`);
      return route.abort();
    });
    // Only state.json is this fake's file; routes.json is not made yet, as on a new repository.
    await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('/routes.json') ? route.fulfill({ status: 404, headers: CORS, json: {} }) : route.fulfill({ headers: CORS, json: cdnLags ? EMPTY : github.file }));
    await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (request.url().includes('/contents/routes.json')) return route.fulfill({ status: 404, headers: CORS, json: { message: 'Not Found' } });
      // state.json's history, newest first: a reopened page asks it whether an unanswered write landed.
      if (request.method() === 'GET' && request.url().includes('/commits?')) return route.fulfill({ headers: CORS, json: github.commits });
      if (refuseKey && request.headers().authorization) return route.fulfill({ status: 401, headers: CORS, json: { message: 'Bad credentials' } });
      if (request.url().endsWith('/git/blobs')) {
        github.probes += 1;
        return route.fulfill({ status: canWrite ? 201 : 403, headers: CORS, json: canWrite ? { sha: 'e69de29' } : { message: 'Resource not accessible by personal access token' } });
      }
      if (request.method() === 'PUT') {
        // Like GitHub: a write must name the file's current sha.
        const body = request.postDataJSON();
        if (body.sha !== github.sha) return route.fulfill({ status: 409, headers: CORS, json: { message: 'sha does not match' } });
        github.file = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
        github.sha = `sha-${github.puts.push(github.file)}`;
        github.commits.unshift({ sha: github.sha, commit: { message: body.message } });
        return route.fulfill({ headers: CORS, json: { content: { sha: github.sha } } });
      }
      // Playwright cannot answer 304, so conditional reads always get the full file here.
      return route.fulfill({ headers: { ...CORS, ETag: `"${github.sha}"` }, json: { sha: github.sha, encoding: 'base64', content: base64(github.file) } });
    });
  };
  return github;
}

const hidePage = page => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
// The footer bar stays at the bottom of the screen; its menu holds "Cihaz eşitleme".
const openSyncFromFooter = async page => {
  await page.locator('.footer-dock').click();
  await page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: 'Cihaz eşitleme' }).click();
};
const markPurchased = async page => {
  await page.goto(`./?book=${BOOK.slug}`);
  const button = page.getByRole('button', { name: 'Satın alındı', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
};

test('a mark made on a device that is not connected says it stays there, and connecting sends it at once', async ({ page }) => {
  const github = fakeGitHub();
  await github.attach(page.context());
  await markPurchased(page);
  await page.keyboard.press('Escape');
  const notice = page.locator('.sync-notice');
  await expect(notice).toContainText('Bu cihazdaki işaretler yalnız burada');
  await expect(notice).toContainText('1 değişiklik bu cihazda bekliyor');
  expect(github.puts).toHaveLength(0);
  await expect(page.locator('.library-toast')).toHaveCount(1);
  await notice.getByRole('button', { name: 'Bu cihazı bağla' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' });
  // The purchase toast sits above dialogs; it must not cover the token field.
  await expect(page.locator('.library-toast')).toHaveCount(0);
  await dialog.getByLabel('İnce ayarlı (fine-grained) GitHub anahtarı').fill(TOKEN);
  await dialog.getByRole('button', { name: 'Bu cihazda bağla' }).click();
  await expect(dialog.getByRole('status')).toContainText('GitHub ile eşitlendi.');
  expect(github.probes).toBe(1);
  expect(github.puts).toHaveLength(1);
  expect(github.file.books[BOOK.id].value.states).toContain('alindi');
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(page.locator('.sync-notice')).toHaveCount(0);
  // The notice that opened the dialog is gone, so focus lands on the main content, not the page body.
  await expect(page.locator('#main-content')).toBeFocused();
});

test('a mark made in the book sheet says there that it stays on this device, and connects from there', async ({ page }) => {
  const github = fakeGitHub();
  await github.attach(page.context());
  await markPurchased(page);
  // The reader marks books in the sheet, so the sheet itself says where the mark stands.
  const line = page.locator('.detail-actions .sync-status-line');
  await expect(line).toContainText('1 değişiklik yalnız bu cihazda kayıtlı');
  const dialog = page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' });
  // Escape closes the dialog opened from the sheet, not the sheet under it.
  await line.getByRole('button', { name: 'Bu cihazı bağla' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(line).toBeVisible();
  await expect(line.getByRole('button', { name: 'Bu cihazı bağla' })).toBeFocused();
  await line.getByRole('button', { name: 'Bu cihazı bağla' }).click();
  await dialog.getByLabel('İnce ayarlı (fine-grained) GitHub anahtarı').fill(TOKEN);
  await dialog.getByRole('button', { name: 'Bu cihazda bağla' }).click();
  await expect(dialog.getByRole('status')).toContainText('GitHub ile eşitlendi.');
  expect(github.puts).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await expect(line).toContainText('GitHub’a gönderildi');
  // The button that opened the dialog is gone; focus stays in the sheet, on its sync status.
  await expect(line.locator('.sync-status-text')).toBeFocused();
});

// AGENTS.md: large text is in place before the page opens, so the sheet's em container queries apply.
const enlargeBeforeOpening = (context, wide = false) => context.addInitScript(css => {
  const add = () => document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add, { once: true });
}, `html{font-size:200%}${wide ? ':root{--sans:Verdana,sans-serif!important;--mantine-font-family:Verdana,sans-serif!important}' : ''}`);

test('the sheet’s sync line keeps its words and button inside at 320 px with 200% text, in a wide font too', async ({ browser }) => {
  const spilled = line => line.evaluate(container => {
    const edge = container.getBoundingClientRect().right + 1;
    return [...container.querySelectorAll('*')].filter(element => element.getBoundingClientRect().right > edge
      || (element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflowX !== 'visible')).map(element => element.className || element.tagName);
  });
  // Ubuntu CI draws the interface in a font much wider than macOS's; Verdana stands in for it.
  for (const wide of [false, true]) {
    for (const [state, button] of [['local', 'Bu cihazı bağla'], ['failed', 'Eşitleme ayrıntıları']]) {
      const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
      await enlargeBeforeOpening(context, wide);
      if (state === 'failed') await context.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
      await fakeGitHub({ refuseKey: state === 'failed' }).attach(context);
      const page = await context.newPage();
      await markPurchased(page);
      const line = page.locator('.detail-actions .sync-status-line');
      await expect(line).toHaveAttribute('data-kind', state);
      await expect(line.getByRole('button', { name: button })).toBeVisible();
      expect(await spilled(line), `${state}${wide ? ', wide font' : ''}`).toEqual([]);
      const box = await line.getByRole('button', { name: button }).boundingBox();
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      await context.close();
    }
  }
});

test('a token that can read but not write is refused and never stored', async ({ page }) => {
  const github = fakeGitHub({ canWrite: false });
  await github.attach(page.context());
  await page.goto('./');
  await openSyncFromFooter(page);
  const dialog = page.getByRole('dialog', { name: 'Cihazlar arası eşitleme' });
  await dialog.getByLabel('İnce ayarlı (fine-grained) GitHub anahtarı').fill(TOKEN);
  await dialog.getByRole('button', { name: 'Bu cihazda bağla' }).click();
  await expect(dialog.getByRole('status')).toContainText('Bu anahtar kitaps-state deposuna yazamıyor');
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(github.puts).toHaveLength(0);
});

test('the phone sends its mark when the reader leaves the page, and the computer sees it on opening', async ({ browser }) => {
  // The CDN copy lags, so the computer can only see the mark through a fresh read.
  const github = fakeGitHub({ cdnLags: true });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await github.attach(phone);
  await phone.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
  const phonePage = await phone.newPage();
  await markPurchased(phonePage);
  await phonePage.waitForTimeout(500);
  expect(github.puts, 'the 30 second window is still open').toHaveLength(0);
  // Browsers fire both events when a page goes away; they share one write.
  await hidePage(phonePage);
  await phonePage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => github.puts.length).toBe(1);
  await phonePage.waitForTimeout(500);
  expect(github.puts).toHaveLength(1);
  expect(github.file.books[BOOK.id].value.states).toContain('alindi');

  const computer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await github.attach(computer);
  const computerPage = await computer.newPage();
  await computerPage.goto(`./?book=${BOOK.slug}`);
  await expect(computerPage.getByRole('button', { name: 'Satın alındı', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(computerPage.locator('.sync-notice')).toHaveCount(0);
  await phone.close();
  await computer.close();
});

test('filled buttons keep readable text in the dark theme: the notice and an active mark', async ({ browser }) => {
  const { readFileSync } = await import('node:fs');
  const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  const context = await browser.newContext({ colorScheme: 'dark' });
  await fakeGitHub().attach(context);
  const page = await context.newPage();
  await markPurchased(page);
  const active = page.getByRole('button', { name: 'Satın alındı', exact: true });
  await expect(active).toHaveCSS('color', 'rgb(21, 15, 8)');
  await page.keyboard.press('Escape');
  const connect = page.locator('.sync-notice').getByRole('button', { name: 'Bu cihazı bağla' });
  await expect(connect).toHaveCSS('color', 'rgb(21, 15, 8)');
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => (await window.axe.run('.sync-notice', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => item.id));
  expect(violations).toEqual([]);
  await context.close();
});

test('connecting a second device asks before it replaces a book the first one saved', async ({ browser }) => {
  // Two devices and a connection on one machine: Linux WebKit under load needs more than the default time.
  test.slow();
  // The phone is connected and buys the book; the computer, not yet connected, marked it as being read.
  const github = fakeGitHub();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await github.attach(phone);
  await phone.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
  const computer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await github.attach(computer);
  const computerPage = await computer.newPage();
  await computerPage.goto(`./?book=${BOOK.slug}`);
  await computerPage.getByRole('button', { name: 'Okuma kaydım ve kişisel notlarım' }).click();
  await computerPage.getByRole('button', { name: 'Okunuyor', exact: true }).click();
  const phonePage = await phone.newPage();
  await markPurchased(phonePage);
  await hidePage(phonePage);
  await expect.poll(() => github.puts.length).toBe(1);

  await computerPage.keyboard.press('Escape');
  await openSyncFromFooter(computerPage);
  const dialog = computerPage.getByRole('dialog', { name: 'Cihazlar arası eşitleme' });
  await dialog.getByLabel('İnce ayarlı (fine-grained) GitHub anahtarı').fill(TOKEN);
  await dialog.getByRole('button', { name: 'Bu cihazda bağla' }).click();
  const merge = computerPage.getByRole('dialog', { name: 'Bu cihazdaki kayıtlar farklı' });
  await expect(merge).toContainText('1 kitabın kaydı', { timeout: 20000 });
  expect(github.puts, 'nothing is replaced before the reader decides').toHaveLength(1);
  // Escape does not close what lies under the question, and focus stays with the question.
  await computerPage.waitForTimeout(400);
  await computerPage.keyboard.press('Escape');
  await computerPage.waitForTimeout(400);
  await expect(merge).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect.poll(() => merge.evaluate(element => element.contains(document.activeElement)), { message: 'focus stays in the question' }).toBe(true);
  await merge.getByRole('button', { name: 'GitHub’dakini kullan' }).click();
  await expect(merge).toHaveCount(0);
  // The computer now shows the phone's purchase; the shared file was never overwritten.
  await dialog.getByRole('button', { name: 'Kapat' }).click();
  await computerPage.goto(`./?book=${BOOK.slug}`);
  await expect(computerPage.getByRole('button', { name: 'Satın alındı', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(github.puts).toHaveLength(1);
  expect(github.file.books[BOOK.id].value.states).toEqual(['alindi']);
  await phone.close();
  await computer.close();
});

test('the notice and the connect dialog keep their content inside at 320 px with 200% text', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ colorScheme, viewport: { width: 320, height: 720 } });
    await context.addInitScript(mode => { localStorage.setItem('kitapatlasi:wood', 'ceviz'); localStorage.setItem('kitapatlasi:color-scheme', mode); }, colorScheme);
    await fakeGitHub().attach(context);
    const page = await context.newPage();
    await markPurchased(page);
    await page.keyboard.press('Escape');
    await page.addStyleTag({ content: 'html{font-size:200%}' });
    // Every box inside stays within its container, and no box clips its own content
    // (a button label cut off inside its button stays within the button's box). Firefox
    // counts a button's 1 px transparent borders in scrollWidth, hence the 2 px allowance.
    const spills = root => page.locator(root).evaluate(container => {
      const edge = container.getBoundingClientRect().right + 1;
      return [...container.querySelectorAll('*')].filter(element => element.getBoundingClientRect().right > edge
        || (element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflowX !== 'visible')).map(element => element.className || element.tagName);
    });
    await expect(page.locator('.sync-notice')).toBeVisible();
    expect(await spills('.sync-notice'), `${colorScheme} notice`).toEqual([]);
    // With 200% text on a 320 px screen the sticky header and the purchase toast cover most of
    // the page, so the dialog is opened from the keyboard.
    await page.locator('.sync-notice').getByRole('button', { name: 'Bu cihazı bağla' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sync-modal .mantine-Modal-content')).toBeVisible();
    expect(await spills('.sync-modal .mantine-Modal-content'), `${colorScheme} dialog`).toEqual([]);
    // Ubuntu CI draws the interface in a font much wider than macOS's; Verdana stands in for it.
    await page.addStyleTag({ content: ':root{--sans:Verdana,sans-serif!important;--mantine-font-family:Verdana,sans-serif!important}' });
    expect(await spills('.sync-modal .mantine-Modal-content'), `${colorScheme} dialog, wide font`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  }
});

test('a damaged pending queue is kept aside: the notice points to its copy, which downloads and goes only when asked', async ({ browser }) => {
  const damaged = JSON.stringify({ since: '2026-10-22T08:00:00.000Z', mutations: [{ id: 'x', kind: 'book', bookId: BOOK.id, updatedAt: 'dün', value: { states: ['alindi'] } }] });
  const spills = (page, root) => page.locator(root).evaluate(container => {
    const edge = container.getBoundingClientRect().right + 1;
    return [...container.querySelectorAll('*')].filter(element => element.getBoundingClientRect().right > edge
      || (element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflowX !== 'visible')).map(element => element.className || element.tagName);
  });
  // Ubuntu CI draws the interface in a font much wider than macOS's; Verdana stands in for it.
  for (const wide of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
    await enlargeBeforeOpening(context, wide);
    // Seeded once: a reload must find what the page itself left behind.
    await context.addInitScript(([key, value]) => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem(key, value);
      localStorage.setItem('kitapatlasi:github-state:migrated:v1', '1');
      sessionStorage.setItem('seeded', '1');
    }, ['kitapatlasi:github-state:pending:v2', damaged]);
    await fakeGitHub().attach(context);
    const page = await context.newPage();
    await page.goto('./');
    const notice = page.locator('.sync-notice');
    await expect(notice.locator('.mantine-Alert-title')).toHaveText('Bekleyen değişikliklerin kaydı tam okunamadı');
    expect(await spills(page, '.sync-notice'), `notice${wide ? ', wide font' : ''}`).toEqual([]);
    await notice.getByRole('button', { name: 'Eşitleme ayrıntıları' }).focus();
    await page.keyboard.press('Enter');
    const warning = page.locator('.sync-modal .sync-recovery');
    await expect(warning).toBeVisible();
    expect(await spills(page, '.sync-modal .mantine-Modal-content'), `dialog${wide ? ', wide font' : ''}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(warning).toContainText('kayıttaki değişikliklerin hiçbiri okunamadı');
    const [download] = await Promise.all([page.waitForEvent('download'), warning.getByRole('button', { name: 'Kopyayı indir' }).click()]);
    expect(download.suggestedFilename()).toBe('kitaplik-bekleyen-degisiklikler.json');
    const { readFile } = await import('node:fs/promises');
    expect(JSON.parse(await readFile(await download.path(), 'utf8')).copies.map(copy => copy.raw)).toEqual([damaged]);
    // The copy survives a reload, once, until the reader removes it.
    await page.reload();
    await expect(notice.locator('.mantine-Alert-title')).toHaveText('Bekleyen değişikliklerin kaydı tam okunamadı');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('kitapatlasi:github-state:pending-recovery:v1'))).map(copy => copy.raw)).toEqual([damaged]);
    await notice.getByRole('button', { name: 'Eşitleme ayrıntıları' }).focus();
    await page.keyboard.press('Enter');
    await warning.getByRole('button', { name: 'Kopyayı sil' }).click();
    // Deleting asks first; the question keeps to the screen too.
    await expect(warning.getByRole('button', { name: 'Vazgeç' })).toBeFocused();
    expect(await spills(page, '.sync-modal .mantine-Modal-content'), `question${wide ? ', wide font' : ''}`).toEqual([]);
    await warning.getByRole('button', { name: 'Evet, sil' }).click();
    await expect(warning).toHaveCount(0);
    await expect(page.locator('.sync-modal [role="status"]').first()).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('kitapatlasi:github-state:pending-recovery:v1'))).toBeNull();
    await context.close();
  }
});
