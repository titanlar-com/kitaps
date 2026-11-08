import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planTimeline, routeDraftSteps, routeTimeline, storeBadge, storePlace } from '../src/core/places/stores.js';
import { fairBadge, fairCountdown, fairTimeline, fairsFrom, formatRange, groupByMonth, todayInIstanbul } from '../src/core/places/fairs.js';
import * as oldAddress from '../src/fairs.js';

// The queries behind the bookstores, routes and fairs screens (ADR 003, K14; docs/UI-REDESIGN.md,
// phase 6). A component shows what these return and works nothing out by itself.
const stores = [
 { id: 'minoa', name: 'Minoa Pera', district: 'Beyoğlu', area: 'Tepebaşı', address: 'Meşrutiyet Cad. No:99', status: 'open' },
 { id: 'homer', name: 'Homer Kitabevi', district: 'Beyoğlu', area: 'Beyoğlu', address: 'Yeni Çarşı Cad.', status: 'open' },
 { id: 'kabalci', name: 'Kabalcı', district: 'Beşiktaş', area: 'Akaretler', address: 'Bir sokak', status: 'closed' },
];
const byId = Object.fromEntries(stores.map(store => [store.id, store]));

test('a status badge names the store\'s state in words and takes a tone, never a colour', () => {
 assert.deepEqual(storeBadge('open'), { label: 'Açık', tone: 'ok', icon: 'open' });
 assert.deepEqual(storeBadge('closed'), { label: 'Kapandı', tone: 'muted', icon: 'closed' });
 assert.deepEqual(storeBadge('unverified'), { label: 'Doğrulanmadı', tone: 'accent', icon: 'unverified' });
 assert.equal(storeBadge('moved'), null, 'a state the page does not know shows no badge');
});

test('every store in the data has a status with a badge', () => {
 const data = JSON.parse(fs.readFileSync(new URL('../data/bookstores.json', import.meta.url), 'utf8'));
 for (const store of data.stores) assert.ok(storeBadge(store.status), store.id);
});

test('a store\'s place names the area only when it says more than the district', () => {
 assert.equal(storePlace(byId.minoa), 'Tepebaşı, Beyoğlu');
 assert.equal(storePlace(byId.homer), 'Beyoğlu');
});

test('a route timeline keeps the stops in the order they were walked and numbers them from one', () => {
 assert.deepEqual(routeTimeline(['homer', 'kabalci', 'minoa'], byId).map(stop => [stop.position, stop.id, stop.name]), [
  [1, 'homer', 'Homer Kitabevi'],
  [2, 'kabalci', 'Kabalcı'],
  [3, 'minoa', 'Minoa Pera'],
 ]);
 assert.equal(routeTimeline(['minoa'], byId)[0].place, 'Tepebaşı, Beyoğlu');
 assert.equal(routeTimeline(['minoa'], byId)[0].address, 'Meşrutiyet Cad. No:99');
});

test('a saved route that names a store no longer listed keeps that stop in its place', () => {
 assert.deepEqual(routeTimeline(['minoa', 'gone', 'homer'], byId).map(stop => [stop.position, stop.name]), [[1, 'Minoa Pera'], [2, 'gone'], [3, 'Homer Kitabevi']]);
 assert.deepEqual(routeTimeline([], byId), []);
});

test('the plan follows the owner\'s order, and each visit says when it is', () => {
 const plan = [
  { id: 'a', date: '2026-11-07', title: '7 Kasım', stops: ['minoa', 'homer'], note: 'Beyoğlu' },
  { id: 'b', title: 'Sonraki', stops: ['homer'], note: 'Sonra' },
  { id: 'c', title: 'Öneri', suggested: true, stops: ['kabalci'], note: 'Öneri' },
 ];
 const visits = planTimeline(plan, byId);
 assert.deepEqual(visits.map(visit => visit.id), ['a', 'b', 'c']);
 assert.deepEqual(visits[0].mark, { date: '2026-11-07', tone: 'accent' });
 assert.deepEqual(visits[1].mark, { label: '2. gezi', tone: 'accent' });
 assert.deepEqual(visits[2].mark, { label: 'Öneri', tone: 'neutral' });
 assert.deepEqual(visits[0].stops.map(stop => stop.name), ['Minoa Pera', 'Homer Kitabevi']);
});

