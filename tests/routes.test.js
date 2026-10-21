import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_PAGE_SIZE,GRID_COLUMNS,PAGE_SIZES,emptyFilters,encodeRoute,decodeRoute,bookSlug } from '../src/library.js';
import { displayTitle,translationStatus,turkishMeaning } from '../src/translation.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../src/catalog.json',import.meta.url)));
test('readable English query parameters survive reload and retain legacy hashes',()=>{
 const route={view:'books',sort:'reading',book:null,page:1,pageSize:DEFAULT_PAGE_SIZE,filters:{...emptyFilters(),categories:['strategy']}};
 assert.equal(encodeRoute(route),'category=strategy');
 assert.deepEqual(decodeRoute('?category=strategy',catalog),route);
 assert.deepEqual(decodeRoute('#f=%7B%22categories%22%3A%5B%22strategy%22%5D%7D',catalog),route);
 const all={...route,view:'owned',book:'goal',sort:'newest',filters:{...emptyFilters(),states:['okunuyor'],awards:['Kazanan'],authors:['Chip and Dan Heath'],awardYears:['2025'],categories:['management','systems'],categoryMode:'all',yearMin:1980,yearMax:2026,shared:true,hasEdition:true}};
 const url=encodeRoute(all,catalog);assert.ok(url.includes('view=library'));assert.ok(url.includes('status=reading'));assert.ok(url.includes('award=winner'));assert.ok(!url.includes('%7B'));
 assert.deepEqual(decodeRoute('?'+url,catalog),all);
 assert.deepEqual(decodeRoute('?category=unknown&year-from=no',catalog).filters,emptyFilters());
});
test('pagination has durable readable URLs',()=>{
 const route={view:'books',sort:'reading',book:null,page:5,pageSize:48,filters:emptyFilters()};
 assert.equal(encodeRoute(route,catalog),'page=5&page-size=48');
 assert.deepEqual(decodeRoute('?page=5&page-size=48',catalog),route);
 assert.equal(decodeRoute('?page=0&page-size=99',catalog).page,1);
 assert.equal(decodeRoute('?page=0&page-size=99',catalog).pageSize,DEFAULT_PAGE_SIZE);
 assert.equal(encodeRoute({...route,page:1,pageSize:DEFAULT_PAGE_SIZE},catalog),'');
});
test('page sizes are the owner’s multiples of 24 and every one fills the grid’s last row',()=>{
 // Fixed by the owner (AGENTS.md); change them only on the owner's explicit instruction.
 assert.deepEqual(PAGE_SIZES,[24,48,96,192,384]);
 assert.equal(DEFAULT_PAGE_SIZE,24);
 assert.deepEqual(GRID_COLUMNS,[2,3,4]);
 for(const size of PAGE_SIZES)for(const columns of GRID_COLUMNS)assert.equal(size%columns,0,`${size} books in ${columns} columns`);
 // Links shared before a change open on the page that holds their first book.
 for(const [query,pageSize,page] of [['?page-size=12',24,1],['?page=2&page-size=12',24,1],['?page=3&page-size=25',24,3],['?page=5&page-size=50',48,5],['?page=2&page-size=75',96,1],['?page=4&page-size=100',96,4],['?page=3&page-size=24',24,3],['?page=5&page-size=48',48,5]]){
  const route=decodeRoute(query,catalog);
  assert.deepEqual([route.pageSize,route.page],[pageSize,page],query);
 }
});
test('readable book URLs resolve every title without collisions',()=>{
 const slugs=catalog.books.map(bookSlug);assert.equal(new Set(slugs).size,catalog.books.length);
 for(const b of catalog.books)assert.equal(decodeRoute('?book='+bookSlug(b),catalog).book,b.id);
});
test('a corrected author credit keeps the book’s shared URL',()=>{
 const smartChoices=catalog.books.find(b=>b.id==='smartchoices');
 assert.equal(smartChoices.author,'John S. Hammond, Ralph L. Keeney & Howard Raiffa');
 assert.equal(decodeRoute('?book=smart-choices-by-john-s-hammond-et-al',catalog).book,'smartchoices');
 assert.equal(decodeRoute('?book=the-economist-numbers-guide-by-richard-stuteley',catalog).book,'economistnumbersguide');
});
test('translation absence is never inferred from an original cover or translated title',()=>{
 assert.equal(translationStatus({titleTr:'Türkçe bir ad',cover:{language:'en'}}).status,'unverified');
 assert.equal(translationStatus({cover:{language:'tr'}}).status,'available');
 assert.equal(translationStatus({verifiedEdition:{sourceUrl:'https://example.com'}}).status,'available');
 assert.equal(translationStatus({translationResearch:{status:'unavailable'}}).status,'unverified');
 assert.equal(translationStatus({translationResearch:{status:'unavailable',scopeNote:'İki aşamada bulunamadı.',stage1:{sources:[{url:'https://example.com/evidence'}]}}}).status,'unavailable');
 assert.equal(translationStatus({translationResearch:{status:'original',stage1:{sources:[{url:'https://example.com/original'}]}}}).status,'original');
});
test('unverified and unavailable works keep their original title while preserving a Turkish meaning',()=>{
 const unverified={title:'Çocuklar İçin Yunan Mitolojisi',titleTr:'',cover:{language:'en',title:'Orchard Greek Myths'},editions:[{turkish:'Çocuklar İçin Yunan Mitolojisi'}]};
 assert.equal(displayTitle(unverified),'Orchard Greek Myths');
 assert.equal(turkishMeaning(unverified),'Çocuklar İçin Yunan Mitolojisi');
 const imported={title:'Çocuklar İçin Yunan Mitolojisi',titleTr:'',cover:{language:'en',title:'Orchard Greek Myths'},editions:[{turkish:''}]};
 assert.equal(turkishMeaning(imported),'Çocuklar İçin Yunan Mitolojisi');
 const available={title:'The Mom Test',titleTr:'Anne Testi',cover:{language:'tr',title:'Anne Testi'}};
 assert.equal(displayTitle(available),'Anne Testi');
 assert.equal(turkishMeaning(available),'');
});

test('the added-day filter lives in the URL and ignores unknown days',()=>{
 const day=catalog.books.find(b=>b.addedAt).addedAt;
 const route={view:'books',sort:'added',book:null,page:1,pageSize:DEFAULT_PAGE_SIZE,filters:{...emptyFilters(),addedDates:[day]}};
 assert.equal(encodeRoute(route,catalog),`added=${day}&sort=added`);
 assert.deepEqual(decodeRoute(`?added=${day}&sort=added`,catalog),route);
 assert.deepEqual(decodeRoute('?added=1999-01-01',catalog).filters.addedDates,[]);
});
