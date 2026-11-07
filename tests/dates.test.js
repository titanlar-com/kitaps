import test from 'node:test';
import assert from 'node:assert/strict';
import { longDay } from '../src/dates.js';

// One way to write a calendar day in Turkish (ADR 002, phase 3); the bookstores page, the route
// planner and the fair calendar each had their own copy.
test('a calendar day is written in Turkish, the same in every zone', () => {
 assert.equal(longDay('2026-11-07'), '7 Kasım 2026');
 assert.equal(longDay('2027-01-01'), '1 Ocak 2027');
 assert.equal(longDay('2026-12-31'), '31 Aralık 2026');
});
