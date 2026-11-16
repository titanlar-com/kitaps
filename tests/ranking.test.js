import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReadingPriorityEngine, ReadingRankingViewModel } from '../src/ranking/ReadingPriorityEngine.ts';
import { DEFAULT_READING_POLICY } from '../src/ranking/policy.ts';
import { ReadingGraph } from '../src/ranking/readingGraph.ts';
import { readingGuide } from '../src/recommendations.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../src/catalog.json',import.meta.url)));
const byId=ranked=>Object.fromEntries(ranked.map(item=>[item.bookId,item]));
const fixtureBook=(id,overrides={})=>({
 id,
 title:'Aynı test kitabı',
 author:'Test Yazarı',
 years:[2020],
 categories:['strategy'],
 collectionIds:['test-list'],
 groupIds:['test-list:0'],
 memberships:[{collectionId:'test-list',groupId:'test-list:0',source:'https://example.com/list'}],
 editions:[],
 notes:[],
 origins:['test'],
 tags:[],
 cover:{
  title:'Aynı test kitabı',author:'Test Yazarı',publisher:'Test Publisher',isbn:'9780000000002',
  sourceUrl:'https://example.com/book',imageUrl:'https://example.com/book.jpg',src:'covers/test.jpg',language:'en'
 },
 ...overrides
});
const fixtureCatalog=(books,readingGuides={routes:[],overrides:{}})=>({books,readingGuides});

test('reading priority scores every catalog book once and assigns dense ranks plus stable ordinals',()=>{
 const ranked=new ReadingPriorityEngine(catalog).rank();
 assert.equal(ranked.length,catalog.books.length);
 assert.equal(new Set(ranked.map(item=>item.bookId)).size,catalog.books.length);
 assert.deepEqual(ranked.map(item=>item.ordinal),Array.from({length:catalog.books.length},(_,index)=>index+1));
 // Ranks restart for children's books, which follow the general catalog.
 const firstChild=ranked.findIndex(item=>item.audience==='children');
 assert.ok(firstChild>0,'the catalog has both audiences');
 assert.ok(ranked.slice(0,firstChild).every(item=>item.audience==='general'));
 assert.ok(ranked.slice(firstChild).every(item=>item.audience==='children'));
 assert.equal(ranked[firstChild].rank,1,'children are ranked among themselves');
 assert.ok(ranked.every((item,index)=>index===0||index===firstChild||item.rank>=ranked[index-1].rank));
 assert.ok(ranked.every(item=>(catalog.books.find(book=>book.id===item.bookId).categories.includes('children'))===(item.audience==='children')));
 assert.deepEqual(new Set(ranked.map(item=>item.bookId)),new Set(catalog.books.map(book=>book.id)));
});

test('a year before the common era is a known year, so a classic is not scored as undated',()=>{
 const books=[fixtureBook('ancient',{years:[-400],categories:['history']}),fixtureBook('modern',{years:[2018],categories:['history']}),fixtureBook('undated',{years:[],categories:['history']})];
 const engine=new ReadingPriorityEngine(fixtureCatalog(books));
 const byBook=Object.fromEntries(engine.rank().map(item=>[item.bookId,item]));
 const durability=id=>byBook[id].criteria.find(criterion=>criterion.id==='durability');
 assert.equal(durability('ancient').raw,durability('modern').raw);
 assert.ok(durability('ancient').raw>durability('undated').raw);
 assert.doesNotMatch(durability('ancient').evidence,/katalogda yok/);
 assert.equal(durability('ancient').confidence,durability('modern').confidence);
});

test('the engine has no personal input: purchase, wishlist, favorites, reading states, records and queue cannot reach it',()=>{
 const engine=new ReadingPriorityEngine(catalog);
 assert.equal(engine.rank.length,0,'rank() takes no user context');
 assert.equal(ReadingRankingViewModel.prototype.build.length,0,'build() takes no user context');
 const ids=catalog.books.slice(0,40).map(book=>book.id);
 const personal={
  states:Object.fromEntries(ids.map((id,index)=>[id,[['alindi'],['alinacak'],['onemli'],['okunuyor'],['okundu'],['araverildi'],['birakildi'],['alindi','okundu']][index%8]])),
  queue:ids.slice(0,5),
  reading:Object.fromEntries(ids.map((id,index)=>[id,{startedAt:'2026-09-01',page:index,totalPages:300,why:'Kişisel not'}]))
 };
 // Even a caller that still passes a context gets the same, catalog-only result.
 assert.deepEqual(engine.rank(personal),engine.rank());
 assert.deepEqual(new ReadingPriorityEngine(catalog).rank(),engine.rank());
});

