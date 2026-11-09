import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilters } from '../src/core/catalog/query.js';
import {
  activeFiltersScreen, ageLibraryScreen, bookCardScreen, bookCoverScreen, bookPreviewScreen, catalogScreen, categoryPillScreen, childrenShelf, onlyFilters,
  pageSizeLabel, paginationScreen, priorityBadgeScreen, priorityCardScreen, prioritySummaryScreen, readingSummaryScreen, shelfEmptyScreen, sourceBadgeScreen,
} from '../src/screens/catalog.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const collections = { time: { id: 'time', title: 'TIME 100', short: 'TIME' }, plain: { id: 'plain', title: 'Uzun Ad' } };
const groups = { g: { id: 'g', title: 'Alt küme' } };
const filters = extra => ({ ...emptyFilters(), ...extra });
const screen = (extra = {}) => catalogScreen({ view: 'books', filters: filters(), sort: 'title', total: 100, page: 1, pageSize: 24, showsHiddenPurchases: false, copied: false, ownedCount: 3, favoriteCount: 2, coreCount: 12, collections, groups, ...extra });

test('each shelf searches under its own name, and the catalogue has no hidden heading', () => {
  assert.equal(screen().search.label, 'Katalogda ara');
  assert.equal(screen({ view: 'owned' }).search.label, 'Kitaplığımda ara');
  assert.equal(screen({ view: 'favorites' }).search.label, 'Favorilerimde ara');
  assert.equal(screen().search.placeholder, 'Kitap, yazar, çevirmen…');
  assert.equal(screen().shelfHeading, null);
  assert.equal(screen({ view: 'owned' }).shelfHeading, 'Kitaplığım');
  assert.equal(screen({ view: 'favorites' }).shelfHeading, 'Favorilerim');
});

test('the clear button of the search appears only when there is something to clear', () => {
  assert.equal(screen().search.clear, null);
  assert.equal(screen({ filters: filters({ query: 'marcus' }) }).search.clear, 'Aramayı temizle');
});

test('the filter button counts the filters but not the search text', () => {
  assert.equal(screen().filtersButton, 'Filtreler');
  assert.equal(screen({ filters: filters({ query: 'x' }) }).filtersButton, 'Filtreler');
  assert.equal(screen({ filters: filters({ query: 'x', states: ['okundu', 'okunuyor'], shared: true }) }).filtersButton, 'Filtreler · 3');
});

test('the sort field lists its seven orders in the order the reader has always seen', () => {
  assert.equal(screen().sort.label, 'Kitapları sırala');
  assert.deepEqual(screen().sort.options, [
    { value: 'reading', label: 'Okuma önceliği' },
    { value: 'shared', label: 'En çok kesişen' },
    { value: 'title', label: 'Kitap adı · A–Z' },
    { value: 'author', label: 'Yazar · A–Z' },
    { value: 'newest', label: 'Yayın yılı · yeni' },
    { value: 'added', label: 'Eklenme · yeni' },
    { value: 'saved', label: 'Favoriler önce' },
  ]);
});

test('the reading band and the route appear only on the whole catalogue', () => {
  const start = screen();
  assert.equal(start.showsReadingSummary, true);
  assert.deepEqual(start.route, { label: 'Nereden başlamalı?', title: 'Nereden başlamalı?', body: '12 kitaplık çekirdek, düşünceden uygulamaya.', action: 'Seçkiye git' });
  for (const other of [screen({ view: 'owned' }), screen({ view: 'favorites' }), screen({ filters: filters({ query: 'x' }) }), screen({ filters: filters({ states: ['okundu'] }) })]) {
    assert.equal(other.showsReadingSummary, false);
    assert.equal(other.route, null);
  }
});

test('a catalogue without the core collection leaves the number out, as it always has', () => {
  assert.equal(screen({ coreCount: undefined }).route.body, ' kitaplık çekirdek, düşünceden uygulamaya.');
});

test('the age shelves appear only on the children shelf with nothing else chosen', () => {
  const children = filters({ categories: ['children'] });
  assert.equal(screen({ filters: children }).showsAgeLibrary, true);
  assert.equal(screen().showsAgeLibrary, false);
  assert.equal(screen({ filters: children, view: 'owned' }).showsAgeLibrary, false);
  assert.equal(screen({ filters: { ...children, states: ['okundu'] } }).showsAgeLibrary, false);
  assert.equal(screen({ filters: { ...children, query: 'x' } }).showsAgeLibrary, false);
});

