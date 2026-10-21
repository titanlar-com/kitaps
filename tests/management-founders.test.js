import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {displayTitle,translationStatus} from '../src/translation.js';
import {readingGraphFor} from '../src/ranking/readingGraph.ts';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/management-founders.json');
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const mapped=key=>byId[catalog.mapping[`founders:${key}`]];
const resolve=reference=>catalog.mapping[`founders:${reference}`]||reference;
const domain=url=>new URL(url).hostname.replace(/^www\./,'');
const validIsbn13=value=>/^\d{13}$/.test(value)&&[...value].reduce((sum,digit,index)=>sum+Number(digit)*(index%2?3:1),0)%10===0;
const inGroup=group=>catalog.books
 .map(book=>({id:book.id,membership:book.memberships.find(entry=>entry.groupId===`${source.id}:${group}`)}))
 .filter(entry=>entry.membership)
 .sort((left,right)=>left.membership.order-right.membership.order)
 .map(entry=>entry.id);

test('every work of the nine thinkers is one catalog book in its question’s group, with its role',()=>{
 const ids=source.books.map(item=>mapped(item.key)?.id);
 assert.ok(ids.every(Boolean));
 assert.equal(new Set(ids).size,source.books.length);
 assert.equal(catalog.collections.find(collection=>collection.id===source.id)?.count,source.books.length);
 for(const item of source.books){
  const book=mapped(item.key);
  assert.equal(book.memberships.find(entry=>entry.groupId===`${source.id}:${item.group}`)?.role,item.role,item.key);
  if(item.existingId)assert.equal(book.id,item.existingId,item.key);
  else assert.deepEqual(book.origins,['founders'],item.key);
 }
 // Each thinker has exactly one first choice.
 const firsts=source.books.filter(item=>item.role==='Birinci tercih').map(item=>item.key);
 assert.equal(firsts.length,9);
});

test('the suggested order runs through the nine first choices, and three books stand alone',()=>{
 assert.deepEqual(inGroup('okuma-sirasi'),['competitivestrategy','practiceofmanagement','innovatorsdilemma','outofthecrisis','goodtogreat','administrationindustrielleetgenerale','burokrasiveotorite','principlesofscientificmanagement','insearchofexcellence']);
 assert.deepEqual(inGroup('ilk-uc'),['competitivestrategy','practiceofmanagement','innovatorsdilemma']);
});

test('new works show a Turkish edition verified on two websites, or say why not',()=>{
 for(const item of source.books.filter(entry=>!entry.existingId)){
  const book=mapped(item.key);
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
  if(item.cover)assert.equal(book.cover.isbn,edition.isbn,item.key);
 }
});

test('critical notes stay on Taylor and Peters, and advice becomes relations',()=>{
 for(const key of ['principlesofscientificmanagement','insearchofexcellence'])assert.match(mapped(key).notes.map(note=>note.text).join(' '),/Eleştirel okunmalı/,key);
 const graph=readingGraphFor(catalog);
 for(const link of source.links){
  if(link.type==='sequence')assert.ok(graph.relations(resolve(link.then)).before.some(entry=>entry.id===resolve(link.first)),link.first);
  else{const [left,right]=link.books.map(resolve);assert.ok(graph.relations(left).companions.some(entry=>entry.id===right),link.books.join(' + '));}
 }
});
