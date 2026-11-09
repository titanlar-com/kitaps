import test from 'node:test';
import assert from 'node:assert/strict';
import { longDay } from '../src/dates.js';
import { bookstoresScreen, longNoteWords, sourcesLine } from '../src/screens/bookstores.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const full = { id: 'minoa', name: 'Minoa', side: 'europe', district: 'Beyoğlu', area: 'Tepebaşı', address: 'Meşrutiyet Cad. 1', phone: '0212 555 11 22', hours: '10.00–20.00', transit: 'Metro', size: 'Büyük', status: 'open', about: 'Geniş raflar.', caution: 'Pazar kapalı.', web: 'https://minoa.test/', lookFor: ['Birinci', 'İkinci'], sources: [{ url: 'https://a.test/', label: 'A' }, { url: 'https://b.test/', label: 'B' }] };
const bare = { id: 'kadikoy', name: 'Kadıköy Sahaf', side: 'asia', district: 'Kadıköy', area: 'Kadıköy', address: 'Moda', status: 'unverified', about: 'Küçük.' };
const closed = { id: 'eski', name: 'Eski', side: 'europe', district: 'Fatih', area: 'Fatih', address: 'Vefa', phone: '0212 000 00 00', web: 'https://eski.test/', status: 'closed', about: 'Kapandı.' };
const data = {
 intro: 'Giriş',
 updated: '2026-10-07',
 checkedAt: '2026-10-05',
 stores: [full, bare, closed],
 plan: [
  { id: 'a', title: 'Tarihli', date: '2026-11-07', note: 'N1', stops: ['minoa'] },
  { id: 'b', title: 'Tarihsiz', note: 'N2', stops: ['minoa', 'kadikoy'] },
  { id: 'c', title: 'Önerilen', suggested: true, note: 'N3', stops: ['kadikoy'] },
 ],
 routes: [{ id: 'bir', title: 'Tek rota', either: true, stops: ['minoa', 'kadikoy'], why: 'Y1' }, { id: 'iki', title: 'Yürüyüş', stops: ['kadikoy', 'minoa'], why: 'Y2' }],
 topics: [{ topic: 'Felsefe', stores: ['minoa', 'kadikoy', 'eski'], why: 'Çok' }, { topic: 'Tarih', stores: ['minoa', 'kadikoy'], why: 'Az' }, { topic: 'Şiir', stores: ['minoa'], why: 'Tek' }],
 notes: ['Not bir'],
};
const screen = (extra = {}) => bookstoresScreen({ data: { ...data, ...extra }, longDay });

test('the page opens with its title, the notes it was written from and their dates', () => {
 const { intro } = screen();
 assert.equal(intro.title, 'Kitapçılar');
 assert.equal(intro.body, 'Giriş');
 assert.equal(intro.updated, 'Son güncelleme 7 Ekim 2026. Bilgiler 5 Ekim 2026 tarihli notlardan alındı.');
});

test('every section of the page names itself', () => {
 const model = screen();
 assert.deepEqual([model.plan.title, model.topics.title, model.routes.title, model.closed.title, model.notes.title], ['Gezi planı', 'Konuya göre nereye gidilir?', 'Önerilen rotalar', 'Kapanan kitapçılar', 'Gitmeden önce']);
 assert.equal(model.plan.body, 'Geziler sırayla. Tarihi belli olmayanlar sıradaki günlere kalıyor, sonuncusu benim önerim.');
 assert.equal(model.closed.body, 'Bu mağazalar notlarda geçiyor, ama artık açık değil.');
 assert.deepEqual(model.notes.items, ['Not bir']);
});

test('a visit is badged with its day, its number in the order, or as the suggestion', () => {
 const [dated, undated, suggested] = screen().plan.visits;
 assert.deepEqual(dated.badge, { label: '7 Kasım 2026', tone: 'accent' });
 assert.deepEqual(undated.badge, { label: '2. gezi', tone: 'accent' });
 assert.deepEqual(suggested.badge, { label: 'Öneri', tone: 'neutral' });
 assert.equal(suggested.suggested, true);
 assert.deepEqual(undated.stops.map(stop => [stop.id, stop.position]), [['minoa', 1], ['kadikoy', 2]]);
 assert.deepEqual(dated.stops[0].map, { href: 'https://www.google.com/maps/search/?api=1&query=Minoa%2C%20Me%C5%9Frutiyet%20Cad.%201', text: 'Haritada aç' });
});

