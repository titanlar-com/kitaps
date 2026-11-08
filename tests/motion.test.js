import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSY_STEP_MS, HINT_DELAY_MS, MOTION_EASE, MOTION_MS, MOTION_PX, motionCss, transition } from '../src/motion.js';

// The one source of the site's motion (docs/ADR-004-motion.md). A component names what a moment
// is, and the table says how long it takes.
test('the curve is the owner\'s symmetric curve', () => {
  assert.equal(MOTION_EASE, 'cubic-bezier(.65, 0, .35, 1)');
});

test('every role has a positive, bounded duration, and duration follows distance', () => {
  assert.deepEqual(Object.keys(MOTION_MS).sort(), ['busy', 'control', 'disclosure', 'move', 'overlay', 'sheet']);
  for (const [role, ms] of Object.entries(MOTION_MS)) {
    assert.ok(Number.isFinite(ms) && ms > 0, role);
    assert.ok(ms <= (role === 'busy' ? 1500 : 400), `${role} stays short`);
  }
  assert.ok(MOTION_MS.control < MOTION_MS.overlay && MOTION_MS.overlay < MOTION_MS.sheet);
});

test('a loop step and the hint delay are positive, and movement stays small', () => {
  assert.ok(BUSY_STEP_MS > 0 && BUSY_STEP_MS * 3 < MOTION_MS.busy);
  assert.ok(HINT_DELAY_MS > 0);
  for (const px of Object.values(MOTION_PX)) assert.ok(px > 0 && px <= 8, 'a small displacement');
});

test('transition props come from a role, and stop for readers who ask for less motion', () => {
  assert.deepEqual(transition('sheet'), { duration: MOTION_MS.sheet, timingFunction: MOTION_EASE });
  assert.deepEqual(transition('sheet', true), { duration: 0, timingFunction: MOTION_EASE });
});

test('the CSS variables carry every value of the table', () => {
  const css = motionCss();
  assert.ok(css.startsWith(':root{'));
  assert.ok(css.includes(`--motion-ease:${MOTION_EASE};`));
  for (const [role, ms] of Object.entries(MOTION_MS)) assert.ok(css.includes(`--motion-${role}:${ms}ms;`), role);
  assert.ok(css.includes(`--motion-busy-step:${BUSY_STEP_MS}ms;`));
  for (const [name, px] of Object.entries(MOTION_PX)) assert.ok(css.includes(`--motion-${name}:${px}px;`), name);
});
