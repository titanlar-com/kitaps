/** The one source of the site's motion (docs/ADR-004-motion.md, AGENT.md motion contract). A
 * component names what a moment is, and this table says how long it takes. The build writes the
 * same values into the first response as CSS variables (motionCss, vite.config.js), so the
 * loading screen, the stylesheets and Mantine's layers read them without a copy. */
export const MOTION_EASE='cubic-bezier(.65, 0, .35, 1)';
export const MOTION_MS=Object.freeze({
 /** Hover, press, colour and surface changes. */
 control:150,
 /** Small changes of place or height: the section marker, a cover lifting, a progress bar. */
 move:200,
 /** Accordions, collapsing sections and their arrows. */
 disclosure:200,
 /** Floating panels, tooltips, menus, dialogs and notices. */
 overlay:200,
 /** Sheets that cross most of the screen. */
 sheet:300,
 /** One turn of the loading bars. */
 busy:1200,
});
/** How far each loading bar runs ahead of the next one. */
export const BUSY_STEP_MS=120;
/** A hint waits this long for a pointer, so it does not flash as the pointer passes. It never delays focus, input or state. */
export const HINT_DELAY_MS=250;
/** Displacements stay small: a cover lifts, a notice rises. */
export const MOTION_PX=Object.freeze({lift:3,rise:8});
/** Mantine transitionProps for a role; with reduced motion the panel appears at once. */
export const transition=(role,reduced=false)=>({duration:reduced?0:MOTION_MS[role],timingFunction:MOTION_EASE});
/** The table as CSS variables. */
export const motionCss=()=>`:root{--motion-ease:${MOTION_EASE};${Object.entries(MOTION_MS).map(([role,ms])=>`--motion-${role}:${ms}ms;`).join('')}--motion-busy-step:${BUSY_STEP_MS}ms;${Object.entries(MOTION_PX).map(([name,px])=>`--motion-${name}:${px}px;`).join('')}}`;
