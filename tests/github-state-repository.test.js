import test from 'node:test';
import assert from 'node:assert/strict';
import {FINE_GRAINED_TOKEN,GITHUB_REQUEST_HEADERS,GitHubStateBatcher,GitHubStateRepository,GitHubStateRepositoryError,MIN_GITHUB_SYNC_DELAY_MS,applyPendingMutations,assertStateDocument,emptyStateDocument,fieldStamp,planConnect,planFirstSync,projectPublicState,upgradeStateDocument} from '../src/state/index.ts';

// Copied from GitHub's live preflight response (Access-Control-Allow-Headers).
const GITHUB_CORS_ALLOWED=['authorization','content-type','if-match','if-modified-since','if-none-match','if-unmodified-since','accept-encoding','x-github-otp','x-requested-with','user-agent','graphql-features','x-github-next-global-id','x-github-api-version','x-fetch-nonce','copilot-integration-id','dd-client-token','x-client-application'];
const CORS_SAFELISTED=['accept','accept-language','content-language'];
// Deliberately not shaped like a real token so secret scanners stay quiet.
const TOKEN='github_pat_TEST_ONLY_not_a_real_token_for_unit_tests';
const timestamp=second=>`2026-09-28T10:00:${String(second).padStart(2,'0')}.000Z`;
const document=(books={},updatedAt=timestamp(0),queue=null)=>({schemaVersion:2,updatedAt,books,queue});
const record=(second,value,stamps)=>({updatedAt:timestamp(second),value,...(stamps?{stamps}:{})});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const withToken=()=>{const local=storage();local.setItem(GitHubStateRepository.TOKEN_KEY,TOKEN);return local;};
const base64=value=>Buffer.from(value,'utf8').toString('base64');
const contents=(value,sha='remote-sha',headers={})=>new Response(JSON.stringify({sha,encoding:'base64',content:base64(JSON.stringify(value))}),{status:200,headers:{'content-type':'application/json',...headers}});
const raw=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'text/plain'}});
const assertCorsSafe=(init,context)=>{for(const name of Object.keys(init.headers||{})){const lower=name.toLowerCase();assert.ok(GITHUB_CORS_ALLOWED.includes(lower)||CORS_SAFELISTED.includes(lower),`${context}: header ${name} would fail GitHub's CORS preflight`);}};

test('every request header stays inside GitHub’s CORS allowlist',async()=>{
 assert.ok(GITHUB_REQUEST_HEADERS.every(name=>GITHUB_CORS_ALLOWED.includes(name.toLowerCase())||CORS_SAFELISTED.includes(name.toLowerCase())));
 const requests=[];
 const fetch=async(url,init)=>{requests.push({url,init});if(init.method==='PUT')return new Response('{}',{status:200});return url.startsWith('https://raw.')?raw(emptyStateDocument()):contents(emptyStateDocument(),'sha',{ETag:'"e1"'});};
 await new GitHubStateRepository({storage:storage(),fetch}).load();
 const connected=new GitHubStateRepository({storage:withToken(),fetch});
 await connected.load();await connected.load();
 await connected.validateToken(TOKEN);
 connected.queueBookState('a',{states:['onemli']});await connected.flushPending();
 for(const {url,init} of requests)assertCorsSafe(init,url);
 assert.ok(requests.every(({init})=>init.cache==='no-store'));
});

test('anonymous devices read the CDN copy with a simple request; connected devices read the API with a token',async()=>{
 const remote=document({kitap:record(1,{reading:{why:'Türkçe not'}})},timestamp(1));
 let request;
 const anonymous=new GitHubStateRepository({storage:storage(),fetch:async(url,init)=>{request={url,init};return raw(remote);}});
 assert.deepEqual(await anonymous.load(),remote);
 assert.equal(request.url,'https://raw.githubusercontent.com/titanlar-com/kitaps-state/main/state.json');
 assert.equal(Object.keys(request.init.headers||{}).length,0,'no custom headers means no preflight');
 const connected=new GitHubStateRepository({storage:withToken(),fetch:async(url,init)=>{request={url,init};return contents(remote);}});
 await connected.load();
 assert.match(request.url,/api\.github\.com\/repos\/titanlar-com\/kitaps-state\/contents\/state\.json/);
 assert.equal(request.init.headers.Authorization,`Bearer ${TOKEN}`);
});

test('conditional reads reuse the cached file when GitHub answers 304',async()=>{
 const remote=document({a:record(1,{states:['okundu']})},timestamp(1));let calls=0,lastInit;
 const repository=new GitHubStateRepository({storage:withToken(),fetch:async(url,init)=>{calls++;lastInit=init;return calls===1?contents(remote,'sha-1',{ETag:'"v1"'}):new Response(null,{status:304});}});
 assert.deepEqual(await repository.load(),remote);
 assert.deepEqual(await repository.load(),remote);
 assert.equal(lastInit.headers['If-None-Match'],'"v1"');
});