test('the topic table names its columns, and joins its stores the way a sentence would', () => {
 const { topics } = screen();
 assert.equal(topics.tableLabel, 'Konu tablosu');
 assert.deepEqual(topics.columns, ['Konu', 'Nereye gidilir', 'Neden']);
 assert.deepEqual(topics.rows[0].stores, [{ id: 'minoa', before: null }, { id: 'kadikoy', before: ', ' }, { id: 'eski', before: ' ve ' }]);
 assert.deepEqual(topics.rows[1].stores, [{ id: 'minoa', before: null }, { id: 'kadikoy', before: ' ve ' }]);
 assert.deepEqual(topics.rows[2].stores, [{ id: 'minoa', before: null }]);
 assert.equal(topics.rows[0].topic, 'Felsefe');
 assert.equal(topics.rows[0].why, 'Çok');
});

test('the sides of the city are shelved in order, and a side with no open store is left out', () => {
 assert.deepEqual(screen().sides.map(side => [side.side, side.label, side.cards.map(card => card.id)]), [['europe', 'Avrupa yakası', ['minoa']], ['asia', 'Anadolu yakası', ['kadikoy']]]);
 assert.deepEqual(screen({ stores: [full, closed], plan: [] }).sides.map(side => side.side), ['europe']);
 assert.deepEqual(screen({ stores: [{ ...full, side: 'both' }], plan: [] }).sides.map(side => side.label), ['İki yakada']);
 assert.deepEqual(screen().closed.cards.map(card => card.id), ['eski']);
});

test('a store card says what it knows and leaves out what it does not', () => {
 const known = screen().sides[0].cards[0];
 assert.deepEqual(known.facts, [{ label: 'Adres', value: 'Meşrutiyet Cad. 1' }, { label: 'Telefon', value: '0212 555 11 22', href: 'tel:+902125551122' }, { label: 'Saat', value: '10.00–20.00' }, { label: 'Ulaşım', value: 'Metro' }, { label: 'Büyüklük', value: 'Büyük' }]);
 assert.equal(known.place, 'Tepebaşı, Beyoğlu');
 assert.deepEqual(known.badge, { label: 'Açık', tone: 'ok', icon: 'open' });
 assert.deepEqual(known.caution, { label: 'Dikkat:', text: 'Pazar kapalı.' });
 assert.deepEqual(known.lookFor, { label: 'Rafta aranabilecek kitaplar', titles: ['Birinci', 'İkinci'] });
 const unknown = screen().sides[1].cards[0];
 assert.deepEqual(unknown.facts, [{ label: 'Adres', value: 'Moda' }]);
 assert.equal(unknown.place, 'Kadıköy');
 assert.deepEqual(unknown.badge, { label: 'Doğrulanmadı', tone: 'accent', icon: 'unverified' });
 assert.deepEqual([unknown.caution, unknown.lookFor, unknown.sources], [null, null, null]);
});

test('a store offers the map, a call and its site, and a closed store offers none of them', () => {
 const known = screen().sides[0].cards[0];
 assert.deepEqual(known.actions, {
  map: { href: 'https://www.google.com/maps/search/?api=1&query=Minoa%2C%20Me%C5%9Frutiyet%20Cad.%201', text: 'Haritada aç' },
  call: { href: 'tel:+902125551122', text: 'Ara' },
  web: { href: 'https://minoa.test/', text: 'Web sitesi' },
 });
 const unknown = screen().sides[1].cards[0];
 assert.deepEqual([unknown.actions.call, unknown.actions.web], [null, null]);
 assert.equal(unknown.actions.map.text, 'Haritada aç');
 assert.equal(screen().closed.cards[0].actions, null);
});

test('the source line joins its links with commas, and a place with no source has none', () => {
 assert.deepEqual(sourcesLine(full.sources), { label: 'Kaynak: ', links: [{ url: 'https://a.test/', label: 'A', before: null }, { url: 'https://b.test/', label: 'B', before: ', ' }] });
 assert.equal(sourcesLine([]), null);
 assert.equal(sourcesLine(undefined), null);
});

test('a link that leaves the page says so to a screen reader', () => {
 assert.equal(screen().newTab, ' (yeni sekmede açılır)');
});

test('a route is either a choice of stores or a walk in order', () => {
 const [choice, walk] = screen().routes.cards;
 assert.deepEqual(choice.either, { text: 'Şu kitapçılardan birine git.', stops: ['minoa', 'kadikoy'] });
 assert.equal(choice.timeline, null);
 assert.equal(walk.either, null);
 assert.deepEqual(walk.timeline.map(stop => stop.id), ['kadikoy', 'minoa']);
 assert.deepEqual([choice.title, choice.why], ['Tek rota', 'Y1']);
});

test('a folded note names what its control opens and closes', () => {
 assert.deepEqual(longNoteWords('Minoa'), { show: 'Devamını oku', hide: 'Daralt', showLabel: 'Minoa: devamını oku', hideLabel: 'Minoa: daralt' });
});
