import test from 'node:test';
import assert from 'node:assert/strict';
import {EXCLUSIVE_STATE_GROUPS,FINE_GRAINED_TOKEN,GITHUB_REQUEST_HEADERS,GitHubStateBatcher,GitHubStateRepository,GitHubStateRepositoryError,MIN_GITHUB_SYNC_DELAY_MS,applyPendingMutations,assertStateDocument,emptyStateDocument,fieldStamp,mergeQueue,mergeReading,mergeStates,planConnect,planFirstSync,projectPublicState,upgradeStateDocument} from '../src/state/index.ts';
import {toggleState} from '../src/library.js';

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

test('the batcher waits 30 seconds from the first change and sends one combined flush',async()=>{
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
 now+=10_000;
 batcher.queueBookState('library',{states:['alindi']});
 batcher.queueQueueState(['library','favorite']);
 assert.equal(repository.getPendingCount(),3);
 assert.equal(timers.size,1,'later changes join the same scheduled flush');
 assert.equal(flushes,0,'nothing is sent before the window closes');
 const [{callback}]=timers.values();callback();await Promise.resolve();
 assert.equal(flushes,1,'the batch results in one remote write');
});

test('a change older than 30 seconds is sent as soon as the next visit schedules it',()=>{
 assert.equal(MIN_GITHUB_SYNC_DELAY_MS,30_000,'the owner’s decision of 22 October 2026');
 const repository=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(0)),fetch:async()=>raw(emptyStateDocument())});
 repository.queueBookState('a',{states:['onemli']});
 const timers=[];
 const early=new GitHubStateBatcher(repository,async()=>{},{now:()=>Date.parse(timestamp(0))+12_000,setTimeout:(callback,delay)=>{timers.push(delay);return timers.length;},clearTimeout:()=>{}});
 early.schedule();assert.equal(timers.at(-1),18_000,'the window is counted from the change, not the page load');
 const later=new GitHubStateBatcher(repository,async()=>{},{now:()=>Date.parse(timestamp(0))+300_000,setTimeout:(callback,delay)=>{timers.push(delay);return timers.length;},clearTimeout:()=>{}});
 later.schedule();assert.equal(timers.at(-1),0);
});

test('retries back off after a failed flush',async()=>{
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
 assert.equal(repository.hasPendingRecovery(),false);
 // A legacy queue that cannot be read in full is rescued like the current one: its
 // readable edits stay queued and the whole record is kept aside before its key goes.
 const text=JSON.stringify([{id:'old-1',bookId:'a',updatedAt:'dün',value:{states:['okundu']}},{id:'old-2',bookId:'b',updatedAt:timestamp(4),value:{states:['onemli']}}]);
 const damaged=storage();damaged.setItem(GitHubStateRepository.LEGACY_PENDING_KEY,text);
 const migrated=new GitHubStateRepository({storage:damaged,fetch:async()=>raw(emptyStateDocument())});
 assert.deepEqual(migrated.pendingMutations().map(item=>item.bookId),['b']);
 assert.deepEqual(migrated.pendingRecovery().map(copy=>[copy.raw,copy.kept]),[[text,1]]);
 assert.equal(damaged.getItem(GitHubStateRepository.LEGACY_PENDING_KEY),null);
 // An entry without an edit object is damage, never a clear of the book.
 for(const value of [null,'okundu',5,['okundu']]){
  const odd=storage();odd.setItem(GitHubStateRepository.LEGACY_PENDING_KEY,JSON.stringify([{id:'odd',bookId:'a',updatedAt:timestamp(4),value}]));
  const reader=new GitHubStateRepository({storage:odd,fetch:async()=>raw(emptyStateDocument())});
  assert.equal(reader.getPendingCount(),0,JSON.stringify(value));
  assert.equal(reader.recoveryStatus().copies,1);
 }
 // Without room for the copy the legacy record stays where it is.
 const legacyValues=new Map([[GitHubStateRepository.LEGACY_PENDING_KEY,text]]);
 const cramped=new GitHubStateRepository({storage:{getItem:key=>legacyValues.get(key)??null,removeItem:key=>legacyValues.delete(key),setItem:(key,value)=>{if(key===GitHubStateRepository.RECOVERY_KEY)throw new DOMException('full','QuotaExceededError');legacyValues.set(key,value);}},fetch:async()=>raw(emptyStateDocument())});
 assert.equal(cramped.getPendingCount(),1);
 assert.equal(cramped.recoveryStatus().stored,false);
 assert.equal(legacyValues.get(GitHubStateRepository.LEGACY_PENDING_KEY),text);
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
 assert.deepEqual(repository.pendingRecovery().map(copy=>copy.raw),['{broken'],'the unreadable queue is kept aside, not deleted');
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

test('a read that must use the key never falls back, and a 403 is not taken as a refused key',async()=>{
 const requests=[];
 const refusing=new GitHubStateRepository({storage:withToken(),fetch:async(url,init)=>{requests.push({url,authorized:Boolean(init.headers?.Authorization)});return init.headers?.Authorization?new Response('',{status:401}):raw(emptyStateDocument());}});
 await assert.rejects(()=>refusing.load({fresh:true,requireToken:true}),error=>error.code==='unauthorized'&&error.status===401);
 assert.deepEqual(requests.map(item=>item.authorized),[true],'no anonymous read stands in for the comparison');
 await assert.rejects(()=>new GitHubStateRepository({storage:storage(),fetch:async()=>raw(emptyStateDocument())}).load({requireToken:true}),error=>error.code==='unauthorized');
 // GitHub also answers some secondary limits with a bare 403: that is no reason to give up the key.
 const forbidden=new GitHubStateRepository({storage:withToken(),fetch:async()=>new Response('',{status:403})});
 await assert.rejects(()=>forbidden.load(),error=>error.code==='unauthorized'&&error.status===403);
 assert.equal(forbidden.lastReadInfo(),undefined);
 const {info}=await new GitHubStateRepository({storage:withToken(),fetch:async()=>contents(emptyStateDocument())}).loadRead();
 assert.equal(info.authenticated,true);
});

test('a reopened page never goes back to an older CDN copy than the file it last saw',async()=>{
 const local=storage();
 const newer=document({a:record(9,{states:['alindi']})},timestamp(9));
 let served=newer;
 const fetch=async()=>raw(served);
 await new GitHubStateRepository({storage:local,fetch}).load();
 served=document({},timestamp(1));
 const reopened=new GitHubStateRepository({storage:local,fetch});
 assert.deepEqual(await reopened.load(),newer,'a stale CDN edge does not undo a mark after a reload');
 // The kept copy is the shared file alone: unsent edits and bases live elsewhere.
 reopened.queueBookState('b',{states:['okundu']});
 reopened.recordBases(newer);
 await reopened.load();
 assert.deepEqual(JSON.parse(local.getItem(GitHubStateRepository.REMOTE_KEY)).document,newer);
 // A file this device wrote is kept too, so its own marks survive a reload behind a stale edge.
 const written=storage();written.setItem(GitHubStateRepository.TOKEN_KEY,TOKEN);
 let file=document({},timestamp(1));
 const writer=new GitHubStateRepository({storage:written,clock:()=>new Date(timestamp(20)),fetch:async(url,init)=>init.method==='PUT'?new Response('{}',{status:200}):contents(file)});
 writer.queueBookState('c',{states:['onemli']});
 const saved=await writer.flushPending();
 writer.clearToken();
 const behind=new GitHubStateRepository({storage:written,clock:()=>new Date(timestamp(21)),fetch:async()=>raw(file)});
 assert.deepEqual(await behind.load(),saved);
 // The API answers for the file as it is now: it replaces a copy kept from an earlier visit
 // (the shared file was reset, say), but within one visit nothing older replaces what was seen.
 const reset=document({},timestamp(2));
 const api=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(30)),fetch:async url=>url.startsWith('https://raw.')?raw(reset):contents(reset)});
 assert.deepEqual(await api.load({fresh:true}),reset);
 assert.deepEqual(await api.load(),reset);
 // A copy kept for another repository is never shown.
 const elsewhere=new GitHubStateRepository({storage:written,owner:'someone-else',fetch:async()=>raw(document({},timestamp(1)))});
 assert.deepEqual(await elsewhere.load(),document({},timestamp(1)));
 // A damaged copy is ignored.
 const damaged=storage();damaged.setItem(GitHubStateRepository.REMOTE_KEY,'{broken');
 assert.deepEqual(await new GitHubStateRepository({storage:damaged,fetch:async()=>raw(reset)}).load(),reset);
 // Storage that cannot keep the copy does not stop the read.
 const full={getItem:()=>null,removeItem:()=>{},setItem:()=>{throw new DOMException('full','QuotaExceededError');}};
 assert.deepEqual(await new GitHubStateRepository({storage:full,fetch:async()=>raw(reset)}).load(),reset);
});