test('only fine-grained tokens without classic scopes are accepted',async()=>{
 let requests=0;
 const repository=new GitHubStateRepository({storage:storage(),fetch:async()=>{requests++;return contents(emptyStateDocument());}});
 for(const classic of ['ghp_example','gho_example','short'])await assert.rejects(()=>repository.validateToken(classic),error=>error.code==='token-type');
 assert.equal(requests,0,'a classic token is refused before it is ever sent');
 assert.throws(()=>repository.setToken('ghp_example'),error=>error.code==='token-type');
 assert.ok(FINE_GRAINED_TOKEN.test(TOKEN));
 await repository.validateToken(TOKEN);assert.equal(repository.hasToken(),false,'validation never stores the token');
 repository.setToken(TOKEN);assert.equal(repository.hasToken(),true);
 const scoped=new GitHubStateRepository({storage:storage(),fetch:async()=>contents(emptyStateDocument(),'sha',{'X-OAuth-Scopes':'repo, workflow'})});
 await assert.rejects(()=>scoped.validateToken(TOKEN),error=>error.code==='token-type');
});

test('save requires a token, merges the remote file and never puts the token in the body',async()=>{
 const repositoryWithoutToken=new GitHubStateRepository({storage:storage(),fetch:async()=>contents(emptyStateDocument())});
 await assert.rejects(()=>repositoryWithoutToken.save([]),error=>error instanceof GitHubStateRepositoryError&&error.code==='unauthorized');
 const requests=[];
 const repository=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(timestamp(5)),fetch:async(url,init)=>{
  requests.push({url,init});
  if(init.method==='PUT')return new Response('{}',{status:200});
  return contents(document({remote:record(1,{states:['onemli']})},timestamp(1)));
 }});
 repository.queueBookState('local',{states:['alindi']});
 const saved=await repository.flushPending();
 assert.deepEqual(Object.keys(saved.books).sort(),['local','remote']);
 const put=requests.find(item=>item.init.method==='PUT');const body=JSON.parse(put.init.body);
 assert.equal(put.init.headers.Authorization,`Bearer ${TOKEN}`);assert.equal(body.sha,'remote-sha');assert.ok(!put.init.body.includes(TOKEN));
 const uploaded=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));assert.deepEqual(uploaded,saved);
 assertStateDocument(uploaded);
});

test('pending changes survive locally, remember when they started and clear after a successful save',async()=>{
 const repository=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(timestamp(4)),fetch:async(url,init)=>init.method==='PUT'?new Response('{}',{status:200}):contents(emptyStateDocument())});
 assert.equal(repository.getPendingSince(),null);
 repository.queueBookState('book-a',{states:['okunuyor']});
 const since=repository.getPendingSince();
 repository.queueBookState('book-b',{states:['onemli']});
 assert.equal(repository.getPendingSince(),since,'later changes do not move the window start');
 assert.equal(repository.getPendingCount(),2);
 const saved=await repository.flushPending();
 assert.deepEqual(saved.books['book-a'].value,{states:['okunuyor']});
 assert.equal(repository.getPendingCount(),0);assert.equal(repository.getPendingSince(),null);
});

