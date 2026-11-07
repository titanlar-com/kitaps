import test from 'node:test';
import assert from 'node:assert/strict';
import {GITHUB_STATE_COMMIT_IDENTITY,GITHUB_STATE_TOKEN_KEY,GitHubStateRepositoryError} from '../src/state/index.ts';
import {GitHubRouteRegistry,ROUTES_CACHE_KEY,ROUTES_PATH,ROUTES_PENDING_KEY,ROUTES_SCHEMA_VERSION,RouteRegistryError,emptyRouteDocument,listRoutes,mergeRouteDocuments,newRouteId,parseRouteDocument,putRoute,removeRoute} from '../src/state/routeRegistry.ts';

// Bookstore routes are saved to routes.json in titanlar-com/kitaps-state, beside state.json,
// with the same token. Each route is one record; the newer record wins per route id.
// Deliberately not shaped like a real token so secret scanners stay quiet.
const TOKEN='github_pat_TEST_ONLY_not_a_real_token_for_unit_tests';
const API='https://api.github.com/repos/titanlar-com/kitaps-state/contents/routes.json';
const RAW='https://raw.githubusercontent.com/titanlar-com/kitaps-state/main/routes.json';
const at=second=>`2026-11-07T10:00:${String(second).padStart(2,'0')}.000Z`;
const route=(id,extra={})=>({id,title:id,date:null,stops:[],note:'',done:false,...extra});
const doc=(routes={},updatedAt=at(0))=>({schemaVersion:1,updatedAt,routes});
const rec=(second,value)=>({updatedAt:at(second),value});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const withToken=()=>{const local=storage();local.setItem(GITHUB_STATE_TOKEN_KEY,TOKEN);return local;};
const base64=value=>Buffer.from(value,'utf8').toString('base64');
const fromBase64=value=>Buffer.from(value,'base64').toString('utf8');
const contents=(value,sha='remote-sha')=>new Response(JSON.stringify({sha,encoding:'base64',content:base64(JSON.stringify(value))}),{status:200,headers:{'content-type':'application/json'}});
const written=(sha='written-sha')=>new Response(JSON.stringify({content:{sha}}),{status:200});
const missing=()=>new Response('Not Found',{status:404});
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;};
const clock=second=>()=>new Date(at(second));

test('a routes file is read; a malformed record is dropped and the good ones stay',()=>{
 const input=doc({
  iyi:rec(1,route('iyi',{title:'  Beyoğlu turu  ',date:'2026-11-08',stops:['minoa-pera','homer-galatasaray'],note:' Sabah 10’da ',extra:'ignored'})),
  silinen:rec(2,null),
  sinir:rec(1,route('sinir',{title:'a'.repeat(120),stops:Array.from({length:12},(_,index)=>`kitapci-${index}`),note:'n'.repeat(500)})),
  Kotu:rec(1,route('Kotu')),
  'bos-baslik':rec(1,route('bos-baslik',{title:'   '})),
  'uzun-baslik':rec(1,route('uzun-baslik',{title:'a'.repeat(121)})),
  'cok-durak':rec(1,route('cok-durak',{stops:Array.from({length:13},(_,index)=>`kitapci-${index}`)})),
  tekrar:rec(1,route('tekrar',{stops:['minoa-pera','minoa-pera']})),
  'kotu-durak':rec(1,route('kotu-durak',{stops:['Minoa Pera']})),
  'gecersiz-tarih':rec(1,route('gecersiz-tarih',{date:'2026-02-30'})),
  'saatli-tarih':rec(1,route('saatli-tarih',{date:'2026-11-08T10:00:00Z'})),
  'uzun-not':rec(1,route('uzun-not',{note:'n'.repeat(501)})),
  'bitti-mi':rec(1,route('bitti-mi',{done:'evet'})),
  'kotu-zaman':{updatedAt:'dün',value:route('kotu-zaman')},
  'baska-id':rec(1,route('baska')),
  'deger-yok':{updatedAt:at(1)},
 });
 const parsed=parseRouteDocument(JSON.parse(JSON.stringify(input)));
 assert.deepEqual(Object.keys(parsed.routes),['iyi','silinen','sinir']);
 assert.deepEqual(parsed.routes.iyi,rec(1,{id:'iyi',title:'Beyoğlu turu',date:'2026-11-08',stops:['minoa-pera','homer-galatasaray'],note:'Sabah 10’da',done:false}));
 assert.equal(parsed.routes.silinen.value,null);
 assert.equal(parsed.schemaVersion,ROUTES_SCHEMA_VERSION);
 for(const bad of [null,'routes',[],42,{...doc(),schemaVersion:2},{...doc(),updatedAt:'dün'},{...doc(),routes:[]}]){
  assert.throws(()=>parseRouteDocument(bad),error=>error instanceof RouteRegistryError&&error instanceof GitHubStateRepositoryError&&error.code==='invalid-data');
 }
 assert.deepEqual(emptyRouteDocument(),doc({},new Date(0).toISOString()));
 assert.equal(ROUTES_PATH,'routes.json');
});

