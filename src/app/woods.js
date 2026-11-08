// The wood colour schemes a reader can choose (the owner's decision of 8 November 2026). The
// colours live in src/woods.css; index.html sets the saved scheme before the first paint.
export const WOODS = [
  { id: 'ceviz', label: 'Ceviz', note: 'Koyu kahve zemin, pirinç sarısı vurgu' },
  { id: 'mese', label: 'Meşe', note: 'İsli zeytin zemin, yaprak yeşili vurgu' },
  { id: 'akasya', label: 'Akasya', note: 'Kızıl siyah zemin, turkuaz vurgu' },
];
export const DEFAULT_WOOD = 'ceviz';
export const WOOD_KEY = 'kitapatlasi:wood';

const known = id => WOODS.some(wood => wood.id === id);

export function readWood(storage) {
  try {
    const saved = storage.getItem(WOOD_KEY);
    return known(saved) ? saved : DEFAULT_WOOD;
  } catch {
    return DEFAULT_WOOD;
  }
}

// A storage that refuses the value only means the choice lasts until the page is closed.
export function saveWood(id, storage) {
  try { storage.setItem(WOOD_KEY, id); } catch { /* the choice still applies to this page */ }
}