test('401, 404, rate limits and repeated 409 responses become typed errors',async()=>{
 for(const [status,code] of [[401,'unauthorized'],[404,'not-found']]){
  const repository=new GitHubStateRepository({storage:withToken(),fetch:async()=>new Response('',{status})});
  await assert.rejects(()=>repository.load(),error=>error instanceof GitHubStateRepositoryError&&error.code===code&&error.status===status);
 }
 const limited=new GitHubStateRepository({storage:withToken(),fetch:async()=>new Response('',{status:403,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':'1790600000'}})});
 await assert.rejects(()=>limited.load(),error=>error.code==='rate-limited'&&error.retryAt===1790600000000);
 let puts=0;
 const repository=new GitHubStateRepository({storage:withToken(),maxConflictRetries:1,fetch:async(url,init)=>{if(init.method==='PUT'){puts++;return new Response('',{status:409});}return contents(emptyStateDocument(),`sha-${puts}`);}});
 repository.queueBookState('a',{states:['onemli']});
 await assert.rejects(()=>repository.flushPending(),error=>error instanceof GitHubStateRepositoryError&&error.code==='conflict'&&error.status===409);
 assert.equal(puts,2);assert.equal(repository.getPendingCount(),1,'a failed save keeps the change queued');
});

test('422 conflicts re-read and retry like 409 conflicts',async()=>{
 let puts=0,gets=0;
 const repository=new GitHubStateRepository({storage:withToken(),maxConflictRetries:1,fetch:async(url,init)=>{
  if(init.method==='PUT'){puts++;return new Response('{}',{status:puts===1?422:200});}
  gets++;return contents(emptyStateDocument(),`sha-${gets}`);
 }});
 repository.queueBookState('a',{states:['alindi']});
 await repository.flushPending();
 assert.equal(puts,2);assert.equal(gets,2);
});

test('the batcher waits 120 seconds from the first change and sends one combined flush',async()=>{
 const repository=new GitHubStateRepository({storage:storage(),fetch:async()=>raw(emptyStateDocument())});
 const timers=new Map();let nextTimer=0,flushes=0,now=Date.parse(timestamp(0));
 const batcher=new GitHubStateBatcher(repository,async()=>{flushes++;},{
  delayMs:100,now:()=>now,
  setTimeout:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},
  clearTimeout:id=>timers.delete(id),
 });
 batcher.queueBookState('favorite',{states:['onemli']},timestamp(0));
 assert.equal(repository.getPendingCount(),1,'the unload-safe queue is written synchronously');
 assert.equal([...timers.values()][0].delay,MIN_GITHUB_SYNC_DELAY_MS,'the minimum cannot be lowered');
 now+=30_000;
 batcher.queueBookState('library',{states:['alindi']});
 batcher.queueQueueState(['library','favorite']);
 assert.equal(repository.getPendingCount(),3);
 assert.equal(timers.size,1,'later changes join the same scheduled flush');
 assert.equal(flushes,0,'nothing is sent before the window closes');
 const [{callback}]=timers.values();callback();await Promise.resolve();
 assert.equal(flushes,1,'the batch results in one remote write');
});

test('a change older than 120 seconds is sent as soon as the next visit schedules it',()=>{
 const repository=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(0)),fetch:async()=>raw(emptyStateDocument())});
 repository.queueBookState('a',{states:['onemli']});
 const timers=[];
 const early=new GitHubStateBatcher(repository,async()=>{},{now:()=>Date.parse(timestamp(0))+45_000,setTimeout:(callback,delay)=>{timers.push(delay);return timers.length;},clearTimeout:()=>{}});
 early.schedule();assert.equal(timers.at(-1),75_000,'the window is counted from the change, not the page load');
 const later=new GitHubStateBatcher(repository,async()=>{},{now:()=>Date.parse(timestamp(0))+300_000,setTimeout:(callback,delay)=>{timers.push(delay);return timers.length;},clearTimeout:()=>{}});
 later.schedule();assert.equal(timers.at(-1),0);
});

test('bounded retries back off after a failed flush',async()=>{
 const repository=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(0)),fetch:async()=>raw(emptyStateDocument())});
 const timers=new Map();let timerId=0,attempts=0;
 const batcher=new GitHubStateBatcher(repository,async()=>{attempts++;if(attempts<3)throw new Error('offline');},{
  now:()=>Date.parse(timestamp(0)),setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),retryDelaysMs:[10,20],
 });
 batcher.queueBookState('a',{states:['onemli']});
 const runNext=async()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);timer.callback();await new Promise(resolve=>setImmediate(resolve));};
 await runNext();assert.equal([...timers.values()][0].delay,10);
 await runNext();assert.equal([...timers.values()][0].delay,20);
 await runNext();assert.equal(attempts,3);assert.equal(timers.size,0);
});

test('disposing the batcher leaves pending changes in local storage',()=>{
 const local=storage();
 const repository=new GitHubStateRepository({storage:local,fetch:async()=>raw(emptyStateDocument())});
 const timers=new Map();let nextTimer=0;
 const batcher=new GitHubStateBatcher(repository,async()=>{},{setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)});
 batcher.queueBookState('book-a',{states:['onemli']},timestamp(1));
 const persisted=local.getItem(GitHubStateRepository.PENDING_KEY);
 batcher.dispose();
 assert.equal(timers.size,0);assert.equal(local.getItem(GitHubStateRepository.PENDING_KEY),persisted);assert.equal(repository.getPendingCount(),1);
});

test('pending changes coalesce per book and per queue',()=>{
 const local=storage();
 const repository=new GitHubStateRepository({storage:local,fetch:async()=>raw(emptyStateDocument())});
 repository.queueBookState('book-a',{states:['onemli'],reading:{why:'özel not',page:12}},timestamp(1));
 repository.queueBookState('book-a',{reading:{startedAt:'2026-01-01'}},timestamp(2));
 repository.queueQueueState(['book-a'],timestamp(3));repository.queueQueueState(['book-b','book-a'],timestamp(4));
 const store=JSON.parse(local.getItem(GitHubStateRepository.PENDING_KEY));
 assert.equal(store.mutations.length,2);
 assert.deepEqual(store.mutations.find(item=>item.kind==='book').value,{states:['onemli'],reading:{startedAt:'2026-01-01'}});
 assert.deepEqual(store.mutations.find(item=>item.kind==='queue').value,['book-b','book-a']);
});

