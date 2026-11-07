import { test, expect } from '@playwright/test';

// Two or three devices share one fake titanlar-com/kitaps-state, so no test reads or writes the
// real file. The token is a test value. Every kind of record a reader keeps is checked: the seven
// marks, the reading record (dates, pages, notes) and the reading queue.
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_e2e_checks';
const TOKEN_KEY = 'kitapatlasi:github-state:token:v1';
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT',
  'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type, If-None-Match, X-GitHub-Api-Version',
  'Access-Control-Expose-Headers': 'ETag, X-OAuth-Scopes, X-RateLimit-Remaining, X-RateLimit-Reset',
};
const BOOKS = {
  goodtogreat: 'good-to-great-by-jim-collins',
  zerotoone: 'zero-to-one-by-peter-thiel-with-blake-masters',
  innovators: 'the-innovators-by-walter-isaacson',
  goal: 'the-goal-by-eliyahu-goldratt',
  howtoreadabook: 'how-to-read-a-book-by-mortimer-j-adler-and-charles-van-doren',
};
const base64 = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

const fakes = [];
test.afterEach(() => {
  for (const github of fakes.splice(0)) expect(github.elsewhere, 'GitHub requests outside titanlar-com/kitaps-state').toEqual([]);
});

function fakeGitHub() {
  const github = { file: structuredClone(EMPTY), sha: 'sha-0', puts: [], commits: [], elsewhere: [] };
  fakes.push(github);
  github.attach = async context => {
    await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, route => {
      github.elsewhere.push(`${route.request().method()} ${route.request().url()}`);
      return route.abort();
    });
    // Only state.json is this fake's file; routes.json is not made yet, as on a new repository.
    await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('/routes.json') ? route.fulfill({ status: 404, headers: CORS, json: {} }) : route.fulfill({ headers: CORS, json: github.file }));
    await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (request.url().includes('/contents/routes.json')) return route.fulfill({ status: 404, headers: CORS, json: { message: 'Not Found' } });
      // state.json's history, newest first: a reopened page asks it whether an unanswered write landed.
      if (request.method() === 'GET' && request.url().includes('/commits?')) return route.fulfill({ headers: CORS, json: github.commits });
      if (request.url().endsWith('/git/blobs')) return route.fulfill({ status: 201, headers: CORS, json: { sha: 'e69de29' } });
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        if (body.sha !== github.sha) return route.fulfill({ status: 409, headers: CORS, json: { message: 'sha does not match' } });
        github.file = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
        github.sha = `sha-${github.puts.push(github.file)}`;
        github.commits.unshift({ sha: github.sha, commit: { message: body.message } });
        return route.fulfill({ headers: CORS, json: { content: { sha: github.sha } } });
      }
      return route.fulfill({ headers: { ...CORS, ETag: `"${github.sha}"` }, json: { sha: github.sha, encoding: 'base64', content: base64(github.file) } });
    });
  };
  return github;
}

async function device(browser, github, { phone = false, connected = true } = {}) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  await github.attach(context);
  if (connected) await context.addInitScript(([key, token]) => localStorage.setItem(key, token), [TOKEN_KEY, TOKEN]);
  return { context, page: await context.newPage() };
}

const openBook = async (page, id) => {
  await page.goto(`./?book=${BOOKS[id]}`);
  await expect(page.getByRole('button', { name: 'Satın alındı', exact: true })).toBeVisible();
};
const openRecord = async page => {
  const control = page.getByRole('button', { name: 'Okuma kaydım ve kişisel notlarım' });
  if (await control.getAttribute('aria-expanded') !== 'true') await control.click();
  await expect(page.getByLabel('Kaldığım sayfa')).toBeVisible();
};
const mark = async (page, label) => {
  const button = page.getByRole('button', { name: label, exact: true });
  const before = await button.getAttribute('aria-pressed');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
};
const pressed = page => label => expect(page.getByRole('button', { name: label, exact: true }));
/** Leaving the page sends what is waiting, as a phone does when the reader switches away. */
const leave = async (page, github) => {
  const before = github.puts.length;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => github.puts.length, { message: 'the page sends its changes when it is left' }).toBeGreaterThan(before);
};

