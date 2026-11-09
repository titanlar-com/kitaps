import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionsScreen } from '../src/screens/collections.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const collection = { id: 'time', mark: 'T', title: 'TIME 100', short: 'TIME', tag: 'Liste', description: 'Açıklama', note: 'Not', source: 'https://example.test/', originalCount: 99, context: { purpose: 'Amaç', criterion: 'Ölçüt', verdict: 'Karar' } };
const card = (extra = {}) => ({ collection, total: 10, read: 5, done: false, share: 0.5, percent: 50, previews: [], groups: [{ id: 'g', title: 'Alt', count: 4 }], ...extra });

test('the status counts the cards, and the empty state appears only when there are none', () => {
  const some = collectionsScreen({ cards: [card()] });
  assert.equal(some.status, '1 küme bulundu.');
  assert.equal(some.empty, null);
  assert.equal(some.search.label, 'Kümeler arasında ara');
  const none = collectionsScreen({ cards: [] });
  assert.equal(none.status, '0 küme bulundu.');
  assert.deepEqual(Object.keys(none.empty), ['title', 'body', 'clear']);
});

test('a card says how much is read as a sentence and a share', () => {
  const [model] = collectionsScreen({ cards: [card()] }).cards;
  assert.equal(model.meta, '10 kitap, 1 alt küme');
  assert.equal(model.readSentence, '10 kitaptan 5 tanesi okundu.');
  assert.equal(model.share, '%50');
  assert.equal(model.progressLabel, 'TIME 100: okunan oranı');
  assert.deepEqual(model.booksButton, { text: 'Bu kümedeki kitaplar', label: 'Bu kümedeki kitaplar: TIME 100' });
  assert.equal(collectionsScreen({ cards: [card({ read: 0, share: 0, percent: 0 })] }).cards[0].readSentence, 'Bu kümeden henüz okunan kitap yok.');
  assert.equal(collectionsScreen({ cards: [card({ read: 10, done: true, share: 1, percent: 100 })] }).cards[0].readSentence, '10 kitabın tamamı okundu.');
});

test('a finished collection is marked only beside its tag, as the card has always shown it', () => {
  assert.deepEqual(collectionsScreen({ cards: [card({ done: true })] }).cards[0].badges, ['Liste', 'Tamamlandı']);
  assert.deepEqual(collectionsScreen({ cards: [card()] }).cards[0].badges, ['Liste']);
  assert.deepEqual(collectionsScreen({ cards: [card({ done: true, collection: { ...collection, tag: '' } })] }).cards[0].badges, []);
});

test('a card names what it knows and leaves out what it does not', () => {
  const [full] = collectionsScreen({ cards: [card()] }).cards;
  assert.deepEqual(full.context, [{ label: 'Okuma amacı:', text: 'Amaç' }, { label: 'Seçim ölçütü:', text: 'Ölçüt' }]);
  assert.equal(full.verdict, 'Karar');
  assert.equal(full.sourceCount, 'Kaynak listesinde 99 kayıt var.');
  assert.deepEqual(full.sourceLink, { href: 'https://example.test/', text: 'Özgün liste' });
  assert.deepEqual(full.groups, [{ id: 'g', title: 'Alt', count: 4, label: 'Alt: 4 kitap' }]);
  const [bare] = collectionsScreen({ cards: [card({ collection: { ...collection, source: '', originalCount: undefined, context: undefined } })] }).cards;
  assert.deepEqual([bare.context, bare.verdict, bare.sourceCount, bare.sourceLink], [[], null, null, null]);
});
