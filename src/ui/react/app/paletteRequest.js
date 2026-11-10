// The quick search's code arrives a moment after it is first asked for. The reader may move on in
// that moment: press Escape, press somewhere on the page, or open a book or another dialog. A
// request opens the quick search only if none of that happened since it was made.

/** @typedef {{ dialogs: Set<Element>, dropped: boolean }} PaletteRequest */

/** Notes which dialogs are open as the reader asks for the quick search. @returns {PaletteRequest} */
export function askForPalette(doc = document) {
  return { dialogs: new Set(doc.querySelectorAll('[aria-modal="true"]')), dropped: false };
}

/** The reader moved on before the quick search arrived. @param {PaletteRequest | null} ask */
export function dropPaletteRequest(ask) {
  if (ask) ask.dropped = true;
}

/** Whether the quick search may still open: nothing dropped the request, and no dialog has opened since. @param {PaletteRequest | null} ask */
export function paletteStillWanted(ask, doc = document) {
  if (!ask || ask.dropped) return false;
  return [...doc.querySelectorAll('[aria-modal="true"]')].every(dialog => ask.dialogs.has(dialog));
}
