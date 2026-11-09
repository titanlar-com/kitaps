import test from 'node:test';
import assert from 'node:assert/strict';
import { RELATED_STEP, bookDetailScreen, bookDiscoveryScreen, bookSheetScreen, editionGuideScreen, editionSummaryScreen, queueButtonScreen, readingJourneyScreen, readingPanelScreen, readingPurposeScreen, relatedCardScreen, stateMarksScreen, translationCriteriaScreen, translationStatusScreen } from '../src/screens/book.js';
import { formatDay } from '../src/library.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const book = (extra = {}) => ({ id: 'b1', title: 'Dune', author: 'Frank Herbert', years: [1965, 1984], categories: [], collectionIds: [], memberships: [], notes: [], tags: [], editions: [], origins: [], ...extra });
const researched = { status: 'available', stage1: { sources: [{ url: 'https://kaynak.test/', type: 'publisher' }] }, edition: { title: 'Çöl', publisher: 'İthaki', isbn: '111', translators: ['Ayşe', 'Ali'] } };
const verified = (extra = {}) => ({ title: 'Çöl', publisher: 'İthaki', isbn: '111', translators: ['Ayşe'], sourceUrl: 'https://yayinevi.test/', sourceType: 'publisher', ...extra });
const fact = (model, label) => model.facts.find(item => item.label === label)?.value;

test('the book sheet names itself and tells a phone reader how to close it', () => {
  assert.deepEqual(bookSheetScreen(), { title: 'Kitap ayrıntısı', grip: 'Kitap ayrıntısını kapat. Aşağı da sürükleyebilirsin.' });
});

const detail = (bookExtra = {}, marks = []) => bookDetailScreen({
  book: book(bookExtra),
  marks,
  catalog: { sourceTags: { a: 'Klasik', b: 'Bilim' } },
  collections: { time: { title: 'TIME 100' } },
  groups: { g1: { title: 'Romanlar' }, g2: { title: 'Ödüller' } },
  formatDay,
});

test('the book page names its fixed parts', () => {
  const model = detail({ collectionIds: ['time'], memberships: [{ collectionId: 'time', groupId: 'g1' }] });
  assert.equal(model.back, 'Önceki kitaba dön');
  assert.deepEqual(model.sections, { personal: 'Okuma kaydım ve kişisel notlarım', sources: 'Kaynaklar ve küme üyelikleri · 1' });
  assert.deepEqual(model.note, { show: 'Devamını göster', hide: 'Kısalt' });
});

test('a book with no named author says so', () => {
  assert.equal(detail().author, 'Frank Herbert');
  assert.equal(detail({ author: '' }).author, 'Yazar bilgisi belirtilmemiş');
});

test('the original title is shown only under a known Turkish title that differs from it', () => {
  assert.equal(detail({ originalTitle: 'Dune' }).originalTitle, '');
  const translated = detail({ originalTitle: 'Dune', titleTr: 'Çöl', translationResearch: researched });
  assert.equal(translated.title, 'Çöl');
  assert.equal(translated.originalTitle, 'Dune');
  assert.equal(detail({ originalTitle: 'Çöl', titleTr: 'Çöl', translationResearch: researched }).originalTitle, '');
});

test('the facts list holds only what is known', () => {
  assert.deepEqual(detail().facts, [{ label: 'İlk yayın', value: '1965, 1984' }]);
  assert.deepEqual(detail({ years: [], childAge: '8+', addedAt: '2026-10-04' }).facts, [{ label: 'Önerilen yaş', value: '8+' }, { label: 'Kitaplığa eklendi', value: '4 Ekim 2026' }]);
});

test('the cover caption says whose cover it is, and is absent without a cover', () => {
  assert.equal(detail().coverCaption, null);
  assert.deepEqual(detail({ cover: { language: 'tr', sourceUrl: 'https://k.test/' } }).coverCaption, { text: 'Türkçe baskı kapağı', link: { href: 'https://k.test/', text: 'Kapaktaki baskıyı incele' } });
  assert.equal(detail({ cover: { language: 'en', sourceUrl: 'https://k.test/' } }).coverCaption.text, 'Uluslararası baskı kapağı');
  assert.equal(detail({ cover: { language: 'tr', scope: 'İlk baskı', sourceUrl: 'https://k.test/' } }).coverCaption.text, 'İlk baskı');
});

test('the three marks of the page are offered in their order, pressed when set', () => {
  assert.deepEqual(detail({}, ['alindi']).marks, [{ key: 'onemli', label: 'Favori', pressed: false }, { key: 'alinacak', label: 'Alınacak', pressed: false }, { key: 'alindi', label: 'Satın alındı', pressed: true }]);
});