test('the draft moves through three steps as it is filled in', () => {
 const states = draft => routeDraftSteps(draft).steps.map(step => step.state);
 assert.deepEqual(routeDraftSteps({ stops: [], title: '' }).steps.map(step => step.label), ['Seç', 'Sırala', 'Kaydet']);
 assert.equal(routeDraftSteps({ stops: [], title: '' }).active, 0);
 assert.deepEqual(states({ stops: [], title: '' }), ['current', 'todo', 'todo']);
 assert.equal(routeDraftSteps({ stops: ['a'], title: '' }).active, 1);
 assert.deepEqual(states({ stops: ['a'], title: '  ' }), ['done', 'current', 'todo']);
 assert.equal(routeDraftSteps({ stops: ['a'], title: 'Yürüyüş' }).active, 2);
 assert.deepEqual(states({ stops: ['a'], title: 'Yürüyüş' }), ['done', 'done', 'current']);
 // A name alone is not a route: without stops the planner still waits at the first step.
 assert.equal(routeDraftSteps({ stops: [], title: 'Yürüyüş' }).active, 0);
});

const fairs = [
 { id: 'istanbul', name: 'İstanbul', city: 'İstanbul', country: 'Türkiye', venue: 'TÜYAP', start: '2026-12-12', end: '2026-12-20', status: 'listed' },
 { id: 'over', name: 'Biten', city: 'Denizli', country: 'Türkiye', start: '2026-10-17', end: '2026-10-25', status: 'confirmed' },
 { id: 'open', name: 'Açık', city: 'Sharjah', country: 'Birleşik Arap Emirlikleri', start: '2026-11-04', end: '2026-11-15', status: 'confirmed' },
 { id: 'later', name: 'Sonraki yıl', city: 'Bursa', country: 'Türkiye', start: '2027-12-02', end: '2027-12-08', status: 'listed' },
 { id: 'december-2', name: 'Aralık başı', city: 'İzmir', country: 'Türkiye', start: '2026-12-01', status: 'confirmed' },
 { id: 'november', name: 'Kasım sonu', city: 'Frankfurt', country: 'Almanya', start: '2026-11-20', end: '2026-11-22', status: 'confirmed' },
 { id: 'unknown', name: 'Tarihi belirsiz', city: 'Ankara', country: 'Türkiye', start: null, end: null, status: 'expected' },
];
const today = '2026-11-08';

test('the fair timeline groups coming fairs by the month they start in, in date order', () => {
 const { months } = fairTimeline(fairs, 'all', today);
 assert.deepEqual(months.map(month => [month.key, month.label, month.count, month.fairs.map(fair => fair.id)]), [
  ['2026-11', 'Kasım 2026', 1, ['november']],
  ['2026-12', 'Aralık 2026', 2, ['december-2', 'istanbul']],
  ['2027-12', 'Aralık 2027', 1, ['later']],
 ]);
 assert.deepEqual(months.map(month => month.current), [true, false, false], 'only the month we are in is marked');
});

test('a month is written in words with its count, and a fair that spans two months stays in the first', () => {
 const spanning = [{ id: 'x', name: 'X', country: 'Türkiye', start: '2026-11-28', end: '2026-12-06', status: 'confirmed' }];
 const [month] = fairTimeline(spanning, 'all', today).months;
 assert.equal(month.key, '2026-11');
 assert.equal(month.countLabel, '1 fuar');
 assert.equal(fairTimeline(fairs, 'all', today).months[1].countLabel, '2 fuar');
});