test('only the catalogue sorted by priority explains the priority', () => {
  assert.equal(screen({ sort: 'reading' }).showsPrioritySummary, true);
  assert.equal(screen({ sort: 'title' }).showsPrioritySummary, false);
  assert.equal(screen({ sort: 'reading', view: 'owned' }).showsPrioritySummary, false);
  assert.equal(screen({ sort: 'reading', view: 'favorites' }).showsPrioritySummary, false);
});

test('the results heading names what is shown, the shelf first and then a single collection', () => {
  const title = extra => screen(extra).results.title;
  assert.equal(title(), 'Tüm kitaplar');
  assert.equal(title({ view: 'owned' }), 'Kitaplığımdakiler');
  assert.equal(title({ view: 'favorites' }), 'Favorilerim');
  assert.equal(title({ filters: filters({ categories: ['children'] }) }), 'Kızım için');
  assert.equal(title({ filters: filters({ collections: ['time'] }) }), 'TIME 100');
  assert.equal(title({ filters: filters({ collections: ['time'], groups: ['g'] }) }), 'TIME · Alt küme');
  assert.equal(title({ filters: filters({ collections: ['plain'], groups: ['g'] }) }), 'Uzun Ad · Alt küme');
  assert.equal(title({ filters: filters({ collections: ['time'], states: ['okundu'] }) }), 'Seçtiğin kitaplar');
  assert.equal(title({ filters: filters({ collections: ['unknown'] }) }), 'Seçtiğin kitaplar');
  assert.equal(title({ filters: filters({ query: 'x' }), view: 'owned' }), 'Seçtiğin kitaplar');
});

test('the heading is the page\'s first on the catalogue and second on a personal shelf', () => {
  assert.equal(screen().results.order, 1);
  assert.equal(screen({ view: 'owned' }).results.order, 2);
  assert.equal(screen({ view: 'favorites' }).results.order, 2);
});

test('the count says how many and which ones, and nothing more when there are none', () => {
  assert.equal(screen({ total: 100, page: 2, pageSize: 24 }).results.count, '100 eser, 25–48 arası gösteriliyor');
  assert.equal(screen({ total: 30, page: 2, pageSize: 24 }).results.count, '30 eser, 25–30 arası gösteriliyor');
  assert.equal(screen({ total: 0 }).results.count, '0 eser');
});

test('the note on hidden purchases appears only when it is true', () => {
  assert.equal(screen().results.purchasesNote, null);
  assert.equal(screen({ showsHiddenPurchases: true }).results.purchasesNote, 'Satın aldığın kitaplar da listede, çünkü okuma işaretine göre süzdün.');
});

test('the clear button counts the search, and the link button says what happened', () => {
  assert.equal(screen().results.clear, null);
  assert.equal(screen({ filters: filters({ query: 'x' }) }).results.clear, 'Temizle');
  assert.equal(screen({ copied: false }).results.copy, 'Bağlantıyı kopyala');
  assert.equal(screen({ copied: true }).results.copy, 'Bağlantı kopyalandı');
});

test('nothing found is told apart from a shelf that has never held a book', () => {
  assert.equal(screen().empty, null);
  const notFound = { title: 'Bu seçimde kitap yok.', body: 'Bir filtreyi kaldırabilir veya aramanı değiştirebilirsin.', clear: 'Filtreleri temizle' };
  assert.deepEqual(screen({ total: 0 }).empty, notFound);
  assert.deepEqual(screen({ total: 0, view: 'owned', ownedCount: 3 }).empty, notFound);
  assert.deepEqual(screen({ total: 0, view: 'favorites', favoriteCount: 2 }).empty, notFound);
  assert.deepEqual(screen({ total: 0, view: 'owned', ownedCount: 0 }).empty, { shelf: 'owned' });
  assert.deepEqual(screen({ total: 0, view: 'favorites', favoriteCount: 0 }).empty, { shelf: 'favorites' });
});

