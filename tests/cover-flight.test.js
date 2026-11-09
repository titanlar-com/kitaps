import test from 'node:test';
import assert from 'node:assert/strict';
import { flightKeyframes } from '../src/ui/react/app/coverFlight.js';

// A cover leaves its card and lands in the book page (docs/ADR-004-motion.md). The picture is sized
// to where it lands, and starts out moved and scaled onto where it came from, so only the
// compositor works during the flight.
test('a flight starts on the card and ends with nothing applied', () => {
  const from = { left: 100, top: 300, width: 80, height: 120 };
  const to = { left: 500, top: 100, width: 160, height: 240 };
  assert.deepEqual(flightKeyframes(from, to), [{ transform: 'translate(-400px, 200px) scale(0.5, 0.5)' }, { transform: 'none' }]);
});