test('a parent note appears only when the book has one', () => {
  assert.equal(detail().childCaution, null);
  assert.deepEqual(detail({ childCaution: 'Dikkat' }).childCaution, { title: 'Ebeveyn notu', text: 'Dikkat' });
});

test('a membership names its collection, sub-collections, awards, roles and source', () => {
  const [model] = detail({ collectionIds: ['time'], memberships: [
    { collectionId: 'time', groupId: 'g1', award: 'Kazanan', awardYear: 2020, role: 'Roman', source: 'https://s.test/' },
    { collectionId: 'time', groupId: 'g1', role: 'Roman' },
    { collectionId: 'time', groupId: 'g2', role: 'Ödül' },
    { collectionId: 'other', groupId: 'g2' },
  ] }).memberships;
  assert.equal(model.id, 'time');
  assert.equal(model.title, 'TIME 100');
  assert.equal(model.groups, 'Romanlar · Ödüller');
  assert.deepEqual(model.awards, [{ key: 'g1', text: '2020 · Kazanan' }]);
  assert.deepEqual(model.roles, ['Roman', 'Ödül']);
  assert.deepEqual(model.source, { href: 'https://s.test/', text: 'Özgün kaynağı aç' });
  const [bare] = detail({ collectionIds: ['time'], memberships: [{ collectionId: 'time', groupId: 'g1' }] }).memberships;
  assert.deepEqual([bare.awards, bare.roles, bare.source], [[], [], null]);
});

test('the source file\'s tags are listed only when there are some', () => {
  assert.equal(detail().tags, null);
  assert.equal(detail({ tags: ['a', 'b'] }).tags, 'Kaynak dosyanın etiketleri: Klasik · Bilim.');
});

test('the marks drawn on a cover are said for a screen reader too', () => {
  assert.deepEqual(stateMarksScreen([]), { ribbons: [], summary: null });
  assert.deepEqual(stateMarksScreen(['onemli']), { ribbons: [], summary: null });
  assert.deepEqual(stateMarksScreen(['alindi', 'okundu']), { ribbons: [{ state: 'okundu', label: 'Okundu' }, { state: 'alindi', label: 'Satın alındı' }], summary: 'Durum: Okundu, Satın alındı.' });
});

test('a related card shows its title and only the marks it has', () => {
  assert.deepEqual(relatedCardScreen({ book: book(), marks: [] }), { title: 'Dune', read: false, badges: [] });
  assert.deepEqual(relatedCardScreen({ book: book(), marks: ['alindi', 'okundu'] }), { title: 'Dune', read: true, badges: ['Kitaplığında', 'Okundu'] });
  assert.deepEqual(relatedCardScreen({ book: book(), marks: ['okundu'] }).badges, ['Okundu']);
});

const guide = (extra = {}) => ({ purpose: 'Amaç', kind: 'Kitaba özel okuma amacı', before: [], after: [], companions: [], route: { category: 'tarih' }, sources: [], ...extra });

test('the reading purpose keeps its words and says how the purpose was found', () => {
  const model = readingPurposeScreen({ book: book(), guide: guide({ sources: [{ url: 'https://s.test/', label: 'Kaynak' }] }) });
  assert.deepEqual([model.eyebrow, model.title, model.purpose], ['OKUMA AMACI', 'Ne için okumalıyım?', 'Amaç']);
  assert.equal(model.kind, 'Kitaba özel okuma amacı · Editoryal öneri');
  assert.deepEqual(model.sources, [{ url: 'https://s.test/', label: 'Kaynak' }]);
  assert.equal(readingPurposeScreen({ book: book(), guide: guide({ kind: 'Konuya göre okuma amacı' }) }).kind, 'Konuya göre okuma amacı · Kitabın konu etiketlerinden önerilmiştir; ayrıntılı içerik incelemesi değildir.');
});

test('a Turkish meaning is given only when the book has one', () => {
  assert.equal(readingPurposeScreen({ book: book(), guide: guide() }).meaning, null);
  assert.deepEqual(readingPurposeScreen({ book: book({ titleTr: 'Çöl' }), guide: guide() }).meaning, { label: 'Türkçe anlamı:', text: 'Çöl' });
});

