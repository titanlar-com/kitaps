import { describe, expect, it } from 'vitest';
import catalog from '../../src/catalog.json';
import { authorOptions, books, bookIds, byId, readingRanking } from '../../src/ui/react/app/catalogData.js';
import { openCatalog } from '../../src/core/catalog/contract.ts';
import { indexCatalog } from '../../src/core/catalog/catalog.ts';

// The core's catalogue index gives what the live catalogData.js gives today (ADR 003, phase 4).
// Vite loads catalogData.js here, which plain Node cannot (JSON and extensionless imports).
describe('the core catalogue index and catalogData.js', () => {
  const core = indexCatalog(openCatalog(catalog));
  it('hold the same books, ids, author list and lookup', () => {
    expect(core.books).toEqual(books);
    expect(core.books.map(book => book.id)).toEqual(bookIds);
    expect(core.authors).toEqual(authorOptions);
    for (const id of bookIds.slice(0, 50)) expect(core.byId[id]).toEqual(byId[id]);
  });
  it('rank the books the same way', () => {
    expect(core.ranking.ordered.map(item => [item.bookId, item.rank, item.score])).toEqual(readingRanking.ordered.map(item => [item.bookId, item.rank, item.score]));
  });
});