test('merging keeps the newer record per route, a tie keeps b, and newer deletions win',()=>{
 const a=deepFreeze(doc({
  x:rec(1,route('x',{title:'A eski'})),y:rec(5,route('y',{title:'A yeni'})),t:rec(3,route('t',{title:'A'})),
  d:rec(1,route('d',{title:'Silinecek'})),k:rec(4,route('k',{title:'Kalacak'})),
 },at(5)));
 const b=deepFreeze(doc({
  x:rec(2,route('x',{title:'B yeni'})),y:rec(4,route('y',{title:'B eski'})),t:rec(3,route('t',{title:'B'})),
  d:rec(2,null),k:rec(3,null),z:rec(1,route('z',{title:'Yalnız B'})),
 },at(7)));
 const before=JSON.stringify([a,b]);
 const merged=mergeRouteDocuments(a,b);
 assert.equal(merged.routes.x.value.title,'B yeni');
 assert.equal(merged.routes.y.value.title,'A yeni');
 assert.equal(merged.routes.t.value.title,'B','a tie keeps b');
 assert.equal(merged.routes.d.value,null,'a newer deletion removes the route');
 assert.equal(merged.routes.k.value.title,'Kalacak','an older deletion does not');
 assert.equal(merged.routes.z.value.title,'Yalnız B');
 assert.equal(merged.updatedAt,at(7));
 assert.equal(mergeRouteDocuments(b,a).routes.t.value.title,'A','the tie goes to the second argument');
 assert.equal(mergeRouteDocuments(b,a).updatedAt,at(7));
 assert.equal(JSON.stringify([a,b]),before);
 merged.routes.z.value.stops.push('minoa-pera');
 assert.deepEqual(b.routes.z.value.stops,[],'the merged document shares nothing with its inputs');
});

test('putRoute and removeRoute return new documents and never change their input',()=>{
 const original=deepFreeze(doc({var:rec(20,route('var',{title:'Var olan',stops:['minoa-pera']}))},at(20)));
 const before=JSON.stringify(original);
 const added=putRoute(original,route('yeni',{title:'  Kadıköy  ',date:'2026-11-09',stops:['imge-kadikoy']}),new Date(at(30)));
 assert.equal(JSON.stringify(original),before);
 assert.deepEqual(added.routes.yeni,rec(30,route('yeni',{title:'Kadıköy',date:'2026-11-09',stops:['imge-kadikoy']})));
 assert.equal(added.updatedAt,at(30));
 added.routes.var.value.stops.push('homer-galatasaray');
 assert.deepEqual(original.routes.var.value.stops,['minoa-pera']);
 const removed=removeRoute(original,'var',at(31));
 assert.deepEqual(removed.routes.var,rec(31,null));
 assert.equal(original.routes.var.value.title,'Var olan');
 // A clock behind the device that wrote the old record still produces the newer record.
 const behind=putRoute(original,route('var',{title:'Düzeltilmiş'}),at(10));
 assert.equal(behind.routes.var.updatedAt,'2026-11-07T10:00:20.001Z');
 assert.equal(mergeRouteDocuments(original,behind).routes.var.value.title,'Düzeltilmiş');
 for(const bad of [route('Kötü'),route('bos',{title:' '}),route('tarih',{date:'7 Kasım'}),route('cok',{stops:['a','a']})]){
  assert.throws(()=>putRoute(original,bad,at(40)),TypeError);
 }
 assert.throws(()=>removeRoute(original,'Kötü id',at(40)),TypeError);
 assert.throws(()=>putRoute(original,route('saat'),'dün'),TypeError);
});