const discoveryCatalog = { categories: [{ id: 'tarih', label: 'Tarih' }], collections: [{ id: 'time', title: 'TIME 100' }], readingGuides: { routes: [{ category: 'tarih', heading: 'Tarihi sevdiysen' }] } };
const discovery = (extra = {}) => bookDiscoveryScreen({ book: book({ categories: ['tarih'], collectionIds: ['time'] }), catalog: discoveryCatalog, guide: guide(), matches: [], scope: 'category|tarih', visible: RELATED_STEP, ...extra });

test('the reading route keeps its words, and says when there is nothing before or after', () => {
  const model = discovery();
  assert.deepEqual(model.route, { title: 'Okuma rotan', intro: 'Bu sıralama hazırlık ve derinleşme önerisidir. Kitapları anlamak için zorunlu bir önkoşul değildir.' });
  assert.deepEqual(model.phases, [
    { value: 'before', title: 'Önce ne okumalıyım? · 0', links: [], empty: 'Doğrudan bu kitapla başlayabilirsin. Bu rota için bir ön okuma önermiyoruz.' },
    { value: 'after', title: 'Sonra nasıl derinleşirim? · 0', links: [], empty: 'Bu rota için belirli bir devam kitabı seçilmedi. Aşağıdaki konu kitaplarından farklı bir bakış açısı seçebilirsin.' },
  ]);
});

test('companions get a part of the route only when there are some', () => {
  const link = { id: 'x', reason: 'Neden' };
  const { phases } = discovery({ guide: guide({ before: [link], after: [link, link], companions: [link] }) });
  assert.deepEqual(phases.map(phase => [phase.value, phase.title, phase.links.length]), [['before', 'Önce ne okumalıyım? · 1', 1], ['after', 'Sonra nasıl derinleşirim? · 2', 2], ['companions', 'Birlikte veya karşılaştırmalı oku · 1', 1]]);
});

test('the suggestions are headed by the route or the collection they come from', () => {
  assert.equal(discovery().heading, 'Tarihi sevdiysen bunları da oku');
  assert.equal(discovery({ scope: 'collection|time' }).heading, 'Bu kümedeki diğer kitaplar');
  assert.equal(discovery().headingNote, 'Ortak konu ve küme üyeliklerine göre seçildi. Kitaplığındaki eserler de burada görünür.');
});

test('the scope list offers the book\'s subjects and collections', () => {
  assert.deepEqual(discovery().scope, { label: 'Önerilerin konusu veya kümesi', options: [{ group: 'Konular', items: [{ value: 'category|tarih', label: 'Tarih' }] }, { group: 'Kaynak kümeleri', items: [{ value: 'collection|time', label: 'TIME 100' }] }] });
});

test('the status counts the suggestions, and the list opens four at a time', () => {
  const none = discovery();
  assert.equal(none.status, '0 başka kitap');
  assert.equal(none.empty, 'Bu seçimde keşfedilecek başka kitap kalmadı.');
  assert.equal(none.more, null);
  assert.equal(none.openAll, 'Bu listeyi katalogda aç');
  const matches = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => book({ id }));
  const some = discovery({ matches });
  assert.equal(some.status, '6 başka kitap · İlk 4 kitap');
  assert.equal(some.empty, null);
  assert.deepEqual(some.shown.map(item => item.id), ['a', 'b', 'c', 'd']);
  assert.equal(some.more, '4 kitap daha göster');
  const all = discovery({ matches, visible: 8 });
  assert.equal(all.status, '6 başka kitap · İlk 6 kitap');
  assert.equal(all.shown.length, 6);
  assert.equal(all.more, null);
});

const publication = (extra = {}, bookExtra = {}) => editionSummaryScreen({ book: book({ format: 'article', publication: { venue: 'Policy Sciences', volume: 4, issue: 2, pages: '155–169', ...extra }, ...bookExtra }), pages: null });

test('an article says where it appeared and why it has no edition', () => {
  const model = publication({ doi: '10.1/x' });
  assert.equal(model.kind, 'publication');
  assert.deepEqual([model.label, model.title], ['Yayın bilgisi ve metin', 'Yayın bilgisi']);
  assert.deepEqual(model.facts, [{ label: 'Tür', value: 'Makale' }, { label: 'Yayımlandığı yer', value: 'Policy Sciences · 4 (2) · s. 155–169' }, { label: 'DOI', value: '10.1/x' }]);
  assert.equal(model.note, 'Makale olduğu için baskı ve çevirmen bilgisi yok. Türkçe çevirisi araştırılmadı.');
  assert.equal(publication().facts.length, 2);
});

