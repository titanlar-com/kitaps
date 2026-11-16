import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translationStatus,displayTitle} from '../src/translation.js';
import {ReadingGraph} from '../src/ranking/readingGraph.ts';

// The owner's grand strategy list (16 November 2026): nine works in three groups. The owner named
// each Turkish edition; the catalog shows that edition only after two independent sites agree.
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const source=read('../data/grand-strategy.json');
const catalog=read('../src/catalog.json');
const pageCounts=read('../data/page-counts.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const resolve=reference=>catalog.mapping[`strategy:${reference}`]||reference;
const inGroup=group=>catalog.books
 .filter(book=>book.memberships.some(entry=>entry.groupId===`${source.id}:${group}`))
 .map(book=>book.id).sort();
const inOrder=group=>catalog.books
 .map(book=>({id:book.id,membership:book.memberships.find(entry=>entry.groupId===`${source.id}:${group}`)}))
 .filter(entry=>entry.membership)
 .sort((left,right)=>left.membership.order-right.membership.order)
 .map(entry=>entry.id);
const graph=new ReadingGraph(catalog);
const ids=list=>list.map(link=>link.id).sort();

test('the nine works sit in their three groups, and the two already in the catalog join without a copy',()=>{
 const collection=catalog.collections.find(entry=>entry.id===source.id);
 assert.equal(collection.title,'Büyük strateji');
 assert.deepEqual(inGroup('kavram'),[resolve('newmakersofmodernstrategy'),resolve('grandstrategiesinwarandpeace'),resolve('ongrandstrategy'),'strategyahistory'].sort());
 assert.deepEqual(inGroup('tarih'),[resolve('riseandfallofthegreatpowers'),'ιστοριαιpeloponnesossavasitarihi'].sort());
 assert.deepEqual(inGroup('diplomasi'),[resolve('diplomacy'),resolve('worldorder'),resolve('grandchessboard')].sort());
 const titles=catalog.books.map(book=>`${book.title}|${book.author}`);
 assert.equal(new Set(titles).size,titles.length,'no work is listed twice');
});

test('each new work shows the Turkish edition the owner named, or the right one where the owner’s hint was incomplete',()=>{
 const expected={
  ongrandstrategy:['Büyük Strateji','Epsilon Yayınevi','Özgür Umut Hoşafçı','9786254143137'],
  diplomacy:['Diplomasi','Türkiye İş Bankası Kültür Yayınları','İbrahim H. Kurt','9789754581119'],
  worldorder:['Dünya Düzeni','Boyner Yayınları','Sinem Sultan Gül','9789757004745'],
  grandstrategiesinwarandpeace:['Savaşta ve Barışta Büyük Stratejiler','Totem Yayıncılık','Ahmet Fethi','9786259894911'],
  riseandfallofthegreatpowers:['Büyük Güçlerin Yükseliş ve Çöküşleri','Türkiye İş Bankası Kültür Yayınları','Birtane Karanakçı','9789754580303'],
  grandchessboard:['Büyük Satranç Tahtası','İnkılâp Kitabevi','Yelda Türedi','9789751023278'],
  newmakersofmodernstrategy:['Yeni Modern Stratejinin Ustaları: Antik Çağdan Dijital Çağa','Doruk Yayınları','Hakan Baş','9786259264875'],
 };
 for(const [key,[title,publisher,translator,isbn]] of Object.entries(expected)){
  const book=byId[resolve(key)];
  assert.ok(book,key);
  assert.equal(displayTitle(book),title,key);
  assert.equal(translationStatus(book).status,'available',key);
  assert.equal(book.verifiedEdition.publisher,publisher,key);
  assert.deepEqual(book.verifiedEdition.translators,[translator],key);
  assert.equal(book.verifiedEdition.isbn,isbn,key);
  assert.equal(book.cover.isbn,isbn,key);
  assert.ok(fs.existsSync(new URL(`../public/${book.cover.src}`,import.meta.url)),`${key} cover file`);
 }
});

test('each new edition shows the page count printed on a page of that same ISBN',()=>{
 const counted={'9786254143137':392,'9789754581119':856,'9789757004745':448,'9786259894911':280,'9789754580303':768,'9789751023278':293,'9786259264875':1240};
 for(const [isbn,pages] of Object.entries(counted))assert.equal(pageCounts.records[isbn]?.pages,pages,isbn);
 // kitapyurdu.com's Diplomasi page shows another printing (840 pages, no İş Bankası ISBN), so the publisher's page is the source.
 assert.equal(pageCounts.records['9789754581119'].sourceName,'iskultur.com.tr');
});

test('Thukydides keeps the Furkan Akderin translation from Belge Yayınları, as the owner chose, now verified and dated',()=>{
 const book=byId['ιστοριαιpeloponnesossavasitarihi'];
 assert.equal(book.verifiedEdition.publisher,'Belge Yayınları');
 assert.equal(book.verifiedEdition.isbn,'9789753440530');
 assert.deepEqual(book.verifiedEdition.translators,['Furkan Akderin']);
 assert.equal(book.cover.isbn,'9789753440530');
 assert.deepEqual(book.years,[-400],'about 400 BC, written as a negative year');
 assert.equal(book.originalLanguage,'grc');
 assert.ok(book.origins.includes('strategy'));
});

test('Freedman’s Alfa edition names both translators the owner’s note abbreviated',()=>{
 const book=byId.strategyahistory;
 assert.equal(book.verifiedEdition.publisher,'Alfa Yayınları');
 assert.equal(book.verifiedEdition.isbn,'9786051710815');
 assert.deepEqual(book.verifiedEdition.translators,['Belkıs Çorakçı Dişbudak','Taciser Belge']);
 assert.equal(book.pageCounts['9786051710815'].pages,1100,'the printed count of this ISBN, not the 1096 in the owner’s note');
});

test('every new work names who first published it and when',()=>{
 for(const key of ['ongrandstrategy','diplomacy','worldorder','grandstrategiesinwarandpeace','riseandfallofthegreatpowers','grandchessboard','newmakersofmodernstrategy']){
  const book=byId[resolve(key)];
  assert.ok(book.originalPublisher,key);
  assert.equal(book.originalLanguage,'en',key);
  assert.equal(book.years.length,1,key);
 }
});

test('the reading order starts with Gaddis’s short introduction and leaves the two long reference books for last',()=>{
 assert.deepEqual(inOrder('sira'),[resolve('ongrandstrategy'),'ιστοριαιpeloponnesossavasitarihi',resolve('grandstrategiesinwarandpeace'),resolve('riseandfallofthegreatpowers'),resolve('diplomacy'),resolve('worldorder'),resolve('grandchessboard'),'strategyahistory',resolve('newmakersofmodernstrategy')]);
 assert.match(source.context.verdict,/^Önce Gaddis/);
 assert.deepEqual(graph.relations(resolve('ongrandstrategy')).before,[],'the first book needs nothing before it');
});

test('every book says what to read before or after it, in both directions',()=>{
 const after=id=>ids(graph.relations(id).after),before=id=>ids(graph.relations(id).before),companions=id=>ids(graph.relations(id).companions);
 assert.deepEqual(after(resolve('ongrandstrategy')),['strategyahistory','vomkriege','ιστοριαιpeloponnesossavasitarihi'].sort());
 assert.ok(before('ιστοριαιpeloponnesossavasitarihi').includes(resolve('ongrandstrategy')));
 assert.deepEqual(after('strategyahistory').includes(resolve('newmakersofmodernstrategy')),true);
 assert.deepEqual(after(resolve('grandstrategiesinwarandpeace')),[resolve('riseandfallofthegreatpowers')]);
 assert.deepEqual(after(resolve('diplomacy')),[resolve('grandchessboard'),resolve('worldorder')].sort());
 assert.ok(companions(resolve('worldorder')).includes(resolve('grandchessboard')));
 assert.ok(companions(resolve('grandchessboard')).includes(resolve('worldorder')));
 assert.ok(companions(resolve('riseandfallofthegreatpowers')).includes('whynationsfail'));
 assert.ok(companions('prisonersofgeography').includes(resolve('grandchessboard')));
 for(const id of inOrder('sira')){
  const relation=graph.relations(id);
  assert.ok(relation.before.length+relation.after.length+relation.companions.length>0,`${id} is not linked to any book`);
  for(const link of [...relation.before,...relation.after,...relation.companions])assert.ok(link.reason?.trim(),`${id} → ${link.id} has a reason`);
 }
});