test('listRoutes puts dated routes first by day, then undated ones in Turkish order',()=>{
 let routes=emptyRouteDocument();
 // One store may be visited in several routes on different days.
 for(const item of [
  route('dolapdere',{title:'Dolapdere'}),route('cukurcuma',{title:'Çukurcuma'}),route('cihangir',{title:'Cihangir'}),
  route('zeytinburnu',{title:'Zeytinburnu',date:'2026-11-08',stops:['minoa-pera']}),route('besiktas',{title:'Beşiktaş',date:'2026-11-08'}),
  route('pera',{title:'Pera',date:'2026-11-07',stops:['minoa-pera','mephisto-beyoglu']}),route('silinen',{title:'Silinen',date:'2026-11-01'}),
 ])routes=putRoute(routes,item,at(1));
 routes=removeRoute(routes,'silinen',at(2));
 assert.deepEqual(listRoutes(routes).map(item=>item.id),['pera','besiktas','zeytinburnu','cihangir','cukurcuma','dolapdere']);
 const listed=listRoutes(routes);listed[0].stops.push('homer-galatasaray');
 assert.deepEqual(routes.routes.pera.value.stops,['minoa-pera','mephisto-beyoglu'],'listed routes are copies');
});

test('route ids are ASCII slugs of Turkish titles and stay unique',()=>{
 assert.equal(newRouteId('Kadıköy, Şişli ve Üsküdar gezisi',[]),'kadikoy-sisli-ve-uskudar-gezisi');
 assert.equal(newRouteId('İSTİKLAL ÇARŞI ĞÖÜ',[]),'istiklal-carsi-gou');
 assert.equal(newRouteId('Kâğıt & Mürekkep: 7 Kasım',[]),'kagit-murekkep-7-kasim');
 assert.equal(newRouteId('Beyoğlu turu',['beyoglu-turu']),'beyoglu-turu-2');
 assert.equal(newRouteId('Beyoğlu turu',new Set(['beyoglu-turu','beyoglu-turu-2'])),'beyoglu-turu-3');
 assert.equal(newRouteId('  ?!  ',[]),'rota');
 const long=newRouteId('Sahaflar Çarşısı '.repeat(10),[]);
 assert.ok(long.length<=64&&/^[a-z0-9-]{1,64}$/.test(long)&&!long.endsWith('-'),long);
 const longer=newRouteId('Sahaflar Çarşısı '.repeat(10),[long]);
 assert.ok(longer.length<=64&&longer.endsWith('-2'),longer);
});