test('a publication links to its text and DOI, and to the outlet\'s page only without either', () => {
  assert.deepEqual(publication({ readUrl: 'https://r.test/', doi: '10.1/x', pageUrl: 'https://p.test/' }).links, [{ href: 'https://r.test/', text: 'Metni oku' }, { href: 'https://doi.org/10.1/x', text: 'DOI kaydını aç' }]);
  assert.deepEqual(publication({ pageUrl: 'https://p.test/' }).links, [{ href: 'https://p.test/', text: 'Yayın sayfasını aç' }]);
  assert.deepEqual(publication().links, []);
});

test('only an article is searched for on Google Scholar', () => {
  assert.deepEqual(publication({}, { originalTitle: 'On Policy' }).scholar, { text: 'Google Akademik', query: '"On Policy" Frank Herbert' });
  assert.deepEqual(publication().scholar.query, '"Dune" Frank Herbert');
  assert.equal(publication({}, { format: 'essay' }).scholar, null);
  assert.equal(publication({}, { format: 'essay' }).facts[0].value, 'Deneme');
});

const summary = (bookExtra = {}, pages = null) => editionSummaryScreen({ book: book(bookExtra), pages });

test('an unknown edition says what is not yet verified', () => {
  const model = summary();
  assert.equal(model.kind, 'edition');
  assert.deepEqual([model.label, model.title, model.issue], ['Yayınevi, çevirmen ve kitabı bul', 'Baskı ve çevirmen', null]);
  assert.deepEqual(model.facts, [{ label: 'Yayınevi', value: 'Henüz doğrulanmadı' }, { label: 'Çevirmen', value: 'Henüz doğrulanmadı' }, { label: 'Sayfa sayısı', value: 'Henüz doğrulanmadı' }]);
  assert.deepEqual([model.evidence, model.pageSource, model.translatorNote, model.sourceLink], [null, null, null, null]);
  assert.equal(model.statusNote, 'Türkçe baskı doğrulanamadı.');
});

test('a warning about choosing an edition is shown when the source gives one', () => {
  assert.deepEqual(summary({ sourceIssue: { note: 'Eski baskı' } }).issue, { title: 'Baskı seçerken dikkat', text: 'Eski baskı' });
});

test('a known edition gives its record and where it was checked', () => {
  const model = summary({ translationResearch: researched });
  assert.equal(fact(model, 'Yayınevi'), 'İthaki');
  assert.equal(fact(model, 'Çevirmen'), 'Ayşe · Ali');
  assert.equal(fact(model, 'ISBN'), '111');
  assert.equal(model.evidence, 'Türkçe baskı iki bağımsız araştırma aşamasında doğrulandı.');
  assert.equal(model.statusNote, null);
  assert.deepEqual(model.sourceLink, { href: 'https://kaynak.test/', text: 'Künye kaynağını aç' });
});

test('the evidence sentence follows how the edition was verified', () => {
  const evidence = extra => summary({ verifiedEdition: verified(extra) }).evidence;
  assert.equal(evidence({}), 'Yayınevi künyesinden kontrol edildi.');
  assert.equal(evidence({ sourceType: 'publisher-preview' }), 'Yayınevi önizlemesinden kontrol edildi.');
  assert.equal(evidence({ sourceType: 'bibliographic' }), 'Kütüphane künyesinden kontrol edildi.');
  assert.equal(evidence({ sourceType: 'retailer' }), 'Kitapçı künyesinden kontrol edildi; yayıneviyle ikinci kontrol bekliyor.');
  assert.equal(evidence({ sourceType: 'anything' }), 'Kitapçı künyesinden kontrol edildi; yayıneviyle ikinci kontrol bekliyor.');
  assert.equal(evidence({ secondSourceUrl: 'https://2.test/' }), 'ISBN, yayınevi ve çevirmen iki ayrı sitenin künyesiyle kontrol edildi.');
  const cover = summary({ cover: { language: 'tr', title: 'Çöl', publisher: 'İthaki', isbn: '111', sourceUrl: 'https://k.test/' } });
  assert.equal(cover.evidence, 'Türkçe baskının kapak künyesinden alındı.');
  const note = summary({ editions: [{ translator: 'Ayşe', publisher: 'İthaki (2008)', status: ['ok'], turkish: 'Çöl' }] });
  assert.equal(note.evidence, 'Kaynak listesindeki doğrulanmış çeviri notundan alındı.');
  assert.equal(fact(note, 'Yayınevi'), 'İthaki');
});

test('the evidence warns when the cover belongs to another printing', () => {
  assert.equal(summary({ verifiedEdition: verified(), cover: { isbn: '222', language: 'en' } }).evidence, 'Yayınevi künyesinden kontrol edildi. Kapak farklı bir baskıya ait.');
  assert.equal(summary({ verifiedEdition: verified(), cover: { isbn: '111', language: 'en' } }).evidence, 'Yayınevi künyesinden kontrol edildi.');
});

