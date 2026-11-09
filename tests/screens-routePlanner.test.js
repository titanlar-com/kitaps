import test from 'node:test';
import assert from 'node:assert/strict';
import { longDay } from '../src/dates.js';
import { routeMovedText, routeRegistryStatus, routePlannerScreen, routeRegistrySubjects, routeStoreOptions, suggestedRouteTitle } from '../src/screens/routePlanner.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const stores = [
 { id: 'minoa', name: 'Minoa', side: 'europe', district: 'Beyoğlu', status: 'open' },
 { id: 'homer', name: 'Homer', side: 'europe', district: 'Beyoğlu', status: 'open' },
 { id: 'moda', name: 'Moda', side: 'asia', district: 'Kadıköy', status: 'open' },
 { id: 'iki', name: 'İki Yaka', side: 'both', district: 'Şişli', status: 'open' },
 { id: 'eski', name: 'Eski', side: 'europe', district: 'Fatih', status: 'closed' },
];
const byId = Object.fromEntries(stores.map(store => [store.id, store]));
const route = (extra = {}) => ({ id: 'r1', title: 'Pazar', date: '2026-11-07', stops: ['minoa', 'moda'], note: '', done: false, ...extra });
const screen = (extra = {}) => routePlannerScreen({ stops: [], title: '', editing: null, length: null, status: null, moved: '', routes: [], deleting: null, byId, longDay, ...extra });

test('the planner names itself and its parts', () => {
 const model = screen();
 assert.equal(model.title, 'Rota oluşturucu');
 assert.equal(model.intro, "Gitmek istediğin kitapçıları seç. Sistem sırayı yakınlığa göre önerir, sen de elle değiştirebilirsin. Cihaz eşitlemesi bağlıysa kaydettiğin rotalar GitHub'daki eşitleme deposuna yazılır ve her cihazında görünür.");
 assert.equal(model.stepsLabel, 'Rota hazırlama adımları');
 assert.deepEqual([model.nameField, model.dateField], [{ label: 'Rota adı' }, { label: 'Tarih', description: 'İsteğe bağlı' }]);
 assert.equal(model.tools.suggest, 'Sıradaki rotayı öner');
 assert.equal(model.saved.title, 'Kaydettiğin rotalar');
});

test('the steps say where the draft stands, and a finished step says so to a screen reader', () => {
 assert.deepEqual(screen().progress.steps.map(step => [step.label, step.state, step.doneNote]), [['Seç', 'current', null], ['Sırala', 'todo', null], ['Kaydet', 'todo', null]]);
 const named = screen({ stops: ['minoa'], title: 'Ad' }).progress;
 assert.equal(named.active, 2);
 assert.deepEqual(named.steps.map(step => step.doneNote), [' (tamamlandı)', ' (tamamlandı)', null]);
});

test('the store field asks for a choice only while nothing is chosen', () => {
 assert.deepEqual(screen().storesField, { label: 'Kitapçılar', placeholder: 'Kitapçı seç', nothingFound: 'Bu adla bir kitapçı yok' });
 assert.equal(screen({ stops: ['minoa'] }).storesField.placeholder, '');
});

test('the store list offers only open stores, by the two sides of the city', () => {
 assert.deepEqual(routeStoreOptions(stores), [
  { group: 'Avrupa yakası', items: [{ value: 'minoa', label: 'Minoa' }, { value: 'homer', label: 'Homer' }] },
  { group: 'Anadolu yakası', items: [{ value: 'moda', label: 'Moda' }] },
 ]);
});

