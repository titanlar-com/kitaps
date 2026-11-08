import { QUEUE_LIMIT, progressPercent, readingErrors } from './reading.js';

// The marks that say how the reading stands. A purchase or a favourite says nothing about that.
const READING_MARKS = ['okunuyor', 'araverildi', 'birakildi', 'okundu'];

/** What the Sıram page shows (ADR 003, K14): the reader's books in their order, where each can
 * still move, and what is known of its reading. A book the catalogue no longer has is left out, so
 * the numbers stay in one run. Page progress shows only when the record makes sense. */
export function queueView({ queue, books, reading = {}, states = {} }) {
  const known = queue.filter(id => books[id]);
  const rows = known.map((id, index) => {
    const record = reading[id];
    const percent = progressPercent(record);
    const marks = states[id] || [];
    return {
      id,
      book: books[id],
      position: index + 1,
      canMoveUp: index > 0,
      canMoveDown: index < known.length - 1,
      marks: READING_MARKS.filter(mark => marks.includes(mark)),
      read: marks.includes('okundu'),
      progress: percent !== null && !readingErrors(record).pages ? { page: record.page, totalPages: record.totalPages, percent } : null,
    };
  });
  return { rows, free: Math.max(0, QUEUE_LIMIT - rows.length), full: rows.length >= QUEUE_LIMIT };
}
