import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pageCount,shownIsbn} from '../src/pages.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const counts=read('../data/page-counts.json');
const catalog=read('../src/catalog.json');
const valid13=value=>/^\d{13}$/.test(value)&&[...value].reduce((sum,digit,index)=>sum+Number(digit)*(index%2?3:1),0)%10===0;

test('every page count belongs to one valid ISBN and names where it was read',()=>{
 assert.equal(counts.schemaVersion,1);
 assert.match(counts.policy,/ISBN/);
 for(const [isbn,record] of Object.entries(counts.records)){
  assert.ok(valid13(isbn),isbn);
  assert.ok(Number.isInteger(record.pages)&&record.pages>0&&record.pages<20000,isbn);
  assert.match(record.sourceUrl,/^https:\/\//,isbn);
  assert.ok(record.sourceName,isbn);
  assert.match(record.checkedAt,/^\d{4}-\d{2}-\d{2}$/,isbn);
 }
});

test('a book carries only the counts of ISBNs it can show',()=>{
 for(const book of catalog.books){
  if(!book.pageCounts)continue;
  const own=[book.verifiedEdition?.isbn,book.translationResearch?.edition?.isbn,book.cover?.isbn].filter(Boolean).map(value=>value.replace(/[^0-9Xx]/g,'').toUpperCase());
  for(const isbn of Object.keys(book.pageCounts))assert.ok(own.some(value=>value===isbn||value.length===10&&isbn.slice(3,12)===value.slice(0,9)),`${book.id}: ${isbn}`);
 }
});

test('the page shows the count of the printing it shows, never another printing’s',()=>{
 const cover={isbn:'9780393324860',language:'en'};
 const counted={pageCounts:{'9780393324860':{pages:260,sourceUrl:'https://openlibrary.org/isbn/9780393324860',sourceName:'Open Library'}}};
 assert.equal(shownIsbn({cover}),'9780393324860');
 assert.equal(pageCount({cover,...counted}).pages,260);
 // A Turkish edition is shown instead of the cover; the cover's count does not stand in for it.
 const turkish={cover,verifiedEdition:{title:'Çıplak Ekonomi',isbn:'9786053435679',publisher:'Pegasus',translators:['Giray Ergin'],sourceUrl:'https://www.kitapyurdu.com/kitap/ciplak-ekonomi/368459.html'},...counted};
 assert.equal(shownIsbn(turkish),'9786053435679');
 assert.equal(pageCount(turkish),null);
 // An ISBN-10 on a cover finds the count kept under its ISBN-13.
 assert.equal(pageCount({cover:{isbn:'0393324869',language:'en'},...counted}).pages,260);
 assert.equal(pageCount({}),null);
});

test('most shown printings have a count',()=>{
 const shown=catalog.books.filter(book=>shownIsbn(book));
 const known=shown.filter(book=>pageCount(book));
 assert.ok(known.length/shown.length>0.8,`${known.length} of ${shown.length}`);
});