test('each stop can move up or down, except past the ends of the list', () => {
 assert.equal(screen().draftStops, null);
 const rows = screen({ stops: ['minoa', 'moda', 'homer'] }).draftStops;
 assert.deepEqual(rows.map(row => row.up), [{ label: 'Minoa: yukarı taşı', disabled: true }, { label: 'Moda: yukarı taşı', disabled: false }, { label: 'Homer: yukarı taşı', disabled: false }]);
 assert.deepEqual(rows.map(row => row.down), [{ label: 'Minoa: aşağı taşı', disabled: false }, { label: 'Moda: aşağı taşı', disabled: false }, { label: 'Homer: aşağı taşı', disabled: true }]);
 assert.deepEqual([rows[1].id, rows[1].name, rows[1].position], ['moda', 'Moda', 2]);
});

test('a moved stop says where it landed', () => {
 assert.equal(routeMovedText({ name: 'Moda', position: 2 }, -1), 'Moda 1. sıraya taşındı.');
 assert.equal(routeMovedText({ name: 'Moda', position: 2 }, 1), 'Moda 3. sıraya taşındı.');
});

test('the length appears only when it is known, in Turkish numbers', () => {
 assert.equal(screen().length, null);
 assert.equal(screen({ length: 3.456 }).length, 'Duraklar arası toplam yaklaşık 3,5 km, kuş uçuşu.');
 assert.equal(screen({ length: 2 }).length, 'Duraklar arası toplam yaklaşık 2 km, kuş uçuşu.');
});

test('ordering by distance needs three stops', () => {
 assert.deepEqual(screen({ stops: ['minoa', 'moda'] }).tools.order, { text: 'Sırayı yakınlığa göre düzenle', disabled: true });
 assert.equal(screen({ stops: ['minoa', 'moda', 'homer'] }).tools.order.disabled, false);
});

test('a suggested route is named after its districts, once each', () => {
 assert.equal(suggestedRouteTitle(['Beyoğlu', 'Beyoğlu', 'Kadıköy']), 'Öneri: Beyoğlu ve Kadıköy');
 assert.equal(suggestedRouteTitle(['Fatih']), 'Öneri: Fatih');
 assert.equal(suggestedRouteTitle([]), '');
});

test('saving needs a name and a stop, and says whether it edits', () => {
 assert.deepEqual(screen().submit, { text: 'Rotayı kaydet', disabled: true });
 assert.deepEqual(screen({ stops: ['minoa'], title: '   ' }).submit, { text: 'Rotayı kaydet', disabled: true });
 assert.deepEqual(screen({ stops: [], title: 'Ad' }).submit, { text: 'Rotayı kaydet', disabled: true });
 assert.deepEqual(screen({ stops: ['minoa'], title: 'Ad' }).submit, { text: 'Rotayı kaydet', disabled: false });
 assert.deepEqual(screen({ stops: ['minoa'], title: 'Ad', editing: 'r1' }).submit, { text: 'Değişikliği kaydet', disabled: false });
});

test('the way back appears once there is something to leave', () => {
 assert.equal(screen().cancel, null);
 assert.equal(screen({ stops: ['minoa'] }).cancel, 'Vazgeç');
 assert.equal(screen({ editing: 'r1' }).cancel, 'Vazgeç');
});

test('the status line shows the last move first, and otherwise what the registry said', () => {
 assert.deepEqual(screen().status, { kind: undefined, text: '' });
 assert.deepEqual(screen({ status: { kind: 'saved', text: 'Tamam' } }).status, { kind: 'saved', text: 'Tamam' });
 assert.deepEqual(screen({ status: { kind: 'saved', text: 'Tamam' }, moved: 'Taşındı' }).status, { kind: undefined, text: 'Taşındı' });
});

test('with no saved routes the list says so', () => {
 const { saved } = screen();
 assert.equal(saved.empty, 'Henüz kaydettiğin bir rota yok.');
 assert.deepEqual(saved.cards, []);
 assert.equal(screen({ routes: [route()] }).saved.empty, null);
});

test('a saved route shows its day, or says it has none', () => {
 const [card] = screen({ routes: [route()] }).saved.cards;
 assert.equal(card.date, '7 Kasım 2026');
 assert.equal(screen({ routes: [route({ date: null })] }).saved.cards[0].date, 'Tarihi belli değil');
 assert.deepEqual([card.doneLabel, card.edit, card.deleteLabel], ['Gezildi', 'Düzenle', 'Pazar: sil']);
 assert.deepEqual(card.stops.map(stop => stop.name), ['Minoa', 'Moda']);
});

