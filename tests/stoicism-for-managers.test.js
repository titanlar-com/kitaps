import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translationStatus,displayTitle} from '../src/translation.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/stoicism-for-managers.json');
const catalog=read('../src/catalog.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const resolve=reference=>catalog.mapping[`stoic:${reference}`]||reference;
const inGroup=group=>catalog.books
 .map(book=>({id:book.id,membership:book.memberships.find(entry=>entry.groupId===`${source.id}:${group}`)}))
 .filter(entry=>entry.membership)
 .sort((left,right)=>(left.membership.order??0)-(right.membership.order??0))
 .map(entry=>entry.id);

test('the five classics keep the advice’s order, with the first three and the explanatory start apart',()=>{
 assert.deepEqual(inGroup('oncelik'),['enchiridion','meditations',resolve('devitabeata'),resolve('deira'),'epistulaemoralesadlucilium']);
 assert.deepEqual(inGroup('ilk-uc'),['enchiridion','meditations',resolve('devitabeata')]);
 assert.deepEqual(inGroup('aciklayici'),[resolve('howtobeastoic')]);
});

test('the four virtues and the three questions are kept with the collection',()=>{
 for(const word of ['bilgelik','adalet','cesaret','ölçülülük'])assert.match(source.context.criterion,new RegExp(word));
 assert.match(source.context.verdict,/Olgu ne/);
});

test('the advised İş Bankası edition of the Enchiridion is the one shown, and unverified ones say why',()=>{
 assert.equal(displayTitle(byId.enchiridion),'Enkheiridion');
 assert.equal(translationStatus(byId.enchiridion).status,'available');
 for(const key of ['deira','howtobeastoic']){
  const book=byId[resolve(key)];
  assert.ok(book.sourceIssue?.note,key);
  assert.notEqual(translationStatus(book).status,'available',key);
 }
});
