import { test, expect } from '@playwright/test';

// Characterisation of the application shell (architecture plan, phase 0, 7 November 2026): the
// header, the footer bar and the footer menu, as screen readers meet them. Moving components
// between files must leave these trees exactly as they are. Run once, in Chromium, so a
// difference between engines' accessibility trees is not mistaken for a change.
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };

test.beforeEach(async ({ context, browserName }) => {
  test.skip(browserName !== 'chromium', 'The shell is characterised once, in Chromium.');
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.request().url().includes('routes.json') ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

test('the header keeps its links, four section tabs, shortcuts and theme switch', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./');
  await expect(page.getByRole('banner')).toMatchAriaSnapshot(`
    - banner:
      - link "Kitaplık · filtresiz ana sayfa":
        - /url: ./
        - img
        - paragraph: Kitaplık
      - tablist "Kitaplık bölümleri":
        - tab "Kitaplar" [selected]:
          - img
          - text: Kitaplar
        - tab "Sıram":
          - img
          - text: Sıram
        - tab "Kümeler":
          - img
          - text: Kümeler
        - tab "Kitapçılar":
          - img
          - text: Kitapçılar
      - navigation "Hızlı erişim":
        - button "Kızım için"
        - button "Favoriler":
          - img
        - button "Kitaplığım · 0 kitap"
      - button "Koyu temaya geç":
        - img
  `);
});

test('the footer bar names the current section, and its menu keeps every group and item', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.site-footer')).toMatchAriaSnapshot(`
    - contentinfo:
      - button "Menü Kitaplar"
  `);
  await page.locator('.footer-dock').click();
  await expect(page.getByRole('dialog', { name: 'Menü' })).toMatchAriaSnapshot(`
    - dialog "Menü":
      - banner:
        - heading "Menü" [level=2]
        - button "Kapat":
          - img
      - navigation "Bütün bölümler ve araçlar":
        - region "Bölümler":
          - paragraph: Bölümler
          - list:
            - listitem:
              - button "Kitaplar"
            - listitem:
              - button "Sıram"
            - listitem:
              - button "Kümeler"
            - listitem:
              - button "Kitapçılar"
            - listitem:
              - button "Kitap fuarları"
            - listitem:
              - button "Notlar ve kaynaklar"
        - region "Kısayollar":
          - paragraph: Kısayollar
          - list:
            - listitem:
              - button "Kızım için"
            - listitem:
              - button "Favoriler"
            - listitem:
              - 'button "Kitaplığım: 0 kitap"'
        - region "Araçlar":
          - paragraph: Araçlar
          - list:
            - listitem:
              - button "Çeviri rehberi"
            - listitem:
              - button "Cihaz eşitleme"
            - listitem:
              - button "Kitapları JSON indir"
      - paragraph: Kitaplık
      - paragraph: "Yaratılış: 27 Eylül 2026"
      - paragraph: /Güncelleme. \\d+ \\S+ \\d{4}/
  `);
});

// Every section opens from its address with its own heading, and from the footer menu too.
const PAGES = [
  ['./', 'Kitaplar', { level: 1, name: 'Tüm kitaplar' }],
  ['./?view=queue', 'Sıram', { level: 1, name: 'Okuma sıram' }],
  ['./?view=collections', 'Kümeler', { level: 1, name: 'Kitap kümeleri' }],
  ['./?view=bookstores', 'Kitapçılar', { level: 1, name: 'Kitapçılar' }],
  ['./?view=fairs', 'Kitap fuarları', { level: 1, name: 'Kitap fuarları' }],
  ['./?view=notes', 'Notlar ve kaynaklar', { level: 1, name: 'Kaynaklar ve notlar' }],
  ['./?view=favorites', 'Favoriler', { level: 1, name: 'Favorilerim' }],
  ['./?view=library', /^Kitaplığım/, { level: 1, name: 'Kitaplığım' }],
];
for (const [address, item, heading] of PAGES) {
  test(`${address} opens with its heading, and the footer menu reaches it`, async ({ page }) => {
    await page.goto(address);
    await expect(page.getByRole('heading', heading)).toBeAttached();
    await page.goto(address === './' ? './?view=queue' : './');
    await page.locator('.footer-dock').click();
    await page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: item, exact: typeof item === 'string' }).click();
    await expect(page.getByRole('heading', heading)).toBeAttached();
  });
}
