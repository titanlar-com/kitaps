import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_PAGE_SIZE, prepareBooks, filterBooks, sortBooks, formatDay, emptyFilters, toggleState, migrateStates, decodeRoute, encodeRoute, plainTextMarkers, booksForShelf } from '../src/library.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../src/catalog.json',import.meta.url)));
const books=prepareBooks(catalog.books);
const filter=(f,states)=>filterBooks(books,{...emptyFilters(),...f},states);
test('all three inputs and every record survive the merge',()=>{
 const atlas=JSON.parse(fs.readFileSync(new URL('../data/sources/atlas-v1.json',import.meta.url)));
 const kitaps=JSON.parse(fs.readFileSync(new URL('../data/sources/kitaps.json',import.meta.url)));
 const local=JSON.parse(fs.readFileSync(new URL('../data/sources/okuma-kumeleri.json',import.meta.url)));
 assert.equal(books.length,new Set(books.map(b=>b.id)).size);
 for(const c of atlas.collections)for(const g of c.groups)for(const b of g.books){
  const merged=books.find(x=>x.id===catalog.mapping['atlas:'+b.key]);
  assert.ok(merged?.collectionIds.includes(c.id),b.title);
 }
 for(const b of kitaps.books)assert.ok(books.some(x=>x.editions.some(e=>e.key===b.key)),b.key);
 for(const b of local.books)assert.ok(books.some(x=>[x.title,...x.aliases].includes(b.title)),b.title);
 for(const b of books){assert.ok(b.title);assert.ok(b.memberships.length);assert.ok(b.categories.length);}
});
test('the researched entrepreneurship route is unique and stays below the requested cap',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../data/sources/entrepreneurship-curriculum.json',import.meta.url)));
 const entries=source.groups.flatMap(group=>group.books);
 assert.equal(entries.length,35);
 assert.ok(entries.length<=100);
 assert.equal(new Set(entries.map(item=>item.title.toLocaleLowerCase('en'))).size,entries.length);
 assert.equal(catalog.collections.find(item=>item.id===source.id).count,entries.length);
 for(const item of entries){
  assert.match(item.sourceUrl,/^https:\/\//);
  const book=item.existingId?books.find(book=>book.id===item.existingId):books.find(book=>[book.title,...book.aliases].includes(item.title));
  assert.ok(book?.collectionIds.includes(source.id),item.title);
 }
});
test('non-Latin titles and missing original titles remain distinct',()=>{
 // Six Dostoyevski works since Ezilenler (Униженные и оскорблённые) joined with the Peker videos list.
 assert.equal(filter({query:'Dostoyevski'}).length,6);
 assert.ok(filter({query:'Abartma Tozu'}).length===1);
 assert.ok(filter({query:'Yılankale'}).length===1);
});
test('translated titles merge and memberships include secondary collections',()=>{
 const book=filter({query:'Şamatalı Köyün Çocukları'})[0];
 assert.equal(filter({query:'Şamatalı Köyün Çocukları'}).length,1);
 assert.ok(book.collectionIds.includes('kitaps-E'));assert.ok(book.collectionIds.includes('kitaps-P'));
 assert.ok(filter({collections:['kitaps-M'],query:'rumelt'}).length===1);
});
test('category OR, category AND and collection/category intersection',()=>{
 const a=filter({categories:['strategy']});const b=filter({categories:['psychology']});
 const either=filter({categories:['strategy','psychology']});
 assert.equal(either.length,new Set([...a,...b].map(b=>b.id)).size);
 const both=filter({categories:['strategy','psychology'],categoryMode:'all'});
 assert.ok(both.length>0&&both.length<either.length);
 assert.ok(both.every(b=>b.categories.includes('strategy')&&b.categories.includes('psychology')));
 assert.ok(filter({collections:['time','core'],collectionMode:'all'}).length===4);
 const mixed=filter({categories:['strategy'],collections:['kitaps-A'],hasEdition:true});
 assert.ok(mixed.length>0);assert.ok(mixed.every(b=>b.collectionIds.includes('kitaps-A')&&b.categories.includes('strategy')&&b.editions.length));
});
test('FT award filters pair year and award on the same record',()=>{
 assert.equal(filter({awards:['Kazanan']}).length,21);
 assert.equal(filter({awards:['Kazanan'],awardYears:['2026']}).length,0);
 assert.equal(filter({awards:['Kazanan'],awardYears:['2025']}).length,1);
 const synthetic=prepareBooks([{...books[0],memberships:[{collectionId:'ft',award:'Kazanan',awardYear:2020},{collectionId:'ft',award:'Kısa liste',awardYear:2021}]}]);
 assert.equal(filterBooks(synthetic,{...emptyFilters(),awards:['Kazanan'],awardYears:['2021']}).length,0);
});
test('Turkish search, multi-token search and unknown publication years',()=>{
 assert.equal(filter({query:'SISTEMLERLE DUSUNMEK'}).length,1);
 assert.ok(filter({query:'Rumelt Cengiz'}).length===1);
 assert.ok(filter({yearMin:2000}).every(b=>b.years.some(y=>y>=2000)));
 assert.equal(filter({yearMin:2025,yearMax:1990}).length,0);
});
test('reading states migrate across all edition keys; explicit cleared states stay cleared',()=>{
 const b=books.find(b=>b.editions.length>1&&b.legacyKeys.length>1);
 const migrated=migrateStates(books,{},Object.fromEntries(b.legacyKeys.map((k,i)=>[k,[i%2?'okundu':'onemli']])));
 assert.ok(migrated[b.id].includes('onemli'));assert.ok(migrated[b.id].includes('okundu'));
 assert.deepEqual(migrateStates(books,{[b.id]:[]},{[b.legacyKeys[0]]:['onemli']})[b.id],[]);
 assert.deepEqual(toggleState(['onemli','alinacak'],'alindi'),['onemli','alindi']);
 assert.deepEqual(toggleState(['okunuyor'],'okundu'),['okundu']);
 assert.equal(filter({states:['onemli']},{[b.id]:['onemli']}).length,1);
});
test('filters survive shareable URL and malformed routes recover',()=>{
 const route={view:'books',sort:'title',book:books[0].id,page:1,pageSize:DEFAULT_PAGE_SIZE,filters:{...emptyFilters(),categories:['strategy','psychology'],categoryMode:'all',yearMin:1980,query:'İyi Strateji'}};
 assert.deepEqual(decodeRoute('#'+encodeRoute(route),catalog),route);
 assert.equal(decodeRoute('#f=broken',catalog).filters.query,'');
});

