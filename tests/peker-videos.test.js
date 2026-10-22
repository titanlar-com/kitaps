import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translationStatus} from '../src/translation.js';
import {readingGraphFor} from '../src/ranking/readingGraph.ts';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/peker-videos.json');
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const resolve=reference=>catalog.mapping[`peker:${reference}`]||reference;

test('every book is one catalog book in the group of how it appeared, with its role',()=>{
 assert.equal(new Set(source.books.map(item=>resolve(item.key))).size,source.books.length);
 const roles={tavsiye:'Açık tavsiye','video-2021':'Kadrajda, öneri değil','video-2020':'Kadrajda, öneri değil',sozlu:'Sözlü atıf',trevanian:'Tweet önerisi'};
 for(const item of source.books){
  const book=byId[resolve(item.key)];
  assert.ok(book,item.key);
  assert.equal(item.role,roles[item.group],item.key);
  assert.equal(book.memberships.find(entry=>entry.groupId===`${source.id}:${item.group}`)?.role,item.role,item.key);
  if(item.existingId)assert.equal(book.id,item.existingId,item.key);
  else assert.deepEqual(book.origins,['peker'],item.key);
 }
});

test('a book shown on the desk is never presented as a recommendation',()=>{
 assert.match(source.context.criterion,/öneri değildir/);
 for(const item of source.books.filter(entry=>entry.group.startsWith('video-')))assert.doesNotMatch(item.reason,/önerdi/,item.key);
 const advised=source.books.filter(item=>item.group==='tavsiye').map(item=>item.key);
 assert.deepEqual(advised,['birguntekbasina','cyranodebergerac','fiftyyearsinthesystem','artofwar','manualdoguerreirodaluz']);
});

test('the Trevanian order is the order of the tweets, as a chain of relations',()=>{
 const order=['shibumi','eigersanction','loosanction','incidentattwentymile','summerofkatya','themain','hotnightinthecity','crazyladiesofpearlstreet'];
 assert.deepEqual(source.books.filter(item=>item.group==='trevanian').map(item=>item.key),order);
 const graph=readingGraphFor(catalog);
 for(let index=1;index<order.length;index++)assert.ok(graph.relations(resolve(order[index])).before.some(entry=>entry.id===resolve(order[index-1])),order[index]);
});

test('unverified editions say why and are not shown as Turkish',()=>{
 for(const key of ['fiftyyearsinthesystem','loosanction']){
  const book=byId[resolve(key)];
  assert.ok(book.sourceIssue?.note,key);
  assert.notEqual(translationStatus(book).status,'available',key);
 }
 assert.match(source.note,/Meydan Larousse/);
});
