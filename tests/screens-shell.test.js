import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilters } from '../src/core/catalog/query.js';
import { VIEWS } from '../src/views.js';
import { footerMenuScreen, libraryToastScreen, shellScreen, themePanelScreen, woodWords } from '../src/screens/shell.js';
import { WOODS } from '../src/ui/react/app/woods.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const screen = (extra = {}) => shellScreen({ view: 'books', filters: emptyFilters(), favoriteCount: 2, ownedCount: 1019, updated: '9 Kasım 2026', personalSaved: true, ...extra });
const children = { ...emptyFilters(), categories: ['children'] };

test('the frame names the skip link, the brand and the four tabs', () => {
  const model = screen();
  assert.equal(model.skipLink, 'İçeriğe geç');
  assert.equal(model.brand, 'Kitaplık · filtresiz ana sayfa');
  assert.equal(model.tabs.label, 'Kitaplık bölümleri');
  assert.deepEqual(model.tabs.items, [{ id: 'books', label: 'Kitaplar' }, { id: 'queue', label: 'Sıram' }, { id: 'collections', label: 'Kümeler' }, { id: 'bookstores', label: 'Kitapçılar' }]);
  assert.equal(model.hideOwned, 'Satın aldıklarımı gösterme');
});

test('the shortcuts carry their counts in Turkish numbers, and an empty shelf shows no number', () => {
  const { shortcuts } = screen();
  assert.equal(shortcuts.label, 'Hızlı erişim');
  assert.deepEqual(shortcuts.favorites, { label: 'Favoriler: 2 kitap', current: false, count: '2' });
  assert.deepEqual(shortcuts.owned, { label: 'Kitaplığım: 1.019 kitap', current: false, count: '1.019' });
  const none = screen({ favoriteCount: 0, ownedCount: 0 }).shortcuts;
  assert.deepEqual(none.favorites, { label: 'Favoriler: 0 kitap', current: false, count: null });
  assert.deepEqual(none.owned, { label: 'Kitaplığım: 0 kitap', current: false, count: null });
});

test('a shortcut is marked current on its own page only', () => {
  assert.equal(screen({ view: 'favorites' }).shortcuts.favorites.current, true);
  assert.equal(screen({ view: 'favorites' }).shortcuts.owned.current, false);
  assert.equal(screen({ view: 'owned' }).shortcuts.owned.current, true);
  assert.deepEqual(screen().shortcuts.children, { label: 'Kızım için', current: false });
  assert.equal(screen({ filters: children }).shortcuts.children.current, true);
  assert.equal(screen({ filters: children, view: 'owned' }).shortcuts.children.current, false);
  assert.equal(screen({ filters: { ...children, categories: ['children', 'history'] } }).shortcuts.children.current, false);
});

test('the storage warning appears only when the browser cannot keep the reader\'s records', () => {
  assert.equal(screen().storageWarning, null);
  assert.equal(screen({ personalSaved: false }).storageWarning, 'Bu tarayıcı kişisel kayıtlarını kalıcı olarak saklayamıyor. Notlar bölümünden yedeğini indirebilirsin.');
});

test('each page has its hidden heading and its loading words', () => {
  const model = screen();
  assert.deepEqual(model.headings, { queue: 'Okuma sıram', collections: 'Kitap kümeleri', notes: 'Kaynaklar ve notlar' });
  assert.deepEqual(model.loading, { fairs: 'Kitap fuarları yükleniyor…', bookstores: 'Kitapçılar yükleniyor…', notes: 'Notlar yükleniyor…' });
});

test('the two dialogs have their titles and one word for closing', () => {
  assert.deepEqual(screen().modals, { sync: 'Cihazlar arası eşitleme', guide: 'Çeviri seçme rehberi', close: 'Kapat' });
});

test('the footer names the current page, and an unknown page leaves that out', () => {
  assert.equal(screen().footer.current, 'Kitaplar');
  assert.equal(screen({ view: 'notes' }).footer.current, 'Notlar ve kaynaklar');
  assert.equal(screen({ view: 'yok' }).footer.current, undefined);
});

