/** The motion contract for JavaScript transitions (AGENT.md): the same symmetric curve and
 * durations as --motion-ease, --motion-base and --motion-fast in styles.css. tests/ui-gates.test.js
 * checks that the two stay equal. */
export const MOTION_EASE='cubic-bezier(.65, 0, .35, 1)';
export const MOTION_MS=200;
export const MOTION_FAST_MS=150;
/** A tooltip waits this long before it opens, so it does not flash while the pointer passes over. */
export const TOOLTIP_DELAY_MS=250;
/** Mantine transitionProps; with reduced motion the sheet appears at once. */
export const transition=(reduced=false)=>({duration:reduced?0:MOTION_MS,timingFunction:MOTION_EASE});