test('a work written in Turkish has no translator line and its own title', () => {
  const model = summary({ verifiedEdition: verified({ originalLanguage: 'tr', translators: [] }) });
  assert.equal(model.title, 'Baskı bilgisi');
  assert.equal(fact(model, 'Çevirmen'), undefined);
});

test('a translator from the source list is credited as such, with its publisher when it differs', () => {
  const source = [{ translator: 'Ayşe', publisher: 'Can', status: ['ok'], turkish: 'Çöl' }];
  const cover = { language: 'tr', title: 'Çöl', publisher: 'İthaki', isbn: '111', sourceUrl: 'https://k.test/' };
  const other = summary({ cover, editions: source });
  assert.equal(fact(other, 'Çevirmen'), 'Ayşe (Can)');
  assert.equal(other.translatorNote, 'Çevirmen, kaynak listesinin güven puanıyla önerdiği çeviriden alındı.');
  assert.equal(fact(summary({ cover: { ...cover, publisher: 'Can' }, editions: source }), 'Çevirmen'), 'Ayşe');
  assert.equal(summary({ verifiedEdition: verified() }).translatorNote, null);
});

test('the page count is credited to its record, and is unknown until it has one', () => {
  const model = summary({}, { pages: 320, sourceName: 'Google Books', sourceUrl: 'https://g.test/' });
  assert.equal(fact(model, 'Sayfa sayısı'), 320);
  assert.deepEqual(model.pageSource, { before: 'Sayfa sayısı bu ISBN’in', link: { href: 'https://g.test/', text: 'Google Books' }, after: 'kaydından.' });
});

test('a missing translation says so, and adds the cover sentence only with a cover', () => {
  const unavailable = { status: 'unavailable', scopeNote: 'Yok', stage1: { sources: [{ url: 'https://k.test/' }] } };
  assert.equal(summary({ translationResearch: unavailable }).statusNote, 'Kaynaklara göre Türkçe baskısı yok.');
  assert.equal(summary({ translationResearch: unavailable, cover: { language: 'en' } }).statusNote, 'Kaynaklara göre Türkçe baskısı yok. Gösterilen kapak uluslararası baskıya aittir.');
  assert.equal(summary({ cover: { language: 'en' } }).statusNote, 'Türkçe baskı doğrulanamadı. Gösterilen kapak uluslararası baskıya aittir.');
});

test('the shopping links search for the edition, and Amazon appears only when no Turkish edition is known', () => {
  const unknown = summary({ originalTitle: 'Dune Messiah' });
  assert.deepEqual(unknown.shopping, { query: 'Dune Frank Herbert', google: 'Google Alışveriş', images: 'Google Görseller' });
  assert.deepEqual(unknown.amazon, { text: 'Özgün baskı · Amazon', query: 'Dune Messiah Frank Herbert' });
  const known = summary({ translationResearch: researched });
  assert.equal(known.shopping.query, 'Çöl Frank Herbert İthaki 111');
  assert.equal(known.amazon, null);
});

const guideOf = (bookExtra = {}) => editionGuideScreen({ book: book(bookExtra), formatDay });

test('the edition guide is left out for a Turkish original and for an article', () => {
  assert.equal(guideOf({ verifiedEdition: verified({ originalLanguage: 'tr' }) }), null);
  assert.equal(guideOf({ format: 'article' }), null);
});

test('without a checked edition the guide says what to do', () => {
  const model = guideOf();
  assert.deepEqual([model.label, model.title, model.sourcesTitle], ['Çeviri ve baskı seçimi', 'Hangi çeviriyi okumalıyım?', 'Baskının kaynakları ve kontrol notları']);
  assert.equal(model.edition, null);
  assert.deepEqual(model.missing, { badge: 'Çevirmen henüz doğrulanmadı', body: 'Bu eser için Türkçe baskı, ISBN ve çevirmen eşleştirmesi tamamlanmadı. Çeviri bir baskı seçeceksen yayınevinin künyesini ve örnek sayfalarını kontrol et.', coverLink: null });
  assert.deepEqual(guideOf({ cover: { sourceUrl: 'https://k.test/' } }).missing.coverLink, { href: 'https://k.test/', text: 'Kapaktaki baskının sayfasını aç' });
  assert.equal(model.archive, null);
});

