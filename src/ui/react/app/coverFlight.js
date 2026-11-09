import { MOTION_EASE, MOTION_MS } from '../../../motion.js';

// A cover travels between its card and the book page (docs/ADR-004-motion.md). What flies is a
// copy above the sheet: it is sized to where it lands and starts moved and scaled onto where it
// came from, so only the compositor works. The address, the state and the focus never wait for it.

/** @typedef {{left:number,top:number,width:number,height:number}} Box */

/** @param {Box} from @param {Box} to */
export function flightKeyframes(from, to) {
  return [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` }, { transform: 'none' }];
}

/** Where an element will stand once the moving layer around it has come to rest. */
export function restingBox(element, layer) {
  const box = element.getBoundingClientRect();
  const moved = layer ? new DOMMatrixReadOnly(getComputedStyle(layer).transform) : null;
  return { left: box.left - (moved?.m41 ?? 0), top: box.top - (moved?.m42 ?? 0), width: box.width, height: box.height };
}

/** Starts a flight; `stage` hides the real cover at the book end until the copy has landed. */
export function launchCover({ id, src, from, to, stage }) {
  const copy = document.createElement('img');
  copy.src = src;
  copy.alt = '';
  copy.className = 'cover-flight';
  copy.setAttribute('aria-hidden', 'true');
  Object.assign(copy.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  document.body.append(copy);
  stage?.setAttribute('data-flying', '');
  const frames = flightKeyframes(from, to);
  const animation = copy.animate(frames, { duration: MOTION_MS.sheet, easing: MOTION_EASE, fill: 'both' });
  const land = () => { copy.remove(); stage?.removeAttribute('data-flying'); };
  animation.onfinish = land;
  animation.oncancel = land;
  return { id, running: () => animation.playState === 'running', reverse: () => animation.reverse(), cancel: () => animation.cancel() };
}
