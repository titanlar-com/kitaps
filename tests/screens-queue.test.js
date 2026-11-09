import test from 'node:test';
import assert from 'node:assert/strict';
import { queueView } from '../src/core/personal/queue.js';
import { queueScreen } from '../src/screens/queue.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const books = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, { id, title: `Kitap ${id}`, author: `Yazar ${id}` }]));
const screen = (queue, extra = {}) => queueScreen(queueView({ queue, books, ...extra }));

test('an empty queue says what to do next and shows no rows', () => {
  const model = screen([]);
  assert.deepEqual(model.empty, { title: 'Bir sonraki kitabına yer aç.', body: 'Katalogdan en fazla beş kitap seç. Her kartta “Sırama ekle” düğmesi var.', browse: 'Kitap seç' });
  assert.deepEqual(model.rows, []);
});

test('a queue with room counts its books and the places left', () => {
  const model = screen(['a', 'b']);
  assert.equal(model.empty, null);
  assert.equal(model.count, 'Sırada 2 kitap var. 3 kitaplık yerin kaldı.');
  assert.equal(model.browse, 'Sırama kitap seç');
});

test('a full queue says so and sends the reader back to the catalogue', () => {
  const model = screen(['a', 'b', 'c', 'd', 'e']);
  assert.equal(model.count, 'Sıran dolu. En çok 5 kitap sıraya girebilir.');
  assert.equal(model.browse, 'Kataloğa dön');
});

test('only the first row is named as the next book', () => {
  const [first, second] = screen(['a', 'b']).rows;
  assert.equal(first.eyebrow, 'Sıradaki kitabın');
  assert.equal(first.next, true);
  assert.equal(second.eyebrow, null);
  assert.equal(second.next, false);
});

test('a row names its place, its book and every control with the book\'s title', () => {
  const [row] = screen(['a', 'b']).rows;
  assert.equal(row.id, 'a');
  assert.equal(row.title, 'Kitap a');
  assert.equal(row.author, 'Yazar a');
  assert.equal(row.position, 1);
  assert.equal(row.positionLabel, '1. sırada');
  assert.deepEqual(row.moveUp, { label: 'Kitap a: sırada yukarı taşı', disabled: true });
  assert.deepEqual(row.moveDown, { label: 'Kitap a: sırada aşağı taşı', disabled: false });
  assert.equal(row.remove, 'Kitap a: sıradan çıkar');
  assert.deepEqual(row.record, { text: 'Okuma kaydım', label: 'Okuma kaydım: Kitap a' });
});

test('what a screen reader hears after a change names the book and its new place', () => {
  const [, second] = screen(['a', 'b', 'c']).rows;
  assert.equal(second.moved[-1], 'Kitap b 1. sıraya taşındı.');
  assert.equal(second.moved[1], 'Kitap b 3. sıraya taşındı.');
  assert.equal(second.removed, 'Kitap b sıradan çıkarıldı.');
});

test('a row shows the reading marks it has, by name, and no others', () => {
  const [row] = screen(['a'], { states: { a: ['okunuyor', 'alindi', 'okundu'] } }).rows;
  assert.deepEqual(row.marks, [{ id: 'okunuyor', label: 'Okunuyor' }, { id: 'okundu', label: 'Okundu' }]);
  assert.equal(row.read, true);
  const [bare] = screen(['a']).rows;
  assert.deepEqual(bare.marks, []);
  assert.equal(bare.read, false);
});

test('progress appears only when the record can say it', () => {
  const [row] = screen(['a'], { reading: { a: { page: 50, totalPages: 200 } } }).rows;
  assert.deepEqual(row.progress, { sentence: '200 sayfadan 50 tanesi okundu.', share: '%25', percent: 25, label: 'Kitap a: okuma ilerlemesi' });
  assert.equal(screen(['a']).rows[0].progress, null);
  assert.equal(screen(['a'], { reading: { a: { page: 500, totalPages: 200 } } }).rows[0].progress, null);
});

test('the book goes through for the cover, and every word uses the title the catalogue shows', () => {
  const book = { id: 't', title: 'Kayıttaki Ad', originalTitle: 'Gösterilen Ad', author: 'Y' };
  const [row] = queueScreen(queueView({ queue: ['t'], books: { t: book } })).rows;
  assert.equal(row.book, book);
  assert.equal(row.title, 'Gösterilen Ad');
  assert.equal(row.remove, 'Gösterilen Ad: sıradan çıkar');
});