test('a checked edition says who checked it and where', () => {
  const edition = extra => guideOf({ verifiedEdition: verified(extra) }).edition;
  assert.deepEqual(edition({}).badge, { text: 'Yayınevi künyesi kontrol edildi', confirmed: true });
  assert.deepEqual(edition({ sourceType: 'publisher-preview' }).badge, { text: 'Yayınevi künyesi kontrol edildi', confirmed: true });
  assert.deepEqual(edition({ sourceType: 'bibliographic' }).badge, { text: 'Kütüphane künyesi kontrol edildi', confirmed: false });
  assert.deepEqual(edition({ sourceType: 'retailer', secondSourceUrl: 'https://2.test/' }).badge, { text: 'İki sitenin künyesiyle kontrol edildi', confirmed: true });
  assert.deepEqual(edition({ sourceType: 'retailer' }).badge, { text: 'Kitapçı künyesi · ikinci kontrol bekliyor', confirmed: false });
  assert.equal(edition({}).links[0].text, 'Yayınevi kaynağını incele');
  assert.equal(edition({ sourceType: 'bibliographic' }).links[0].text, 'Kütüphane kaynağını incele');
  assert.equal(edition({ sourceType: 'retailer' }).links[0].text, 'Kitapçı kaynağını incele');
});

test('a checked edition lists what it knows and leaves out what it does not', () => {
  const bare = guideOf({ verifiedEdition: verified({ translators: [], isbn: '' }) }).edition;
  assert.equal(bare.translators, 'Çevirmen henüz doğrulanmadı');
  assert.deepEqual([bare.isbn, bare.lines, bare.correction, bare.note], [null, [], null, null]);
  assert.deepEqual(bare.links, [{ href: 'https://yayinevi.test/', text: 'Yayınevi kaynağını incele' }]);
  const full = guideOf({ verifiedEdition: verified({ translators: ['Ayşe', 'Ali'], translationEditors: ['Can'], editors: ['Efe'], sourceLanguage: 'İngilizce', correction: 'Düzeltme', note: 'Not', secondSourceUrl: 'https://2.test/', previewUrl: 'https://o.test/', checkedAt: '2026-10-04' }) }).edition;
  assert.equal(full.translators, 'Ayşe · Ali');
  assert.equal(full.work, 'Çöl · İthaki');
  assert.equal(full.isbn, 'ISBN 111');
  assert.deepEqual(full.lines, ['Çeviri editörleri: Can', 'Editör: Efe', 'Çeviri dili: İngilizce']);
  assert.deepEqual(full.correction, { title: 'Künye düzeltildi', text: 'Düzeltme' });
  assert.equal(full.note, 'Not');
  assert.deepEqual(full.links.slice(1), [{ href: 'https://2.test/', text: 'İkinci kaynağı incele' }, { href: 'https://o.test/', text: 'Örnek metni aç' }]);
  assert.equal(full.checked, 'Kontrol: 4 Ekim 2026. Künye kontrolü çevirinin edebî veya teknik kalitesini tek başına kanıtlamaz; karşılaştırmalı metin incelemesi yapılmadı.');
});

test('an edition checked on an unrecorded day keeps the day of the first check', () => {
  assert.match(guideOf({ verifiedEdition: verified() }).edition.checked, /^Kontrol: 28 Eylül 2026\. /);
});

test('the guide says whether the cover shown belongs to this edition', () => {
  const cover = isbn => guideOf({ verifiedEdition: verified(), cover: { isbn } }).edition.cover;
  assert.equal(cover('111'), 'Gösterilen kapak bu ISBN’ye ait.');
  assert.equal(cover('222'), 'Gösterilen kapak farklı bir baskıya ait; bu künye o kapağın çevirmenini doğrulamaz.');
  assert.equal(guideOf({ verifiedEdition: verified() }).edition.cover, 'Bu baskının kapağı henüz eklenmedi.');
});

test('the archive of older notes appears only when there are some, and names what is missing', () => {
  const { archive } = guideOf({ editions: [{ translator: 'Ayşe', publisher: 'Can', note: 'Not', alt: { name: 'Ali', publisher: 'İthaki' } }, {}, { alt: { name: 'Efe' } }] });
  assert.equal(archive.title, 'Arşivdeki çeviri ve baskı notları · 3');
  assert.equal(archive.intro, 'Aşağıdakiler önceki Kitaps kaynağının notlarıdır. İsimler ve değerlendirmeler bu alanda bağımsız olarak doğrulanmış sayılmaz. Yukarıdaki ISBN’ye bağlı düzeltmeler önceliklidir.');
  assert.deepEqual(archive.items, [
    { translator: 'Ayşe', publisher: 'Can', note: 'Not', alt: 'Arşivdeki diğer seçenek: Ali · İthaki' },
    { translator: 'Çevirmen belirtilmemiş', publisher: 'Yayınevi belirtilmemiş', note: null, alt: null },
    { translator: 'Çevirmen belirtilmemiş', publisher: 'Yayınevi belirtilmemiş', note: null, alt: 'Arşivdeki diğer seçenek: Efe' },
  ]);
});

