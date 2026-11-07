import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, derived } from '../src/core/store.ts';

// The one reactive contract every UI binds to (ADR 003, K5): getSnapshot returns the same
// object until something changed, and subscribe returns its own unsubscribe. React binds it
// with useSyncExternalStore; any other UI technology binds it in a few lines.

test('a store gives its value, notifies once per change and not for an equal value', () => {
  const store = createStore({ count: 0 });
  const first = store.getSnapshot();
  let calls = 0;
  const stop = store.subscribe(() => { calls += 1; });
  store.set(first);
  assert.equal(calls, 0, 'the same value is no change');
  store.update(value => ({ count: value.count + 1 }));
  assert.equal(calls, 1);
  assert.deepEqual(store.getSnapshot(), { count: 1 });
  assert.notEqual(store.getSnapshot(), first);
  stop();
  store.set({ count: 2 });
  assert.equal(calls, 1, 'no call after unsubscribing');
});

test('listeners that unsubscribe or subscribe while being notified do not disturb the round', () => {
  const store = createStore(0);
  const order = [];
  let late = null;
  const stopA = store.subscribe(() => { order.push('a'); stopA(); late ??= store.subscribe(() => order.push('late')); });
  store.subscribe(() => order.push('b'));
  store.set(1);
  assert.deepEqual(order, ['a', 'b'], 'a listener added during the round waits for the next one');
  store.set(2);
  assert.deepEqual(order, ['a', 'b', 'b', 'late']);
});

test('a derived store keeps the same snapshot until one of its sources changes, even unobserved', () => {
  const books = createStore(['a', 'b', 'c']);
  const marks = createStore({ a: ['onemli'] });
  let runs = 0;
  const favourites = derived([books, marks], (ids, states) => { runs += 1; return ids.filter(id => states[id]?.includes('onemli')); });
  const first = favourites.getSnapshot();
  assert.deepEqual(first, ['a']);
  assert.equal(favourites.getSnapshot(), first, 'same object while nothing changed');
  assert.equal(runs, 1, 'computed once');
  marks.set({ a: ['onemli'], b: ['onemli'] });
  assert.deepEqual(favourites.getSnapshot(), ['a', 'b']);
  assert.equal(runs, 2);
});

test('a derived store notifies only when its own value changes, and lets go of its sources', () => {
  const marks = createStore({ a: ['onemli'], b: [] });
  let sourceListeners = 0;
  const watched = { getSnapshot: marks.getSnapshot, subscribe: listener => { sourceListeners += 1; const stop = marks.subscribe(listener); return () => { sourceListeners -= 1; stop(); }; } };
  const count = derived([watched], states => Object.values(states).filter(list => list.includes('onemli')).length);
  let calls = 0;
  const stop = count.subscribe(() => { calls += 1; });
  assert.equal(sourceListeners, 1, 'subscribes to its source while observed');
  marks.set({ a: ['onemli'], b: ['alindi'] });
  assert.equal(calls, 0, 'still one favourite: no notification');
  marks.set({ a: ['onemli'], b: ['onemli'] });
  assert.equal(calls, 1);
  assert.equal(count.getSnapshot(), 2);
  stop();
  assert.equal(sourceListeners, 0, 'no listener left on the source');
});

test('a derived store can compare its value by content', () => {
  const query = createStore('a');
  const result = derived([query], value => ({ query: value.trim() }), (left, right) => left.query === right.query);
  const first = result.getSnapshot();
  query.set('a ');
  assert.equal(result.getSnapshot(), first, 'an equal result keeps the old snapshot');
});