test('within a visit nothing older replaces what was seen; another tab’s newer copy counts; a copy long kept yields to a reset file',async()=>{
 const minute=60_000,start=Date.parse(timestamp(0));
 const d1=document({a:record(1,{states:['onemli']})},timestamp(1)),d2=document({a:record(2,{states:['alindi']})},timestamp(2));
 // Within one visit, even the API cannot take back a file this device saw.
 let served=d2;
 const visit=new GitHubStateRepository({storage:storage(),clock:()=>new Date(start),fetch:async url=>url.startsWith('https://raw.')?raw(served):contents(served)});
 assert.deepEqual(await visit.load({fresh:true}),d2);
 served=d1;
 assert.deepEqual(await visit.load({fresh:true}),d2,'an older API answer within the visit');
 // Two tabs: the one that saw less never takes the browser's kept copy back.
 const shared=storage();let now=start;
 const tabA=new GitHubStateRepository({storage:shared,clock:()=>new Date(now),fetch:async()=>raw(d1)});
 await tabA.load();
 const tabB=new GitHubStateRepository({storage:shared,clock:()=>new Date(now),fetch:async()=>raw(d2)});
 await tabB.load();
 assert.deepEqual(await tabA.load(),d2,'tab A takes the newer copy tab B kept');
 assert.equal(JSON.parse(shared.getItem(GitHubStateRepository.REMOTE_KEY)).document.updatedAt,timestamp(2));
 // A later visit: the CDN may lag five minutes, so an older copy soon after is refused…
 now=start+4*minute;
 assert.deepEqual(await new GitHubStateRepository({storage:shared,clock:()=>new Date(now),fetch:async()=>raw(d1)}).load(),d2);
 // …but long after, an older copy means the shared file itself went back.
 now=start+11*minute;
 assert.deepEqual(await new GitHubStateRepository({storage:shared,clock:()=>new Date(now),fetch:async()=>raw(d1)}).load(),d1);
});

