import test from 'node:test';
import assert from 'node:assert/strict';
import { CHOICE_STEP, choicesScreen, filtersScreen } from '../src/screens/filters.js';
import { QUALITY_LABELS, ORIGIN_LABELS, emptyFilters } from '../src/library.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const catalog = {
  categories: [{ id: 'tarih', label: 'Tarih' }, { id: 'felsefe', label: 'Felsefe' }],
  collections: [{ id: 'time', short: 'TIME' }, { id: 'ft', short: 'FT' }],
  groups: [{ id: 'g1', collectionId: 'time', title: 'Romanlar' }, { id: 'g2', collectionId: 'ft', title: 'Ödüller' }],
  books: [],
};
const shelf = [{ addedAt: '2026-10-04' }, { addedAt: '2026-11-01' }, { addedAt: '2026-11-01' }, {}];
const screen = (filters = {}, extra = {}) => filtersScreen({ filters: { ...emptyFilters(), ...filters }, section: null, count: 12, catalog, authors: ['Ece Temelkuran', 'Orhan Pamuk'], shelf, ...extra });
const row = (model, id) => model.groups.flatMap(group => group.sections).find(section => section.id === id);

test('the head of the sheet names the list, and a section once one is open', () => {
  const list = screen();
  assert.deepEqual(list.header, { back: null, title: 'Filtreler', close: 'Filtreleri uygulamadan kapat', intro: 'Aradığın kitapları daralt.' });
  const open = screen({}, { section: 'years' });
  assert.deepEqual(open.header, { back: 'Filtre başlıklarına dön', title: 'Yıl ve ödül', close: 'Filtreleri uygulamadan kapat', intro: 'Birden fazla seçim yapabilirsin.' });
  assert.equal(list.nav, 'Filtre başlıkları');
});

test('the search a reader made is repeated only when there is one', () => {
  assert.equal(screen().query, null);
  assert.deepEqual(screen({ query: 'savaş' }).query, { label: 'Araman:', value: 'savaş' });
});

test('the headings are grouped by what they are about, in the sheet\'s order', () => {
  const { groups } = screen();
  assert.deepEqual(groups.map(group => [group.id, group.title, group.chosen]), [['topic', 'Konu', null], ['reader', 'Okuma kayıtlarım', null], ['record', 'Künye ve tarih', null]]);
  assert.deepEqual(groups.map(group => group.sections.map(section => section.id)), [['categories', 'authors', 'collections'], ['states'], ['editions', 'years', 'added']]);
  assert.deepEqual(groups.flatMap(group => group.sections).map(section => [section.title, section.detail]), [
    ['Kategoriler', 'Konusuna göre keşfet'],
    ['Yazarlar', 'Bir yazarın kitaplarını bul'],
    ['Kümeler', 'Seçkiler ve okuma rotaları'],
    ['Okuma durumum', 'Favoriler ve okuma kayıtları'],
    ['Baskı ve kaynak', 'Künye bilgisi ve kaynaklar'],
    ['Yıl ve ödül', 'Yayın aralığı ve FT ödülleri'],
    ['Eklenme tarihi', 'Kitaplığa hangi gün eklendi'],
  ]);
});

test('a heading with nothing chosen shows its hint and adds no label or count', () => {
  const model = row(screen(), 'categories');
  assert.deepEqual([model.label, model.chosen, model.count], [undefined, false, 0]);
});

test('a heading with choices says them, and its group counts them', () => {
  const model = screen({ categories: ['tarih', 'felsefe'], authors: ['Orhan Pamuk'] });
  const categories = row(model, 'categories');
  assert.equal(categories.detail, 'Tarih, Felsefe');
  assert.equal(categories.label, 'Kategoriler: Tarih, Felsefe. 2 seçim');
  assert.deepEqual([categories.chosen, categories.count], [true, 2]);
  assert.equal(model.groups[0].chosen, '3 seçim');
  assert.equal(model.groups[1].chosen, null);
});

test('every kind of choice is named on its heading', () => {
  const model = screen({ collections: ['time'], groups: ['g1', 'gone'], shared: true, states: ['okundu'], qualities: ['ok'], origins: ['kitaps'], hasEdition: true, awards: ['Kazanan'], awardYears: ['2020'], yearMin: 1900, yearMax: 1950, addedDates: ['2026-10-04'] });
  assert.equal(row(model, 'collections').detail, 'TIME, Romanlar, gone, Birden fazla kümede');
  assert.equal(row(model, 'states').detail, 'Okundu');
  assert.equal(row(model, 'editions').detail, 'Kaynakta doğrulanmış, Kitaps, Künye bilgisi var');
  assert.equal(row(model, 'years').detail, 'Kazanan, FT 2020, 1900 ile 1950 arası');
  assert.equal(row(model, 'added').detail, '4 Ekim 2026');
});