test('the queue button says where the book is, or what the reader can do', () => {
  const free = queueButtonScreen({ id: 'b', queue: ['a'], title: 'Dune' });
  assert.deepEqual([free.present, free.full, free.text, free.label, free.ariaLabel], [false, false, 'Sırama ekle', 'Sırama ekle', 'Dune: Sırama ekle']);
  const present = queueButtonScreen({ id: 'a', queue: ['b', 'a'], title: 'Dune' });
  assert.deepEqual([present.present, present.full, present.text, present.label, present.ariaLabel], [true, false, 'Sıramda · 2. kitap', 'Sıramda · 2. kitap. Sıramı aç', 'Dune: Sıramda · 2. kitap. Sıramı aç']);
  const full = queueButtonScreen({ id: 'z', queue: ['a', 'b', 'c', 'd', 'e'], title: 'Dune' });
  assert.deepEqual([full.present, full.full, full.text, full.label], [false, true, 'Sıramı düzenle · 5/5', 'Sıram dolu · 5 kitap. Sıramı düzenle']);
  assert.equal(queueButtonScreen({ id: 'a', queue: ['a', 'b', 'c', 'd', 'e'] }).text, 'Sıramda · 1. kitap');
});

test('the reading record keeps the words of its fields', () => {
  const model = readingPanelScreen({ record: undefined, marks: ['okundu'], storageError: null });
  assert.deepEqual([model.title, model.statusTitle], ['Benim okuma kaydım', 'Okuma durumu']);
  assert.deepEqual(model.marks, [{ key: 'okunuyor', label: 'Okunuyor', pressed: false }, { key: 'araverildi', label: 'Ara verdim', pressed: false }, { key: 'birakildi', label: 'Bıraktım', pressed: false }, { key: 'okundu', label: 'Okundu', pressed: true }]);
  assert.deepEqual([model.started.label, model.finished.label], ['Başlama tarihi', 'Bitiş tarihi']);
  assert.deepEqual([model.page.label, model.page.placeholder], ['Kaldığım sayfa', 'Henüz başlamadım']);
  assert.deepEqual([model.total.label, model.total.placeholder], ['Toplam sayfa', 'Baskına göre']);
  assert.deepEqual(model.why, { label: 'Neden okuyorum?', description: 'Bu kitaptan ne öğrenmek veya neyi anlamak istiyorum?', placeholder: 'Bu kitabı seçme nedenim…' });
  assert.deepEqual(model.apply, { label: 'Bundan neyi uygulayacağım?', description: 'Bitirince denemek istediğin somut bir adım.', placeholder: 'İlk uygulayacağım fikir…' });
  assert.deepEqual(model.record, { startedAt: '', finishedAt: '', page: '', totalPages: '', why: '', apply: '' });
});

test('the reading record says where it is saved, or that it cannot be', () => {
  assert.equal(readingPanelScreen({ marks: [], storageError: null }).notice, 'Bu kayıtlar tarayıcıya kaydedilir ve GitHub eşitlemesi bağlıysa herkese açık kitaps-state deposuna gönderilir.');
  assert.equal(readingPanelScreen({ marks: [], storageError: 'dolu' }).notice, 'Kayıt yapılamıyor. Notlar bölümünden yedek indir.');
});

test('the reading record shows progress only when the pages are valid', () => {
  assert.equal(readingPanelScreen({ marks: [], storageError: null }).progress, null);
  assert.deepEqual(readingPanelScreen({ record: { page: 50, totalPages: 200 }, marks: [], storageError: null }).progress, { pages: '50 / 200 sayfa', percent: '%25', value: 25, label: 'Okuma ilerlemesi' });
  const wrong = readingPanelScreen({ record: { page: 300, totalPages: 200 }, marks: [], storageError: null });
  assert.equal(wrong.progress, null);
  assert.equal(wrong.total.error, 'Kaldığın sayfa, toplam sayfadan büyük.');
  assert.equal(readingPanelScreen({ record: { startedAt: '2026-10-05', finishedAt: '2026-10-01' }, marks: [], storageError: null }).finished.error, 'Bitiş tarihi, başlama tarihinden önce olamaz.');
});

