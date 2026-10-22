import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {displayTitle,translationStatus} from '../src/translation.js';

const source=JSON.parse(fs.readFileSync(new URL('../data/preparatory-reading-tr.json',import.meta.url)));
const covers=JSON.parse(fs.readFileSync(new URL('../data/preparatory-reading-covers.json',import.meta.url)));
const catalog=JSON.parse(fs.readFileSync(new URL('../src/catalog.json',import.meta.url)));
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const mapped=item=>byId[catalog.mapping[`preparation:${item.id}`]];

test('ten preparation recommendations merge as ten memberships and eight new works',()=>{
 assert.equal(source.count,10);
 assert.deepEqual(source.books.map(item=>item.okumaSirasi),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(new Set(source.books.map(item=>item.id)).size,10);
 assert.equal(catalog.collections.find(item=>item.id==='preparation')?.count,10);
 assert.equal(catalog.books.filter(book=>book.origins.includes('preparation')).length,10);
 // Collections added later may point at these books by existingId; they stay the same eight new works.
 const later=new Set(['managerprep','managerareas','shelfphotos','peker','stoic']);
 assert.equal(source.books.filter(item=>mapped(item).origins.filter(origin=>!later.has(origin)).length===1).length,8);
 for(const item of source.books)assert.ok(mapped(item)?.collectionIds.includes('preparation'),item.id);
});

test('preparation editions and covers retain their supplied evidence',()=>{
 for(const item of source.books){
  const book=mapped(item);const cover=covers[item.id];
  assert.ok(book,item.id);
  assert.equal(book.titleTr,item.turkceAdi,item.id);
  assert.equal(book.verifiedEdition.isbn,item.turkceBaskiISBN13,item.id);
  assert.equal(book.verifiedEdition.publisher,item.turkiyeYayinevi,item.id);
  assert.deepEqual(book.verifiedEdition.translators,item.onerilenCevirmenler,item.id);
  assert.equal(book.cover.src,cover.src,item.id);
  assert.equal(book.cover.language,'tr',item.id);
  assert.ok(fs.existsSync(new URL(`../public/${cover.src}`,import.meta.url)),item.id);
  assert.match(book.verifiedEdition.sourceUrl,/^https:\/\//,item.id);
  const originalTurkish=item.orijinalAdi===item.turkceAdi&&item.onerilenCevirmenler.length===0;
  assert.equal(translationStatus(book).status,originalTurkish?'original':'available');
  assert.equal(displayTitle(book),item.turkceAdi,item.id);
 }
});

test('preparation advice is metadata and relations, never a direct score',()=>{
 for(const item of source.books){
  assert.equal('score' in item,false,item.id);
  const book=mapped(item);
  assert.equal(book.preparation.order,item.okumaSirasi,item.id);
  assert.equal(book.preparation.stage,item.asama,item.id);
  assert.deepEqual(book.preparation.concepts,item.calisilmasiOnerilenKavramlar,item.id);
  assert.equal(book.preparation.readingMethod,item.onerilenOkumaBicimi,item.id);
  const after=catalog.readingGuides.overrides[book.id]?.after||[];
  assert.ok(after.length>=item.ornekHedefEserler.length,item.id);
  const reciprocal=after.filter(link=>(catalog.readingGuides.overrides[link.id]?.before||[]).some(candidate=>candidate.id===book.id));
  assert.ok(reciprocal.length>=item.ornekHedefEserler.length,item.id);
  for(const link of reciprocal){
   assert.ok(byId[link.id],`${item.id}:${link.id}`);
   assert.ok((catalog.readingGuides.overrides[link.id]?.before||[]).some(candidate=>candidate.id===book.id),`${item.id}:${link.id}: reciprocal relation`);
  }
 }
});