test('field-level last-writer-wins keeps newer edits from other devices and untouched fields',()=>{
 const remote=document({a:record(40,{states:['okundu'],reading:{why:'Uzak not'}},{states:timestamp(40),reading:timestamp(10)})},timestamp(40));
 const merged=applyPendingMutations(remote,[
  {id:'1',kind:'book',bookId:'a',updatedAt:timestamp(20),value:{states:['okunuyor'],reading:{why:'Bu cihazın notu'}}},
 ]);
 assert.deepEqual(merged.books.a.value.states,['okundu'],'the other device changed states later, so it wins');
 assert.deepEqual(merged.books.a.value.reading,{why:'Bu cihazın notu'},'this device edited the note after the remote note');
 const untouched=applyPendingMutations(remote,[{id:'2',kind:'book',bookId:'a',updatedAt:timestamp(50),value:{reading:null}}]);
 assert.deepEqual(untouched.books.a.value.states,['okundu'],'a patch never clears fields it does not carry');
 const legacy=document({b:record(30,{states:['onemli']})},timestamp(30));
 assert.deepEqual(applyPendingMutations(legacy,[{id:'3',kind:'book',bookId:'b',updatedAt:timestamp(20),value:{states:[]}}]).books.b.value.states,['onemli'],'records without field stamps fall back to their record time');
});

test('the queue is one record: a newer shared queue wins over an older local queue',()=>{
 const remote=document({},timestamp(30),{updatedAt:timestamp(30),value:['x','y']});
 assert.deepEqual(applyPendingMutations(remote,[{id:'q1',kind:'queue',updatedAt:timestamp(20),value:['a']}]).queue.value,['x','y']);
 assert.deepEqual(applyPendingMutations(remote,[{id:'q2',kind:'queue',updatedAt:timestamp(40),value:['a']}]).queue.value,['a']);
 assert.throws(()=>applyPendingMutations(remote,[{id:'q3',kind:'queue',updatedAt:timestamp(50),value:['a','b','c','d','e','f']}]),TypeError);
});

test('version 1 files and pending queues are read as version 2',()=>{
 const legacy={schemaVersion:1,updatedAt:timestamp(9),books:{a:{updatedAt:timestamp(5),value:{states:['onemli'],queuePosition:1}},b:{updatedAt:timestamp(9),value:{states:[],queuePosition:0}},c:{updatedAt:timestamp(2),value:null}}};
 const upgraded=upgradeStateDocument(legacy);
 assertStateDocument(upgraded);
 assert.deepEqual(upgraded.queue,{updatedAt:timestamp(9),value:['b','a']});
 assert.deepEqual(upgraded.books.a.value,{states:['onemli']});
 const local=storage();
 local.setItem(GitHubStateRepository.LEGACY_PENDING_KEY,JSON.stringify([{id:'old-1',bookId:'a',updatedAt:timestamp(3),value:{states:['okundu'],queuePosition:0}},{id:'old-2',bookId:'b',updatedAt:timestamp(4),value:{queuePosition:1}}]));
 const repository=new GitHubStateRepository({storage:local,fetch:async()=>raw(emptyStateDocument())});
 assert.equal(repository.getPendingCount(),1,'queue-only legacy entries are dropped; the device queue is re-sent whole');
 assert.equal(local.getItem(GitHubStateRepository.LEGACY_PENDING_KEY),null);
});

test('a first sync adds device-only records, and asks only where both sides disagree',()=>{
 const local=new Map([
  ['a',{states:['onemli'],reading:{why:'Yerel not'}}],
  ['b',{states:['okundu'],reading:null}],
  ['c',{states:['alindi'],reading:null}],
  ['d',{states:[],reading:null}],
 ]);
 const remote=projectPublicState(document({b:record(1,{states:['okunuyor']}),c:record(1,{states:['alindi']})},timestamp(1),{updatedAt:timestamp(1),value:['c']}),['a','b','c','d']);
 assert.deepEqual(planFirstSync(local,['a'],remote),{localOnly:['a'],conflicts:['b'],queue:'conflict'});
 assert.deepEqual(planFirstSync(local,[],remote).queue,'none');
 assert.deepEqual(planFirstSync(local,['a'],projectPublicState(emptyStateDocument(),['a','b','c','d'])),{localOnly:['a','b','c'],conflicts:[],queue:'local-only'});
});

test('the reader’s shared-file choice discards the conflicting unsent edits',()=>{
 const repository=new GitHubStateRepository({storage:storage(),fetch:async()=>raw(emptyStateDocument())});
 repository.queueBookState('a',{states:['onemli']});repository.queueBookState('b',{states:['okundu']});repository.queueQueueState(['a']);
 repository.discardPendingFor(['a'],true);
 assert.equal(repository.getPendingCount(),1);
});