test('a new edit is stamped after the newest shared stamp seen for its fields, even when this clock runs behind',async()=>{
 // Another device, its clock ahead, set the marks at second 50; this device's clock says second 10.
 const remote=document({a:record(50,{states:['okundu'],reading:{why:'Uzak not'}},{states:timestamp(50),reading:timestamp(5)})},timestamp(50),{updatedAt:timestamp(40),value:['a']});
 const local=storage();let now=Date.parse(timestamp(10));
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:async()=>raw(remote)});
 const early=repository.queueBookState('a',{states:['alindi']});
 assert.equal(early.updatedAt,timestamp(10));
 await repository.load();
 assert.equal(repository.pendingMutations()[0].updatedAt,timestamp(10),'reading the file never re-stamps an unsent edit');
 const edit=repository.queueBookState('a',{states:['okunuyor']});
 assert.equal(edit.updatedAt,'2026-09-28T10:00:50.001Z');
 assert.deepEqual(applyPendingMutations(remote,[edit]).books.a.value.states,['okunuyor'],'the new edit wins over the value it was made on');
 assert.equal(repository.getPendingSince(),timestamp(10),'the 30 second window still counts from the change, on this clock');
 const timers=[];
 new GitHubStateBatcher(repository,async()=>{},{now:()=>now,setTimeout:(callback,delay)=>{timers.push(delay);return timers.length;},clearTimeout:()=>{}}).schedule();
 assert.equal(timers.at(-1),MIN_GITHUB_SYNC_DELAY_MS,'the window does not stretch');
 const queue=repository.queueQueueState(['a']);
 assert.ok(Date.parse(queue.updatedAt)>Date.parse(timestamp(40)));
 // Only the fields an edit carries count: the note was set at second 5.
 const fresh=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(10)),fetch:async()=>raw(remote)});
 await fresh.load();
 assert.equal(fresh.queueBookState('a',{reading:{why:'Bu cihaz'}}).updatedAt,timestamp(10));
 // Clearing a book has to be newer than the whole record.
 const cleared=fresh.queueBookState('a',null);
 assert.ok(Date.parse(cleared.updatedAt)>Date.parse(timestamp(50)));
 assert.equal(applyPendingMutations(remote,[cleared]).books.a.value,null);
 // "Bu cihazdakini kullan": the kept edit is stamped anew after the shared value.
 const kept=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(10)),fetch:async()=>raw(remote)});
 kept.queueBookState('a',{states:['alindi']});
 await kept.load();
 kept.requeuePendingFor(['a'],false);
 assert.deepEqual(applyPendingMutations(remote,kept.pendingMutations()).books.a.value.states,['alindi']);
 // After a reload the kept copy of the file still sets the floor.
 const reopened=storage();reopened.setItem(GitHubStateRepository.REMOTE_KEY,local.getItem(GitHubStateRepository.REMOTE_KEY));
 const later=new GitHubStateRepository({storage:reopened,clock:()=>new Date(timestamp(10)),fetch:async()=>raw(remote)});
 assert.ok(Date.parse(later.queueBookState('a',{states:['okundu']}).updatedAt)>Date.parse(timestamp(50)));
 assert.equal(later.getPendingSince(),timestamp(10));
 // A record without field stamps sets the floor with its own time; a stamped record that
 // never set a field sets none for it.
 const legacy=document({old:record(50,{states:['okundu']}),partial:record(50,{states:['okundu']},{states:timestamp(50)})},timestamp(50));
 const mixed=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(10)),fetch:async()=>raw(legacy)});
 await mixed.load();
 assert.ok(Date.parse(mixed.queueBookState('old',{reading:{why:'not'}}).updatedAt)>Date.parse(timestamp(50)));
 const partly=new GitHubStateRepository({storage:storage(),clock:()=>new Date(timestamp(10)),fetch:async()=>raw(legacy)});
 await partly.load();
 assert.equal(partly.queueBookState('partial',{reading:{why:'not'}}).updatedAt,timestamp(10));
 // A stored queue without its start time counts it on this clock, never in the future.
 const stored=storage();
 stored.setItem(GitHubStateRepository.PENDING_KEY,JSON.stringify({mutations:[{id:'f',kind:'book',bookId:'a',updatedAt:timestamp(50),value:{states:['onemli']}}]}));
 assert.equal(new GitHubStateRepository({storage:stored,clock:()=>new Date(timestamp(10)),fetch:async()=>raw(remote)}).getPendingSince(),timestamp(10));
});

test('a damaged pending queue keeps its readable edits queued and a copy of the whole record',()=>{
 const local=storage();
 const good={id:'g',kind:'book',bookId:'a',updatedAt:timestamp(1),value:{states:['onemli']}};
 const damaged=JSON.stringify({since:timestamp(1),mutations:[good,{id:'x',kind:'book',bookId:'b',updatedAt:'dün',value:{states:['okundu']}}]});
 local.setItem(GitHubStateRepository.PENDING_KEY,damaged);
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(30)),fetch:async()=>raw(emptyStateDocument())});
 assert.deepEqual(repository.pendingMutations(),[good],'the readable edit stays queued');
 assert.equal(repository.getPendingSince(),timestamp(1));
 assert.equal(repository.hasPendingRecovery(),true);
 assert.deepEqual(repository.pendingRecovery(),[{at:timestamp(30),kept:1,raw:damaged}]);
 repository.getPendingCount();
 assert.equal(repository.pendingRecovery().length,1,'one copy per damaged record');
 assert.deepEqual(repository.recoveryStatus(),{copies:1,kept:1,stored:true});
 // A copy that cannot be stored leaves the damaged record where it is: its readable edits
 // are used and shown, nothing new is written over it, and the reader can still take it.
 let room=false;
 const values=new Map([[GitHubStateRepository.PENDING_KEY,damaged]]);
 const full={getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key),setItem:(key,value)=>{if(key===GitHubStateRepository.RECOVERY_KEY&&!room)throw new DOMException('full','QuotaExceededError');values.set(key,value);}};
 const unavailable=new GitHubStateRepository({storage:full,clock:()=>new Date(timestamp(30)),fetch:async()=>raw(emptyStateDocument())});
 assert.equal(unavailable.getPendingCount(),1);
 assert.deepEqual(applyPendingMutations(emptyStateDocument(),unavailable.pendingMutations()).books.a.value.states,['onemli']);
 assert.deepEqual(unavailable.recoveryStatus(),{copies:1,kept:1,stored:false});
 assert.deepEqual(unavailable.pendingRecovery().map(copy=>copy.raw),[damaged]);
 assert.throws(()=>unavailable.queueBookState('c',{states:['onemli']}),error=>error instanceof GitHubStateRepositoryError&&error.code==='storage');
 assert.equal(values.get(GitHubStateRepository.PENDING_KEY),damaged);
 // Once there is room, the copy is stored first and the queue moves on.
 room=true;
 unavailable.queueBookState('c',{states:['alindi']});
 assert.deepEqual(unavailable.pendingRecovery().map(copy=>copy.raw),[damaged]);
 assert.deepEqual(unavailable.pendingMutations().map(item=>item.bookId),['a','c']);
 // Deleting a record whose copy could not be stored keeps its readable edits queued.
 const lost=new Map([[GitHubStateRepository.PENDING_KEY,damaged]]);
 const tight=new GitHubStateRepository({storage:{getItem:key=>lost.get(key)??null,removeItem:key=>lost.delete(key),setItem:(key,value)=>{if(key===GitHubStateRepository.RECOVERY_KEY)throw new DOMException('full','QuotaExceededError');lost.set(key,value);}},fetch:async()=>raw(emptyStateDocument())});
 tight.getPendingCount();
 tight.clearPendingRecovery();
 assert.equal(tight.hasPendingRecovery(),false);
 assert.deepEqual(JSON.parse(lost.get(GitHubStateRepository.PENDING_KEY)).mutations,[good]);
 // A damaged list of copies is still handed over as its text.
 const list=storage();list.setItem(GitHubStateRepository.RECOVERY_KEY,'[{broken');
 assert.deepEqual(new GitHubStateRepository({storage:list,fetch:async()=>raw(emptyStateDocument())}).pendingRecovery().map(copy=>copy.raw),['[{broken']);
 // The reader removes the copy once it is no longer needed.
 repository.clearPendingRecovery();
 assert.equal(repository.hasPendingRecovery(),false);
 assert.deepEqual(repository.pendingRecovery(),[]);
});

