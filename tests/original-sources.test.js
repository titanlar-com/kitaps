import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {displayTitle,translationStatus} from '../src/translation.js';
import {publicationUrl,workFormat} from '../src/workFormat.js';
import {ReadingPriorityEngine} from '../src/ranking/ReadingPriorityEngine.ts';
import {readingGraphFor} from '../src/ranking/readingGraph.ts';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/original-sources.json');
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const resolve=reference=>catalog.mapping[`originals:${reference}`]||reference;
const mapped=key=>byId[catalog.mapping[`originals:${key}`]];
const domain=url=>new URL(url).hostname.replace(/^www\./,'');
const validIsbn13=value=>/^\d{13}$/.test(value)&&[...value].reduce((sum,digit,index)=>sum+Number(digit)*(index%2?3:1),0)%10===0;
const LATER_REFERENCES=new Set(['founders','managerprep']);
const ROLES=['Özgün kaynak','Popüler sürüm','Eleştiri ve sınama','Boyd’a giriş','Hem yeni hem derin'];

test('every original-source entry is one catalog book in its concept group, with its role',()=>{
 const ids=source.books.map(item=>mapped(item.key)?.id);
 assert.ok(ids.every(Boolean));
 assert.equal(new Set(ids).size,source.books.length);
 assert.equal(catalog.collections.find(collection=>collection.id===source.id)?.count,source.books.length);
 for(const item of source.books){
  const book=mapped(item.key);
  assert.ok(ROLES.includes(item.role),item.key);
  const membership=book.memberships.find(entry=>entry.groupId===`${source.id}:${item.group}`);
  assert.equal(membership?.role,item.role,item.key);
  assert.ok(book.notes.some(note=>note.text===item.reason&&note.source===`${source.short} · ${item.role}`),item.key);
  // Catalog books keep their identity; new ones never merge into another work.
  if(item.existingId)assert.equal(book.id,item.existingId,item.key);
  // Collections added later may point at the same book by existingId; it is still one work.
  else assert.deepEqual(book.origins.filter(origin=>!LATER_REFERENCES.has(origin)),['originals'],item.key);
 }
});

test('every concept group pairs an original source with what it is compared to',()=>{
 const concepts=source.groups.filter(group=>group.id!=='ilk-uc');
 for(const group of concepts){
  const roles=source.books.filter(item=>item.group===group.id).map(item=>item.role);
  assert.ok(roles.includes('Özgün kaynak')||roles.includes('Boyd’a giriş'),group.id);
  assert.ok(roles.length>=2,group.id);
 }
});

test('with little time, the three texts to start with come in their order',()=>{
 const first=catalog.books
  .map(book=>({book,membership:book.memberships.find(entry=>entry.groupId===`${source.id}:ilk-uc`)}))
  .filter(entry=>entry.membership)
  .sort((left,right)=>left.membership.order-right.membership.order)
  .map(entry=>entry.book.id);
 assert.deepEqual(first,['outofthecrisis','dilemmasinageneraltheoryofplanning','psychologicalsafetyandlearningbehaviorinworkteams']);
});

test('new books show a Turkish edition verified on two websites, or say why not',()=>{
 for(const item of source.books.filter(entry=>!entry.existingId&&!entry.format)){
  const book=mapped(item.key);
  assert.ok(book.years.length>0,item.key);
  if(!item.edition){
   assert.ok(book.sourceIssue?.note||book.cover,item.key);
   assert.notEqual(translationStatus(book).status,'available',item.key);
   continue;
  }
  const edition=book.verifiedEdition;
  assert.ok(validIsbn13(edition.isbn),item.key);
  assert.notEqual(domain(edition.sourceUrl),domain(edition.secondSourceUrl),item.key);
  assert.equal(translationStatus(book).status,'available',item.key);
  assert.equal(displayTitle(book),item.titleTr,item.key);
  if(item.cover){
   assert.equal(book.cover.isbn,edition.isbn,item.key);
   assert.ok(fs.statSync(new URL(`../public/${item.cover.src}`,import.meta.url)).size>1000,item.key);
  }
 }
});

test('articles and essays name where they appeared and link to the text, never to an edition',()=>{
 const works=source.books.filter(item=>item.format);
 assert.ok(works.length>=7);
 for(const item of works){
  const book=mapped(item.key);
  assert.ok(workFormat(book),item.key);
  assert.ok(book.publication.venue,item.key);
  assert.match(publicationUrl(book.publication),/^https:\/\//,item.key);
  assert.ok(book.years.length>0,item.key);
  assert.equal(book.cover,undefined,item.key);
  assert.equal(book.verifiedEdition,undefined,item.key);
  assert.equal(translationStatus(book).status,'unverified',item.key);
 }
});

test('the review’s advice becomes reading relations, never a score',()=>{
 const graph=readingGraphFor(catalog);
 const related=(from,to)=>{
  const relations=graph.relations(from);
  return [...relations.before,...relations.after,...relations.companions].some(link=>link.id===to);
 };
 for(const item of source.books)assert.equal(['score','rank','weight'].some(field=>field in item),false,item.key);
 for(const link of source.links){
  if(link.type==='sequence'){
   const first=resolve(link.first),then=resolve(link.then);
   assert.ok(graph.relations(then).before.some(entry=>entry.id===first),`${link.first} → ${link.then}`);
   assert.ok(graph.relations(first).after.some(entry=>entry.id===then),`${link.first} → ${link.then}`);
  }else{
   const [left,right]=link.books.map(resolve);
   assert.ok(related(left,right)&&related(right,left),link.books.join(' + '));
  }
 }
 const ranked=Object.fromEntries(new ReadingPriorityEngine(catalog).rank().map(result=>[result.bookId,result]));
 for(const item of source.books)assert.equal(ranked[mapped(item.key).id]?.audience,'general',item.key);
});