test('a filter is counted as only when it is the single one chosen', () => {
  assert.equal(childrenShelf(filters({ categories: ['children'] })), true);
  assert.equal(childrenShelf(filters({ categories: ['children', 'history'] })), false);
  assert.equal(onlyFilters(filters({ categories: ['a'], categoryMode: 'all' }), ['categories']), true);
  assert.equal(onlyFilters(filters({ categories: ['a'], shared: true }), ['categories']), false);
  assert.equal(onlyFilters(filters({ categories: ['a'], query: ' ' }), ['categories']), true);
  assert.equal(onlyFilters(filters({ categories: ['a'], query: 'x' }), ['categories']), false);
});

test('no chip row appears when no filter is on', () => {
  assert.equal(activeFiltersScreen({ filters: filters(), categories: {}, collections: {}, groups: {} }), null);
  assert.equal(activeFiltersScreen({ filters: filters({ query: 'x' }), categories: {}, collections: {}, groups: {} }), null);
});

test('each filter is a chip with its name, and removing one leaves the others', () => {
  const on = filters({ categories: ['history'], collections: ['time'], groups: ['g'], states: ['okundu'], authors: ['Epiktetos'], origins: ['atlas'], awards: ['Kazanan'], awardYears: ['2020'], qualities: ['ok'], addedDates: ['2026-10-04'] });
  const model = activeFiltersScreen({ filters: on, categories: { history: { label: 'Tarih' } }, collections, groups });
  assert.equal(model.label, 'Etkin filtreler');
  assert.deepEqual(model.chips.map(chip => [chip.id, chip.label]), [
    ['categories-history', 'Tarih'], ['collections-time', 'TIME'], ['groups-g', 'Alt küme'], ['states-okundu', 'Okundu'], ['authors-Epiktetos', 'Epiktetos'],
    ['origins-atlas', 'Kitap Atlası'], ['awards-Kazanan', 'Kazanan'], ['awardYears-2020', 'FT 2020'], ['qualities-ok', 'Kaynakta doğrulanmış'], ['addedDates-2026-10-04', 'Eklenme · 4 Ekim 2026'],
  ]);
  assert.equal(model.chips[0].removeLabel, 'Tarih filtresini kaldır');
  assert.deepEqual(model.chips[0].next, { ...on, categories: [] });
  assert.deepEqual(model.chips[9].next, { ...on, addedDates: [] });
});

test('an unknown value is shown as it is, and the three plain filters have their own chips', () => {
  const unknown = activeFiltersScreen({ filters: filters({ categories: ['bilinmeyen'] }), categories: {}, collections: {}, groups: {} });
  assert.equal(unknown.chips[0].label, 'bilinmeyen');
  const model = activeFiltersScreen({ filters: filters({ hasEdition: true, shared: true, yearMin: '1990', yearMax: '' }), categories: {}, collections: {}, groups: {} });
  assert.deepEqual(model.chips.map(chip => [chip.id, chip.label]), [['edition', 'Künye bilgisi var'], ['shared', 'Birden fazla kümede'], ['years', 'Yayın: 1990–…']]);
  assert.equal(model.chips[0].next.hasEdition, false);
  assert.equal(model.chips[1].next.shared, false);
  assert.deepEqual([model.chips[2].next.yearMin, model.chips[2].next.yearMax], ['', '']);
});

const book = (extra = {}) => ({ id: 'b', title: 'Kitap', author: 'Yazar', years: [1999], ...extra });

test('a card names the book and says when the source names no author', () => {
  const card = bookCardScreen({ book: book(), marks: [] });
  assert.equal(card.title, 'Kitap');
  assert.equal(card.author, 'Yazar');
  assert.equal(bookCardScreen({ book: book({ author: '' }), marks: [] }).author, 'Yazar bilgisi kaynakta belirtilmemiş');
});

test('a child\'s age shows only on a book that has one', () => {
  assert.equal(bookCardScreen({ book: book({ childAge: '4–7' }), marks: [] }).age, '4–7 yaş');
  assert.equal(bookCardScreen({ book: book(), marks: [] }).age, null);
});