// Two devices edit the same book or the queue before either has seen the other's edit.
// Each edit keeps the value it was made on (its base), so both sides' edits are kept.
const basisOf=local=>new Map(Object.entries(JSON.parse(local.getItem(GitHubStateRepository.BASIS_KEY)??'{}')));

test('marks merge three-way: removals go, additions come, and of two exclusive marks the later stays',()=>{
 assert.deepEqual(mergeStates([],['alindi'],['onemli'],false),['onemli','alindi']);
 assert.deepEqual(mergeStates(['onemli','alinacak'],['alinacak'],['onemli','alinacak','okunuyor'],false),['alinacak','okunuyor'],'a mark this device took off stays off');
 assert.deepEqual(mergeStates(['alinacak'],['alindi'],['alinacak','onemli'],false),['onemli','alindi'],'bought replaces to-buy');
 assert.deepEqual(mergeStates([],['okundu'],['okunuyor'],false),['okundu'],'this device set its mark later');
 assert.deepEqual(mergeStates([],['okundu'],['okunuyor'],true),['okunuyor'],'the other device set its mark later');
 // The groups are the ones the mark buttons apply.
 for(const group of EXCLUSIVE_STATE_GROUPS)for(const mark of group)for(const other of group)if(other!==mark)assert.deepEqual(toggleState([other],mark),[mark]);
 assert.deepEqual(toggleState(['onemli','alindi'],'okundu').sort(),['alindi','okundu','onemli']);
});

test('the reading record merges part by part, and the queue keeps both devices’ books',()=>{
 assert.deepEqual(mergeReading(null,{page:50},{why:'Bilgisayardan'},false),{page:50,why:'Bilgisayardan'});
 assert.deepEqual(mergeReading({why:'eski',page:5},{page:5},{why:'eski',page:5,apply:'yeni'},false),{page:5,apply:'yeni'},'a part this device cleared stays cleared');
 assert.equal(mergeReading({page:10},{page:20},{page:30},false).page,20);
 assert.equal(mergeReading({page:10},{page:20},{page:30},true).page,30);
 assert.equal(mergeReading({why:'x'},null,{why:'x'},false),null);
 assert.deepEqual(mergeQueue(['a'],['a','b'],['a','c'],false),['a','c','b'],'the other device’s book keeps its place after the book it followed');
 assert.deepEqual(mergeQueue(['a','b'],['b'],['a','b','c'],false),['b','c']);
 assert.deepEqual(mergeQueue(['a','b'],['b','a'],['x','a','b'],false),['x','b','a'],'a reorder survives a book this device does not show');
 assert.deepEqual(mergeQueue(['a','b'],['b','a'],['a','b','c'],true),['a','b','c'],'the side that changed the queue later leads its order');
 // Five books at most: the later side's books stay.
 assert.deepEqual(mergeQueue([],['f'],['a','b','c','d','e'],false),['a','b','c','d','f']);
 assert.deepEqual(mergeQueue([],['f'],['a','b','c','d','e'],true),['a','b','c','d','e']);
});

test('an edit is written exactly as made when the shared value is still the one it was made on, and merged when it is not',async()=>{
 const local=storage();
 const seen=document({a:record(1,{states:['onemli','alinacak'],reading:{why:'not',page:5}},{states:timestamp(1),reading:timestamp(1)})},timestamp(1),{updatedAt:timestamp(1),value:['a','b']});
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(seen)});
 await repository.load();
 repository.queueBookState('a',{states:[]},undefined,{states:['onemli','alinacak']});
 repository.queueBookState('a',{reading:{page:5}},undefined,{reading:{why:'not',page:5}});
 repository.queueQueueState(['b','a'],undefined,['a','b']);
 const exact=applyPendingMutations(seen,repository.pendingMutations(),basisOf(local));
 assert.deepEqual(exact.books.a.value,{states:[],reading:{page:5}},'removals and a cleared note travel');
 assert.deepEqual(exact.queue.value,['b','a'],'a reorder travels');
 // Meanwhile another device added a mark, a part of the record and a book to the queue.
 const changed=document({a:record(10,{states:['onemli','alinacak','okunuyor'],reading:{why:'not',page:5,totalPages:300}},{states:timestamp(10),reading:timestamp(10)})},timestamp(10),{updatedAt:timestamp(10),value:['a','b','c']});
 const both=applyPendingMutations(changed,repository.pendingMutations(),basisOf(local));
 assert.deepEqual(both.books.a.value,{states:['okunuyor'],reading:{page:5,totalPages:300}});
 assert.deepEqual(both.queue.value,['b','c','a'],'this later reorder leads; the other device’s book keeps its place after b');
 assert.ok(Date.parse(both.books.a.stamps.states)>=Date.parse(timestamp(20)));
 // The queue's stored format is the one older pages read; the basis lives beside it.
 for(const mutation of JSON.parse(local.getItem(GitHubStateRepository.PENDING_KEY)).mutations)assert.deepEqual(Object.keys(mutation).sort(),mutation.kind==='book'?['bookId','id','kind','updatedAt','value']:['id','kind','updatedAt','value']);
});

