import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { displayTitle, translationStatus, turkishMeaning } from '../src/translation.js';
import { readingGraphFor } from '../src/ranking/readingGraph.ts';

const source=JSON.parse(fs.readFileSync(new URL('../data/foundational-reading.json',import.meta.url)));
const catalog=JSON.parse(fs.readFileSync(new URL('../src/catalog.json',import.meta.url)));
const allEntries=source.groups.flatMap(group=>group.books.map(book=>({...book,groupId:group.id})));
// Catalog books that are keys too keep their own record; the rest are new works.
const keys=allEntries.filter(entry=>entry.existingId);
const entries=allEntries.filter(entry=>!entry.existingId);
// The books to read first that are not keys themselves.
const startOnly=source.start.books.filter(id=>!catalog.books.find(book=>book.id===id)?.memberships.some(item=>item.collectionId===source.id&&item.groupId!==`${source.id}:${source.start.id}`));
const catalogIds=new Set(catalog.books.map(book=>book.id));
const categoryIds=new Set(catalog.categories.map(category=>category.id));

const mergedBook=entry=>catalog.books.find(book=>
 book.collectionIds.includes(source.id)&&(book.title===entry.title||book.aliases.includes(entry.title))
);

// The 50-book limit of the first research was lifted in October 2026; every
// addition still has to open specific catalog books.
test('foundational reading source contains 56 unique works and 2 catalog books as keys',()=>{
 assert.equal(entries.length,56);
 assert.equal(new Set(entries.map(book=>`${book.title}\u0000${book.author}`)).size,56);
 assert.deepEqual(keys.map(entry=>entry.existingId),['howasiaworks','innovators']);
 assert.equal(new Set(source.groups.map(group=>group.id)).size,source.groups.length);
});