test('schema validation rejects malformed nested fields and unknown data',()=>{
 for(const invalid of [
  {...document(),extra:true},
  {...document(),schemaVersion:3},
  document({a:record(1,{states:['bilinmeyen']})}),
  document({a:record(1,{states:['onemli','onemli']})}),
  document({a:record(1,{queuePosition:1})}),
  document({a:record(1,{reading:{page:'12'}})}),
  document({a:{...record(1,{}),extra:true}}),
  document({a:record(1,{states:[]},{states:'not-a-date'})}),
  document({},timestamp(1),{updatedAt:timestamp(1),value:['a','a']}),
 ])assert.throws(()=>assertStateDocument(invalid),TypeError);
});

test('corrupt pending storage is quarantined and storage quota failures are typed',()=>{
 const local=storage();local.setItem(GitHubStateRepository.PENDING_KEY,'{broken');
 const repository=new GitHubStateRepository({storage:local,fetch:async()=>raw(emptyStateDocument())});
 assert.equal(repository.getPendingCount(),0);assert.equal(local.getItem(GitHubStateRepository.PENDING_KEY),null);
 const full={getItem:()=>null,removeItem:()=>{},setItem:()=>{throw new DOMException('full','QuotaExceededError')}};
 const unavailable=new GitHubStateRepository({storage:full,fetch:async()=>raw(emptyStateDocument())});
 assert.throws(()=>unavailable.queueBookState('a',{states:['onemli']}),error=>error instanceof GitHubStateRepositoryError&&error.code==='storage');
});

test('initial local-state migration marker persists only when explicitly completed',()=>{
 const local=storage();
 const repository=new GitHubStateRepository({storage:local,fetch:async()=>raw(emptyStateDocument())});
 assert.equal(repository.hasCompletedInitialMigration(),false);
 repository.markInitialMigrationComplete();
 assert.equal(repository.hasCompletedInitialMigration(),true);
 assert.equal(local.getItem(GitHubStateRepository.MIGRATION_KEY),'1');
});

test('generated mutation times remain monotonic when the device clock moves backward',()=>{
 let now=5;
 const repository=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(now--)),fetch:async()=>raw(emptyStateDocument())});
 const first=repository.queueBookState('a',{states:['onemli']});
 const second=repository.queueBookState('b',{states:['alindi']});
 assert.ok(Date.parse(second.updatedAt)>Date.parse(first.updatedAt));
});

