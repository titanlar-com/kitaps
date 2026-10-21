import {useCallback,useEffect,useRef,useState} from 'react';
import {GitHubStateRepository,GitHubStateRepositoryError} from './GitHubStateRepository.ts';
import {GitHubStateBatcher,isPermanentSyncError} from './GitHubStateBatcher.ts';
import {planConnect,planFirstSync,projectPublicState} from './syncModel.ts';
import {GITHUB_STATE_BACKUP_KEY,GITHUB_STATE_OWNER,GITHUB_STATE_REPOSITORY} from './types.ts';

const readingPayload=(personal,id)=>{
 const source=personal.reading[id];if(!source||typeof source!=='object')return null;
 const reading={};
 for(const key of ['startedAt','finishedAt','why','apply'])if(typeof source[key]==='string'&&source[key]!=='' )reading[key]=source[key];
 for(const key of ['page','totalPages'])if(Number.isInteger(source[key])&&source[key]>=0)reading[key]=source[key];
 return Object.keys(reading).length?reading:null;
};
const publicPayload=(id,states,personal)=>({states:states[id]||[],reading:readingPayload(personal,id)});
// Only the fields a view holds: an empty field this device never set must not travel as a
// value, or it would overwrite another device's note or marks.
const setFields=view=>({...(view.states.length?{states:view.states}:{}),...(view.reading?{reading:view.reading}:{})});
const signature=value=>JSON.stringify(value);
const emptySignature=signature({states:[],reading:null});
const modelSnapshot=(bookIds,states,personal)=>new Map(bookIds.map(id=>[id,publicPayload(id,states,personal)]));
const queueSignature=personal=>JSON.stringify(personal.queue);
const noSkip=()=>({books:new Set(),queue:false});
// A visible page reads the shared file this often (the owner's decision of 22 October 2026).
// A connected device reads the API conditionally, 120 requests an hour against its 5000;
// a device without a key reads the CDN copy, which has no API limit but may lag.
export const SHARED_REFRESH_MS=30_000;
// The check runs more often than the refresh, so a read is never a whole period late.
const REFRESH_CHECK_MS=5_000;
// Coming back to the page re-reads the shared file when the last read is at least this old.
const RETURN_REFRESH_MS=30_000;

const clock=ms=>new Date(ms).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
const readMessage=error=>error?.code==='rate-limited'?`GitHub istek sınırına ulaşıldı; ${clock(error.retryAt)} sonrasında yeniden denenecek.`:error?.code==='not-found'?'Durum deposu henüz hazırlanmadı.':error?.code==='invalid-data'?'GitHub durum dosyası güvenli biçimde okunamadı.':'GitHub durumu okunamadı.';
const REVIEW_FAILED='Bu cihazın kayıtları GitHub’dakiyle karşılaştırılamadı; sayfaya dönünce yeniden denenecek. O zamana kadar hiçbir şey gönderilmez.';
const writeMessage=error=>error?.code==='unauthorized'?'GitHub anahtarı reddetti: süresi dolmuş ya da kitaps-state için yazma izni kaldırılmış olabilir. Anahtarı kaldırıp yeni bir anahtarla bu cihazı yeniden bağla.':error?.code==='storage'?'Tarayıcının yerel eşitleme alanına yazılamadı.':error?.code==='rate-limited'?`GitHub istek sınırına ulaşıldı; değişiklikler kuyrukta, ${clock(error.retryAt)} sonrasında gönderilecek.`:error?.code==='not-found'?'Durum deposu ya da dosyası bulunamadı; değişiklikler cihazda bekliyor.':error?.code==='invalid-data'?'GitHub durum dosyası güvenli biçimde okunamadı; değişiklikler cihazda bekliyor.':'Eşitleme tamamlanamadı; değişiklikler cihazda kuyrukta ve otomatik olarak yeniden denenecek.';

/** The copy of this device's records taken before a first sync decision. */
export function readSyncBackup(){
 try{return JSON.parse(localStorage.getItem(GITHUB_STATE_BACKUP_KEY)||'null')}catch{return null}
}