test('a year range is said in words, by the limits that were given', () => {
  assert.equal(row(screen({ yearMin: 1900 }), 'years').detail, '1900 ve sonrası');
  assert.equal(row(screen({ yearMax: 1950 }), 'years').detail, '1950 ve öncesi');
});

test('the foot of the sheet counts matches and choices', () => {
  const none = screen();
  assert.deepEqual(none.result, { fix: null, count: 12, unit: 'kitap eşleşiyor', selection: null });
  assert.deepEqual(none.footer, { clear: { text: 'Temizle', disabled: true }, apply: { text: 'Kitapları göster', disabled: false } });
  const some = screen({ categories: ['tarih'], shared: true });
  assert.equal(some.result.selection, '2 seçim');
  assert.equal(some.footer.clear.disabled, false);
});

test('an impossible year range is reported and stops the sheet from applying', () => {
  const model = screen({ yearMin: 2000, yearMax: 1900 });
  assert.equal(model.result.fix, 'Yıl aralığını düzelt');
  assert.equal(model.footer.apply.disabled, true);
  assert.equal(model.content.years.range.invalid, 'En geç yıl, en erken yıldan küçük olamaz.');
  assert.equal(screen({ yearMin: 1900, yearMax: 2000 }).content.years.range.invalid, null);
  assert.equal(screen({ yearMin: 2000 }).content.years.range.invalid, null);
});

test('the year fields keep their words', () => {
  const { range, awards, awardYears } = screen().content.years;
  assert.deepEqual([range.legend, range.from, range.to, range.none, range.hint], ['İlk yayın yılı', 'En erken', 'En geç', 'Sınır yok', 'Aralık seçildiğinde yayın yılı bilinmeyen kitaplar gösterilmez.']);
  assert.equal(awards.title, 'FT ödülü');
  assert.deepEqual(awards.options.map(option => [option.value, option.label]), [['Kazanan', 'Kazanan'], ['Kısa liste', 'Kısa liste'], ['Uzun liste', 'Uzun liste']]);
  assert.equal(awardYears.title, 'FT ödül yılı');
  assert.equal(awardYears.options.length, 22);
  assert.deepEqual([awardYears.options[0], awardYears.options[21]], [{ value: '2026', label: '2026' }, { value: '2005', label: '2005' }]);
});

test('asking that every chosen category match is offered only with two or more', () => {
  assert.equal(screen({ categories: ['tarih'] }).content.categories.allMatch, null);
  assert.deepEqual(screen({ categories: ['tarih', 'felsefe'] }).content.categories.allMatch, { text: 'Seçili kategorilerin tümü eşleşsin', checked: false });
  assert.equal(screen({ categories: ['tarih', 'felsefe'], categoryMode: 'all' }).content.categories.allMatch.checked, true);
});

test('asking that a book be in every chosen collection is offered only with two or more', () => {
  assert.equal(screen({ collections: ['time'] }).content.collections.allMatch, null);
  assert.deepEqual(screen({ collections: ['time', 'ft'] }).content.collections.allMatch, { text: 'Seçili kümelerin tümünde bulunsun', checked: false });
  assert.equal(screen({ collections: ['time', 'ft'], collectionMode: 'all' }).content.collections.allMatch.checked, true);
});