test('a token must prove it can write before it is stored, without committing anything',async()=>{
 // The state repository is public, so any token reads it; only a write proves the right permission.
 const requests=[];
 const writable=new GitHubStateRepository({storage:storage(),fetch:async(url,init)=>{requests.push({url,init});return init.method==='POST'?new Response('{"sha":"e69de29"}',{status:201}):contents(emptyStateDocument());}});
 await writable.validateToken(TOKEN);
 const probe=requests.find(item=>item.init.method==='POST');
 assert.equal(probe.url,'https://api.github.com/repos/titanlar-com/kitaps-state/git/blobs');
 // Non-empty content: GitHub's documented case, and the same blob (sha) every time.
 assert.deepEqual(JSON.parse(probe.init.body),{content:'Kitaplık yazma denetimi',encoding:'utf-8'});
 assert.equal(probe.init.headers.Authorization,`Bearer ${TOKEN}`);
 assertCorsSafe(probe.init,probe.url);
 assert.equal(requests.some(item=>item.init.method==='PUT'),false,'validation never writes the state file');
 // A secondary rate limit (403 with Retry-After while quota remains) is not a read-only key.
 for(const [status,headers,code] of [[403,{},'read-only'],[404,{},'read-only'],[403,{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':'4102444800'},'rate-limited'],[403,{'X-RateLimit-Remaining':'4990','Retry-After':'60'},'rate-limited']]){
  const repository=new GitHubStateRepository({storage:storage(),fetch:async(url,init)=>init.method==='POST'?new Response('{"message":"Resource not accessible by personal access token"}',{status,headers}):contents(emptyStateDocument())});
  await assert.rejects(()=>repository.validateToken(TOKEN),error=>error.code===code,`${status} ${JSON.stringify(headers)}`);
  assert.equal(repository.hasToken(),false);
 }
});

test('an anonymous device asks the API for a fresh copy when it matters, at most once a minute, and keeps the CDN as fallback',async()=>{
 const remote=document({a:record(5,{states:['alindi']})},timestamp(5));
 const requests=[];let now=Date.parse(timestamp(10));
 const repository=new GitHubStateRepository({storage:storage(),clock:()=>new Date(now),fetch:async(url,init)=>{requests.push({url,init});return url.startsWith('https://raw.')?raw(remote):contents(remote,'sha',{ETag:'"v1"'});}});
 assert.deepEqual(await repository.load({fresh:true}),remote);
 assert.match(requests.at(-1).url,/^https:\/\/api\.github\.com\/repos\/titanlar-com\/kitaps-state\/contents\/state\.json/);
 assert.equal(requests.at(-1).init.headers.Authorization,undefined,'an anonymous device sends no token');
 assertCorsSafe(requests.at(-1).init,'anonymous API read');
 await repository.load({fresh:true});
 assert.match(requests.at(-1).url,/^https:\/\/raw\.githubusercontent\.com\//,'a second fresh read within a minute uses the CDN');
 now+=60_000;
 await repository.load();
 assert.match(requests.at(-1).url,/^https:\/\/raw\.githubusercontent\.com\//,'periodic reads stay on the CDN');
 await repository.load({fresh:true});
 assert.match(requests.at(-1).url,/^https:\/\/api\.github\.com\//);
 // GitHub's anonymous limit: the CDN answers instead, and the API rests until the reset time.
 const limitedRequests=[];
 const limited=new GitHubStateRepository({storage:storage(),clock:()=>new Date(now),fetch:async url=>{limitedRequests.push(url);return url.startsWith('https://raw.')?raw(remote):new Response('{}',{status:403,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':String(Math.floor(now/1000)+3600)}});}});
 assert.deepEqual(await limited.load({fresh:true}),remote);
 now+=120_000;
 await limited.load({fresh:true});
 assert.deepEqual(limitedRequests.map(url=>url.startsWith('https://raw.')?'cdn':'api'),['api','cdn','cdn']);
});

test('an older CDN copy never replaces a newer file this device has already seen',async()=>{
 const newer=document({a:record(9,{states:['alindi']})},timestamp(9));
 let served=newer;
 const repository=new GitHubStateRepository({storage:storage(),fetch:async()=>raw(served)});
 assert.deepEqual(await repository.load(),newer);
 served=document({},timestamp(1));
 assert.deepEqual(await repository.load(),newer,'a stale CDN edge does not undo a mark');
 const newest=document({a:record(9,{states:['alindi']}),b:record(12,{states:['okundu']})},timestamp(12));
 served=newest;
 assert.deepEqual(await repository.load(),newest);
});

test('a write starts from the last file it knows in one request, and the file’s time always moves forward',async()=>{
 const remote=document({a:record(1,{states:['onemli']})},timestamp(30));
 const requests=[];let current=remote,sha='sha-1';
 const repository=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(timestamp(5)),fetch:async(url,init)=>{
  requests.push({method:init.method||'GET',init});
  if(init.method==='PUT'){const body=JSON.parse(init.body);if(body.sha!==sha)return new Response('{}',{status:409});current=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));sha=`sha-${requests.length}`;return new Response(JSON.stringify({content:{sha}}),{status:200});}
  return contents(current,sha,{ETag:`"${sha}"`});
 }});
 await repository.load();
 repository.queueBookState('b',{states:['alindi']});
 const saved=await repository.flushPending({keepalive:true});
 assert.deepEqual(requests.map(item=>item.method),['GET','PUT'],'the write reuses the file just read');
 assert.equal(requests[1].init.keepalive,true,'a write sent while the page hides outlives the page');
 assert.ok(requests.every(item=>item.init.signal),'every request has a timeout');
 // The device clock is behind the file, yet the new file is still newer than the old one.
 assert.ok(Date.parse(saved.updatedAt)>Date.parse(remote.updatedAt));
 repository.queueBookState('c',{states:['okundu']});
 await repository.flushPending();
 assert.deepEqual(requests.slice(2).map(item=>item.method),['PUT'],'the next write starts from the file it wrote');
 // Another device writes: the remembered sha is refused, and the write starts again from a fresh read.
 current=document({...current.books,d:record(40,{states:['onemli']})},timestamp(40));sha='sha-other';
 repository.queueBookState('e',{states:['alindi']});
 const merged=await repository.flushPending();
 assert.deepEqual(requests.slice(3).map(item=>item.method),['PUT','GET','PUT']);
 assert.deepEqual(Object.keys(merged.books).sort(),['a','b','c','d','e']);
 assert.equal(requests.at(-1).init.keepalive,false);
});

test('connecting a device asks only about its own unsent edits that the shared file holds differently',()=>{
 const shared=document({
  bought:record(5,{states:['alindi']}),
  same:record(5,{states:['onemli']}),
  notesOnly:record(5,{reading:{why:'Başka cihazın notu'}}),
  cleared:record(5,null),
 },timestamp(5),{updatedAt:timestamp(5),value:['same']});
 const edit=(bookId,value)=>({id:`${bookId}-1`,kind:'book',bookId,updatedAt:timestamp(1),value});
 const plan=planConnect([
  edit('bought',{states:['okunuyor']}),   // another device bought it meanwhile: ask
  edit('same',{states:['onemli']}),       // both sides agree: send
  edit('notesOnly',{states:['okundu']}),  // the shared file never set its states: merge field by field
  edit('cleared',{states:['alindi']}),    // another device cleared it: ask
  edit('fresh',{states:['alindi']}),      // the shared file has no record: send
  {id:'queue-1',kind:'queue',updatedAt:timestamp(2),value:['fresh']},
 ],shared);
 assert.deepEqual(plan,{conflicts:['bought','cleared'],queueConflict:true});
 assert.deepEqual(planConnect([edit('bought',{states:['alindi']})],shared),{conflicts:[],queueConflict:false});
});

test('the batcher never leaves a timer it cannot cancel',async()=>{
 const timers=new Map();let next=0;
 const setTimeout=callback=>{const id=++next;timers.set(id,callback);return id;};
 const clearTimeout=id=>{timers.delete(id);};
 const repository=new GitHubStateRepository({storage:withToken(),fetch:async()=>contents(emptyStateDocument())});
 repository.queueBookState('a',{states:['onemli']});
 let failFlush;
 const batcher=new GitHubStateBatcher(repository,()=>new Promise((_,reject)=>{failFlush=reject;}),{setTimeout,clearTimeout,retryDelaysMs:[15_000]});
 batcher.schedule();
 const [[id,fire]]=timers;timers.delete(id);fire();
 batcher.schedule(); // another path schedules while the batcher's own write runs
 failFlush(new Error('offline'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(timers.size,1,'the retry replaced the waiting timer instead of orphaning it');
 batcher.cancel();
 assert.equal(timers.size,0);
});

test('connecting compares against what this device last saw of each field',()=>{
 const shared=document({read:record(5,{states:['onemli']},{states:timestamp(5)}),changed:record(9,{states:['alindi']},{states:timestamp(9)})},timestamp(9),{updatedAt:timestamp(9),value:['read']});
 const edit=(bookId,value)=>({id:`${bookId}-1`,kind:'book',bookId,updatedAt:timestamp(7),value});
 // This device saw 'read' at 5 and 'changed' at 3; another device saved 'changed' again at 9.
 const bases={books:{read:{states:timestamp(5)},changed:{states:timestamp(3)}},queue:timestamp(9)};
 const plan=planConnect([edit('read',{states:['onemli','alindi']}),edit('changed',{states:['okunuyor']}),{id:'q',kind:'queue',updatedAt:timestamp(8),value:['changed','read']}],shared,bases);
 assert.deepEqual(plan,{conflicts:['changed'],queueConflict:false});
 // A queue another device emptied after this device last saw it is a difference too.
 const emptied=document({},timestamp(9),{updatedAt:timestamp(9),value:[]});
 assert.equal(planConnect([{id:'q',kind:'queue',updatedAt:timestamp(8),value:['read']}],emptied,{books:{},queue:timestamp(4)}).queueConflict,true);
});

test('bases keep the stamps an unsent edit was based on, and re-queued edits keep only their fields',()=>{
 const local=storage();
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(emptyStateDocument())});
 repository.queueBookState('edited',{states:['okunuyor']});
 const file=document({edited:record(5,{states:['onemli'],reading:{why:'not'}},{states:timestamp(5),reading:timestamp(5)}),seen:record(6,{states:['alindi'],reading:{why:'not'}},{states:timestamp(6),reading:timestamp(6)})},timestamp(6));
 repository.recordBases(file);
 assert.deepEqual(repository.readBases().books,{edited:{reading:timestamp(5)},seen:{states:timestamp(6),reading:timestamp(6)}},'only the edited field keeps its older base');
 repository.recordBases(file,{forceBooks:['edited']});
 assert.deepEqual(repository.readBases().books.edited,{states:timestamp(5),reading:timestamp(5)},'a decided book takes the file it was decided against');
 const before=repository.pendingMutations()[0];
 repository.requeuePendingFor(['edited'],false);
 const after=repository.pendingMutations()[0];
 assert.deepEqual(after.value,{states:['okunuyor']});
 assert.ok(Date.parse(after.updatedAt)>Date.parse(before.updatedAt),'kept edits are stamped anew so they win');
 repository.beginConnectReview();assert.equal(repository.hasConnectReviewPending(),true);
 repository.clearConnectReview();assert.equal(repository.hasConnectReviewPending(),false);
});

test('a partly stamped legacy record answers from its stamps alone, like the merge',()=>{
 const partly={updatedAt:timestamp(9),value:{states:['onemli'],reading:{why:'eski not'}},stamps:{states:timestamp(9)}};
 assert.equal(fieldStamp(partly,'states'),timestamp(9));
 assert.equal(fieldStamp(partly,'reading'),undefined,'an unstamped field predates stamps; any edit may overwrite it');
 const legacy={updatedAt:timestamp(4),value:{states:['onemli']}};
 assert.equal(fieldStamp(legacy,'states'),timestamp(4));
 assert.equal(fieldStamp(legacy,'reading'),undefined);
 assert.equal(fieldStamp({updatedAt:timestamp(3),value:null},'reading'),timestamp(3));
});

test('a refused key stops writes, not reads: the public file is read without it',async()=>{
 const remote=document({a:record(1,{states:['alindi']})},timestamp(1));
 const requests=[];
 const fetch=async(url,init)=>{
  requests.push({url,authorized:Boolean(init.headers?.Authorization)});
  if(init.headers?.Authorization)return new Response('',{status:401});
  return url.startsWith('https://raw.')?raw(remote):contents(remote,'sha-1');
 };
 const repository=new GitHubStateRepository({storage:withToken(),fetch,clock:()=>new Date(timestamp(5))});
 assert.deepEqual(await repository.load(),remote);
 assert.deepEqual(repository.lastReadInfo(),{source:'cdn',authenticated:false,tokenRejected:true,at:Date.parse(timestamp(5))});
 assert.deepEqual(requests.map(item=>item.authorized),[true,false],'the key is tried once, then the CDN copy is read without it');
 requests.length=0;
 await repository.load({fresh:true});
 assert.equal(repository.lastReadInfo().source,'api');
 assert.deepEqual(requests.map(item=>item.authorized),[true,false],'a fresh read asks the API without the refused key');
 const connected=new GitHubStateRepository({storage:withToken(),fetch:async()=>contents(remote)});
 await connected.load();
 assert.deepEqual({...connected.lastReadInfo(),at:0},{source:'api',authenticated:true,tokenRejected:false,at:0});
});

test('Retry-After decides the wait; the reset time counts only once the hourly quota is used up',async()=>{
 const before=Date.now();
 const secondary=new GitHubStateRepository({storage:withToken(),fetch:async()=>new Response('',{status:403,headers:{'Retry-After':'30','X-RateLimit-Remaining':'4000','X-RateLimit-Reset':'1999999999'}})});
 await assert.rejects(()=>secondary.load(),error=>error.code==='rate-limited'&&error.retryAt>=before+30_000&&error.retryAt<=Date.now()+30_000);
 const quota=new GitHubStateRepository({storage:withToken(),fetch:async()=>new Response('',{status:429,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':'1790600000'}})});
 await assert.rejects(()=>quota.load(),error=>error.code==='rate-limited'&&error.retryAt===1790600000000);
});

test('every state commit names the owner as author and committer, never the token',async()=>{
 let body;
 const repository=new GitHubStateRepository({storage:withToken(),fetch:async(url,init)=>{if(init.method==='PUT'){body=JSON.parse(init.body);return new Response('{}',{status:200});}return contents(emptyStateDocument());}});
 repository.queueBookState('a',{states:['onemli']});
 await repository.flushPending();
 const identity={name:'karacaismail',email:'35493655+karacaismail@users.noreply.github.com'};
 assert.deepEqual(body.author,identity);
 assert.deepEqual(body.committer,identity);
 assert.ok(!JSON.stringify(body).includes(TOKEN));
});

test('the batcher keeps retrying a passing failure at its last step, waits for a rate limit, and stops for a refused key',async()=>{
 const make=failure=>{
  const repository=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(0)),fetch:async()=>raw(emptyStateDocument())});
  const timers=new Map();let id=0,attempts=0;const now=Date.parse(timestamp(0))+200_000;
  const batcher=new GitHubStateBatcher(repository,async()=>{attempts++;throw failure();},{now:()=>now,setTimeout:(callback,delay)=>{timers.set(++id,{callback,delay});return id;},clearTimeout:key=>timers.delete(key),retryDelaysMs:[10,20]});
  batcher.queueBookState('a',{states:['onemli']});
  const runNext=async()=>{const [key,timer]=timers.entries().next().value;timers.delete(key);timer.callback();await new Promise(resolve=>setImmediate(resolve));};
  return {timers,runNext,attempts:()=>attempts,now};
 };
 const passing=make(()=>new GitHubStateRepositoryError('network','offline'));
 await passing.runNext();await passing.runNext();await passing.runNext();await passing.runNext();
 assert.equal(passing.attempts(),4);
 assert.deepEqual([...passing.timers.values()].map(timer=>timer.delay),[20],'after the last step it keeps that step');
 const refused=make(()=>new GitHubStateRepositoryError('unauthorized','refused',401));
 await refused.runNext();
 assert.equal(refused.attempts(),1);assert.equal(refused.timers.size,0,'a refused key waits for the reader');
 let limited;limited=make(()=>new GitHubStateRepositoryError('rate-limited','limited',403,{retryAt:limited.now+90_000}));
 await limited.runNext();
 assert.deepEqual([...limited.timers.values()].map(timer=>timer.delay),[90_000],'nothing is sent before GitHub accepts requests again');
});
