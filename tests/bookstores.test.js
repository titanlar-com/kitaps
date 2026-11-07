import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decodeRoute, encodeRoute } from '../src/library.js';
import { seoState } from '../src/seo.js';

// The bookstores page (?view=bookstores) lists every bookstore the owner's four research notes
// recommend, with the route walked on 7 November 2026. data/bookstores.json is its only source.
const catalog=JSON.parse(fs.readFileSync(new URL('../src/catalog.json',import.meta.url)));
const data=JSON.parse(fs.readFileSync(new URL('../data/bookstores.json',import.meta.url)));
const byId=Object.fromEntries(data.stores.map(store=>[store.id,store]));

test('the bookstores page has its own readable address and title',()=>{
 const route=decodeRoute('?view=bookstores',catalog);
 assert.equal(route.view,'bookstores');
 assert.equal(encodeRoute(route,catalog),'view=bookstores');
 const seo=seoState({route,catalog,count:0,currentPage:1,totalPages:1,displayed:[]});
 assert.match(seo.title,/^Kitapçılar \|/);
});

test('every bookstore the four notes name is listed once, open or not',()=>{
 const ids=data.stores.map(store=>store.id);
 assert.equal(new Set(ids).size,ids.length,'no store twice');
 for(const id of [
  'minoa-pera','mephisto-beyoglu','homer-galatasaray','minoa-akaretler','remzi-akmerkez','remzi-zorlu','remzi-kanyon','remzi-rumeli',
  'pandora-nisantasi','dr-kanyon','dr-marmara-forum','dr-istinyepark','dr-zorlu','dr-galataport','dr-bagdat','penguen-icerenkoy',
  'imge-kadikoy','turkmen-beyazit','nezih-bostanci','nezih-nisantasi','ykks-galatasaray','is-kultur-taksim','robinson-crusoe',
  'istanbul-kitapcisi','kirmizi-kedi-tunel','remzi-suadiye','mephisto-besiktas','kirmizi-kedi-besiktas','kabalci-besiktas','pandora-beyoglu',
 ])assert.ok(byId[id],id);
 for(const store of data.stores){
  assert.match(store.id,/^[a-z0-9-]+$/);
  assert.ok(store.name&&store.district&&store.address,store.id);
  assert.ok(['europe','asia','both'].includes(store.side),`${store.id} side`);
  assert.ok(['open','closed','unverified'].includes(store.status),`${store.id} status`);
  assert.ok(store.about,`${store.id} says why it is listed`);
 }
 // Closed shops stay on the page so nobody walks to them; each says when it closed.
 for(const id of ['remzi-suadiye','mephisto-besiktas','kirmizi-kedi-besiktas','kabalci-besiktas','pandora-beyoglu'])assert.equal(byId[id].status,'closed',id);
 assert.equal(byId['kirmizi-kedi-tunel'].status,'unverified');
 assert.match(byId['remzi-suadiye'].about,/19 Ağustos 2026/);
});

test('the route walked on 7 November 2026 is Minoa Pera, then Mephisto Beyoğlu, then Homer',()=>{
 const visit=data.visits.find(item=>item.date==='2026-11-07');
 assert.ok(visit);
 assert.deepEqual(visit.stops,['minoa-pera','mephisto-beyoglu','homer-galatasaray']);
 for(const item of [...data.visits,...data.routes])for(const id of item.stops){
  assert.ok(byId[id],`${item.title}: ${id}`);
  assert.notEqual(byId[id].status,'closed',`${item.title} sends no one to a closed shop`);
 }
 for(const topic of data.topics)for(const id of topic.stores)assert.ok(byId[id],`${topic.topic}: ${id}`);
});

test('conflicting figures from the notes are kept side by side, not settled by guess',()=>{
 assert.match(byId['penguen-icerenkoy'].caution,/5\.000 m²/);
 assert.match(byId['penguen-icerenkoy'].caution,/1\.800 m²/);
 assert.match(byId['pandora-nisantasi'].caution,/35/);
 assert.match(byId['pandora-nisantasi'].caution,/45/);
 assert.match(byId['minoa-akaretler'].caution,/45 bin/);
 assert.match(byId['minoa-akaretler'].caution,/60 bin/);
});

test('links are clean https addresses and phone numbers can be dialled',()=>{
 for(const store of data.stores){
  for(const url of [store.web,...(store.sources||[]).map(source=>source.url)].filter(Boolean)){
   assert.match(url,/^https:\/\//,`${store.id} ${url}`);
   assert.doesNotMatch(url,/utm_|chatgpt/,`${store.id} keeps no tracking parameter`);
  }
  for(const source of store.sources||[])assert.ok(source.label,`${store.id} names its source`);
  if(store.phone)assert.match(store.phone.replace(/[\s()]/g,''),/^0?\d{10,11}$/,`${store.id} ${store.phone}`);
 }
});

// The owner's Turkish writing rule (AGENTS.md, 2026-11-03): explanations are whole sentences,
// with no semicolon, long dash, middle dot or arrow standing in for a word.
test('every explanation on the page is written in whole sentences',()=>{
 const prose=[data.intro,...data.notes,
  ...data.stores.flatMap(store=>[store.about,store.caution,store.hours,store.transit,store.size]),
  ...data.visits.map(item=>item.note),...data.routes.map(item=>item.why),...data.topics.map(item=>item.why)].filter(Boolean);
 for(const text of prose){
  assert.doesNotMatch(text,/;|—|·|→|←/,text);
  assert.match(text,/[.!?]$/,`ends as a sentence: ${text}`);
 }
});