test('open fairs and undated fairs stay out of the months; finished fairs are gone', () => {
 const timeline = fairTimeline(fairs, 'all', today);
 assert.deepEqual(timeline.open.map(fair => fair.id), ['open']);
 assert.deepEqual(timeline.undated.map(fair => fair.id), ['unknown']);
 assert.ok(!timeline.months.flatMap(month => month.fairs).some(fair => ['open', 'unknown', 'over'].includes(fair.id)));
 assert.equal(timeline.isEmpty, false);
});

test('the fair timeline shows all fairs, those in Türkiye or those abroad', () => {
 const ids = scope => { const { open, months, undated } = fairTimeline(fairs, scope, today); return [...open, ...months.flatMap(month => month.fairs), ...undated].map(fair => fair.id).sort(); };
 assert.deepEqual(ids('all'), ['december-2', 'istanbul', 'later', 'november', 'open', 'unknown']);
 assert.deepEqual(ids('tr'), ['december-2', 'istanbul', 'later', 'unknown']);
 assert.deepEqual(ids('world'), ['november', 'open']);
});

test('a fair in the timeline carries its date, place and badge ready to show', () => {
 const { months } = fairTimeline(fairs, 'all', today);
 const istanbul = months[1].fairs[1];
 assert.equal(istanbul.when, '12–20 Aralık 2026');
 assert.equal(istanbul.place, 'TÜYAP, İstanbul');
 assert.deepEqual(istanbul.badge, { label: 'Fuar listesinde var', tone: 'neutral' });
 assert.equal(months[0].fairs[0].place, 'Frankfurt, Almanya', 'a fair abroad names its country');
 assert.equal(fairTimeline([], 'all', today).isEmpty, true);
});

test('a fair\'s badge tells where its date comes from', () => {
 assert.deepEqual(fairBadge('confirmed'), { label: 'Resmî kaynakta var', tone: 'ok' });
 assert.deepEqual(fairBadge('listed'), { label: 'Fuar listesinde var', tone: 'neutral' });
 assert.deepEqual(fairBadge('expected'), { label: 'Tarih bekleniyor', tone: 'accent' });
 assert.equal(fairBadge('rumour'), null);
});

test('a fair says how near it is, only while that helps', () => {
 const fair = (start, end) => ({ id: 'f', start, end });
 assert.deepEqual(fairCountdown(fair('2026-11-04', '2026-11-15'), today), { kind: 'open', text: 'Kapanışa 7 gün var' });
 assert.deepEqual(fairCountdown(fair('2026-11-04', '2026-11-09'), today), { kind: 'open', text: 'Yarın kapanıyor' });
 assert.deepEqual(fairCountdown(fair('2026-11-04', '2026-11-08'), today), { kind: 'open', text: 'Bugün son gün' });
 assert.deepEqual(fairCountdown(fair('2026-11-08', null), today), { kind: 'open', text: 'Bugün son gün' });
 assert.deepEqual(fairCountdown(fair('2026-11-09', '2026-11-12'), today), { kind: 'soon', text: 'Yarın başlıyor' });
 assert.deepEqual(fairCountdown(fair('2026-11-20', '2026-11-22'), today), { kind: 'soon', text: '12 gün sonra başlıyor' });
 assert.deepEqual(fairCountdown(fair('2026-12-08', null), today), { kind: 'soon', text: '30 gün sonra başlıyor' });
 assert.equal(fairCountdown(fair('2026-12-09', null), today), null, 'further off than a month');
 assert.equal(fairCountdown(fair('2026-10-01', '2026-10-02'), today), null, 'already over');
 assert.equal(fairCountdown(fair(null, null), today), null, 'no date yet');
});

test('the countdown counts calendar days across a month and a year', () => {
 assert.equal(fairCountdown({ start: '2027-01-02' }, '2026-12-31').text, '2 gün sonra başlıyor');
});

test('the old address of the fair helpers still works, and gives the same functions', () => {
 assert.equal(oldAddress.formatRange, formatRange);
 assert.equal(oldAddress.fairsFrom, fairsFrom);
 assert.equal(oldAddress.groupByMonth, groupByMonth);
 assert.equal(oldAddress.todayInIstanbul, todayInIstanbul);
});