test('each section names its lists and offers the catalogue\'s options', () => {
  const { categories, states, authors, collections, editions, added } = screen().content;
  assert.equal(categories.choices.title, 'Kategoriler');
  assert.deepEqual(categories.choices.options, [{ value: 'tarih', label: 'Tarih' }, { value: 'felsefe', label: 'Felsefe' }]);
  assert.equal(states.choices.title, 'Okuma durumum');
  assert.deepEqual(states.choices.options.slice(0, 2), [{ value: 'onemli', label: 'Favori' }, { value: 'alinacak', label: 'Alınacak' }]);
  assert.equal(authors.choices.title, 'Yazar');
  assert.deepEqual(authors.choices.options[0], { value: 'Ece Temelkuran', label: 'Ece Temelkuran' });
  assert.deepEqual([collections.collections.title, collections.groups.title], ['Kitap kümesi', 'Alt küme']);
  assert.deepEqual(collections.collections.options, [{ value: 'time', label: 'TIME' }, { value: 'ft', label: 'FT' }]);
  assert.deepEqual(collections.shared, { text: 'Birden fazla kitap kümesinde bulunanlar', checked: false });
  assert.deepEqual([editions.qualities.title, editions.origins.title], ['Kaynağın künye değerlendirmesi', 'Verinin kaynağı']);
  assert.deepEqual(editions.hasEdition, { text: 'Çevirmen veya yayınevi bilgisi bulunanlar', checked: false });
  assert.equal(editions.hint, 'Künye değerlendirmeleri özgün kaynaktan aktarılır. Bu değerlendirmeler çevirinin kalitesini tek başına ölçmez.');
  assert.deepEqual(editions.qualities.options[0], { value: 'ok', label: 'Kaynakta doğrulanmış' });
  assert.deepEqual(editions.origins.options[0], { value: 'atlas', label: 'Kitap Atlası' });
  assert.equal(added.choices.title, 'Kitaplığa eklendiği gün');
  assert.equal(added.hint, 'Tarihler, kitabın kitaplık verisine ilk girdiği kayıttan çıkarıldı.');
});

test('sub-collections narrow to the chosen collections and say whose they are', () => {
  assert.deepEqual(screen().content.collections.groups.options.map(option => option.label), ['TIME · Romanlar', 'FT · Ödüller']);
  assert.deepEqual(screen({ collections: ['ft'] }).content.collections.groups.options, [{ value: 'g2', label: 'FT · Ödüller' }]);
});

test('added days come newest first with how many books arrived that day', () => {
  assert.deepEqual(screen().content.added.choices.options, [{ value: '2026-11-01', label: '1 Kasım 2026 · 2 kitap' }, { value: '2026-10-04', label: '4 Ekim 2026 · 1 kitap' }]);
});

const options = n => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Yazar ${i}` }));
const choices = (extra = {}) => choicesScreen({ title: 'Yazar', options: options(3), value: [], query: '', limit: CHOICE_STEP, searchable: false, ...extra });

test('a list counts its options until something is chosen, then counts what is chosen', () => {
  assert.equal(choices().count, '3 seçenek');
  assert.equal(choices({ value: ['v1'] }).count, '1 seçili');
  assert.equal(choices().title, 'Yazar');
});

test('only a searchable list has a search field', () => {
  assert.equal(choices().search, null);
  assert.deepEqual(choices({ searchable: true }).search, { label: 'Yazar ara', placeholder: 'Yazar ara' });
});

test('a search matches without regard to Turkish letters or case', () => {
  const model = choicesScreen({ title: 'Yazar', options: [{ value: 'a', label: 'Işık' }, { value: 'b', label: 'Orhan' }], value: [], query: 'isik', limit: CHOICE_STEP, searchable: true });
  assert.deepEqual(model.visible.map(option => option.value), ['a']);
});

test('a choice hidden by the search or the limit stays removable, under its own hint', () => {
  assert.equal(choices().retained, null);
  const model = choices({ value: ['v2'], query: 'Yazar 0', searchable: true });
  assert.deepEqual(model.retained, { hint: 'Diğer seçimlerin', options: [{ value: 'v2', label: 'Yazar 2' }] });
  assert.equal(choices({ options: options(20), value: ['v15'], searchable: true }).retained.options[0].value, 'v15');
});

test('a search that finds nothing says so', () => {
  assert.equal(choices().noMatch, null);
  assert.equal(choices({ query: 'yok' }).noMatch, 'Eşleşme yok. Aramayı kısaltmayı dene.');
});

test('only a long searchable list offers more, and then less', () => {
  assert.equal(choices({ options: options(12), searchable: true }).more, null);
  assert.equal(choices({ options: options(20) }).more, null);
  assert.deepEqual(choices({ options: options(20), searchable: true }).more, { text: '8 seçenek daha göster', limit: 24 });
  assert.deepEqual(choices({ options: options(20), searchable: true, limit: 24 }).more, { text: 'Daha az göster', limit: CHOICE_STEP });
  assert.equal(choices({ options: options(20), searchable: true }).visible.length, 12);
  assert.equal(choices({ options: options(20) }).visible.length, 20);
});