test('source note markers render as text without losing their meaning',()=>{
 const notes=fs.readFileSync(new URL('../data/sources/kitaplar.md',import.meta.url),'utf8');
 const output=plainTextMarkers(notes);
 assert.ok(!/\p{Extended_Pictographic}/u.test(output));
 for(const label of ['[Doğrulandı]','[Dikkat]','[Doğrulanmadı]','[Bu baskıdan kaçın]'])assert.ok(output.includes(label));
 assert.ok(output.includes('Ali Atav'));assert.ok(output.includes('Canan Feyyat'));
});


test('purchased works stay in catalog and appear in the library; favorites remain independent',()=>{
 const b=books.find(b=>b.id==='goal');
 const states={[b.id]:toggleState(['alinacak','okunuyor','onemli'],'alindi')};
 const owned=booksForShelf(books,states,'owned');
 const discover=booksForShelf(books,states);
 assert.deepEqual(owned.map(b=>b.id),['goal']);
 assert.equal(discover.length,books.length);
 assert.deepEqual(booksForShelf(books,states,'favorites').map(b=>b.id),['goal']);
 assert.ok(discover.some(x=>x.id===b.id));
 assert.ok(states[b.id].includes('okunuyor')&&states[b.id].includes('onemli'));
 for(const id of b.collectionIds)assert.ok(filterBooks(discover,{...emptyFilters(),collections:[id]},states).some(x=>x.id===b.id));
 assert.deepEqual(owned[0].memberships,b.memberships);
 const restored={[b.id]:toggleState(states[b.id],'alindi')};
 assert.equal(booksForShelf(books,restored).length,books.length);
 assert.equal(booksForShelf(books,restored,'owned').length,0);
 const route={view:'owned',sort:'title',book:null,page:1,pageSize:DEFAULT_PAGE_SIZE,filters:{...emptyFilters(),states:['okunuyor']}};
 assert.deepEqual(decodeRoute('#'+encodeRoute(route),catalog),route);
 assert.equal(filterBooks(owned,route.filters,states).length,1);
});

test('books can be filtered by the day they were added and sorted by the latest additions',()=>{
 const day=books.find(b=>b.addedAt)?.addedAt;
 const added=filterBooks(books,{...emptyFilters(),addedDates:[day]});
 assert.ok(added.length>0);
 assert.ok(added.every(b=>b.addedAt===day));
 assert.equal(filterBooks(books,{...emptyFilters(),addedDates:['1999-01-01']}).length,0);
 const sorted=sortBooks(books,'added');
 for(let index=1;index<sorted.length;index++)assert.ok(sorted[index-1].addedAt>=sorted[index].addedAt,sorted[index].id);
 assert.equal(formatDay('2026-10-04'),'4 Ekim 2026');
 assert.equal(formatDay('not a day'),'');
});

test('the latest additions come first, a day keeps reading order and undated books go last',()=>{
 const book=(id,addedAt)=>({id,addedAt,title:id,titleTr:id,author:'',years:[],categories:[],collectionIds:[]});
 const rankings={a:{rank:3,audience:'general'},b:{rank:1,audience:'general'},c:{rank:2,audience:'general'}};
 const order=sortBooks([book('a','2026-10-04'),book('u',undefined),book('b','2026-10-04'),book('c','2026-09-02')],'added',{},rankings).map(b=>b.id);
 assert.deepEqual(order,['b','a','c','u']);
 assert.equal(formatDay('2026-02-30'),'');
});
