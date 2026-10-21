import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translationStatus} from '../src/translation.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/shelf-photos.json');
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const resolve=reference=>catalog.mapping[`shelfphotos:${reference}`]||reference;

test('each photographed book is one catalog book in the group of its photo’s day',()=>{
 assert.equal(new Set(source.books.map(item=>resolve(item.key))).size,source.books.length);
 for(const group of source.groups)assert.match(group.id,/^\d{4}-\d{2}-\d{2}$/);
 for(const item of source.books){
  const book=byId[resolve(item.key)];
  assert.ok(book,item.key);
  assert.ok(book.memberships.some(entry=>entry.groupId===`${source.id}:${item.group}`),item.key);
  if(item.existingId)assert.equal(book.id,item.existingId,item.key);
  else assert.deepEqual(book.origins,['shelfphotos'],item.key);
 }
});

test('being on the shelf is not a purchase mark, and an unverified edition is not shown as Turkish',()=>{
 assert.match(source.note,/satın alındı işareti değildir/);
 for(const item of source.books.filter(entry=>!entry.existingId)){
  const status=translationStatus(byId[resolve(item.key)]).status;
  if(!item.edition)assert.notEqual(status,'available',item.key);
 }
});