test('every foundational recommendation has usable evidence and valid catalog relations',()=>{
 for(const entry of keys){
  assert.ok(catalogIds.has(entry.existingId),entry.existingId);
  assert.ok(entry.reason?.trim(),`${entry.existingId}: reason`);
  assert.ok(entry.unlocks?.length,`${entry.existingId}: unlocks`);
  for(const id of entry.unlocks)assert.ok(catalogIds.has(id),`${entry.existingId}: missing relation ${id}`);
 }
 for(const entry of entries){
  assert.match(entry.sourceUrl,/^https:\/\//,`${entry.title}: source URL`);
  assert.ok(entry.reason?.trim(),`${entry.title}: reason`);
  assert.ok(entry.categories?.length,`${entry.title}: categories`);
  assert.equal(new Set(entry.categories).size,entry.categories.length,`${entry.title}: duplicate category`);
  for(const category of entry.categories)assert.ok(categoryIds.has(category),`${entry.title}: unknown category ${category}`);
  const relations=[...(entry.unlocks||[]),...(entry.companions||[])];
  assert.ok(relations.length,`${entry.title}: relations`);
  assert.equal(new Set(relations).size,relations.length,`${entry.title}: duplicate relation`);
  for(const id of relations)assert.ok(catalogIds.has(id),`${entry.title}: missing relation ${id}`);
 }
});

test('all foundational books survive the merge in one collection',()=>{
 const collection=catalog.collections.find(item=>item.id===source.id);
 const merged=catalog.books.filter(book=>book.collectionIds.includes(source.id));
 assert.deepEqual(startOnly,['personalmbamastertheartofbusiness','100bestbusinessbooksofalltime','askeristratejinintemellerikuramcilar']);
 assert.equal(collection?.count,entries.length+keys.length+startOnly.length);
 assert.equal(merged.length,entries.length+keys.length+startOnly.length);
 for(const entry of keys){
  const book=catalog.books.find(item=>item.id===entry.existingId);
  assert.ok(book.memberships.some(item=>item.groupId===`${source.id}:${entry.groupId}`),`${entry.existingId}: membership`);
  for(const id of entry.unlocks)assert.ok(readingGraphFor(catalog).relations(id).before.some(link=>link.id===entry.existingId),`${entry.existingId} → ${id}`);
 }
 for(const entry of entries){
  const matches=merged.filter(book=>book.title===entry.title||book.aliases.includes(entry.title));
  assert.equal(matches.length,1,`${entry.title}: merged record`);
  assert.ok(matches[0].memberships.some(item=>item.collectionId===source.id&&item.groupId===`${source.id}:${entry.groupId}`),`${entry.title}: membership`);
 }
});

test('the books to read first lead the collection in their order',()=>{
 const group=`${source.id}:${source.start.id}`;
 assert.equal(catalog.collections.find(item=>item.id===source.id).groupIds[0],group);
 const ordered=catalog.books
  .map(book=>({id:book.id,membership:book.memberships.find(item=>item.groupId===group)}))
  .filter(item=>item.membership)
  .sort((left,right)=>left.membership.order-right.membership.order)
  .map(item=>item.id);
 assert.deepEqual(ordered,source.start.books);
});

test('reading-order advice becomes relations and the method notes stay on their books',()=>{
 const graph=readingGraphFor(catalog);
 const resolve=reference=>catalog.mapping[`foundations:${reference}`]||reference;
 for(const link of source.links){
  assert.equal(link.type,'sequence');
  const first=resolve(link.first),then=resolve(link.then);
  assert.ok(graph.relations(then).before.some(entry=>entry.id===first),`${link.first} → ${link.then}`);
 }
 for(const [id,text] of Object.entries(source.notes))assert.ok(catalog.books.find(book=>book.id===id).notes.some(note=>note.text===text),id);
});

test('foundational titles follow the verified-edition display rule',()=>{
 for(const entry of entries){
  const book=mergedBook(entry);
  assert.ok(book,entry.title);
  // A Turkish edition confirmed by the two-stage research supplies its title.
  const researched=book.translationResearch?.status==='available'?(book.translationResearch.edition?.title||'').trim():'';
  // An English "Turkish title" is no Turkish title; it is stored empty.
  const storedTurkish=researched||(entry.titleTr===entry.title&&book.cover?.language!=='tr'?'':entry.titleTr??'');
  assert.equal(book.titleTr,storedTurkish,`${entry.title}: stored Turkish meaning`);
  if(book.cover?.language==='tr'){
   const original=book.verifiedEdition?.originalLanguage==='tr';
   assert.equal(translationStatus(book).status,original?'original':'available',`${entry.title}: translation status`);
   assert.equal(displayTitle(book),researched||entry.titleTr,`${entry.title}: displayed Turkish title`);
   assert.equal(turkishMeaning(book),'',`${entry.title}: redundant Turkish meaning`);
  }else if(researched){
   assert.equal(translationStatus(book).status,'available',`${entry.title}: researched translation status`);
   assert.equal(displayTitle(book),researched,`${entry.title}: researched Turkish title`);
  }else{
   assert.equal(translationStatus(book).status,'unverified',`${entry.title}: translation status`);
   assert.equal(displayTitle(book),entry.title,`${entry.title}: displayed original title`);
   assert.equal(turkishMeaning(book),storedTurkish===entry.title?'':storedTurkish,`${entry.title}: Turkish meaning`);
  }
 }
});

test('each foundational book has either a verified local cover or an explicit source issue',()=>{
 for(const entry of entries){
  const book=mergedBook(entry);
  assert.ok(book,entry.title);
  if(entry.cover){
   assert.match(entry.cover.sourceUrl,/^https:\/\//,`${entry.title}: cover source`);
   assert.match(entry.cover.imageUrl,/^https:\/\//,`${entry.title}: cover image source`);
   assert.ok(['en','tr'].includes(entry.cover.language),`${entry.title}: cover language`);
   assert.ok(fs.existsSync(new URL(`../public/${entry.cover.src}`,import.meta.url)),`${entry.title}: local cover file`);
   assert.ok(book.cover?.src,`${entry.title}: merged cover`);
   assert.ok(fs.existsSync(new URL(`../public/${book.cover.src}`,import.meta.url)),`${entry.title}: merged local cover file`);
   assert.equal(book.sourceIssue,undefined,`${entry.title}: unexpected source issue`);
  }else if(entry.format){
   // An essay has no cover: its page names where it appeared and links to the text.
   assert.equal(book.cover,undefined,`${entry.title}: unexpected cover`);
   assert.match(book.publication?.readUrl||'',/^https:\/\//,`${entry.title}: text link`);
  }else{
   assert.equal(book.cover,undefined,`${entry.title}: unexpected cover`);
   assert.ok(book.sourceIssue?.note?.trim(),`${entry.title}: missing source issue`);
  }
 }
});