test('a card names the publisher of the edition it knows, or what an article is', () => {
  const edition = { verifiedEdition: { title: 'Türkçe Ad', publisher: 'Türkçe Yayınevi', isbn: '1' } };
  assert.equal(bookCardScreen({ book: book({ cover: { publisher: 'Kapak Yayınevi' } }), marks: [] }).publisher, 'Kapak Yayınevi');
  assert.equal(bookCardScreen({ book: book({ ...edition, cover: { publisher: 'Kapak Yayınevi' } }), marks: [] }).publisher, 'Türkçe Yayınevi');
  assert.equal(bookCardScreen({ book: book(), marks: [] }).publisher, '');
  assert.equal(bookCardScreen({ book: book({ format: 'article', publication: { venue: 'Dergi' } }), marks: [] }).publisher, 'Makale · Dergi');
  assert.equal(bookCardScreen({ book: book({ format: 'essay' }), marks: [] }).publisher, 'Deneme');
});

test('a card badges the reading marks only: favourites, purchases and finished books have their own signs', () => {
  const card = bookCardScreen({ book: book(), marks: ['onemli', 'alindi', 'okundu', 'okunuyor', 'alinacak'] });
  assert.deepEqual(card.readingBadges, [{ id: 'okunuyor', label: 'Okunuyor' }, { id: 'alinacak', label: 'Alınacak' }]);
  assert.equal(card.read, true);
  assert.equal(bookCardScreen({ book: book(), marks: [] }).read, false);
});

test('the heart and the bag say what pressing them will do', () => {
  const off = bookCardScreen({ book: book(), marks: [] });
  assert.deepEqual(off.favorite, { pressed: false, tooltip: 'Favorilerime ekle', label: 'Kitap: favori olarak işaretle' });
  assert.deepEqual(off.owned, { pressed: false, tooltip: 'Satın aldım', label: 'Kitap: satın aldım' });
  const on = bookCardScreen({ book: book(), marks: ['onemli', 'alindi'] });
  assert.deepEqual(on.favorite, { pressed: true, tooltip: 'Favorilerden çıkar', label: 'Kitap: favori işaretini kaldır' });
  assert.deepEqual(on.owned, { pressed: true, tooltip: 'Kitaplığımdan çıkar', label: 'Kitap: kitaplığımdan çıkar' });
});

test('the preview lists the facts it has and leaves out the others', () => {
  assert.deepEqual(bookPreviewScreen({ purpose: 'Amaç', year: 1999, pages: { pages: 300 } }), { purpose: 'Amaç', facts: [{ label: 'İlk yayın', value: 1999 }, { label: 'Sayfa', value: 300 }] });
  assert.deepEqual(bookPreviewScreen({ purpose: 'Amaç', year: undefined, pages: { pages: 300 } }).facts, [{ label: 'Sayfa', value: 300 }]);
  assert.deepEqual(bookPreviewScreen({ purpose: 'Amaç', year: 1999, pages: null }).facts, [{ label: 'İlk yayın', value: 1999 }]);
  assert.deepEqual(bookPreviewScreen({ purpose: 'Amaç', year: undefined, pages: null }).facts, []);
});

test('a cover says whose it is and which edition, and its button names the book', () => {
  const tr = bookCoverScreen(book({ cover: { title: 'Kapak', publisher: 'Yayınevi', language: 'tr' } }));
  assert.equal(tr.alt, 'Kapak, Yayınevi, Türkçe baskı kapağı');
  assert.equal(tr.openLabel, 'Kapak ayrıntılarını aç', 'a Turkish edition gives the book its Turkish name');
  assert.equal(bookCoverScreen(book()).openLabel, 'Kitap ayrıntılarını aç');
  assert.equal(bookCoverScreen(book({ cover: { title: 'Cover', publisher: 'Press', language: 'en' } })).alt, 'Cover, Press, Uluslararası baskı kapağı');
  assert.equal(bookCoverScreen(book()).alt, null);
});

test('a cover with no picture shows the book\'s name, and a work names its kind', () => {
  const plain = bookCoverScreen(book());
  assert.deepEqual([plain.title, plain.author, plain.kind], ['Kitap', 'Yazar', null]);
  assert.equal(bookCoverScreen(book({ format: 'article' })).kind, 'Makale');
});