test('no criterion or explanation refers to ownership',()=>{
 const ranked=new ReadingPriorityEngine(catalog).rank();
 assert.deepEqual(Object.keys(DEFAULT_READING_POLICY.weights).sort(),['difficultyFit','durability','editorialConsensus','learningLeverage','preparationFit']);
 for(const item of ranked)for(const criterion of item.criteria)assert.doesNotMatch(criterion.evidence,/sahip olun|satın/i,`${item.bookId}:${criterion.id}`);
 assert.equal(Object.hasOwn(ranked[0],'signals'),false);
});

test('ranking is deterministic regardless of catalog order',()=>{
 const first=new ReadingPriorityEngine(catalog).rank();
 assert.deepEqual(new ReadingPriorityEngine({...catalog,books:[...catalog.books].reverse()}).rank(),first);
});

test('adding and removing a strong outlier recomputes normalization and ranks',()=>{
 const baseBooks=[
  fixtureBook('steady-a'),
  fixtureBook('steady-b',{collectionIds:['test-list','second-list'],groupIds:['test-list:0','second-list:0']})
 ];
 const baseline=new ReadingPriorityEngine(fixtureCatalog(baseBooks)).rank();
 const outlier=fixtureBook('new-outlier',{
  collectionIds:Array.from({length:24},(_,index)=>`list-${index}`),
  groupIds:Array.from({length:24},(_,index)=>`list-${index}:0`),
  categories:['strategy','management','productivity']
 });
 const expanded=new ReadingPriorityEngine(fixtureCatalog([...baseBooks,outlier])).rank();
 const before=byId(baseline);const after=byId(expanded);
 assert.ok(baseBooks.some(book=>before[book.id].criteria.some((item,index)=>after[book.id].criteria[index].normalized!==item.normalized)),'an outlier recomputes a catalog-relative normalization');
 assert.ok(baseBooks.some(book=>before[book.id].score!==after[book.id].score),'an outlier recomputes a retained score');
 assert.deepEqual(new ReadingPriorityEngine(fixtureCatalog(baseBooks)).rank(),baseline,'removing the outlier restores the original ranking');
});

test('preparation and companion relations affect distinct catalog factors',()=>{
 const relationCatalog=fixtureCatalog([fixtureBook('prerequisite'),fixtureBook('target'),fixtureBook('companion')],{routes:[],overrides:{
  prerequisite:{after:[{id:'target'}]},
  target:{before:[{id:'prerequisite'}],companions:[{id:'companion'}]},
  companion:{companions:[{id:'target'}]}
 }});
 const ranked=byId(new ReadingPriorityEngine(relationCatalog).rank());
 const criterion=(id,name)=>ranked[id].criteria.find(item=>item.id===name);
 assert.ok(criterion('prerequisite','learningLeverage').raw>0,'a prerequisite contributes learning leverage');
 assert.ok(criterion('target','learningLeverage').raw>0,'a companion contributes learning leverage');
 assert.ok(criterion('target','preparationFit').raw<criterion('companion','preparationFit').raw,'only an actual before relation creates preparation load');
 assert.equal(criterion('companion','preparationFit').raw,1,'a companion is not treated as a prerequisite');
});

test('routes contribute consecutive steps only, and one-sided links become reciprocal',()=>{
 const graph=new ReadingGraph(fixtureCatalog([fixtureBook('a'),fixtureBook('b'),fixtureBook('c'),fixtureBook('d')],{
  routes:[{category:'strategy',heading:'Strateji',books:['a','b','c']}],
  overrides:{d:{after:[{id:'a',reason:'Önce bu çerçeve kurulmalı; ardından rotaya geçilebilir.'}]}}
 }));
 assert.deepEqual(graph.relations('c').before.map(link=>link.id),['b'],'the route start is not a prerequisite of its third book');
 assert.deepEqual(graph.relations('a').before.map(link=>link.id),['d'],'an after link on d appears as a before link on a');
 assert.equal(graph.prerequisiteCount('c'),1);
 assert.equal(graph.unlockCount('d'),1);
});

test('a route step that would close a loop across routes is left out',()=>{
 const graph=new ReadingGraph(fixtureCatalog([fixtureBook('a'),fixtureBook('b'),fixtureBook('c')],{
  routes:[{category:'strategy',books:['a','b']},{category:'management',books:['b','c']},{category:'psychology',books:['c','a']}],
  overrides:{}
 }));
 assert.deepEqual(graph.relations('a').before.map(link=>link.id),[],'c→a would make a follow itself through b and c');
 assert.deepEqual(graph.relations('c').before.map(link=>link.id),['b']);
});

test('the book page lists exactly the prerequisites the engine scores',()=>{
 const ranked=byId(new ReadingPriorityEngine(catalog).rank());
 for(const book of catalog.books){
  const shown=readingGuide(book,catalog).before.length;
  const evidence=ranked[book.id].criteria.find(item=>item.id==='preparationFit').evidence;
  if(shown===0)assert.match(evidence,/önerilmiyor/,book.id);
  else assert.match(evidence,new RegExp(`^${shown} isteğe bağlı`),book.id);
 }
});