test('without a token load reads the CDN copy with a cache-busting query; a missing file is empty',async()=>{
 const requests=[];
 const local=storage();
 const registry=new GitHubRouteRegistry({storage:local,clock:clock(5),fetch:async(url,init)=>{requests.push({url,init});return missing();}});
 assert.deepEqual(await registry.load(),emptyRouteDocument());
 assert.equal(requests[0].url,`${RAW}?t=${Date.parse(at(5))}`);
 assert.equal(Object.keys(requests[0].init.headers||{}).length,0,'no custom headers means no CORS preflight');
 assert.equal(requests[0].init.cache,'no-store');
 // The remote file is merged with this device's unsent changes and cached.
 local.setItem(ROUTES_PENDING_KEY,JSON.stringify(doc({yerel:rec(4,route('yerel'))},at(4))));
 const remote=doc({uzak:rec(1,route('uzak',{title:'Uzak'}))},at(1));
 const reader=new GitHubRouteRegistry({storage:local,clock:clock(6),fetch:async()=>new Response(JSON.stringify(remote),{status:200})});
 const loaded=await reader.load();
 assert.deepEqual(Object.keys(loaded.routes),['uzak','yerel']);
 assert.deepEqual(JSON.parse(local.getItem(ROUTES_CACHE_KEY)),loaded);
 assert.deepEqual(new GitHubRouteRegistry({storage:local}).cached(),loaded);
});

test('with a token load reads the Contents API and decodes Turkish text',async()=>{
 const remote=doc({kadikoy:rec(1,route('kadikoy',{title:'Kadıköy ğüşiöç',note:'İŞÇĞÜÖ'}))},at(1));
 let request;
 const registry=new GitHubRouteRegistry({storage:withToken(),fetch:async(url,init)=>{request={url,init};return contents(remote);}});
 assert.deepEqual(await registry.load(),remote);
 assert.equal(request.url,`${API}?ref=main`);
 assert.equal(request.init.headers.Authorization,`Bearer ${TOKEN}`);
 assert.equal(request.init.headers.Accept,'application/vnd.github+json');
 assert.equal(request.init.headers['X-GitHub-Api-Version'],'2022-11-28');
 // A refused token stops writes, not reads: the public copy is read instead.
 const urls=[];
 const refused=new GitHubRouteRegistry({storage:withToken(),fetch:async url=>{urls.push(url);return url.startsWith(API)?new Response('',{status:401}):new Response(JSON.stringify(remote),{status:200});}});
 assert.deepEqual(await refused.load(),remote);
 assert.ok(urls[1].startsWith(`${RAW}?t=`));
});

test('update with a token writes routes.json with the sha, the owner identity and UTF-8 base64',async()=>{
 const requests=[];
 const local=withToken();
 const registry=new GitHubRouteRegistry({storage:local,clock:clock(10),fetch:async(url,init)=>{
  requests.push({url,init});
  return init.method==='PUT'?written():contents(doc({},at(1)),'remote-sha');
 }});
 const turkish=route('kadikoy',{title:'Kadıköy ğüşiöç',date:'2026-11-08',stops:['imge-kadikoy'],note:'Şule’ye sor: Çarşı İçi'});
 const result=await registry.update((routes,now)=>putRoute(routes,turkish,now));
 assert.equal(result.saved,true);
 const put=requests.find(item=>item.init.method==='PUT');
 assert.equal(put.url,API);
 assert.equal(requests[0].url,`${API}?ref=main`);
 assert.equal(put.init.headers.Authorization,`Bearer ${TOKEN}`);
 const body=JSON.parse(put.init.body);
 assert.equal(body.message,'Update reading routes');
 assert.equal(body.branch,'main');
 assert.equal(body.sha,'remote-sha');
 assert.deepEqual(body.committer,GITHUB_STATE_COMMIT_IDENTITY);
 assert.deepEqual(body.author,GITHUB_STATE_COMMIT_IDENTITY);
 assert.ok(!put.init.body.includes(TOKEN),'the token never goes into the file');
 const text=fromBase64(body.content);
 assert.equal(text,`${JSON.stringify(JSON.parse(text),null,2)}\n`,'two-space JSON with a trailing newline');
 const uploaded=JSON.parse(text);
 assert.equal(uploaded.routes.kadikoy.value.title,'Kadıköy ğüşiöç');
 assert.equal(uploaded.routes.kadikoy.value.note,'Şule’ye sor: Çarşı İçi');
 assert.deepEqual(uploaded,result.document);
 assert.equal(registry.pendingCount(),0,'a saved change is no longer pending');
 // Round trip: the registry decodes its own upload, with GitHub's line breaks in the base64.
 const wrapped=body.content.replace(/.{60}/g,'$&\n');
 const reader=new GitHubRouteRegistry({storage:withToken(),fetch:async()=>new Response(JSON.stringify({sha:'s',encoding:'base64',content:wrapped}),{status:200})});
 assert.equal((await reader.load()).routes.kadikoy.value.title,'Kadıköy ğüşiöç');
 // A file that does not exist yet is created without a sha.
 const creates=[];
 const fresh=new GitHubRouteRegistry({storage:withToken(),clock:clock(11),fetch:async(url,init)=>{creates.push(init);return init.method==='PUT'?written():missing();}});
 assert.equal((await fresh.update((routes,now)=>putRoute(routes,route('ilk'),now))).saved,true);
 assert.equal('sha' in JSON.parse(creates[1].body),false);
});