test('the reading journey is left out with nothing to show', () => {
  assert.equal(readingJourneyScreen({ record: undefined, formatDay }), null);
});

test('the reading journey gives how far the reading is and its days in order', () => {
  const model = readingJourneyScreen({ record: { page: 50, totalPages: 200, startedAt: '2026-10-04', finishedAt: '2026-11-01' }, formatDay });
  assert.equal(model.label, 'Okuma durumum');
  assert.deepEqual(model.progress, { pages: '50 / 200 sayfa', percent: '%25', value: 25, label: 'Okunan sayfa oranı' });
  assert.deepEqual(model.steps, [{ kind: 'started', label: 'Başladım', day: '4 Ekim 2026' }, { kind: 'finished', label: 'Bitirdim', day: '1 Kasım 2026' }]);
  const days = readingJourneyScreen({ record: { finishedAt: '2026-11-01' }, formatDay });
  assert.equal(days.progress, null);
  assert.equal(days.steps.length, 1);
  assert.deepEqual(readingJourneyScreen({ record: { page: 50, totalPages: 200 }, formatDay }).steps, []);
});

test('the translation mark is left out for a work written in Turkish', () => {
  assert.equal(translationStatusScreen({ book: book({ verifiedEdition: verified({ originalLanguage: 'tr' }) }) }), null);
});

test('the translation mark says what is known in three lengths', () => {
  const available = translationStatusScreen({ book: book({ translationResearch: researched, titleTr: 'Çöl' }) });
  assert.deepEqual([available.status, available.word, available.tooltip, available.label], ['available', 'Türkçe', 'Türkçe çevirisi var', 'Türkçe çeviri var']);
  assert.equal(available.ariaLabel, 'Çöl: Türkçe çeviri var. Baskı bilgisi');
  assert.equal(available.description, 'Türkçe baskı iki bağımsız araştırma aşamasında doğrulandı. Künye bilgilerini kitap ayrıntısında karşılaştır.');
  assert.deepEqual(available.sourceLink, { href: 'https://kaynak.test/', text: 'Baskı kaynağını aç' });
  const unavailable = translationStatusScreen({ book: book({ translationResearch: { status: 'unavailable', scopeNote: 'Yok', stage1: { sources: [{ url: 'https://k.test/' }] } } }) });
  assert.deepEqual([unavailable.status, unavailable.word, unavailable.tooltip, unavailable.label, unavailable.description], ['unavailable', 'Türkçesi yok', 'Türkçe çevirisi yok', 'Türkçe çeviri yok', 'Yok']);
  const unverified = translationStatusScreen({ book: book() });
  assert.deepEqual([unverified.status, unverified.word, unverified.tooltip, unverified.label, unverified.sourceLink], ['unverified', 'Doğrulanmadı', 'Çeviri durumu doğrulanmadı', 'Türkçe çeviri doğrulanamadı', null]);
});

test('an article\'s translation mark links to its text by the name the book page uses', () => {
  const link = publicationExtra => translationStatusScreen({ book: book({ format: 'article', publication: publicationExtra }) }).sourceLink;
  assert.deepEqual(link({ readUrl: 'https://r.test/' }), { href: 'https://r.test/', text: 'Metni oku' });
  assert.deepEqual(link({ doi: '10.1/x' }), { href: 'https://doi.org/10.1/x', text: 'DOI kaydını aç' });
});

test('the translation guide lists its five criteria and its basis', () => {
  const model = translationCriteriaScreen();
  assert.equal(model.intro, 'Bir çeviriyi değerlendirirken baskı künyesini, kaynak dili ve örnek metni birlikte incele.');
  assert.deepEqual(model.steps.map(step => step.title), ['Baskıyı eşleştir.', 'Kaynak dil ve tam metin.', 'Alan deneyimi.', 'Örnek sayfaları karşılaştır.', 'Editoryal destek.']);
  assert.equal(model.steps[0].body, 'Yayınevi, ISBN, çevirmen ve baskı yılını aynı künye sayfasından kontrol et. Aynı kitabın farklı kapakları farklı çeviriler olabilir.');
  assert.deepEqual(model.basis, { before: 'Ölçütlerin dayanağı:', link: { href: 'https://www.atanet.org/certification/how-the-exam-is-graded/error-categories/', text: 'ATA anlam, terim ve üslup değerlendirme ölçütleri' }, after: '. Bu liste bir çevirmenin yeterliğini tek başına ölçmez.' });
});
