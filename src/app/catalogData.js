// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import catalog from '../catalog.json';
import { download } from '../download';
import { ReadingPriorityEngine, ReadingRankingViewModel } from '../ranking/ReadingPriorityEngine.ts';
import { createBooksExport } from '../catalogExport';
import { prepareBooks, migrateStates } from '../library';

export const books=prepareBooks(catalog.books);
export const bookIds=books.map(book=>book.id);
// Reading priority is a pure function of the catalog: no personal state is an input.
export const readingRanking=new ReadingRankingViewModel(new ReadingPriorityEngine(catalog)).build();
export const byId=Object.fromEntries(books.map(b=>[b.id,b]));
export const collectionMap=Object.fromEntries(catalog.collections.map(c=>[c.id,c]));
export const groupMap=Object.fromEntries(catalog.groups.map(g=>[g.id,g]));
export const categoryMap=Object.fromEntries(catalog.categories.map(c=>[c.id,c]));
export const STATE_KEY='kitapatlasi:states:v2';

export const authorOptions=[...new Set(books.map(b=>b.author).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
export const safeRead=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}};
export const loadStates=()=>migrateStates(books,safeRead(STATE_KEY),safeRead('kitaps:states:v1'));
export const exportAllBooks=()=>download('kitaplik-tum-kitaplar.json',createBooksExport(catalog));
