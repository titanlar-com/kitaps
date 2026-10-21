import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {displayTitle,translationStatus} from '../src/translation.js';
import {readingGraphFor} from '../src/ranking/readingGraph.ts';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/manager-foundations.json');
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const mapped=key=>byId[catalog.mapping[`managerprep:${key}`]];
const resolve=reference=>catalog.mapping[`managerprep:${reference}`]||reference;
const domain=url=>new URL(url).hostname.replace(/^www\./,'');
const validIsbn13=value=>/^\d{13}$/.test(value)&&[...value].reduce((sum,digit,index)=>sum+Number(digit)*(index%2?3:1),0)%10===0;
const inGroup=group=>catalog.books
 .map(book=>({id:book.id,membership:book.memberships.find(entry=>entry.groupId===`${source.id}:${group}`)}))
 .filter(entry=>entry.membership)
 .sort((left,right)=>(left.membership.order??0)-(right.membership.order??0))
 .map(entry=>entry.id);

test('every book of the manager-candidate programme is one catalog book in its stage, with its role',()=>{
 const ids=source.books.map(item=>mapped(item.key)?.id);
 assert.ok(ids.every(Boolean));
 assert.equal(new Set(ids).size,source.books.length);
 assert.equal(catalog.collections.find(collection=>collection.id===source.id)?.count,source.books.length);
 for(const item of source.books){
  const book=mapped(item.key);
  assert.equal(book.memberships.find(entry=>entry.groupId===`${source.id}:${item.group}`)?.role,item.role,item.key);
  if(item.existingId)assert.equal(book.id,item.existingId,item.key);
  else assert.deepEqual(book.origins,['managerprep'],item.key);
 }
});

test('the programme runs through twelve books in three stages, with its first three and its short way',()=>{
 const programme=['personalmba','finansciolmayanlaricinfinans','decisive','nakedeconomics','nakedstatistics','invitationtosociology','radicalcandor','fivedysfunctions','gettingtoyes','thinkinginsystems','goal','first90days'];
 assert.deepEqual(inGroup('program'),programme.map(resolve));
 const stage=key=>source.books.find(item=>item.key===key).group;
 assert.deepEqual(programme.map(stage),['asama-1','asama-1','asama-1','asama-1','asama-1','asama-2','asama-2','asama-2','asama-2','asama-3','asama-3','asama-3']);
 assert.deepEqual(inGroup('ilk-uc').map(id=>byId[id].author),['Josh Kaufman','Hakan Özerol','Chip Heath and Dan Heath']);
 assert.deepEqual(inGroup('kisa-yol'),[resolve('personalmba'),resolve('finansciolmayanlaricinfinans'),resolve('nakedeconomics'),resolve('decisive'),resolve('radicalcandor'),resolve('thinkinginsystems')]);
 assert.deepEqual(new Set(inGroup('ilk-kez-yonetecekler')),new Set([resolve('radicalcandor'),resolve('fivedysfunctions')]));
});

test('new books show a Turkish edition verified on two websites, or say why not',()=>{
 for(const item of source.books.filter(entry=>!entry.existingId)){
  const book=mapped(item.key);
  if(!item.edition){
   assert.ok(book.sourceIssue?.note,item.key);
   assert.notEqual(translationStatus(book).status,'available',item.key);
   continue;
  }
  const edition=book.verifiedEdition;
  assert.ok(validIsbn13(edition.isbn),item.key);
  assert.notEqual(domain(edition.sourceUrl),domain(edition.secondSourceUrl),item.key);
  assert.ok(['available','original'].includes(translationStatus(book).status),item.key);
  assert.equal(displayTitle(book),item.titleTr||item.title,item.key);
  if(item.cover)assert.equal(book.cover.isbn,edition.isbn,item.key);
 }
});

test('each part of the programme points to the classics it prepares for',()=>{
 const graph=readingGraphFor(catalog);
 assert.ok(source.links.length>=15);
 for(const link of source.links){
  assert.equal(link.type,'sequence');
  assert.ok(graph.relations(resolve(link.then)).before.some(entry=>entry.id===resolve(link.first)),`${link.first} → ${link.then}`);
 }
 // Founders' books the programme leads to.
 for(const id of ['practiceofmanagement','competitivestrategy','outofthecrisis','burokrasiveotorite','goodtogreat','innovatorsdilemma'])assert.ok(source.links.some(link=>link.then===id),id);
});
