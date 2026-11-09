import test from 'node:test';
import assert from 'node:assert/strict';
import { longDay } from '../src/dates.js';
import { fairsScreen, fairScopes } from '../src/screens/fairs.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const fair = (extra = {}) => ({ id: 'tuyap', name: 'TÜYAP', start: '2026-11-20', when: '20 Kasım 2026', place: 'Büyükçekmece', organizer: 'TÜYAP A.Ş.', note: 'Uzun not', badge: { label: 'Resmî kaynakta var', tone: 'ok' }, countdown: { kind: 'soon', text: '5 gün sonra başlıyor' }, sources: [{ url: 'https://a.test/', label: 'A' }], ...extra });
const month = (extra = {}) => ({ key: '2026-11', label: 'Kasım 2026', countLabel: '1 fuar', current: false, fairs: [fair()], ...extra });
const data = { intro: 'Giriş', checkedAt: '2026-11-01', notes: ['Not'] };
const screen = (timeline = {}, extra = {}) => fairsScreen({ data: { ...data, ...extra }, timeline: { open: [], months: [], undated: [], ...timeline }, longDay });

test('the page opens with its title and the day its facts were checked', () => {
 const model = screen();
 assert.equal(model.title, 'Kitap fuarları');
 assert.equal(model.intro, 'Giriş');
 assert.equal(model.checked, 'Bilgiler 1 Kasım 2026 tarihinde kontrol edildi.');
});

test('the reader can choose which fairs to see, and the choice is named', () => {
 const model = screen();
 assert.equal(model.scope.label, 'Hangi fuarlar gösterilsin?');
 assert.equal(model.scope.options, fairScopes);
 assert.deepEqual(fairScopes, [{ value: 'all', label: 'Tümü' }, { value: 'tr', label: 'Türkiye' }, { value: 'world', label: 'Yurt dışı' }]);
});

test('the status counts every fair shown, wherever it stands', () => {
 assert.equal(screen().status, '0 fuar gösteriliyor.');
 assert.equal(screen({ open: [fair()], months: [month({ fairs: [fair(), fair()] }), month()], undated: [fair({ start: null })] }).status, '5 fuar gösteriliyor.');
});

test('with nothing dated the timeline gives way to a sentence, and undated fairs do not count as dated', () => {
 const none = screen({ undated: [fair({ start: null })] });
 assert.equal(none.timeline, null);
 assert.equal(none.empty, 'Bu seçimde yaklaşan fuar yok.');
 assert.equal(screen({ months: [month()] }).empty, null);
 assert.equal(screen({ open: [fair()] }).empty, null);
});

test('the open fairs lead the timeline and light it', () => {
 const lit = screen({ open: [fair()] }).timeline;
 assert.equal(lit.active, 0);
 assert.equal(lit.open.title, 'Şu an açık');
 assert.deepEqual(lit.open.cards.map(card => card.id), ['tuyap']);
 const dark = screen({ months: [month()] }).timeline;
 assert.equal(dark.active, -1);
 assert.equal(dark.open, null);
});

test('a month counts its fairs and marks itself only when it is this month', () => {
 const [later] = screen({ months: [month()] }).timeline.months;
 assert.deepEqual([later.key, later.label, later.count, later.badge], ['2026-11', 'Kasım 2026', '1 fuar', null]);
 assert.deepEqual(screen({ months: [month({ current: true })] }).timeline.months[0].badge, { label: 'Bu ay', tone: 'accent' });
});

test('a fair says what is known of it', () => {
 const raw = fair();
 const [card] = screen({ open: [raw] }).timeline.open.cards;
 assert.equal(card.fair, raw);
 assert.deepEqual([card.when, card.name, card.note], ['20 Kasım 2026', 'TÜYAP', 'Uzun not']);
 assert.deepEqual(card.badge, { label: 'Resmî kaynakta var', tone: 'ok' });
 assert.deepEqual(card.countdown, { kind: 'soon', text: '5 gün sonra başlıyor' });
 assert.deepEqual(card.facts, [{ label: 'Yer', value: 'Büyükçekmece' }, { label: 'Düzenleyen', value: 'TÜYAP A.Ş.' }]);
 assert.equal(card.calendar, 'Takvime ekle');
 assert.deepEqual(card.sources, { label: 'Kaynak: ', links: [{ url: 'https://a.test/', label: 'A', before: null }] });
});

test('a fair leaves out what it does not know, and an undated fair cannot go in a calendar', () => {
 const [card] = screen({ open: [fair({ start: null, organizer: '', note: '', sources: [], countdown: null, place: '' })] }).timeline.open.cards;
 assert.deepEqual([card.facts, card.calendar, card.sources, card.note, card.countdown], [[], null, null, null, null]);
});

test('the undated fairs and the notes appear only when there are some', () => {
 const model = screen({ undated: [fair({ start: null })] });
 assert.equal(model.undated.title, 'Tarihi henüz açıklanmayanlar');
 assert.equal(model.undated.body, 'Bu fuarlar her yıl düzenleniyor, ama bu yılın tarihleri henüz duyurulmadı.');
 assert.deepEqual(model.undated.cards.map(card => card.id), ['tuyap']);
 assert.deepEqual(model.notes, { title: 'Bilmen gerekenler', items: ['Not'] });
 assert.equal(screen().undated, null);
 assert.equal(screen({}, { notes: [] }).notes, null);
 assert.equal(screen({}, { notes: undefined }).notes, null);
});

test('a link that leaves the page says so to a screen reader', () => {
 assert.equal(screen().newTab, ' (yeni sekmede açılır)');
});
