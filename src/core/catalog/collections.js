import { normalize } from './query.js';

/** How many covers stand for a collection on its card. */
const PREVIEW_COVERS = 4;

/** What the Kümeler page shows for each collection (ADR 003, K14): how many of its books are read,
 * the first covers that stand for it, and the book count of each of its parts. A book in two
 * collections counts in both. Only the Okundu mark counts as read. With a search, only the
 * collections whose title or description match it are given, in the catalogue's order. */
export function collectionCards({ collections, books, states = {}, groups = {}, query = '' }) {
  const wanted = normalize(query);
  const shown = collections.filter(item => normalize(`${item.title} ${item.description}`).includes(wanted));
  const tallies = new Map(shown.map(item => [item.id, { total: 0, read: 0, previews: [] }]));
  const groupCounts = new Map();
  for (const book of books) {
    const isRead = (states[book.id] || []).includes('okundu');
    for (const id of book.collectionIds) {
      const tally = tallies.get(id);
      if (!tally) continue;
      tally.total += 1;
      if (isRead) tally.read += 1;
      if (book.cover && tally.previews.length < PREVIEW_COVERS) tally.previews.push(book);
    }
    for (const id of book.groupIds) groupCounts.set(id, (groupCounts.get(id) || 0) + 1);
  }
  return shown.map(collection => {
    const { total, read, previews } = tallies.get(collection.id);
    return {
      collection, total, read, previews,
      share: total ? read / total : 0,
      done: total > 0 && read === total,
      groups: collection.groupIds.map(id => ({ id, title: groups[id]?.title, count: groupCounts.get(id) || 0 })),
    };
  });
}

/** A share as a Turkish percentage. One under one percent keeps a decimal, so a read book never shows as %0. */
export const sharePercent = share => new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: share > 0 && share < 0.01 ? 1 : 0 }).format(share < 1 ? Math.min(share, 0.99) : share);
