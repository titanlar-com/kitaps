// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import catalog from '../catalog.json';
import { download } from '../download';
import { ReadingPriorityEngine, ReadingRankingViewModel } from '../ranking/ReadingPriorityEngine.ts';
import { createBooksExport } from '../catalogExport';
import { prepareBooks } from '../library';
import { browserStorage } from '../adapters/browser/ports.js';
import { createPersonalLibrary } from '../core/personal/library.ts';

export const books=prepareBooks(catalog.books);
export const bookIds=books.map(book=>book.id);
// Reading priority is a pure function of the catalog: no personal state is an input.
export const readingRanking=new ReadingRankingViewModel(new ReadingPriorityEngine(catalog)).build();
export const byId=Object.fromEntries(books.map(b=>[b.id,b]));
export const collectionMap=Object.fromEntries(catalog.collections.map(c=>[c.id,c]));
export const groupMap=Object.fromEntries(catalog.groups.map(g=>[g.id,g]));
export const categoryMap=Object.fromEntries(catalog.categories.map(c=>[c.id,c]));

export const authorOptions=[...new Set(books.map(b=>b.author).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
// Reached at each use: a browser that blocks storage throws on the name itself.
const deviceStorage=browserStorage({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
/** The reader's data on this device (ADR 003, phase 7a). */
export const openPersonalLibrary=()=>createPersonalLibrary({storage:deviceStorage,books,now:()=>new Date()});
export const exportAllBooks=()=>download('kitaplik-tum-kitaplar.json',createBooksExport(catalog));