test('folded edits keep their first base and each field its own time, so an edit that lost stays lost',async()=>{
 const local=storage();let now=Date.parse(timestamp(10));
 const empty=document({},timestamp(0));
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:async()=>raw(served)});
 let served=empty;
 await repository.load();
 repository.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 now+=1000;
 // The view now shows the first edit; the second is folded into it.
 repository.queueBookState('a',{states:['onemli','alindi']},undefined,{states:['onemli']});
 const other=document({a:record(5,{states:['okundu']},{states:timestamp(5)})},timestamp(5));
 assert.deepEqual(applyPendingMutations(other,repository.pendingMutations(),basisOf(local)).books.a.value.states,['okundu','onemli','alindi'],'both of this device’s marks and the other device’s');
 // A note edited on a clock that runs behind loses to a newer note; a later edit to the
 // marks, stamped after what was seen, must not carry the old note past it.
 const slow=storage();now=Date.parse(timestamp(10));
 const behind=new GitHubStateRepository({storage:slow,clock:()=>new Date(now),fetch:async()=>raw(served)});
 behind.queueBookState('b',{reading:{why:'v1'}});
 served=document({b:record(50,{states:['okundu'],reading:{why:'v2'}},{states:timestamp(50),reading:timestamp(50)})},timestamp(50));
 await behind.load();
 behind.queueBookState('b',{states:['okunuyor']},undefined,{states:['okundu']});
 const result=applyPendingMutations(served,behind.pendingMutations(),basisOf(slow));
 assert.deepEqual(result.books.b.value.reading,{why:'v2'},'the newer note the reader saw stays');
 assert.deepEqual(result.books.b.value.states,['okunuyor'],'the new mark wins');
});

test('keeping this device’s edits bases them on the file decided against; a send clears the basis; a damaged basis merges as before',async()=>{
 const local=storage();
 const decided=document({a:record(10,{states:['onemli']},{states:timestamp(10)})},timestamp(10));
 const keeper=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(decided)});
 keeper.queueBookState('a',{states:['alindi']},undefined,{states:[]});
 keeper.requeuePendingFor(['a'],false,decided);
 assert.deepEqual(applyPendingMutations(decided,keeper.pendingMutations(),basisOf(local)).books.a.value.states,['alindi'],'the reader’s choice, exactly');
 const after=document({a:record(30,{states:['onemli','okundu']},{states:timestamp(30)})},timestamp(30));
 assert.deepEqual([...applyPendingMutations(after,keeper.pendingMutations(),basisOf(local)).books.a.value.states].sort(),['alindi','okundu'],'what another device saves after the decision is merged');
 // A send clears the basis with the queue.
 const written=withToken();let file=emptyStateDocument();
 const sender=new GitHubStateRepository({storage:written,clock:()=>new Date(timestamp(20)),fetch:async(url,init)=>{if(init.method==='PUT'){file=JSON.parse(Buffer.from(JSON.parse(init.body).content,'base64').toString('utf8'));return new Response('{}',{status:200});}return contents(file);}});
 sender.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 assert.ok(written.getItem(GitHubStateRepository.BASIS_KEY));
 await sender.flushPending();
 assert.equal(written.getItem(GitHubStateRepository.BASIS_KEY),null);
 // A damaged basis, or none (an edit queued by older code), merges by the later stamp.
 const damaged=storage();
 const old=new GitHubStateRepository({storage:damaged,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(emptyStateDocument())});
 old.queueBookState('a',{states:['alindi']},undefined,{states:[]});
 damaged.setItem(GitHubStateRepository.BASIS_KEY,'{broken');
 const other=document({a:record(5,{states:['onemli']},{states:timestamp(5)})},timestamp(5));
 assert.deepEqual((await old.loadWithPending(other)).books.a.value.states,['alindi']);
 assert.deepEqual(applyPendingMutations(other,old.pendingMutations()).books.a.value.states,['alindi']);
});

// A fake GitHub for writes: `gate` holds the next write until released; `lose` stores the
// next write but answers as if it failed, as when a phone page closes or the network drops.
// `commits` is state.json's history, newest first, as GitHub lists it.
function writableGitHub(start=emptyStateDocument()){
 const server={file:start,sha:'sha-0',puts:0,gate:null,lose:false,commits:[]};
 server.fetch=async(url,init={})=>{
  if(!init.method&&url.includes('/commits?'))return new Response(JSON.stringify(server.commits),{status:200});
  if(init.method==='PUT'){
   if(server.gate){const gate=server.gate;server.gate=null;await gate;}
   const body=JSON.parse(init.body);
   if(body.sha!==server.sha)return new Response('{}',{status:409});
   server.file=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));server.sha=`sha-${++server.puts}`;
   server.commits.unshift({sha:server.sha,commit:{message:body.message}});
   if(server.lose){server.lose=false;return new Response('{}',{status:500});}
   return new Response(JSON.stringify({content:{sha:server.sha}}),{status:200});
  }
  return contents(server.file,server.sha,{ETag:`"${server.sha}"`});
 };
 return server;
}

test('an undo made while the first edit is being sent is not lost',async()=>{
 const server=writableGitHub();let now=Date.parse(timestamp(10));
 const repository=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(now),fetch:server.fetch});
 await repository.load();
 repository.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 let open;server.gate=new Promise(resolve=>{open=resolve;});
 const sending=repository.flushPending();
 await new Promise(resolve=>setImmediate(resolve));
 now+=1000;
 // The reader takes the mark off while the write is under way.
 repository.queueBookState('a',{states:[]},undefined,{states:['onemli']});
 open();await sending;
 assert.deepEqual(server.file.books.a.value.states,['onemli']);
 await repository.flushPending();
 assert.deepEqual(server.file.books.a.value.states,[],'the undo reaches GitHub');
});