test('everything one device records reaches the other device and a reader without a key', async ({ browser }) => {
  const github = fakeGitHub();
  const phone = await device(browser, github, { phone: true });
  const p = phone.page;

  // The marks on the book page and in the reading record.
  await openBook(p, 'goodtogreat');
  await mark(p, 'Favori');
  await mark(p, 'Alınacak');
  await mark(p, 'Satın alındı');
  await p.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' }).click();
  await openBook(p, 'zerotoone');
  await openRecord(p);
  await mark(p, 'Okunuyor');
  await p.getByLabel('Kaldığım sayfa').fill('40');
  await p.getByLabel('Toplam sayfa').fill('300');
  await p.getByLabel('Neden okuyorum?').fill('Tekel ve rekabet üzerine düşünmek için.');
  await p.getByLabel('Bundan neyi uygulayacağım?').fill('Bir ürün fikrini tekel sorusuyla sınamak.');
  await p.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' }).click();
  for (const [id, label] of [['innovators', 'Okundu'], ['goal', 'Ara verdim'], ['howtoreadabook', 'Bıraktım']]) {
    await openBook(p, id);
    await openRecord(p);
    await mark(p, label);
  }
  await p.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' }).click();
  await leave(p, github);

  const file = github.file.books;
  expect(file.goodtogreat.value.states.sort()).toEqual(['alindi', 'onemli']);
  expect(file.zerotoone.value.states).toEqual(['okunuyor']);
  expect(file.zerotoone.value.reading).toMatchObject({ page: 40, totalPages: 300, why: 'Tekel ve rekabet üzerine düşünmek için.', apply: 'Bir ürün fikrini tekel sorusuyla sınamak.' });
  expect(file.zerotoone.value.reading.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(file.innovators.value.states).toEqual(['okundu']);
  expect(file.goal.value.states).toEqual(['araverildi']);
  expect(file.howtoreadabook.value.states).toEqual(['birakildi']);
  expect(github.file.queue.value).toEqual(['goodtogreat', 'zerotoone', 'howtoreadabook']);

  // The computer and a friend without a key see all of it.
  const computer = await device(browser, github);
  const friend = await device(browser, github, { connected: false });
  for (const { page } of [computer, friend]) {
    await openBook(page, 'goodtogreat');
    await pressed(page)('Favori').toHaveAttribute('aria-pressed', 'true');
    await pressed(page)('Alınacak').toHaveAttribute('aria-pressed', 'false');
    await pressed(page)('Satın alındı').toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.detail-actions').getByRole('button', { name: 'Sıramda · 1. kitap' })).toBeVisible();
    await openBook(page, 'zerotoone');
    await openRecord(page);
    await pressed(page)('Okunuyor').toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Kaldığım sayfa')).toHaveValue('40');
    await expect(page.getByLabel('Toplam sayfa')).toHaveValue('300');
    await expect(page.getByLabel('Neden okuyorum?')).toHaveValue('Tekel ve rekabet üzerine düşünmek için.');
    await expect(page.getByLabel('Bundan neyi uygulayacağım?')).toHaveValue('Bir ürün fikrini tekel sorusuyla sınamak.');
    await expect(page.locator('.detail-actions').getByRole('button', { name: 'Sıramda · 2. kitap' })).toBeVisible();
    for (const [id, label] of [['innovators', 'Okundu'], ['goal', 'Ara verdim'], ['howtoreadabook', 'Bıraktım']]) {
      await openBook(page, id);
      await openRecord(page);
      await pressed(page)(label).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(page.locator('.detail-actions').getByRole('button', { name: 'Sıramda · 3. kitap' })).toBeVisible();
  }

  // Taking things away travels too: a removed mark, a cleared note, a book out of the queue.
  const c = computer.page;
  await openBook(c, 'goodtogreat');
  await mark(c, 'Favori');
  await openBook(c, 'zerotoone');
  await openRecord(c);
  await c.getByLabel('Neden okuyorum?').fill('');
  await c.keyboard.press('Escape');
  await c.getByRole('tab', { name: 'Sıram' }).click();
  await c.getByRole('button', { name: /sıradan çıkar$/ }).first().click();
  await leave(c, github);
  expect(github.file.books.goodtogreat.value.states).toEqual(['alindi']);
  expect(github.file.books.zerotoone.value.reading.why).toBeUndefined();
  expect(github.file.queue.value).toEqual(['zerotoone', 'howtoreadabook']);

  await openBook(p, 'goodtogreat');
  await pressed(p)('Favori').toHaveAttribute('aria-pressed', 'false');
  await pressed(p)('Satın alındı').toHaveAttribute('aria-pressed', 'true');
  await openBook(p, 'zerotoone');
  await openRecord(p);
  await expect(p.getByLabel('Neden okuyorum?')).toHaveValue('');
  await expect(p.getByLabel('Kaldığım sayfa')).toHaveValue('40');
  await expect(p.locator('.detail-actions').getByRole('button', { name: 'Sıramda · 1. kitap' })).toBeVisible();
  for (const item of [phone, computer, friend]) await item.context.close();
});

// Both devices are open and have read the shared file. Each changes something before it has seen
// the other's change, as when the reader marks a book on the phone and, a minute later, on the
// computer. Nothing either device recorded may be lost.
test.describe('two devices that change things before they have seen each other', () => {
  const pair = async browser => {
    const github = fakeGitHub();
    const phone = await device(browser, github, { phone: true });
    const computer = await device(browser, github);
    return { github, phone, computer, close: () => Promise.all([phone.context.close(), computer.context.close()]) };
  };

  test('different books: both are kept', async ({ browser }) => {
    const { github, phone, computer, close } = await pair(browser);
    await openBook(phone.page, 'goodtogreat');
    await openBook(computer.page, 'zerotoone');
    await mark(phone.page, 'Favori');
    await leave(phone.page, github);
    await mark(computer.page, 'Satın alındı');
    await leave(computer.page, github);
    expect(github.file.books.goodtogreat?.value.states).toEqual(['onemli']);
    expect(github.file.books.zerotoone?.value.states).toEqual(['alindi']);
    await close();
  });

  test('the same book, different marks: both marks are kept', async ({ browser }) => {
    const { github, phone, computer, close } = await pair(browser);
    await openBook(phone.page, 'goodtogreat');
    await openBook(computer.page, 'goodtogreat');
    await mark(phone.page, 'Favori');
    await leave(phone.page, github);
    // The computer has not seen the phone's mark: any rule would keep it otherwise.
    await pressed(computer.page)('Favori').toHaveAttribute('aria-pressed', 'false');
    await mark(computer.page, 'Satın alındı');
    await leave(computer.page, github);
    expect(github.file.books.goodtogreat.value.states.sort()).toEqual(['alindi', 'onemli']);
    await close();
  });

  test('the same book, different parts of the reading record: both are kept', async ({ browser }) => {
    const { github, phone, computer, close } = await pair(browser);
    await openBook(phone.page, 'zerotoone');
    await openBook(computer.page, 'zerotoone');
    await openRecord(phone.page);
    await openRecord(computer.page);
    await phone.page.getByLabel('Kaldığım sayfa').fill('50');
    await leave(phone.page, github);
    await expect(computer.page.getByLabel('Kaldığım sayfa'), 'the computer has not seen the phone’s page').toHaveValue('');
    await computer.page.getByLabel('Neden okuyorum?').fill('Bilgisayardan yazılan not.');
    await leave(computer.page, github);
    expect(github.file.books.zerotoone.value.reading).toMatchObject({ page: 50, why: 'Bilgisayardan yazılan not.' });
    await close();
  });

  // Second review of 7 November 2026: a send that failed offline was taken for one that may
  // have landed, and the phone's mark was lost once the computer marked the same book.
  test('a phone that marked a book offline keeps its marks and the computer’s once it is back', async ({ browser }) => {
    const { github, phone, computer, close } = await pair(browser);
    await openBook(phone.page, 'goodtogreat');
    await openBook(computer.page, 'goodtogreat');
    await phone.context.setOffline(true);
    await mark(phone.page, 'Favori');
    await phone.page.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' }).click();
    // Leaving the page tries to send; offline, nothing reaches GitHub.
    await phone.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(phone.page.getByText(/Eşitleme tamamlanamadı/).first()).toBeAttached();
    expect(github.puts).toHaveLength(0);
    await mark(computer.page, 'Satın alındı');
    await computer.page.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' }).click();
    await leave(computer.page, github);
    await phone.context.setOffline(false);
    await openBook(phone.page, 'goodtogreat');
    await pressed(phone.page)('Satın alındı').toHaveAttribute('aria-pressed', 'true');
    await pressed(phone.page)('Favori').toHaveAttribute('aria-pressed', 'true');
    await leave(phone.page, github);
    expect([...github.file.books.goodtogreat.value.states].sort()).toEqual(['alindi', 'onemli']);
    expect(github.file.queue.value).toEqual(['goodtogreat']);
    await close();
  });

  test('the queue: a book added on each device is kept on both', async ({ browser }) => {
    const { github, phone, computer, close } = await pair(browser);
    await openBook(phone.page, 'goodtogreat');
    await openBook(computer.page, 'zerotoone');
    await phone.page.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' }).click();
    await leave(phone.page, github);
    await computer.page.locator('.detail-actions').getByRole('button', { name: 'Sırama ekle' }).click();
    await leave(computer.page, github);
    expect([...github.file.queue.value].sort()).toEqual(['goodtogreat', 'zerotoone']);
    await close();
  });
});
