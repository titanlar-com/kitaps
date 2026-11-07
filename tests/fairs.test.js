import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRange, fairsFrom, groupByMonth, fairCalendar, todayInIstanbul } from '../src/fairs.js';

// The book fair calendar (owner's request, 7 November 2026): dates read in Istanbul time,
// finished fairs leave the list, fairs without announced dates stay apart, and each fair can be
// added to a calendar.
const fairs = [
 { id: 'istanbul', name: 'Uluslararası İstanbul Kitap Fuarı', city: 'İstanbul', country: 'Türkiye', venue: 'TÜYAP', start: '2026-12-12', end: '2026-12-20', status: 'listed', note: 'Türkiye’nin en büyük kitap fuarı.' },
 { id: 'over', name: 'Biten fuar', city: 'Denizli', country: 'Türkiye', start: '2026-10-17', end: '2026-10-25', status: 'confirmed', note: 'Bitti.' },
 { id: 'open', name: 'Açık fuar', city: 'Sharjah', country: 'Birleşik Arap Emirlikleri', start: '2026-11-04', end: '2026-11-15', status: 'confirmed', note: 'Sürüyor.' },
 { id: 'later', name: 'Sonraki yıl', city: 'Bursa', country: 'Türkiye', start: '2027-04-10', end: '2027-04-18', status: 'listed', note: 'Gelecek bahar.' },
 { id: 'unknown', name: 'Tarihi belirsiz', city: 'Ankara', country: 'Türkiye', start: null, end: null, status: 'expected', note: 'Genellikle şubatta.' },
];

test('a date range is written the Turkish way, in one month or across two', () => {
 assert.equal(formatRange('2026-12-12', '2026-12-20'), '12–20 Aralık 2026');
 assert.equal(formatRange('2026-11-28', '2026-12-06'), '28 Kasım – 6 Aralık 2026');
 assert.equal(formatRange('2026-12-30', '2027-01-03'), '30 Aralık 2026 – 3 Ocak 2027');
 assert.equal(formatRange('2027-03-05', '2027-03-05'), '5 Mart 2027');
 assert.equal(formatRange(null, null), 'Tarih açıklanmadı');
});

test('finished fairs leave the list; open, coming and undated fairs stay, each marked', () => {
 const { open, coming, undated } = fairsFrom(fairs, '2026-11-07');
 assert.deepEqual(open.map(fair => fair.id), ['open']);
 assert.deepEqual(coming.map(fair => fair.id), ['istanbul', 'later']);
 assert.deepEqual(undated.map(fair => fair.id), ['unknown']);
 // The last day still counts as open.
 assert.deepEqual(fairsFrom(fairs, '2026-12-20').open.map(fair => fair.id), ['istanbul']);
});

test('coming fairs are grouped by the month they start in', () => {
 const groups = groupByMonth(fairsFrom(fairs, '2026-11-07').coming);
 assert.deepEqual(groups.map(group => [group.label, group.fairs.map(fair => fair.id)]), [['Aralık 2026', ['istanbul']], ['Nisan 2027', ['later']]]);
});

test('today is read in Istanbul time, not the device clock’s zone', () => {
 assert.equal(todayInIstanbul(new Date('2026-11-06T22:30:00Z')), '2026-11-07');
 assert.equal(todayInIstanbul(new Date('2026-11-07T20:59:00Z')), '2026-11-07');
});

test('a fair becomes an all-day calendar event that ends the day after its last day', () => {
 const text = fairCalendar(fairs[0], new Date('2026-11-07T10:00:00Z'));
 assert.match(text, /^BEGIN:VCALENDAR\r\n/);
 assert.match(text, /\r\nDTSTART;VALUE=DATE:20261212\r\n/);
 assert.match(text, /\r\nDTEND;VALUE=DATE:20261221\r\n/);
 assert.match(text, /\r\nSUMMARY:Uluslararası İstanbul Kitap Fuarı\r\n/);
 assert.match(text, /\r\nLOCATION:TÜYAP\\, İstanbul\r\n/);
 assert.match(text, /\r\nUID:istanbul-2026-12-12@titanlar-com\.github\.io\r\n/);
 assert.match(text, /END:VCALENDAR\r\n$/);
 assert.equal(fairCalendar(fairs[4]), null, 'no event without dates');
});

// The calendar's data (data/book-fairs.json): one record per fair edition, a date only when a
// source gives one, clean links, and notes written in whole sentences (owner's writing rule).
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('../data/book-fairs.json', import.meta.url), 'utf8'));

test('every fair has a name, a place, a known status and its sources', () => {
 const ids = data.fairs.map(fair => fair.id);
 assert.equal(new Set(ids).size, ids.length, 'no fair twice');
 for (const fair of data.fairs) {
  assert.match(fair.id, /^[a-z0-9-]+$/);
  assert.ok(fair.name && fair.city && fair.country, fair.id);
  assert.ok(['confirmed', 'listed', 'expected'].includes(fair.status), `${fair.id} status`);
  assert.ok(fair.sources?.length, `${fair.id} names a source`);
  for (const source of fair.sources) {
   assert.ok(source.label, fair.id);
   assert.match(source.url, /^https:\/\//, `${fair.id} ${source.url}`);
   assert.doesNotMatch(source.url, /utm_|chatgpt/, `${fair.id} keeps no tracking parameter`);
  }
 }
});

test('dates are real calendar days, a fair ends on or after its start, and undated fairs wait for one', () => {
 const valid = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T12:00:00Z`).toISOString().startsWith(iso);
 for (const fair of data.fairs) {
  if (fair.status === 'expected') { assert.equal(fair.start, null, fair.id); assert.equal(fair.end, null, fair.id); continue; }
  assert.ok(valid(fair.start) && valid(fair.end), fair.id);
  assert.ok(fair.end >= fair.start, fair.id);
 }
 // The calendar was built on 7 November 2026 and keeps no fair that had already ended.
 for (const fair of data.fairs.filter(fair => fair.end)) assert.ok(fair.end >= '2026-11-07', fair.id);
 assert.ok(data.fairs.some(fair => fair.id === 'istanbul-kitap-fuari-2026' && fair.start === '2026-12-12' && fair.end === '2026-12-20'));
});

test('every explanation in the calendar is written in whole sentences', () => {
 for (const text of [data.intro, ...data.notes, ...data.fairs.map(fair => fair.note)]) {
  assert.doesNotMatch(text, /;|—|·|→|←/, text);
  assert.match(text, /[.!?]$/, text);
 }
});