test('the footer groups list every page once, in the order of the pages table', () => {
  const { groups } = screen().footer;
  assert.deepEqual(groups.map(group => [group.id, group.title]), [['sections', 'Bölümler'], ['shortcuts', 'Kısayollar'], ['tools', 'Araçlar']]);
  assert.deepEqual(groups[0].items.map(item => item.id), VIEWS.filter(view => view.footer === 'sections').map(view => view.id));
  assert.deepEqual(groups[0].items.map(item => item.label), VIEWS.filter(view => view.footer === 'sections').map(view => view.label));
  assert.deepEqual(groups[0].items[0], { id: 'books', label: 'Kitaplar', current: true });
  assert.deepEqual(groups[0].items.find(item => item.id === 'notes'), { id: 'notes', label: 'Notlar ve kaynaklar', current: false });
});

test('the shortcuts group leads with the children\'s shelf, and counts the two personal shelves', () => {
  const [, shortcuts] = screen().footer.groups;
  assert.deepEqual(shortcuts.items, [
    { id: 'children', label: 'Kızım için', current: false },
    { id: 'favorites', label: 'Favoriler: 2 kitap', current: false },
    { id: 'owned', label: 'Kitaplığım: 1.019 kitap', current: false },
  ]);
  assert.equal(screen({ filters: children }).footer.groups[1].items[0].current, true);
  assert.equal(screen({ filters: children, view: 'queue' }).footer.groups[1].items[0].current, false);
  assert.equal(screen({ view: 'owned' }).footer.groups[1].items[2].current, true);
});

test('the tools are always there and are never the current page', () => {
  assert.deepEqual(screen().footer.groups[2].items, [{ id: 'guide', label: 'Çeviri rehberi' }, { id: 'sync', label: 'Cihaz eşitleme' }, { id: 'export', label: 'Kitapları JSON indir' }]);
});

test('the footer states when the catalogue was made and last updated, in that order', () => {
  assert.deepEqual(screen().footer.meta, { name: 'Kitaplık', created: 'Yaratılış: 27 Eylül 2026', updated: 'Güncelleme: 9 Kasım 2026' });
});

test('the footer menu has one word for its bar and sheet, and one name for its links', () => {
  assert.deepEqual(footerMenuScreen(), { title: 'Menü', links: 'Bütün bölümler ve araçlar' });
});

test('the toast says what happened to which book, and how to take it back', () => {
  const book = { id: 'a', title: 'Meditations' };
  assert.deepEqual(libraryToastScreen({ book, owned: true }), { title: 'Kitaplığa eklendi', book: 'Meditations', undo: 'Geri al', close: 'Bildirimi kapat' });
  assert.equal(libraryToastScreen({ book, owned: false }).title, 'Kitaplıktan çıkarıldı');
});

test('the toast uses the title the catalogue shows', () => {
  assert.equal(libraryToastScreen({ book: { id: 'a', title: 'Kayıttaki', originalTitle: 'Gösterilen' }, owned: true }).book, 'Gösterilen');
});

test('the colour panel offers its two modes and names its groups', () => {
  assert.deepEqual(themePanelScreen(), { title: 'Renk düzeni', appearance: 'Görünüm', modes: [{ value: 'dark', label: 'Koyu' }, { value: 'light', label: 'Açık' }], wood: 'Ağaç' });
});

test('each wood has its name and its note, and the table of woods takes them from the model', () => {
  assert.deepEqual(woodWords('ceviz'), { label: 'Ceviz', note: 'Koyu kahve zemin, pirinç sarısı vurgu' });
  assert.deepEqual(woodWords('mese'), { label: 'Meşe', note: 'İsli zeytin zemin, yaprak yeşili vurgu' });
  assert.deepEqual(woodWords('akasya'), { label: 'Akasya', note: 'Kızıl siyah zemin, turkuaz vurgu' });
  assert.deepEqual(WOODS.map(({ id, ...words }) => [id, words]), ['ceviz', 'mese', 'akasya'].map(id => [id, woodWords(id)]));
});