test('the age shelves name each band by its first part and count', () => {
  const library = { id: 'lib', title: 'Temel Kütüphane', description: 'Açıklama', count: 30, groupIds: ['a', 'b'] };
  const shelves = { a: { title: '3–5 yaş · Resimli', count: 10 }, b: { title: '6–8 yaş', count: 20 } };
  assert.deepEqual(ageLibraryScreen({ library, groups: shelves }), {
    eyebrow: 'Kızım için', title: 'Temel Kütüphane', description: 'Açıklama',
    bands: [{ id: 'a', label: '3–5 yaş · 10' }, { id: 'b', label: '6–8 yaş · 20' }],
    all: 'Tümü · 30',
  });
});

const summary = { total: 1002, read: 3, reading: 2, queued: 1, owned: 1500, favorites: 0, readShare: 3 / 1002 };

test('the reading band says how much is read, in Turkish numbers', () => {
  const band = readingSummaryScreen(summary);
  assert.equal(band.title, 'Okuma özetim');
  assert.equal(band.sentence, '1.002 kitaptan 3 tanesi okundu.');
  assert.equal(band.share, '%0,3');
  assert.equal(band.progress, 0.3);
  assert.equal(band.progressLabel, 'Okunan oranı');
  assert.equal(readingSummaryScreen({ ...summary, read: 0, readShare: 0 }).sentence, 'Henüz okundu işaretli kitap yok.');
  assert.equal(readingSummaryScreen({ ...summary, read: 0, readShare: 0 }).share, '%0');
  assert.equal(readingSummaryScreen({ ...summary, read: 501, readShare: 0.5 }).share, '%50');
});

test('the band lists its five shelves with what a screen reader hears', () => {
  assert.deepEqual(readingSummaryScreen(summary).stats, [
    { key: 'read', label: 'Okunan', value: '3', spoken: 'Okunan: 3 kitap' },
    { key: 'reading', label: 'Okuyorum', value: '2', spoken: 'Okuyorum: 2 kitap' },
    { key: 'queued', label: 'Sıramda', value: '1', spoken: 'Sıramda: 1 kitap' },
    { key: 'owned', label: 'Kitaplığım', value: '1.500', spoken: 'Kitaplığım: 1.500 kitap' },
    { key: 'favorites', label: 'Favoriler', value: '0', spoken: 'Favoriler: 0 kitap' },
  ]);
});

const ranking = (extra = {}) => ({ audience: 'general', rank: 7, score: 88, maturity: 'high', maturityLabel: 'Olgun', confidence: 90, policyVersion: 'v2', reasons: ['Birinci', 'İkinci'], criteria: [{ id: 'c', label: 'Kalıcılık', points: 12.345, normalized: 0.876, evidence: 'Kanıt' }], ...extra });

test('the priority notice lists the criteria in lower case and says what never changes the order', () => {
  const model = prioritySummaryScreen({ ordered: [{ criteria: [{ label: 'Kalıcılık' }, { label: 'İz Bırakma' }] }] });
  assert.equal(model.toggle, 'Okuma önceliğine göre sıralı');
  assert.equal(model.detail, '2 ölçüt: kalıcılık, iz bırakma. Çocuk kitapları kendi aralarında sıralanır. Satın alma, favori, okuma durumu ve kişisel sıra puanı değiştirmez.');
  assert.equal(prioritySummaryScreen({ ordered: [] }).detail, '0 ölçüt: . Çocuk kitapları kendi aralarında sıralanır. Satın alma, favori, okuma durumu ve kişisel sıra puanı değiştirmez.');
});

test('the priority badge tells a screen reader in a sentence what the eye reads in two numbers', () => {
  const badge = priorityBadgeScreen(ranking());
  assert.equal(badge.tooltip, 'Olgun · 88/100');
  assert.equal(badge.spoken, 'Okuma önceliği: 7. sıra, 100 üzerinden 88 puan. Olgun.');
  assert.equal(badge.rank, '#7');
  assert.equal(badge.score, 88);
  assert.equal(priorityBadgeScreen(ranking({ audience: 'children' })).spoken, 'Okuma önceliği: çocuk kitapları arasında 7. sıra, 100 üzerinden 88 puan. Olgun.');
});