test('an undo after a write whose answer never came is not lost, and resending that write changes nothing',async()=>{
 const server=writableGitHub();let now=Date.parse(timestamp(10));
 const local=withToken();
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:server.fetch});
 await repository.load();
 repository.queueBookState('a',{states:['onemli','alinacak']},undefined,{states:[]});
 server.lose=true;
 await assert.rejects(()=>repository.flushPending());
 assert.deepEqual(server.file.books.a.value.states,['onemli','alinacak'],'the write reached GitHub');
 assert.equal(repository.getPendingCount(),1,'the device never heard back');
 // A reload: the same edit is still waiting, and the reader takes one mark off.
 now+=1000;
 const reopened=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:server.fetch});
 await reopened.load();
 reopened.queueBookState('a',{states:['alinacak']},undefined,{states:['onemli','alinacak']});
 await reopened.flushPending();
 assert.deepEqual(server.file.books.a.value.states,['alinacak'],'the undo reaches GitHub');
 // Resending a write that already reached GitHub keeps what is there.
 const resend=withToken();
 const twice=new GitHubStateRepository({storage:resend,clock:()=>new Date(now),fetch:server.fetch});
 await twice.load();
 twice.queueQueueState(['a','b'],undefined,[]);
 server.lose=true;
 await assert.rejects(()=>twice.flushPending());
 await twice.flushPending();
 assert.deepEqual(server.file.queue.value,['a','b']);
});

// Review of 7 November 2026: a write that reached GitHub without the page hearing back must not
// bring back what another device removed afterwards, and must not swallow a later undo.
test('a mark, a note or a queue book another device removed after an unanswered write stays removed',async()=>{
 const server=writableGitHub();let now=Date.parse(timestamp(10));
 const phone=withToken();
 const first=new GitHubStateRepository({storage:phone,clock:()=>new Date(now),fetch:server.fetch});
 await first.load();
 first.queueBookState('a',{states:['onemli'],reading:{why:'not'}},undefined,{states:[],reading:null});
 first.queueQueueState(['a'],undefined,[]);
 server.lose=true;
 await assert.rejects(()=>first.flushPending());
 assert.deepEqual(server.file.books.a.value.states,['onemli'],'the write reached GitHub');
 // The computer reads the file and takes all three back.
 now=Date.parse(timestamp(20));
 const computer=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(now),fetch:server.fetch});
 await computer.load();
 computer.queueBookState('a',{states:[],reading:null},undefined,{states:['onemli'],reading:{why:'not'}});
 computer.queueQueueState([],undefined,['a']);
 await computer.flushPending();
 // The phone opens the page again with its old edit still waiting.
 now=Date.parse(timestamp(30));
 const reopened=new GitHubStateRepository({storage:phone,clock:()=>new Date(now),fetch:server.fetch});
 const shown=await reopened.loadWithPending();
 assert.deepEqual(shown.books.a.value.states,[],'the removed mark stays removed');
 assert.equal(shown.books.a.value.reading??null,null,'the cleared note stays cleared');
 assert.deepEqual(shown.queue.value,[],'the removed book stays out of the queue');
 await reopened.flushPending();
 assert.deepEqual(server.file.books.a.value.states,[]);
 assert.equal(server.file.books.a.value.reading??null,null);
 assert.deepEqual(server.file.queue.value,[]);
});

test('an undo after a merged write whose answer never came reaches GitHub',async()=>{
 const server=writableGitHub();let now=Date.parse(timestamp(10));
 const phone=withToken();
 const first=new GitHubStateRepository({storage:phone,clock:()=>new Date(now),fetch:server.fetch});
 await first.load();
 first.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 // Meanwhile a computer whose clock runs ahead adds another mark.
 server.file=document({a:record(50,{states:['alindi']},{states:timestamp(50)})},timestamp(50));server.sha='sha-computer';
 server.lose=true;
 await assert.rejects(()=>first.flushPending());
 assert.deepEqual([...server.file.books.a.value.states].sort(),['alindi','onemli'],'the merged write reached GitHub');
 // After a reload the reader takes this device's mark off again.
 now=Date.parse(timestamp(12));
 const reopened=new GitHubStateRepository({storage:phone,clock:()=>new Date(now),fetch:server.fetch});
 await reopened.load();
 reopened.queueBookState('a',{states:['alindi']},undefined,{states:['alindi','onemli']});
 await reopened.flushPending();
 assert.deepEqual(server.file.books.a.value.states,['alindi'],'the undo reaches GitHub');
});

test('a write GitHub refused is not remembered as sent, and a write sent again is remembered once',async()=>{
 const server=writableGitHub();
 const local=withToken();
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(10)),fetch:async(url,init={})=>init.method==='PUT'&&server.refuse?new Response('{}',{status:403,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':'2000000000'}}):server.fetch(url,init)});
 await repository.load();
 repository.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 const sentOf=()=>basisOf(local).get(repository.pendingMutations()[0].id).sent??[];
 server.refuse=true;
 await assert.rejects(()=>repository.flushPending(),error=>error.code==='rate-limited');
 assert.deepEqual(sentOf(),[],'a refused write never reached the file');
 server.refuse=false;
 server.lose=true;
 await assert.rejects(()=>repository.flushPending());
 server.lose=true;
 await assert.rejects(()=>repository.flushPending());
 assert.equal(sentOf().length,1,'the same write sent twice is one version');
});

test('an edit made on a view that merged another device’s change is based on that change, so its later removal stays',async()=>{
 const start=async()=>{
  const local=storage();const server={file:document({},timestamp(0))};
  const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(server.file)});
  await repository.load();
  repository.queueBookState('a',{states:['alindi']},undefined,{states:[]});
  repository.queueQueueState(['a'],undefined,[]);
  // A refresh shows the other device's mark and queue book merged with this device's edits.
  server.file=document({a:record(5,{states:['onemli']},{states:timestamp(5)})},timestamp(5),{updatedAt:timestamp(5),value:['c']});
  const shown=await repository.loadWithPending();
  assert.deepEqual([...shown.books.a.value.states].sort(),['alindi','onemli']);
  assert.deepEqual([...shown.queue.value].sort(),['a','c']);
  return {local,repository,shown};
 };
 const removed=document({a:record(8,{states:[]},{states:timestamp(8)})},timestamp(8),{updatedAt:timestamp(8),value:[]});
 // The reader adds a mark and a book on top of what the page shows; then the other device
 // takes its own mark and book back.
 const added=await start();
 added.repository.queueBookState('a',{states:[...added.shown.books.a.value.states,'okunuyor']},undefined,{states:added.shown.books.a.value.states});
 added.repository.queueQueueState([...added.shown.queue.value,'d'],undefined,added.shown.queue.value);
 const after=applyPendingMutations(removed,added.repository.pendingMutations(),basisOf(added.local));
 assert.deepEqual([...after.books.a.value.states].sort(),['alindi','okunuyor'],'the other device’s removal stays');
 assert.deepEqual(after.queue.value,['a','d']);
 // While the other device keeps its mark and book, both sides' changes stay.
 const kept=applyPendingMutations(document({a:record(5,{states:['onemli']},{states:timestamp(5)})},timestamp(5),{updatedAt:timestamp(5),value:['c']}),added.repository.pendingMutations(),basisOf(added.local));
 assert.deepEqual([...kept.books.a.value.states].sort(),['alindi','okunuyor','onemli']);
 assert.deepEqual([...kept.queue.value].sort(),['a','c','d']);
 // The reader takes the other device's mark and book off: that removal travels.
 const dropped=await start();
 dropped.repository.queueBookState('a',{states:['alindi']},undefined,{states:dropped.shown.books.a.value.states});
 dropped.repository.queueQueueState(['a'],undefined,dropped.shown.queue.value);
 const served=document({a:record(5,{states:['onemli']},{states:timestamp(5)})},timestamp(5),{updatedAt:timestamp(5),value:['c']});
 const result=applyPendingMutations(served,dropped.repository.pendingMutations(),basisOf(dropped.local));
 assert.deepEqual(result.books.a.value.states,['alindi'],'the reader’s removal of the other device’s mark travels');
 assert.deepEqual(result.queue.value,['a']);
});

