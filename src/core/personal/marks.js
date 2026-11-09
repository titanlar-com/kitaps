import { STATE_LABELS } from '../text.js';
// A reader's marks on a book (ADR 003, phase 7a), moved verbatim from src/library.js, which
// re-exports them. Pure and framework-free.
export { STATE_LABELS };
export function toggleState(current, key) {
 const result = new Set(current || []);
 if (result.has(key)) result.delete(key);
 else {
  result.add(key);
  const opposite = { alinacak: 'alindi', alindi: 'alinacak', okunuyor: 'okundu', okundu: 'okunuyor' }[key];
  if (opposite) result.delete(opposite);
  const readingStates=['okunuyor','okundu','araverildi','birakildi'];
  if(readingStates.includes(key)){
   for(const state of readingStates)if(state!==key)result.delete(state);
   // The owner, 8 November 2026: a book that is being read has been bought. The lists stay
   // separate, so taking either mark off later leaves the other one alone.
   result.add('alindi');result.delete('alinacak');
  }
 }
 return [...result];
}
export function migrateStates(books, own, legacy) {
 const result = Object.fromEntries(Object.entries(own || {}).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.filter(s=>s in STATE_LABELS)]));
 for (const b of books) {
  if (Object.hasOwn(result,b.id)) continue;
  const values = b.legacyKeys.flatMap(k => Array.isArray(legacy?.[k]) ? legacy[k] : []).filter(s => s in STATE_LABELS);
  if (values.length) result[b.id] = [...new Set(values)];
 }
 return result;
}