test('children’s books are measured against a young reader',()=>{
 const child=fixtureBook('child',{categories:['children']});
 const adult=fixtureBook('adult',{categories:['strategy']});
 const hard=fixtureBook('hard',{categories:['finance']});
 const ranked=byId(new ReadingPriorityEngine(fixtureCatalog([child,adult,hard])).rank());
 const fit=id=>ranked[id].criteria.find(item=>item.id==='difficultyFit');
 assert.equal(fit('child').raw,fit('adult').raw);
 assert.ok(fit('hard').raw<fit('child').raw);
 assert.match(fit('child').evidence,/genç okur/);
});

test('children’s books are ranked among themselves and follow the general catalog',()=>{
 const listed=Array.from({length:6},(_,index)=>`kids-${index}`);
 const child=fixtureBook('child',{categories:['children'],collectionIds:listed,groupIds:listed.map(id=>`${id}:0`)});
 const quiet=fixtureBook('quiet-child',{categories:['children']});
 const adult=fixtureBook('adult',{categories:['strategy']});
 const ranked=new ReadingPriorityEngine(fixtureCatalog([child,quiet,adult])).rank();
 assert.deepEqual(ranked.map(item=>item.bookId),['adult','child','quiet-child'],'six lists do not lift a children’s book above the general catalog');
 assert.deepEqual(ranked.map(item=>[item.audience,item.rank]),[['general',1],['children',1],['children',2]]);
 assert.match(ranked[1].criteria.find(item=>item.id==='editorialConsensus').evidence,/çocuk kitapları arasında/);
});

test('maturity thresholds come from the versioned policy',()=>{
 const books=[fixtureBook('one'),fixtureBook('two',{collectionIds:['a','b'],groupIds:['a:0','b:0']})];
 const strict={...DEFAULT_READING_POLICY,version:'test-strict',maturity:[{level:5,minScore:101,label:'Hiç'},{level:1,minScore:0,label:'Test düzeyi'}]};
 const ranked=new ReadingPriorityEngine(fixtureCatalog(books),strict).rank();
 assert.ok(ranked.every(item=>item.maturity===1&&item.maturityLabel==='Test düzeyi'&&item.policyVersion==='test-strict'));
 assert.throws(()=>new ReadingPriorityEngine(fixtureCatalog(books),{...DEFAULT_READING_POLICY,maturity:[{level:1,minScore:5,label:'x'}]}),/end at 0/);
 assert.throws(()=>new ReadingPriorityEngine(fixtureCatalog(books),{...DEFAULT_READING_POLICY,weights:{...DEFAULT_READING_POLICY.weights,durability:0.5}}),/total 1/);
});

test('identical books share a dense rank while retaining deterministic ordinals',()=>{
 const books=[fixtureBook('same-c'),fixtureBook('same-a'),fixtureBook('same-b')];
 const ranked=new ReadingPriorityEngine(fixtureCatalog(books)).rank();
 assert.deepEqual(ranked.map(item=>item.bookId),['same-a','same-b','same-c']);
 assert.deepEqual(ranked.map(item=>item.rank),[1,1,1]);
 assert.deepEqual(ranked.map(item=>item.ordinal),[1,2,3]);
});

test('ranking scales linearly to large catalogs',()=>{
 const books=Array.from({length:2000},(_,index)=>fixtureBook(`scale-${index}`,{categories:[['strategy','finance','children'][index%3]],collectionIds:[`list-${index%7}`]}));
 const ranked=new ReadingPriorityEngine(fixtureCatalog(books)).rank();
 assert.equal(ranked.length,2000);
 assert.equal(new Set(ranked.map(item=>item.ordinal)).size,2000);
});

test('every reading score is explained, mature enough to display, and numerically safe',()=>{
 const ranked=new ReadingPriorityEngine(catalog).rank();
 for(const item of ranked){
  assert.ok(Number.isInteger(item.rank)&&item.rank>=1&&item.rank<=catalog.books.length,item.bookId);
  assert.ok(Number.isFinite(item.score)&&item.score>=0&&item.score<=100,item.bookId);
  assert.ok(Number.isFinite(item.confidence)&&item.confidence>=0&&item.confidence<=100,item.bookId);
  assert.ok([1,2,3,4,5].includes(item.maturity),item.bookId);
  assert.ok(item.maturityLabel.trim().length>0,item.bookId);
  assert.equal(item.criteria.length,5,item.bookId);
  assert.ok(item.reasons.length>=2,item.bookId);
  for(const criterion of item.criteria){
   assert.ok(criterion.evidence.trim().length>0,`${item.bookId}:${criterion.id}`);
   for(const key of ['raw','normalized','weight'])assert.ok(Number.isFinite(criterion[key])&&criterion[key]>=0&&criterion[key]<=1,`${item.bookId}:${criterion.id}:${key}`);
   assert.ok(criterion.points>=0&&criterion.points<=100,`${item.bookId}:${criterion.id}:points`);
  }
 }
});