test('an edit is based on the file the page shows, not on a newer read the page has not shown yet',async()=>{
 const local=storage();const server={file:document({},timestamp(0))};
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(server.file)});
 await repository.load();
 repository.queueBookState('a',{states:['okunuyor']},undefined,{states:[]});
 server.file=document({a:record(5,{states:['onemli']},{states:timestamp(5)})},timestamp(5));
 const shown=await repository.loadWithPending();
 assert.deepEqual([...shown.books.a.value.states].sort(),['okunuyor','onemli']);
 // A newer read with another mark arrives, but the page still shows the earlier one.
 server.file=document({a:record(8,{states:['onemli','alindi']},{states:timestamp(8)})},timestamp(8));
 const newer=await repository.load();
 // The reader takes the other device's first mark off.
 repository.queueBookState('a',{states:['okunuyor']},undefined,{states:shown.books.a.value.states});
 const result=applyPendingMutations(newer,repository.pendingMutations(),basisOf(local));
 assert.deepEqual([...result.books.a.value.states].sort(),['alindi','okunuyor'],'the mark from the read not yet shown stays, the removed one goes');
});

// Second review of 7 November 2026: only a write that went out can be unanswered.
const offline=async task=>{
 const before=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
 try{return await task();}finally{Object.defineProperty(globalThis,'navigator',before);}
};
/** A write that leaves the device but is lost on the way: GitHub never stores it. */
const droppingFetch=server=>async(url,init={})=>{if(init.method==='PUT'&&server.drop){server.drop=false;throw new TypeError('Failed to fetch');}return server.fetch(url,init);};

test('a write that never left the device is not remembered as sent, so both devices’ changes stay',async()=>{
 const server=writableGitHub();let now=Date.parse(timestamp(10));
 const local=withToken();
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:server.fetch});
 await repository.load();
 repository.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 repository.queueQueueState(['a'],undefined,[]);
 await offline(()=>assert.rejects(()=>repository.flushPending(),error=>error.code==='network'));
 assert.equal(server.puts,0,'nothing is written while the browser is offline');
 // A read that fails before the write: no write is made either.
 const failing=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:async(url,init={})=>{if(!init.method)throw new TypeError('Failed to fetch');return server.fetch(url,init);}});
 await assert.rejects(()=>failing.flushPending(),error=>error.code==='network');
 assert.equal(server.puts,0);
 // The computer adds a mark and a book; back online, both devices' changes stay.
 now=Date.parse(timestamp(20));
 const computer=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(now),fetch:server.fetch});
 await computer.load();
 computer.queueBookState('a',{states:['alindi']},undefined,{states:[]});
 computer.queueQueueState(['c'],undefined,[]);
 await computer.flushPending();
 now=Date.parse(timestamp(30));
 await new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:server.fetch}).flushPending();
 assert.deepEqual([...server.file.books.a.value.states].sort(),['alindi','onemli']);
 assert.deepEqual([...server.file.queue.value].sort(),['a','c']);
});

test('a send stamped after the shared field cannot have landed, so the edit merges against its first base',async()=>{
 const server=writableGitHub();
 const local=withToken();
 const phone=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(30)),fetch:droppingFetch(server)});
 await phone.load();
 phone.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 server.drop=true;
 await assert.rejects(()=>phone.flushPending(),error=>error.code==='network');
 assert.equal(server.puts,0,'the write never reached GitHub');
 // A computer whose clock runs behind adds another mark.
 const computer=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(timestamp(5)),fetch:server.fetch});
 await computer.load();
 computer.queueBookState('a',{states:['alindi']},undefined,{states:[]});
 await computer.flushPending();
 await phone.flushPending();
 assert.deepEqual([...server.file.books.a.value.states].sort(),['alindi','onemli']);
});

test('GitHub’s history tells whether an unanswered write landed, so a write that never did still merges',async()=>{
 const server=writableGitHub();let now=Date.parse(timestamp(30));
 const local=withToken();
 const phone=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:droppingFetch(server)});
 await phone.load();
 phone.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 phone.queueQueueState(['a'],undefined,[]);
 server.drop=true;
 await assert.rejects(()=>phone.flushPending(),error=>error.code==='network');
 assert.equal(server.puts,0,'the write never reached GitHub');
 // A computer marks the same book and adds a book later than the phone did.
 now=Date.parse(timestamp(40));
 const computer=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(now),fetch:server.fetch});
 await computer.load();
 computer.queueBookState('a',{states:['alindi']},undefined,{states:[]});
 computer.queueQueueState(['c'],undefined,[]);
 await computer.flushPending();
 // The phone opens again: its write is not in the history, so it merges as never sent.
 now=Date.parse(timestamp(45));
 const reopened=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:server.fetch});
 const shown=await reopened.loadWithPending();
 assert.deepEqual([...shown.books.a.value.states].sort(),['alindi','onemli']);
 await reopened.flushPending();
 assert.deepEqual([...server.file.books.a.value.states].sort(),['alindi','onemli']);
 assert.deepEqual([...server.file.queue.value].sort(),['a','c']);
 // Every write names itself in its commit message.
 assert.ok(server.commits.every(item=>/\(write [a-z0-9-]{8,64}\)$/.test(item.commit.message)));
});