test('the priority card shows the score, the place and each criterion with its share', () => {
  const card = priorityCardScreen(ranking());
  assert.equal(card.eyebrow, 'OKUMA ÖNCELİĞİ');
  assert.equal(card.score, '88 / 100');
  assert.equal(card.place, 'Katalog sırası · 7');
  assert.equal(priorityCardScreen(ranking({ audience: 'children' })).place, 'Çocuk kitapları arasında sıra · 7');
  assert.deepEqual(card.maturity, { level: 'high', label: 'Olgun' });
  assert.deepEqual(card.total, { value: 88, label: 'Toplam okuma önceliği: 100 üzerinden 88' });
  assert.deepEqual(card.criteria, [{ id: 'c', label: 'Kalıcılık', points: '+12.3', value: 87.6, progressLabel: 'Kalıcılık: yüzde 88, katkı 12.3 puan', evidence: 'Kanıt' }]);
});

test('the priority card keeps its reasons only when there are some, and says what never moves the score', () => {
  const card = priorityCardScreen(ranking());
  assert.deepEqual(card.reasons, { title: 'En güçlü gerekçeler', items: ['Birinci', 'İkinci'] });
  assert.equal(priorityCardScreen(ranking({ reasons: [] })).reasons, null);
  assert.equal(priorityCardScreen(ranking({ reasons: undefined })).reasons, null);
  assert.deepEqual(card.confidence, { label: 'Puan güveni:', value: '%90' });
  assert.equal(card.policy, 'Kural sürümü: v2. Puan yalnızca katalog, kitap ilişkileri veya kural sürümü değiştiğinde yeniden hesaplanır. Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez.');
});

test('an empty shelf says how a book gets there', () => {
  assert.deepEqual(shelfEmptyScreen('favorites'), { title: 'Henüz favori kitap yok.', body: 'Bir kitabın kartındaki kalp düğmesine bastığında kitap burada görünür.', browse: 'Kataloğa git' });
  assert.deepEqual(shelfEmptyScreen('owned'), { title: 'Kitaplığın ilk kitabını bekliyor.', body: 'Bir kitabın kartında “Satın aldım” düğmesine bastığında kitap burada görünür. Okumaya başladığın kitaplar da buraya gelir.', browse: 'Kataloğa git' });
});

test('the pagination says where the reader is', () => {
  const model = paginationScreen({ page: 2, total: 5, count: 100, pageSize: 24 });
  assert.equal(model.label, 'Katalog sayfaları');
  assert.equal(model.range, '25–48');
  assert.equal(model.rangeOf, ' · 100 kitap içinde');
  assert.deepEqual(model.status, { lead: 'Sayfa ', page: 2, tail: ' / 5' });
  assert.equal(model.sizeSelect, 'Sayfa başına kitap');
  assert.equal(paginationScreen({ page: 5, total: 5, count: 100, pageSize: 24 }).range, '97–100');
  assert.equal(paginationScreen({ page: 1, total: 1, count: 0, pageSize: 24 }).range, '0–0');
});

test('the page controls appear only when there is more than one page, and each says where it goes', () => {
  assert.equal(paginationScreen({ page: 1, total: 1, count: 3, pageSize: 24 }).showsNavigation, false);
  const model = paginationScreen({ page: 1, total: 5, count: 100, pageSize: 24 });
  assert.equal(model.showsNavigation, true);
  assert.equal(model.previous, 'Önceki sayfa');
  assert.equal(model.next, 'Sonraki sayfa');
  assert.equal(model.pageLabel(3), '3. sayfaya git');
  assert.equal(model.pageOf(3, 5), 'Sayfa 3 / 5');
  assert.deepEqual(model.jump, { open: 'Sayfaya git', field: 'Sayfa · 1–5', fieldLabel: 'Gidilecek sayfa', submit: 'Git' });
  assert.equal(pageSizeLabel(96), '96 / sayfa');
});

test('a category pill names what it shows, and its short form falls back to the full name', () => {
  assert.deepEqual(categoryPillScreen({ id: 'history', label: 'Tarih ve Toplum' }), { text: 'Tarih ve Toplum', label: 'Tarih ve Toplum kitaplarını göster' });
  assert.equal(categoryPillScreen({ id: 'history', label: 'Tarih ve Toplum', compact: true }).text, 'Tarih');
  assert.equal(categoryPillScreen({ id: 'bilinmeyen', label: 'Başka', compact: true }).text, 'Başka');
});

test('a source badge says where the record came from', () => {
  assert.equal(sourceBadgeScreen('atlas').label, 'Kitap Atlası');
  assert.equal(sourceBadgeScreen('kitaps').label, 'Kitaps');
});
