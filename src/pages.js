import {translationStatus,turkishEdition} from './translation.js';

const isbn13=value=>{
 let digits=String(value||'').replace(/[^0-9Xx]/g,'').toUpperCase();
 if(digits.length===10){
  const core=`978${digits.slice(0,9)}`;
  digits=core+String((10-[...core].reduce((sum,digit,index)=>sum+Number(digit)*(index%2?3:1),0)%10)%10);
 }
 return /^\d{13}$/.test(digits)?digits:'';
};

/** The ISBN the book page shows: its Turkish edition's, or else its cover's. */
export function shownIsbn(book){
 const status=translationStatus(book).status;
 const edition=status==='available'||status==='original'?turkishEdition(book):null;
 return isbn13(edition?.isbn||book.cover?.isbn);
}

/** The page count of that printing, with where it was read; null while unknown.
 * A count is never borrowed from another printing of the same work. */
export function pageCount(book){
 const isbn=shownIsbn(book);
 return (isbn&&book.pageCounts?.[isbn])||null;
}