export function useGitHubStateSync({bookIds,states,setStates,personal,setPersonal}){
 const repositoryRef=useRef(null);
 if(!repositoryRef.current)repositoryRef.current=new GitHubStateRepository();
 const repository=repositoryRef.current;
 const latest=useRef({states,personal});latest.current={states,personal};
 const known=useRef(new Map());
 const knownQueue=useRef(null);
 const hydrated=useRef(false);
 const loading=useRef(false);
 const lastRefresh=useRef(0);
 const backoffUntil=useRef(0);
 // GitHub refused the stored key on the last read: nothing is written until a read with
 // the key succeeds again or the reader connects a new one.
 const rejected=useRef(false);
 const blocked=useRef(noSkip());
 const firstSyncRemote=useRef(null);
 const flushLatest=useRef(async(_options={})=>undefined);
 const batcher=useRef(null);
 const pendingCount=()=>{try{return repository.getPendingCount()}catch{return 0}};
 const tokenPresent=()=>{try{return repository.hasToken()}catch{return false}};
 // writeError: why GitHub refused this device's last write; cleared by the next successful one.
 // lastSentAt and lastReadAt: this visit's last successful write and read; readSource: 'api' or
 // the CDN copy ('cdn'), which can lag; tokenRejected: GitHub refused the stored key on a read.
 const [sync,setSync]=useState(()=>({status:'loading',message:'GitHub durumu okunuyor.',pending:pendingCount(),hasToken:tokenPresent(),writeError:null,lastSentAt:null,lastReadAt:null,readSource:null,tokenRejected:false}));
 const [mergePrompt,setMergePrompt]=useState(null);

 const applyDocument=useCallback((document,baseline,baselineQueue,skip=noSkip())=>{
  const projected=projectPublicState(document,bookIds),records=new Map(Object.entries(projected.records));
  for(const [id,normalized] of records)if(!skip.books.has(id))known.current.set(id,normalized);
  if(!skip.queue)knownQueue.current=signature(projected.queue);
  setStates(previous=>{
   const next={...previous};
   for(const [id,value] of records){
    if(skip.books.has(id))continue;
    const changedDuringRequest=baseline&&signature(baseline.get(id)?.states||[])!==signature(previous[id]||[]);
    if(changedDuringRequest)continue;
    if(value.states.length)next[id]=value.states;else delete next[id];
   }
   return next;
  });
  setPersonal(previous=>{
   const nextReading={...previous.reading};
   for(const [id,value] of records){
    if(skip.books.has(id))continue;
    const changedDuringRequest=baseline&&signature(baseline.get(id)?.reading??null)!==signature(readingPayload(previous,id));
    if(changedDuringRequest)continue;
    if(value.reading)nextReading[id]=value.reading;else delete nextReading[id];
   }
   const keepLocalQueue=skip.queue||(baselineQueue!==undefined&&baselineQueue!==queueSignature(previous));
   return {...previous,reading:nextReading,queue:keepLocalQueue?previous.queue:projected.queue};
  });
 },[bookIds,setPersonal,setStates]);

 const refreshing=useRef(null);
 const reviewLatest=useRef(async(_remote)=>undefined);
 // Why the merge dialog is open: 'first-sync' (a device's first read) or 'connect'.
 const mergeReason=useRef(null);
 const reviewPending=()=>{try{return repository.hasConnectReviewPending()}catch{return false}};
 const backupBeforeChoice=()=>{try{localStorage.setItem(GITHUB_STATE_BACKUP_KEY,JSON.stringify({version:1,createdAt:new Date().toISOString(),states:latest.current.states,...latest.current.personal,pending:repository.pendingMutations()}))}catch{/* The dialog still offers both choices. */}};

 const refresh=useCallback((silent=false,fresh=false)=>{
  // A second caller (a connect, say) waits for the read under way instead of skipping it.
  if(loading.current)return refreshing.current;
  if(Date.now()<backoffUntil.current)return Promise.resolve();
  loading.current=true;
  const run=(async()=>{
   const baseline=modelSnapshot(bookIds,latest.current.states,latest.current.personal),baselineQueue=queueSignature(latest.current.personal);
   // A read that started without the key may be the CDN copy, up to five minutes old.
   const authenticated=repository.hasToken();
   if(!silent)setSync(value=>({...value,status:'loading',message:'GitHub durumu okunuyor.'}));
   try{
    const {document:remoteDocument,info:read}=await repository.loadRead({fresh});
    lastRefresh.current=Date.now();
    let skip=blocked.current;
    if(!repository.hasCompletedInitialMigration()&&!firstSyncRemote.current){
     // A device that has never synced adds what only it knows. Where both sides
     // disagree, nothing is overwritten until the reader decides.
     const plan=planFirstSync(baseline,latest.current.personal.queue,projectPublicState(remoteDocument,bookIds));
     for(const id of plan.localOnly)repository.queueBookState(id,setFields(baseline.get(id)));
     if(plan.queue==='local-only')repository.queueQueueState(latest.current.personal.queue);
     // These were compared with the file as it is now; a later connect asks only about what changes after.
     repository.recordBases(remoteDocument,{skipBooks:plan.conflicts,skipQueue:plan.queue==='conflict',forceBooks:plan.localOnly,forceQueue:plan.queue==='local-only'});
     if(plan.conflicts.length||plan.queue==='conflict'){
      backupBeforeChoice();
      skip={books:new Set(plan.conflicts),queue:plan.queue==='conflict'};
      blocked.current=skip;firstSyncRemote.current=remoteDocument;mergeReason.current='first-sync';
      setMergePrompt({conflicts:plan.conflicts,queueConflict:plan.queue==='conflict',reason:'first-sync'});
     }else repository.markInitialMigrationComplete();
    }
    const document=await repository.loadWithPending(remoteDocument);
    applyDocument(document,baseline,baselineQueue,skip);hydrated.current=true;
    // A book edited while this read was under way keeps its old base: its edit is not yet queued.
    const now=modelSnapshot(bookIds,latest.current.states,latest.current.personal);
    const editing=[...now].filter(([id,view])=>signature(view)!==signature(baseline.get(id))).map(([id])=>id);
    repository.recordBases(remoteDocument,{skipBooks:[...skip.books,...editing],skipQueue:skip.queue||queueSignature(latest.current.personal)!==baselineQueue});
    // A connected device that has not yet compared its unsent edits does so now,
    // also after a reload or a failed first attempt. Only a read made with the key
    // is fresh enough to compare against; otherwise the comparison reads again.
    // A key removed or replaced while this read ran is not judged by it.
    const readState={lastReadAt:read.at,readSource:read.source,tokenRejected:read.tokenRejected&&repository.hasToken()};
    // A read GitHub answered without the stored key (it refused it) is no fresh comparison.
    setSync(value=>({...value,lastReadAt:readState.lastReadAt,readSource:readState.readSource}));
    if(reviewPending()&&repository.hasToken()&&!firstSyncRemote.current&&!readState.tokenRejected){await reviewLatest.current(authenticated&&read.authenticated?remoteDocument:undefined);return;}
    const pending=repository.getPendingCount();
    // A read with the key that GitHub accepts again clears the refusal it had reported.
    const wasRejected=rejected.current;
    rejected.current=readState.tokenRejected;
    if(readState.tokenRejected){
     // Writes stop and the queue stays until the reader connects a new key; reads go on.
     batcher.current?.cancel();
     const message=writeMessage({code:'unauthorized'});
     setSync(value=>({...value,...readState,status:'error',message,writeError:message,pending}));
     return;
    }
    if(repository.hasToken()&&pending)batcher.current?.schedule();
    const readOnly=read.source==='cdn'?'GitHub durumu okundu. Bağlı olmayan cihaz GitHub’ın önbellek kopyasını okur; bu kopya en çok beş dakika gecikebilir.':'GitHub durumu salt okunur olarak güncel.';
    setSync(value=>({...value,...readState,...(wasRejected?{writeError:null}:{}),status:pending?'queued':'ready',message:pending?(value.hasToken?'Değişiklikler cihazda; ilk değişiklikten 30 saniye sonra toplu gönderilecek.':'Değişiklikler cihazda kuyrukta; GitHub’a göndermek için bu cihazı bağla.'):(value.hasToken?'GitHub durumu güncel.':readOnly),pending}));
   }catch(error){
    if(error.code==='rate-limited')backoffUntil.current=error.retryAt;
    if(!hydrated.current)for(const [id,value] of baseline)known.current.set(id,value);
    if(knownQueue.current===null)knownQueue.current=baselineQueue;
    hydrated.current=true;
    // While a connect still waits for its comparison, the notice says why nothing is sent.
    const waiting=reviewPending()&&repository.hasToken()?REVIEW_FAILED:null;
    setSync(value=>({...value,status:'error',message:waiting??readMessage(error),writeError:waiting??value.writeError,pending:pendingCount()}));
   }finally{loading.current=false;}
  })();
  refreshing.current=run;
  return run;
 },[applyDocument,bookIds,repository]);
 // Opening the page and the reader's own refresh ask for a fresh copy.
 const load=useCallback(()=>refresh(false,true),[refresh]);

 // A newly connected device compares its unsent edits with the shared file before it
 // sends anything. Where another device saved a different value meanwhile, the reader
 // decides through the merge dialog (after a backup); everything else is sent at once.
 const reviewing=useRef(null);
 const reviewConnection=useCallback(remoteDocument=>{
  if(reviewing.current)return reviewing.current;
  const run=(async()=>{
  if(firstSyncRemote.current||!reviewPending())return;
  const baseline=modelSnapshot(bookIds,latest.current.states,latest.current.personal),baselineQueue=queueSignature(latest.current.personal);
  let remote=remoteDocument;
  if(!remote){
   // The comparison needs the file as the key reads it: a refused key keeps the marker
   // (nothing is sent) and asks to reconnect instead of comparing with an anonymous copy.
   try{
    const {document,info}=await repository.loadRead({fresh:true,requireToken:true});
    remote=document;lastRefresh.current=Date.now();
    setSync(value=>({...value,lastReadAt:info.at,readSource:info.source}));
   }
   catch(error){
    const refused=error?.status===401;
    if(refused){rejected.current=true;batcher.current?.cancel();}
    const message=refused?writeMessage(error):REVIEW_FAILED;
    setSync(value=>({...value,status:'error',message,writeError:message,tokenRejected:refused||value.tokenRejected,pending:pendingCount()}));
    return;
   }
  }
  // The key may have been removed, or another review may have finished, while this one read.
  if(firstSyncRemote.current||!reviewPending()||!repository.hasToken())return;
  const catalogIds=new Set(bookIds);
  const plan=planConnect(repository.pendingMutations().filter(item=>item.kind==='queue'||catalogIds.has(item.bookId)),remote,repository.readBases());
  if(plan.conflicts.length||plan.queueConflict){
   backupBeforeChoice();
   blocked.current={books:new Set(plan.conflicts),queue:plan.queueConflict};firstSyncRemote.current=remote;mergeReason.current='connect';
   applyDocument(await repository.loadWithPending(remote),baseline,baselineQueue,blocked.current);
   setMergePrompt({conflicts:plan.conflicts,queueConflict:plan.queueConflict,reason:'connect'});
   rejected.current=false;
   setSync(value=>({...value,status:'queued',writeError:null,tokenRejected:false,pending:pendingCount(),message:'Bu cihazdaki bazı kayıtları başka bir cihaz farklı kaydetmiş; seçimini yapınca gönderilecek.'}));
   return;
  }
  repository.clearConnectReview();
  const pending=repository.getPendingCount();
  if(pending){
   rejected.current=false;
   setSync(value=>({...value,status:'saving',writeError:null,tokenRejected:false,pending,message:`Bu cihazda bekleyen ${pending} değişiklik şimdi gönderiliyor.`}));
   await flushLatest.current().catch(()=>undefined);
   return;
  }
  applyDocument(await repository.loadWithPending(remote),baseline,baselineQueue,blocked.current);
  rejected.current=false;
  setSync(value=>({...value,status:'ready',writeError:null,tokenRejected:false,pending:0,message:'Bu cihaz bağlandı; değişiklikleri artık GitHub’a gönderilecek.'}));
  })();
  reviewing.current=run;
  const settle=()=>{if(reviewing.current===run)reviewing.current=null};
  run.then(settle,settle);
  return run;
 },[applyDocument,bookIds,repository]);
 reviewLatest.current=reviewConnection;

 const resolveMerge=useCallback(async choice=>{
  const remote=firstSyncRemote.current;if(!remote)return;
  const decision=blocked.current,reason=mergeReason.current;
  if(choice==='device'){
   if(reason==='connect'){
    // Exactly the fields this device changed win; fields it never touched keep the shared value.
    repository.requeuePendingFor(decision.books,decision.queue);
   }else{
    const snapshot=modelSnapshot(bookIds,latest.current.states,latest.current.personal);
    for(const id of decision.books){const view=snapshot.get(id);if(view&&(view.states.length||view.reading))repository.queueBookState(id,setFields(view));}
    if(decision.queue)repository.queueQueueState(latest.current.personal.queue);
   }
  }
  blocked.current=noSkip();firstSyncRemote.current=null;mergeReason.current=null;repository.markInitialMigrationComplete();setMergePrompt(null);
  if(choice!=='device')repository.discardPendingFor(decision.books,decision.queue);
  applyDocument(await repository.loadWithPending(remote));
  // The decided books were compared with this file; a later connect asks only about what changes after.
  repository.recordBases(remote,{forceBooks:decision.books,forceQueue:decision.queue});
  if(reason==='connect')repository.clearConnectReview();
  // A first-sync choice made while connecting: the rest of this device's edits are compared next.
  else if(reviewPending()&&repository.hasToken()){await reviewLatest.current();return;}
  const pending=repository.getPendingCount();
  if(repository.hasToken()&&pending){
   // The reader has just decided, so the result is sent now rather than after the window.
   setSync(value=>({...value,status:'saving',pending,message:'Seçimin kaydedildi; değişiklikler şimdi gönderiliyor.'}));
   void flushLatest.current().catch(()=>undefined);
   return;
  }
  setSync(value=>({...value,status:pending?'queued':'ready',pending,message:pending?'Seçimin kaydedildi; değişiklikler bu cihaz bağlanınca gönderilecek.':'Seçimin kaydedildi.'}));
 },[applyDocument,bookIds,repository]);

 const flushing=useRef(null),flushAgain=useRef(false);
 const flush=useCallback(({fromBatcher=false,keepalive=false}={})=>{
  // While the reader chooses between this device and the shared file, or a newly
  // connected device has not yet compared its edits, nothing is sent: a write now
  // could send a value that the choice can no longer undo.
  if(firstSyncRemote.current||reviewPending())return Promise.resolve(undefined);
  // Leaving the page, the batcher and "Şimdi gönder" can ask at once; one write serves
  // them all, and a change made while it ran gets one more write right after it.
  if(flushing.current){flushAgain.current=true;return flushing.current;}
  // Nothing to send: "Şimdi gönder" reads the shared file again instead of claiming a send.
  if(!pendingCount())return fromBatcher||keepalive?Promise.resolve(undefined):refresh(false,true).then(()=>undefined);
  // A refused key writes nothing. The batcher stops; leaving the page sends nothing; the
  // reader's own "Şimdi gönder" checks the key again with a fresh read, which resumes the
  // writes if GitHub accepts it now (an organisation approved it, say).
  if(rejected.current){
   if(fromBatcher)return Promise.reject(new GitHubStateRepositoryError('unauthorized','GitHub refused the stored key.',401));
   return keepalive?Promise.resolve(undefined):refresh(false,true).then(()=>undefined);
  }
  // GitHub asked this device to wait: no path (the timer, "Şimdi gönder", leaving the
  // page) sends before then. The batcher is told when; the others leave the queue to it.
  if(Date.now()<backoffUntil.current){
   const waiting=new GitHubStateRepositoryError('rate-limited','GitHub rate limit reached.',429,{retryAt:backoffUntil.current});
   if(!fromBatcher&&tokenPresent()&&pendingCount())batcher.current?.schedule();
   setSync(value=>({...value,status:'queued',message:writeMessage(waiting),pending:pendingCount()}));
   return fromBatcher?Promise.reject(waiting):Promise.resolve(undefined);
  }
  const run=(async()=>{
   batcher.current?.cancel();
   const baseline=modelSnapshot(bookIds,latest.current.states,latest.current.personal),baselineQueue=queueSignature(latest.current.personal);
   setSync(value=>({...value,status:'saving',message:'Değişiklikler GitHub’a yazılıyor.'}));
   try{
    const document=await repository.flushPending({keepalive});applyDocument(document,baseline,baselineQueue,blocked.current);
    repository.recordBases(document,{skipBooks:blocked.current.books,skipQueue:blocked.current.queue});
    lastRefresh.current=Date.now();
    rejected.current=false;
    setSync(value=>({...value,status:'ready',message:'GitHub ile eşitlendi.',writeError:null,tokenRejected:false,lastSentAt:Date.now(),pending:repository.getPendingCount()}));return document;
   }catch(error){
    if(error.code==='rate-limited')backoffUntil.current=error.retryAt;
    // A refused key or a broken file waits for the reader; anything else is retried.
    if(!fromBatcher&&repository.hasToken()&&pendingCount()&&!isPermanentSyncError(error))batcher.current?.schedule();
    const message=writeMessage(error);
    setSync(value=>({...value,status:'error',message,writeError:message,pending:pendingCount()}));
    throw error;
   }
  })();
  flushing.current=run;
  const settle=succeeded=>{
   if(flushing.current!==run)return;
   flushing.current=null;
   const again=flushAgain.current;flushAgain.current=false;
   // Not after a failure: the batcher's retries and GitHub's requested wait apply then.
   if(again&&succeeded&&Date.now()>=backoffUntil.current&&tokenPresent()&&pendingCount())void flushLatest.current({keepalive}).catch(()=>undefined);
  };
  run.then(()=>settle(true),()=>settle(false));
  return run;
 },[applyDocument,bookIds,refresh,repository]);
 flushLatest.current=flush;
 if(!batcher.current)batcher.current=new GitHubStateBatcher(repository,()=>flushLatest.current({fromBatcher:true}));

 const saveToken=useCallback(async token=>{
  setSync(value=>({...value,status:'loading',message:'GitHub anahtarı doğrulanıyor.'}));
  try{
   await repository.validateToken(token);
   // The review marker goes down before the key: from here on nothing is sent until the
   // comparison has run, whatever asks to send (the batcher, leaving the page, a reload).
   repository.beginConnectReview();
   try{repository.setToken(token)}catch(error){try{repository.clearConnectReview()}catch{/* Nothing more to undo. */}throw error;}
  }catch(error){setSync(value=>({...value,status:'error',hasToken:tokenPresent(),message:error.code==='read-only'?`Bu anahtar ${GITHUB_STATE_REPOSITORY} deposuna yazamıyor. Anahtarın sahibi (Resource owner) ${GITHUB_STATE_OWNER} olmalı, Repository access bölümünde ${GITHUB_STATE_REPOSITORY} seçili ve Contents izni Read and write olmalı; kuruluş onayı bekleyen anahtar da yazamaz. Anahtar kaydedilmedi.`:error.code==='token-type'?`Yalnız ince ayarlı (fine-grained) ve yalnız ${GITHUB_STATE_OWNER}/${GITHUB_STATE_REPOSITORY} deposuna yetkili bir anahtar kabul edilir; anahtar kaydedilmedi.`:error.code==='storage'?'Anahtar bu tarayıcıya kaydedilemedi.':error.code==='rate-limited'?readMessage(error):'GitHub anahtarı doğrulanamadı; anahtar kaydedilmedi.'}));throw error;}
  rejected.current=false;
  setSync(value=>({...value,status:'loading',hasToken:true,writeError:null,tokenRejected:false,message:'Anahtar doğrulandı; bu cihazın kayıtları GitHub’dakiyle karşılaştırılıyor.'}));
  if(!repository.hasCompletedInitialMigration()&&!firstSyncRemote.current)await refresh(true,true);
  else if(loading.current)await refreshing.current;
  await reviewConnection();
 },[refresh,reviewConnection,repository]);
 const clearToken=useCallback(()=>{try{repository.clearToken();repository.clearConnectReview();batcher.current?.cancel();rejected.current=false;setSync(value=>({...value,status:'ready',hasToken:false,writeError:null,tokenRejected:false,message:'Yazma anahtarı bu cihazdan kaldırıldı; GitHub durumu salt okunur.'}));}catch{setSync(value=>({...value,status:'error',message:'Anahtar tarayıcıdan kaldırılamadı.'}));}},[repository]);

 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  const refreshIfDue=()=>{if(document.visibilityState==='visible'&&Date.now()-lastRefresh.current>=SHARED_REFRESH_MS)void refresh(true)};
  // A phone suspends a page as soon as the reader switches away, so the 30 second
  // window would hold a change until the next visit; leaving the page sends it now.
  // keepalive lets the write outlive the page once it has been sent.
  const sendBeforeLeaving=()=>{if(tokenPresent()&&pendingCount())void flushLatest.current({keepalive:true}).catch(()=>undefined)};
  const visibilityChanged=()=>{
   if(document.visibilityState==='hidden')sendBeforeLeaving();
   else if(Date.now()-lastRefresh.current>=RETURN_REFRESH_MS)void refresh(true,true);
  };
  const interval=window.setInterval(refreshIfDue,REFRESH_CHECK_MS);
  document.addEventListener('visibilitychange',visibilityChanged);
  window.addEventListener('pagehide',sendBeforeLeaving);
  return()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('pagehide',sendBeforeLeaving)};
 },[refresh]);
 useEffect(()=>{
  if(!hydrated.current)return;
  try{
   const skip=blocked.current;
   for(const id of bookIds){
    if(skip.books.has(id))continue;
    const payload=publicPayload(id,states,personal),current=signature(payload),previous=known.current.get(id);
    if(previous&&signature(previous)===current)continue;
    if(!previous&&current===emptySignature){known.current.set(id,payload);continue;}
    const patch={};
    // A book never seen before is compared with the empty value, so only fields this device set travel.
    const before=previous??{states:[],reading:null};
    if(signature(before.states||[])!==signature(payload.states))patch.states=payload.states;
    if(signature(before.reading??null)!==signature(payload.reading))patch.reading=payload.reading;
    batcher.current.queueBookState(id,patch,undefined,false);known.current.set(id,payload);
   }
   const queue=queueSignature(personal);
   if(!skip.queue&&queue!==knownQueue.current){batcher.current.queueQueueState(personal.queue,undefined,false);knownQueue.current=queue;}
   const pending=repository.getPendingCount();
   // Returning the same object when nothing changed keeps this effect from
   // re-rendering the app on every pass.
   setSync(value=>{
    if(!pending)return value.pending===0?value:{...value,pending};
    // While the stored key is refused, the reconnect message stays; only the count moves.
    if(value.tokenRejected)return value.pending===pending?value:{...value,pending};
    const message=value.hasToken?(reviewPending()?'Değişiklikler cihazda; bu cihazın kayıtları GitHub’dakiyle karşılaştırıldıktan sonra gönderilecek.':'Değişiklikler cihazda; ilk değişiklikten 30 saniye sonra toplu gönderilecek.'):'Değişiklikler cihazda kuyrukta; GitHub’a göndermek için bu cihazı bağla.';
    return value.status==='queued'&&value.pending===pending&&value.message===message?value:{...value,status:'queued',message,pending};
   });
   if(sync.hasToken&&!sync.tokenRejected&&pending)batcher.current.schedule();else batcher.current.cancel();
  }catch{setSync(value=>({...value,status:'error',message:'Tarayıcının yerel eşitleme alanına yazılamadı.',pending:pendingCount()}));}
 },[bookIds,states,personal,repository,sync.hasToken,sync.tokenRejected]);
 useEffect(()=>()=>batcher.current?.dispose(),[]);
 // reviewPending: this device's unsent edits wait for their comparison; retryAt: GitHub asked to wait until then.
 return {...sync,reviewPending:reviewPending(),retryAt:backoffUntil.current>Date.now()?backoffUntil.current:null,hydrated:hydrated.current,mergePrompt,resolveMerge,load,flush,saveToken,clearToken};
}
