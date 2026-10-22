import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {displayTitle,translationStatus} from '../src/translation.js';
import {ReadingPriorityEngine} from '../src/ranking/ReadingPriorityEngine.ts';
import {readingGraphFor} from '../src/ranking/readingGraph.ts';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const shelf=read('../data/shelf-review.json');
const originals=read('../data/original-sources.json');
// Later reviews that may list a shelf book again, by naming it with existingId.
const laterReviews={originals,founders:read('../data/management-founders.json'),managerprep:read('../data/manager-foundations.json'),managerareas:read('../data/manager-reading-areas.json'),shelfphotos:read('../data/shelf-photos.json'),peker:read('../data/peker-videos.json'),stoic:read('../data/stoicism-for-managers.json')};
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const resolve=reference=>catalog.mapping[`shelf:${reference}`]||reference;
const mapped=key=>byId[catalog.mapping[`shelf:${key}`]];
const domain=url=>new URL(url).hostname.replace(/^www\./,'');
const validIsbn13=value=>/^\d{13}$/.test(value)&&[...value].reduce((sum,digit,index)=>sum+Number(digit)*(index%2?3:1),0)%10===0;

test('every shelf recommendation is one catalog book in the shelf collection',()=>{
 const ids=shelf.books.map(item=>mapped(item.key)?.id);
 assert.ok(ids.every(Boolean));
 assert.equal(new Set(ids).size,shelf.books.length);
 assert.equal(catalog.collections.find(collection=>collection.id===shelf.id)?.count,shelf.books.length);
 for(const item of shelf.books){
  const book=mapped(item.key);
  assert.ok(book.groupIds.includes(`${shelf.id}:${item.group}`),item.key);
  // Books already in the catalog keep their identity; new ones never merge into another work.
  // A later review may list it too, but only by naming it (İnsanlık 2.0 among the original sources,
  // the Effective Executive workbook among the reading areas).
  if(item.existingId)assert.equal(book.id,item.existingId,item.key);
  else{
   assert.equal(book.origins[0],'shelf',item.key);
   for(const origin of book.origins.slice(1))assert.ok(laterReviews[origin]?.books.some(entry=>entry.existingId===book.id),`${item.key}: ${origin}`);
  }
 }
});

test('new shelf books show a Turkish edition verified on two websites, or say why not',()=>{
 for(const item of shelf.books.filter(entry=>!entry.existingId)){
  const book=mapped(item.key);
  assert.ok(book.years.length>0,item.key);
  if(!item.edition){
   assert.ok(book.sourceIssue?.note,item.key);
   assert.equal(translationStatus(book).status,'unverified',item.key);
   continue;
  }
  const edition=book.verifiedEdition;
  assert.ok(validIsbn13(edition.isbn),item.key);
  assert.notEqual(domain(edition.sourceUrl),domain(edition.secondSourceUrl),item.key);
  assert.equal(translationStatus(book).status,item.originalLanguage==='tr'?'original':'available',item.key);
  assert.equal(displayTitle(book),item.titleTr,item.key);
  if(item.cover){
   assert.equal(book.cover.isbn,edition.isbn,item.key);
   assert.ok(fs.statSync(new URL(`../public/${item.cover.src}`,import.meta.url)).size>1000,item.key);
  }
 }
});

test('shelf advice becomes reading relations and notes, never a score',()=>{
 const graph=readingGraphFor(catalog);
 const related=(from,to)=>{
  const relations=graph.relations(from);
  return [...relations.before,...relations.after,...relations.companions].some(link=>link.id===to);
 };
 for(const item of shelf.books)assert.equal(['score','rank','weight'].some(field=>field in item),false,item.key);
 for(const link of shelf.links){
  if(link.type==='sequence'){
   const first=resolve(link.first),then=resolve(link.then);
   assert.ok(graph.relations(then).before.some(entry=>entry.id===first),`${link.first} → ${link.then}`);
   assert.ok(graph.relations(first).after.some(entry=>entry.id===then),`${link.first} → ${link.then}`);
  }else{
   const [left,right]=link.books.map(resolve);
   assert.ok(related(left,right)&&related(right,left),link.books.join(' + '));
  }
 }
 for(const [id,text] of Object.entries(shelf.lookAlikes))assert.ok(byId[id].notes.some(entry=>entry.text===text),id);
});

test('shelf books are ranked by the same engine, children’s books among children’s books',()=>{
 const ranked=Object.fromEntries(new ReadingPriorityEngine(catalog).rank().map(result=>[result.bookId,result]));
 for(const item of shelf.books){
  const book=mapped(item.key);
  assert.ok(ranked[book.id],item.key);
  assert.equal(ranked[book.id].audience,book.categories.includes('children')?'children':'general',item.key);
 }
 assert.equal(ranked[resolve('zen-ogreten-kedi')].audience,'children');
});
