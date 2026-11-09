import { afterEach, describe, expect, it, vi } from 'vitest';
import catalog from '../../src/catalog.json';
import { CatalogContractError } from '../../src/core/catalog/contract.ts';

// The page opens the catalogue through the whole contract, as the build does (ADR 003, K10,
// changed on the owner's word on 9 November 2026).
describe('the catalogue the page opens', () => {
  afterEach(() => { vi.doUnmock('../../src/catalog.json'); vi.resetModules(); });

  it('is refused when a book points to a collection that does not exist', async () => {
    const [first, ...rest] = catalog.books;
    vi.doMock('../../src/catalog.json', () => ({ default: { ...catalog, books: [{ ...first, collectionIds: ['yok-boyle-bir-kume'] }, ...rest] } }));
    await expect(import('../../src/app/catalogData')).rejects.toSatisfy(error => error.name === CatalogContractError.name && /yok-boyle-bir-kume/.test(error.message));
  });

  it('opens the real catalogue', async () => {
    const data = await import('../../src/app/catalogData');
    expect(data.books.length).toBe(catalog.books.length);
  });
});
