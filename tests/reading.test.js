import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readingJourney, addToQueue, moveInQueue, cleanPersonal, cleanReading, progressPercent, readingErrors, restorePersonal, todayLocal } from '../src/reading.js';
import { toggleState, encodeRoute, emptyFilters, decodeRoute } from '../src/library.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../src/catalog.json',import.meta.url)));

test('queue has five distinct books and supports reversible ordering without mutation',()=>{
 let q=[];for(const id of ['a','b','c','d','e','f','b'])q=addToQueue(q,id);
 assert.deepEqual(q,['a','b','c','d','e']);
 const moved=moveInQueue(q,'c',-1);assert.deepEqual(moved,['a','c','b','d','e']);assert.deepEqual(q,['a','b','c','d','e']);
 assert.deepEqual(moveInQueue(moved,'c',1),q);assert.deepEqual(moveInQueue(q,'a',-1),q);assert.deepEqual(moveInQueue(q,'e',1),q);
});
test('personal data rejects unknown IDs and preserves valid Turkish notes and dates',()=>{
 const restored=cleanPersonal({queue:['a','a','unknown','b','c','d','e','f'],reading:{a:{startedAt:'2026-09-01',finishedAt:'2026-09-28',page:58,totalPages:220,why:'İç görü; ğ, ü, ş, ı, ö, ç.',apply:'Haftalık değerlendirme yapacağım.'},unknown:{why:'unused'}}},['a','b','c','d','e','f']);
 assert.deepEqual(restored.queue,['a','b','c','d','e']);assert.equal(Object.keys(restored.reading).length,1);
 assert.equal(restored.reading.a.why,'İç görü; ğ, ü, ş, ı, ö, ç.');assert.equal(restored.reading.a.finishedAt,'2026-09-28');
 assert.equal(cleanReading({startedAt:'2026-02-30',page:-2,apply:{bad:true}}).startedAt,'');
 assert.equal(cleanReading({startedAt:'2024-02-29'}).startedAt,'2024-02-29');
 assert.equal(cleanReading({page:-2}).page,'');assert.equal(cleanReading({apply:{bad:true}}).apply,'');
});
test('progress handles blank and invalid ranges and dates',()=>{
 assert.equal(progressPercent({page:25,totalPages:100}),25);assert.equal(progressPercent({page:0,totalPages:100}),0);
 assert.equal(progressPercent({page:'',totalPages:100}),null);assert.equal(progressPercent({page:20,totalPages:0}),null);
 assert.ok(readingErrors({page:200,totalPages:100}).pages);assert.ok(readingErrors({startedAt:'2026-09-28',finishedAt:'2026-09-01'}).dates);
 assert.equal(todayLocal(new Date(2026,8,28,1)), '2026-09-28');
});
test('new reading states are exclusive but keep purchase and important marks',()=>{
 assert.deepEqual(toggleState(['onemli','alindi','okunuyor'],'araverildi'),['onemli','alindi','araverildi']);
 assert.deepEqual(toggleState(['alindi','araverildi'],'birakildi'),['alindi','birakildi']);assert.deepEqual(toggleState(['alindi','birakildi'],'okundu'),['alindi','okundu']);
 assert.deepEqual(toggleState(['okundu'],'okundu'),[]);
});
// The owner, 8 November 2026: "satın almadığımı okuyamam". The two are separate lists, and a
// reading mark puts the book on the purchased one as well.
test('a reading mark also marks the book as purchased, and replaces a to-buy mark',()=>{
 for(const mark of ['okunuyor','okundu','araverildi','birakildi']){
  assert.deepEqual(toggleState([],mark).sort(),['alindi',mark].sort(),mark);
  assert.deepEqual(toggleState(['alinacak','onemli'],mark).sort(),['alindi',mark,'onemli'].sort(),`${mark} after to-buy`);
 }
});
test('the two lists stay separate when a mark is taken off',()=>{
 assert.deepEqual(toggleState(['alindi','okundu'],'okundu'),['alindi'],'taking off the reading mark keeps the purchase');
 assert.deepEqual(toggleState(['alindi','okundu'],'alindi'),['okundu'],'taking off the purchase keeps the reading mark');
});
test('new backup round trip preserves queue and notes; old backups do not clear them',()=>{
 const personal=cleanPersonal({queue:['b','a'],reading:{a:{why:'Neden?',apply:'Bir eylem',page:20,totalPages:90}}},['a','b','c']);
 assert.deepEqual(restorePersonal({queue:[],reading:{}},JSON.parse(JSON.stringify({version:3,states:{a:['okunuyor']},...personal})),['a','b','c']),personal);
 assert.deepEqual(restorePersonal(personal,{version:2,states:{a:['okundu']}},['a','b','c']),personal);
 const changed=restorePersonal(personal,{queue:[],reading:{b:{why:'Yeni'}}},['a','b','c']);assert.deepEqual(changed.queue,[]);assert.equal(changed.reading.a.why,'Neden?');assert.equal(changed.reading.b.why,'Yeni');
});
test('queue URL opens the personal view without putting personal text in the URL',()=>{
 const encoded=encodeRoute({view:'queue',sort:'reading',book:null,filters:emptyFilters(),reading:{why:'private text'},queue:['a']});
 assert.equal(encoded,'view=queue');assert.equal(decodeRoute('#'+encoded,catalog).view,'queue');
});
test('Turkish covers retain provenance and exist as local image files',()=>{
 const covers=JSON.parse(fs.readFileSync(new URL('../data/turkish-covers.json',import.meta.url)));
 assert.ok(Object.keys(covers).length>=100);
 for(const [id,c] of Object.entries(covers)){
  assert.deepEqual(catalog.books.find(b=>b.id===id)?.cover,c,id);
  assert.equal(c.language,'tr');assert.ok(c.title&&c.author&&c.publisher&&(c.isbn||c.isbnUnavailable));
  for(const url of [c.sourceUrl,c.imageUrl])assert.equal(new URL(url).protocol,'https:');
  const data=fs.readFileSync(new URL('../public/'+c.src,import.meta.url));assert.ok(data.length>1000);
  assert.ok(data.subarray(0,2).equals(Buffer.from([255,216]))||data.subarray(0,4).equals(Buffer.from([137,80,78,71]))||(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'),c.src);
 }
});

// What the book page shows of a reading at a glance (docs/UI-REDESIGN.md, phase 4).
test('a reading journey works its percentage out from the pages',()=>{
 assert.equal(readingJourney({page:75,totalPages:300}).percent,25);
 assert.equal(readingJourney({page:1,totalPages:3}).percent,33);
 assert.equal(readingJourney({page:300,totalPages:300}).percent,100);
});
test('a reading journey has no percentage when the pages cannot give one',()=>{
 assert.equal(readingJourney({page:10,totalPages:''}).percent,null);
 assert.equal(readingJourney({page:400,totalPages:300}).percent,null,'a page past the end is an entry error, not 100%');
});
test('a reading journey lists its days in date order and drops days that do not exist',()=>{
 assert.deepEqual(readingJourney({startedAt:'2026-01-02',finishedAt:'2026-02-03'}).steps,[{kind:'started',day:'2026-01-02'},{kind:'finished',day:'2026-02-03'}]);
 assert.deepEqual(readingJourney({startedAt:'2026-03-01',finishedAt:'2026-02-03'}).steps.map(step=>step.kind),['finished','started']);
 assert.deepEqual(readingJourney({startedAt:'2026-02-30'}).steps,[]);
});
test('an empty record has no journey to show',()=>{
 assert.equal(readingJourney(undefined).hasAny,false);
 assert.equal(readingJourney({why:'Merak ettim.'}).hasAny,false);
 assert.equal(readingJourney({startedAt:'2026-01-02'}).hasAny,true);
 assert.equal(readingJourney({page:10,totalPages:100}).hasAny,true);
});
