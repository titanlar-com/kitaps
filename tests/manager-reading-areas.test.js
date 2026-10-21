import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translationStatus} from '../src/translation.js';
import {readingGraphFor} from '../src/ranking/readingGraph.ts';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/manager-reading-areas.json');
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const resolve=reference=>catalog.mapping[`managerareas:${reference}`]||reference;
const mapped=key=>byId[resolve(key)];
const inGroup=group=>catalog.books
 .map(book=>({id:book.id,membership:book.memberships.find(entry=>entry.groupId===`${source.id}:${group}`)}))
 .filter(entry=>entry.membership)
 .sort((left,right)=>(left.membership.order??0)-(right.membership.order??0))
 .map(entry=>entry.id);
const AREAS=['strateji','yoneticilik','orgutsel-davranis','karar','veri','ekonomi','finans','pazarlama','muzakere','operasyon','sistem','degisim','etik','sosyoloji','tarih','siyaset','felsefe','edebiyat'];

test('every reading area has one book to start with, and every entry is one catalog book with its role',()=>{
 assert.equal(new Set(source.books.map(item=>resolve(item.key))).size,source.books.length);
 assert.equal(catalog.collections.find(collection=>collection.id===source.id)?.count,source.books.length);
 for(const area of AREAS)assert.equal(source.books.filter(item=>item.group===area&&item.role==='Başlangıç kitabı').length,1,area);
 for(const item of source.books){
  const book=mapped(item.key);
  assert.ok(book,item.key);
  assert.equal(book.memberships.find(entry=>entry.groupId===`${source.id}:${item.group}`)?.role,item.role,item.key);
  if(item.existingId)assert.equal(book.id,item.existingId,item.key);
  else assert.deepEqual(book.origins,['managerareas'],item.key);
 }
});

test('Popper, Geertz and Mills are deepening reads, never the first book of an area',()=>{
 for(const key of ['logicofscientificdiscovery','interpretationofcultures','sociologicalimagination'])assert.equal(source.books.find(item=>item.key===key).role,'Derinleşme okuması',key);
});

test('the two priority lists keep the advice’s books and order',()=>{
 assert.deepEqual(new Set(inGroup('ilk-oncelik')),new Set(['goodstrategybadstrategy','thinkinginsystems','leadingchange',resolve('organizationalbehavior'),'gettingtoyes','goal']));
 assert.deepEqual(inGroup('ilk-alti'),['goodstrategybadstrategy','goal','thinkinginsystems','effectiveexecutiveinaction','thinkingfastandslow','financialintelligence']);
});

test('new books are not shown as translated unless an edition was verified',()=>{
 for(const item of source.books.filter(entry=>!entry.existingId)){
  const book=mapped(item.key);
  if(!item.edition)assert.notEqual(translationStatus(book).status,'available',item.key);
  else assert.equal(translationStatus(book).status,'available',item.key);
 }
});

test('the advice’s “then” and “alongside” become relations',()=>{
 const graph=readingGraphFor(catalog);
 for(const link of source.links){
  if(link.type==='sequence')assert.ok(graph.relations(resolve(link.then)).before.some(entry=>entry.id===resolve(link.first)),`${link.first} → ${link.then}`);
  else{const [left,right]=link.books.map(resolve);assert.ok(graph.relations(left).companions.some(entry=>entry.id===right),link.books.join(' + '));}
 }
});