test('an edit made on the view after an unanswered send is based on that view, so a later removal stays',async()=>{
 const server=writableGitHub();let now=Date.parse(timestamp(30));
 const local=withToken();
 const phone=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:droppingFetch(server)});
 await phone.load();
 phone.queueBookState('a',{states:['onemli']},undefined,{states:[]});
 server.drop=true;
 await assert.rejects(()=>phone.flushPending());
 now=Date.parse(timestamp(40));
 const computer=new GitHubStateRepository({storage:withToken(),clock:()=>new Date(now),fetch:server.fetch});
 await computer.load();
 computer.queueBookState('a',{states:['alindi']},undefined,{states:[]});
 await computer.flushPending();
 // The phone opens again; the reader adds a mark on what the page shows.
 now=Date.parse(timestamp(45));
 const reopened=new GitHubStateRepository({storage:local,clock:()=>new Date(now),fetch:droppingFetch(server)});
 const view=(await reopened.loadWithPending()).books.a.value.states;
 reopened.queueBookState('a',{states:[...view,'okunuyor']},undefined,{states:view});
 // The computer takes its mark back before the phone sends.
 now=Date.parse(timestamp(50));
 await computer.load();
 computer.queueBookState('a',{states:[]},undefined,{states:['alindi']});
 await computer.flushPending();
 await reopened.flushPending();
 assert.ok(!server.file.books.a.value.states.includes('alindi'),'the removed mark stays removed');
 assert.ok(server.file.books.a.value.states.includes('okunuyor'),'the new mark travels');
});

test('an edit on a view the page kept from before the read, or one that hides books it cannot show, is not based on the newer file',async()=>{
 const local=storage();const server={file:document({},timestamp(0))};
 const visit=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(server.file)});
 await visit.load();
 visit.queueBookState('a',{states:['alindi']},undefined,{states:[]});
 visit.queueQueueState(['a'],undefined,[]);
 server.file=document({a:record(5,{states:['onemli']},{states:timestamp(5)})},timestamp(5),{updatedAt:timestamp(5),value:['c']});
 const first=await visit.loadWithPending();
 // Next visit: the computer added a mark and a book this catalogue does not have. The reader
 // edits while the first read runs, so the page still shows the first visit's view.
 server.file=document({a:record(8,{states:['onemli','okunuyor']},{states:timestamp(8)})},timestamp(8),{updatedAt:timestamp(8),value:['c','yeni-kitap']});
 const next=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(25)),fetch:async()=>raw(server.file)});
 await next.loadWithPending();
 next.queueBookState('a',{states:['alindi']},undefined,{states:first.books.a.value.states});
 next.queueQueueState(['c','a'],undefined,first.queue.value);
 const result=applyPendingMutations(server.file,next.pendingMutations(),basisOf(local));
 assert.ok(result.books.a.value.states.includes('okunuyor'),'the mark the reader never saw stays');
 assert.ok(result.books.a.value.states.includes('alindi'));
 assert.ok(result.queue.value.includes('yeni-kitap'),'a book this device cannot show stays in the queue');
});

test('edits a damaged record still holds are not sent twice while it cannot be replaced',async()=>{
 const good={id:'g',kind:'book',bookId:'a',updatedAt:timestamp(1),value:{states:['onemli']}};
 const damaged=JSON.stringify({since:timestamp(1),mutations:[good,{id:'x',kind:'book',bookId:'b',updatedAt:'dün',value:{}}]});
 const values=new Map([[GitHubStateRepository.PENDING_KEY,damaged],[GitHubStateRepository.TOKEN_KEY,TOKEN]]);
 const full={getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key),setItem:(key,value)=>{if(key===GitHubStateRepository.RECOVERY_KEY)throw new DOMException('full','QuotaExceededError');values.set(key,value);}};
 const server=writableGitHub();
 const repository=new GitHubStateRepository({storage:full,clock:()=>new Date(timestamp(30)),fetch:server.fetch});
 await assert.rejects(()=>repository.flushPending(),error=>error.code==='storage');
 assert.equal(server.puts,1);
 assert.equal(repository.getPendingCount(),0,'what was sent is not waiting any more');
 await repository.flushPending();
 assert.equal(server.puts,1,'nothing is written again');
 assert.equal(values.get(GitHubStateRepository.PENDING_KEY),damaged,'the record stays until its copy is stored');
});

test('an edit queued by older code, without a basis, merges as before when a new edit is folded into it',()=>{
 const local=storage();
 local.setItem(GitHubStateRepository.PENDING_KEY,JSON.stringify({since:timestamp(5),mutations:[{id:'old',kind:'book',bookId:'a',updatedAt:timestamp(5),value:{states:['alindi']}}]}));
 const repository=new GitHubStateRepository({storage:local,clock:()=>new Date(timestamp(20)),fetch:async()=>raw(emptyStateDocument())});
 repository.queueBookState('a',{reading:{why:'not'}},undefined,{reading:null});
 const basis=basisOf(local).get(repository.pendingMutations()[0].id);
 assert.deepEqual(basis.base,{reading:null},'the old field keeps no base');
 assert.equal(basis.stamps.states,timestamp(5),'and its own time');
 const remote=document({a:record(10,{states:['onemli'],reading:{page:3}},{states:timestamp(10),reading:timestamp(10)})},timestamp(10));
 const result=applyPendingMutations(remote,repository.pendingMutations(),basisOf(local));
 assert.deepEqual(result.books.a.value.states,['onemli'],'the newer shared marks win over the old edit');
 assert.deepEqual(result.books.a.value.reading,{page:3,why:'not'},'the new edit merges');
});
