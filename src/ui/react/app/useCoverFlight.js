import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '@mantine/hooks';
import { launchCover, restingBox } from './coverFlight.js';

const onScreen = box => box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
/** A book's cover on the page behind the sheet, if it is loaded and in view. */
function pageCover(id) {
  const image = document.querySelector(`main [data-book-id="${CSS.escape(id)}"] .cover-stage img`);
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && onScreen(image.getBoundingClientRect()) ? image : null;
}
const sheetStage = () => document.querySelector('.detail-drawer .cover-stage-detail');

/** Flies the cover when the sheet opens from the page and when it closes again. Walking from book to book inside the sheet does not fly. */
export function useCoverFlight(openId) {
  const reducedMotion = useReducedMotion();
  const flight = useRef(null);
  const previous = useRef(null);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = openId ?? null;
    if (reducedMotion || Boolean(before) === Boolean(openId)) return undefined;
    if (!openId) {
      // A reader who closes during the flight sends the cover back from where it is.
      if (flight.current?.running()) { flight.current.reverse(); return undefined; }
      const stage = sheetStage(), image = stage?.querySelector('img'), card = before && pageCover(before);
      if (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && card) flight.current = launchCover({ id: before, src: image.currentSrc || image.src, from: image.getBoundingClientRect(), to: card.getBoundingClientRect(), stage });
      return undefined;
    }
    if (flight.current?.running()) {
      // Opened again while it was on its way back: the same cover turns round where it is.
      if (flight.current.id === openId) { flight.current.reverse(); return undefined; }
      flight.current.cancel();
    }
    const card = pageCover(openId);
    if (!card) return undefined;
    const from = card.getBoundingClientRect(), src = card.currentSrc || card.src;
    // The sheet puts its pages on the screen a frame or two after it is told to open.
    let frames = 0, request = 0;
    const launch = () => {
      const stage = sheetStage();
      if (!stage) { if (++frames < 12) request = requestAnimationFrame(launch); return; }
      flight.current = launchCover({ id: openId, src, from, to: restingBox(stage.querySelector('img') ?? stage, stage.closest('.mantine-Drawer-content')), stage });
    };
    request = requestAnimationFrame(launch);
    return () => cancelAnimationFrame(request);
  }, [openId, reducedMotion]);
  useEffect(() => () => flight.current?.cancel(), []);
}