test('a 409 conflict re-reads the file and the retry keeps both the remote and the local route',async()=>{
 let gets=0;const puts=[];
 const first=doc({uzak:rec(1,route('uzak',{title:'Uzak rota'}))},at(1));
 const second=doc({uzak:rec(1,route('uzak',{title:'Uzak rota'})),araya:rec(3,route('araya',{title:'Başka cihazdan',stops:['minoa-pera']}))},at(3));
 const registry=new GitHubRouteRegistry({storage:withToken(),clock:clock(10),fetch:async(url,init)=>{
  if(init.method==='PUT'){puts.push(JSON.parse(init.body));return puts.length===1?new Response('',{status:409}):written();}
  gets++;return gets===1?contents(first,'sha-1'):contents(second,'sha-2');
 }});
 const result=await registry.update((routes,now)=>putRoute(routes,route('yerel',{title:'Yerel rota',stops:['minoa-pera']}),now));
 assert.equal(result.saved,true);
 assert.equal(gets,2);assert.equal(puts.length,2);
 assert.equal(puts[0].sha,'sha-1');assert.equal(puts[1].sha,'sha-2');
 const uploaded=JSON.parse(fromBase64(puts[1].content));
 assert.deepEqual(Object.keys(uploaded.routes),['araya','uzak','yerel']);
 assert.deepEqual(listRoutes(result.document).map(item=>item.id),['araya','uzak','yerel']);
 assert.equal(registry.pendingCount(),0);
 // Conflicts that never stop give up after maxConflictRetries and keep the change.
 let attempts=0;
 const stuck=new GitHubRouteRegistry({storage:withToken(),maxConflictRetries:2,fetch:async(url,init)=>{if(init.method==='PUT'){attempts++;return new Response('',{status:422});}return contents(first,`sha-${attempts}`);}});
 await assert.rejects(()=>stuck.update((routes,now)=>putRoute(routes,route('yerel'),now)),error=>error instanceof RouteRegistryError&&error.code==='conflict');
 assert.equal(attempts,3);assert.equal(stuck.pendingCount(),1);
});