test('a card keeps the saved route itself, for the commands that write it back', () => {
 const saved = route();
 assert.equal(screen({ routes: [saved] }).saved.cards[0].route, saved);
});

test('a walked route lights its whole timeline', () => {
 assert.equal(screen({ routes: [route()] }).saved.cards[0].active, -1);
 assert.equal(screen({ routes: [route({ done: true })] }).saved.cards[0].active, 1);
});

test('only the route being deleted asks first', () => {
 const [asking, quiet] = screen({ routes: [route(), route({ id: 'r2', title: 'Salı' })], deleting: 'r1' }).saved.cards;
 assert.deepEqual(asking.deleteAsk, { label: 'Pazar: silinsin mi?', question: 'Bu rota bütün cihazlarından silinsin mi?', keep: 'Vazgeç', confirm: 'Evet, sil' });
 assert.equal(quiet.deleteAsk, null);
});

test('the registry says what happened to a change, and names it', () => {
 assert.deepEqual(routeRegistrySubjects, { save: 'Rota', remove: 'Silme' });
 assert.deepEqual(routeRegistryStatus.applied('Rota', true), { kind: 'saved', text: 'Rota GitHub’a kaydedildi.' });
 assert.deepEqual(routeRegistryStatus.applied('Silme', false), { kind: 'local', text: 'Silme bu cihazda saklandı. GitHub’a göndermek için cihaz eşitlemesini bağla.' });
 assert.deepEqual(routeRegistryStatus.waiting(2), { kind: 'local', text: 'Bu cihazda GitHub’a gönderilmemiş 2 rota değişikliği var. Göndermek için cihaz eşitlemesini bağla.' });
 assert.deepEqual(routeRegistryStatus.sent(2), { kind: 'saved', text: 'Bu cihazda bekleyen 2 rota değişikliği GitHub’a kaydedildi.' });
 assert.deepEqual(routeRegistryStatus.readFailed(), { kind: 'error', text: 'GitHub’daki rotalar okunamadı. Bu cihazdaki rotalar gösteriliyor.' });
});

test('a change that did not reach GitHub says why, and that it waits on this device', () => {
 assert.deepEqual(routeRegistryStatus.failed({ code: 'unauthorized' }, 'Rota'), { kind: 'error', text: 'Rota GitHub’a yazılamadı, çünkü anahtar yazma iznine sahip değil. Değişiklik bu cihazda bekliyor.' });
 assert.deepEqual(routeRegistryStatus.failed(new Error('ağ'), 'Silme'), { kind: 'error', text: 'Silme GitHub’a gönderilemedi. Değişiklik bu cihazda bekliyor ve sonraki kayıtta yeniden gönderilecek.' });
 assert.deepEqual(routeRegistryStatus.failed(undefined, 'Rota'), { kind: 'error', text: 'Rota GitHub’a gönderilemedi. Değişiklik bu cihazda bekliyor ve sonraki kayıtta yeniden gönderilecek.' });
 const retryAt = Date.UTC(2026, 10, 7, 11, 5);
 const time = new Date(retryAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
 assert.deepEqual(routeRegistryStatus.failed({ code: 'rate-limited', retryAt }, 'Bekleyen 2 rota değişikliği'), { kind: 'error', text: `Bekleyen 2 rota değişikliği GitHub’a gönderilemedi, çünkü GitHub istek sınırına ulaşıldı. Değişiklik bu cihazda bekliyor. Saat ${time} sonrasındaki ilk kayıtta ya da sayfa yeniden açıldığında gönderilir.` });
 assert.equal(routeRegistryStatus.waitingSubject(2), 'Bekleyen 2 rota değişikliği');
});
