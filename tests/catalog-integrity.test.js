import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {translationStatus} from '../src/translation.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const catalog=read('../src/catalog.json');
const books=Object.fromEntries(catalog.books.map(b=>[b.id,b]));
const validIsbn=s=>/^\d{13}$/.test(s)?[...s].reduce((sum,d,i)=>sum+Number(d)*(i%2?3:1),0)%10===0:/^\d{9}[\dX]$/.test(s)&&[...s].reduce((sum,d,i)=>sum+(d==='X'?10:Number(d))*(10-i),0)%11===0;
test('every selected cover has a source, a local image and a valid ISBN when specified',()=>{
 for(const b of catalog.books){const c=b.cover;if(!c)continue;
  assert.match(c.sourceUrl,/^https:\/\//,b.id);
  assert.ok(existsSync(new URL('../public/'+c.src,import.meta.url)),b.id);
  assert.ok(readFileSync(new URL('../public/'+c.src,import.meta.url)).length>1000,b.id);
  if(c.isbn)assert.ok(validIsbn(c.isbn),b.id);
 }
});
// The book page shows a cover's scope verbatim under the cover. The source files
// are checked too, because a later cover can hide an English scope in the catalog.
test('cover scopes are written in Turkish',()=>{
 const covers=[
  ...catalog.books.map(b=>[b.id,b.cover]),
  ...read('../data/foundational-reading.json').groups.flatMap(g=>g.books.map(b=>['foundations: '+b.title,b.cover])),
  ...Object.entries(read('../data/preparatory-reading-covers.json')),
  ...Object.entries(read('../data/turkish-covers.json')),
  ...Object.entries(read('../data/international-covers.json')),
  ...read('../data/children-library.json').books.map(b=>['children: '+b.key,b.cover]),
 ];
 const english=covers.filter(([,c])=>/edition|cover/i.test(c?.scope??'')).map(([id,c])=>`${id}: ${c.scope}`);
 assert.deepEqual(english,[]);
});
test('verified edition ISBNs pass their check digit and name their evidence source',()=>{
 for(const [id,e] of Object.entries(read('../data/edition-verification.json'))){
  if(e.isbn)assert.ok(validIsbn(e.isbn),id);
  assert.ok(['publisher','publisher-preview','retailer','bibliographic'].includes(e.sourceType),id);
  assert.match(e.sourceUrl,/^https:\/\//,id);
 }
});
test('companion workbooks and disputed translator credits are not presented as exact matches',()=>{
 assert.equal(books.effectiveexecutive.cover.title,'Etkin Yöneticilik');
 assert.equal(books.effectiveexecutive.cover.language,'tr');
 assert.equal(books.effectiveexecutive.cover.isbnUnavailable,true);
 assert.ok(books.effectiveexecutive.sourceIssue);
 assert.equal(books.savasati.cover.isbn,'9786059604451');
 assert.equal(books.birseftalibinseftali.cover.isbn,'9789753484640');
 assert.deepEqual(books.taleofdespereaux.verifiedEdition.translators,['Gözde Koca']);
 for(const id of ['influence','7habitsofhighlyeffectivepeople']){assert.deepEqual(books[id].verifiedEdition.translators,[]);assert.ok(books[id].sourceIssue)}
});
test('unresolved source records remain visible and explain why a cover is absent',()=>{
 // Articles and essays have no cover; they name where they appeared instead.
 for(const b of catalog.books.filter(b=>!b.cover&&!b.format))assert.ok(b.sourceIssue?.note,b.id);
 for(const b of catalog.books.filter(b=>b.format)){assert.ok(['article','essay'].includes(b.format),b.id);assert.ok(b.publication?.venue,b.id);assert.equal(b.cover,undefined,b.id)}
 assert.equal(translationStatus({verifiedEdition:{originalLanguage:'tr'}}).label,'Türkçe eser');
});