test('without a token the change stays pending, and the next update sends it',async()=>{
 const local=storage();const requests=[];
 const registry=new GitHubRouteRegistry({storage:local,clock:clock(10),fetch:async(url,init)=>{requests.push({url,init});return init.method==='PUT'?written():missing();}});
 const offline=await registry.update((routes,now)=>putRoute(routes,route('ilk',{title:'İlk rota'}),now));
 assert.equal(offline.saved,false);
 assert.equal(requests.length,0,'nothing is sent without a token');
 assert.equal(registry.pendingCount(),1);
 assert.deepEqual(listRoutes(offline.document).map(item=>item.id),['ilk']);
 assert.deepEqual(listRoutes(new GitHubRouteRegistry({storage:local}).cached()).map(item=>item.id),['ilk'],'a reload still shows it');
 local.setItem(GITHUB_STATE_TOKEN_KEY,TOKEN);
 const online=await registry.update((routes,now)=>putRoute(routes,route('ikinci',{title:'İkinci rota'}),now));
 assert.equal(online.saved,true);
 const put=requests.find(item=>item.init.method==='PUT');
 assert.deepEqual(Object.keys(JSON.parse(fromBase64(JSON.parse(put.init.body).content)).routes),['ikinci','ilk']);
 assert.equal(registry.pendingCount(),0);
 assert.equal(local.getItem(ROUTES_PENDING_KEY),null);
 // A flush with nothing pending reads the file but makes no empty commit.
 const before=requests.length;
 await registry.flush();
 assert.equal(requests.slice(before).filter(item=>item.init.method==='PUT').length,0);
});

test('401 becomes an unauthorized error and the change stays pending',async()=>{
 for(const failing of ['GET','PUT']){
  const registry=new GitHubRouteRegistry({storage:withToken(),clock:clock(10),fetch:async(url,init)=>(init.method??'GET')===failing?new Response('',{status:401}):contents(doc())});
  await assert.rejects(()=>registry.update((routes,now)=>putRoute(routes,route('bekleyen'),now)),error=>error instanceof RouteRegistryError&&error.code==='unauthorized'&&error.status===401);
  assert.equal(registry.pendingCount(),1,`${failing}: the change is kept`);
  assert.deepEqual(listRoutes(registry.cached()).map(item=>item.id),['bekleyen']);
 }
 for(const [response,code] of [
  [()=>{throw new TypeError('Failed to fetch');},'network'],
  [()=>new Response('',{status:403}),'unauthorized'],
  [()=>new Response('',{status:403,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':'1790600000'}}),'rate-limited'],
  [()=>new Response('',{status:500}),'network'],
 ]){
  const registry=new GitHubRouteRegistry({storage:withToken(),fetch:async()=>response()});
  await assert.rejects(()=>registry.update((routes,now)=>putRoute(routes,route('bekleyen'),now)),error=>error instanceof RouteRegistryError&&error.code===code);
  assert.equal(registry.pendingCount(),1,code);
 }
 const invalid=new GitHubRouteRegistry({storage:withToken(),fetch:async()=>contents({schemaVersion:2,updatedAt:at(1),routes:{}})});
 await assert.rejects(()=>invalid.update((routes,now)=>putRoute(routes,route('bekleyen'),now)),error=>error.code==='invalid-data','a newer schema is never overwritten');
 assert.equal(invalid.pendingCount(),1);
});

test('cached never throws on damaged or unavailable storage, and bad updates are refused locally',async()=>{
 const damaged=storage();damaged.setItem(ROUTES_CACHE_KEY,'{not json');damaged.setItem(ROUTES_PENDING_KEY,JSON.stringify({schemaVersion:9}));
 assert.deepEqual(new GitHubRouteRegistry({storage:damaged}).cached(),emptyRouteDocument());
 const broken={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');},removeItem:()=>{throw new Error('denied');}};
 const registry=new GitHubRouteRegistry({storage:broken,fetch:async()=>missing()});
 assert.deepEqual(registry.cached(),emptyRouteDocument());
 await assert.rejects(()=>registry.update((routes,now)=>putRoute(routes,route('yer-yok'),now)),error=>error instanceof RouteRegistryError&&error.code==='storage');
 const local=storage();
 const strict=new GitHubRouteRegistry({storage:local,fetch:async()=>missing()});
 await assert.rejects(()=>strict.update(routes=>({...routes,routes:{...routes.routes,kotu:rec(1,route('kotu',{title:''}))}})),TypeError);
 assert.equal(strict.pendingCount(),0,'an invalid route is never queued');
});
