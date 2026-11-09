// The catalogue as the page reads it: the core's one index, under the names the screens use.
import catalogDocument from '../../../catalog.json';
import { download } from '../../../download';
import { createBooksExport } from '../../../catalogExport';
import { openCatalog } from '../../../core/catalog/contract.ts';
import { indexCatalog } from '../../../core/catalog/catalog.ts';

// The gate: a catalogue this code cannot read stops here and says why (ADR 003, K10).
export const catalogIndex=indexCatalog(openCatalog(catalogDocument));
/** The catalogue as the build wrote it, for screens that read its lists and notes. */
export const catalog=catalogIndex.document;
export const books=catalogIndex.books;
export const bookIds=books.map(book=>book.id);
// Reading priority is a pure function of the catalog: no personal state is an input.
export const readingRanking=catalogIndex.ranking;
export const byId=catalogIndex.byId;
export const collectionMap=catalogIndex.collectionById;
export const groupMap=catalogIndex.groupById;
export const categoryMap=catalogIndex.categoryById;
export const authorOptions=catalogIndex.authors;
export const exportAllBooks=()=>download('kitaplik-tum-kitaplar.json',createBooksExport(catalog));
