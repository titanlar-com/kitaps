import {GitHubStateBatcher,isPermanentSyncError} from '../../state/GitHubStateBatcher.ts';
import {GitHubStateRepositoryError} from '../../state/GitHubStateRepository.ts';
import {planConnect,planFirstSync,projectPublicState} from '../../state/syncModel.ts';
import {GITHUB_STATE_BACKUP_KEY,GITHUB_STATE_OWNER,GITHUB_STATE_REPOSITORY} from '../../state/types.ts';

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
// What an edit was made on: the fields it carries, as the view showed them before it.
const baseOf=(view,patch)=>Object.fromEntries(Object.keys(patch).map(field=>[field,field==='states'?[...(view?.states||[])]:view?.reading??null]));
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
export const RETURN_REFRESH_MS=30_000;

const clock=ms=>new Date(ms).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
const readMessage=error=>error?.code==='storage'?'Tarayıcının yerel eşitleme alanı okunamadı ya da dolu; GitHub’dan okunan durum gösterilemedi.':error?.code==='rate-limited'?`GitHub istek sınırına ulaşıldı; ${clock(error.retryAt)} sonrasında yeniden denenecek.`:error?.code==='not-found'?'Durum deposu henüz hazırlanmadı.':error?.code==='invalid-data'?'GitHub durum dosyası güvenli biçimde okunamadı.':'GitHub durumu okunamadı.';
const REVIEW_FAILED='Bu cihazın kayıtları GitHub’dakiyle karşılaştırılamadı; sayfaya dönünce yeniden denenecek. O zamana kadar hiçbir şey gönderilmez.';
const writeMessage=error=>error?.code==='unauthorized'?'GitHub anahtarı reddetti: süresi dolmuş ya da kitaps-state için yazma izni kaldırılmış olabilir. Anahtarı kaldırıp yeni bir anahtarla bu cihazı yeniden bağla.':error?.code==='storage'?'Tarayıcının yerel eşitleme alanına yazılamadı.':error?.code==='rate-limited'?`GitHub istek sınırına ulaşıldı; değişiklikler kuyrukta, ${clock(error.retryAt)} sonrasında gönderilecek.`:error?.code==='not-found'?'Durum deposu ya da dosyası bulunamadı; değişiklikler cihazda bekliyor.':error?.code==='invalid-data'?'GitHub durum dosyası güvenli biçimde okunamadı; değişiklikler cihazda bekliyor.':'Eşitleme tamamlanamadı; değişiklikler cihazda kuyrukta ve otomatik olarak yeniden denenecek.';

/**
 * The order of operations of cross-device sync (ADR 003, phase 8), moved from the React hook
 * without changing it. Everything outside the core arrives through a port:
 *
 * - `source`: the reader's data. `getSnapshot()` gives `{states, personal}`, `subscribe` reports a
 *   local change, and `applyRemote(update)` takes over what was read in one step.
 * - `repository`: a GitHubStateRepository (state.json and the device's unsent edits).
 * - `lifecycle`: `visibility()`, `onVisibilityChange(listener)`, `onPageHide(listener)`.
 * - `timers`: `setInterval`, `clearInterval`, `setTimeout`, `clearTimeout`.
 * - `storage`: a KeyValueStore for the copy taken before a first sync decision.
 * - `now`: the time in milliseconds.
 *
 * The snapshot holds what the reader is told and never the key.
 */
export function createSyncController({bookIds,source,repository,lifecycle,timers,storage,now}){
 const known=new Map();
 let knownQueue=null;
 let hydrated=false;
 let loading=false;
 let lastRefresh=0;
 let backoffUntil=0;
 // GitHub refused the stored key on the last read: nothing is written until a read with
 // the key succeeds again or the reader connects a new one.
 let rejected=false;
 let blocked=noSkip();
 let firstSyncRemote=null;
 let refreshing=null;
 // Why the merge dialog is open: 'first-sync' (a device's first read) or 'connect'.
 let mergeReason=null;
 let reviewing=null;
 let flushing=null,flushAgain=false;
 let batcher=null;
 let mergePrompt=null;
 let comparison=false;
 const pendingCount=()=>{try{return repository.getPendingCount()}catch{return 0}};
 const tokenPresent=()=>{try{return repository.hasToken()}catch{return false}};
 // writeError: why GitHub refused this device's last write; cleared by the next successful one.
 // lastSentAt and lastReadAt: this visit's last successful write and read; readSource: 'api' or
 // the CDN copy ('cdn'), which can lag; tokenRejected: GitHub refused the stored key on a read.
 let sync={status:'loading',message:'GitHub durumu okunuyor.',pending:pendingCount(),hasToken:tokenPresent(),writeError:null,lastSentAt:null,lastReadAt:null,readSource:null,tokenRejected:false};
 const listeners=new Set();
 const notify=()=>{for(const listener of [...listeners])if(listeners.has(listener))listener();};
 const setSync=change=>{
  const next=change(sync);
  if(next===sync)return;
  const keyChanged=next.hasToken!==sync.hasToken||next.tokenRejected!==sync.tokenRejected;
  sync=next;
  if(keyChanged)comparePending();
  notify();
 };
 const setMergePrompt=prompt=>{mergePrompt=prompt;notify();};

 const applyDocument=(document,baseline,baselineQueue,skip=noSkip())=>{
  const projected=projectPublicState(document,bookIds),records=new Map(Object.entries(projected.records));
  // A field the reader changed while this read ran keeps its own value on screen, so what this
  // device last showed of it stays known: the edit is based on that, not on a shared value the
  // reader never saw (review of 7 November 2026).
  const shown=source.getSnapshot();
  for(const [id,normalized] of records){
   if(skip.books.has(id))continue;
   const earlier=known.get(id)??baseline?.get(id);
   const keepStates=baseline&&signature(baseline.get(id)?.states||[])!==signature(shown.states[id]||[]);
   const keepReading=baseline&&signature(baseline.get(id)?.reading??null)!==signature(readingPayload(shown.personal,id));
   known.set(id,{...normalized,...(keepStates?{states:earlier?.states??[]}:{}),...(keepReading?{reading:earlier?.reading??null}:{})});
  }
  const keepQueue=baselineQueue!==undefined&&baselineQueue!==queueSignature(shown.personal);
  if(!skip.queue&&!keepQueue)knownQueue=signature(projected.queue);
  else if(!skip.queue&&knownQueue===null)knownQueue=baselineQueue;
  const nextStates=previous=>{
   const next={...previous};
   for(const [id,value] of records){
    if(skip.books.has(id))continue;
    const changedDuringRequest=baseline&&signature(baseline.get(id)?.states||[])!==signature(previous[id]||[]);
    if(changedDuringRequest)continue;
    if(value.states.length)next[id]=value.states;else delete next[id];
   }
   return next;
  };
  const nextPersonal=previous=>{
   const nextReading={...previous.reading};
   for(const [id,value] of records){
    if(skip.books.has(id))continue;
    const changedDuringRequest=baseline&&signature(baseline.get(id)?.reading??null)!==signature(readingPayload(previous,id));
    if(changedDuringRequest)continue;
    if(value.reading)nextReading[id]=value.reading;else delete nextReading[id];
   }
   const keepLocalQueue=skip.queue||(baselineQueue!==undefined&&baselineQueue!==queueSignature(previous));
   return {...previous,reading:nextReading,queue:keepLocalQueue?previous.queue:projected.queue};
  };
  // One step for the whole read (ADR 003, K7): what arrives from GitHub is never taken for an edit.
  source.applyRemote(current=>({states:nextStates(current.states),personal:nextPersonal(current.personal)}));
  comparePending();
  return shown;
 };

 const reviewPending=()=>{try{return repository.hasConnectReviewPending()}catch{return false}};
 // A pending queue that could not be read in full was kept aside; the reader decides what happens to the copy.
 const recovery=()=>{try{return repository.recoveryStatus()}catch{return null}};
 const recoveryCopies=()=>{try{return repository.pendingRecovery()}catch{return []}};
 const clearRecovery=()=>{try{repository.clearPendingRecovery()}catch{/* The copy stays; so does the warning. */}setSync(value=>({...value}))};
 const backupBeforeChoice=(view=source.getSnapshot())=>{try{storage.write(GITHUB_STATE_BACKUP_KEY,JSON.stringify({version:1,createdAt:new Date(now()).toISOString(),states:view.states,...view.personal,pending:repository.pendingMutations()}))}catch{/* The dialog still offers both choices. */}};

 const refresh=(silent=false,fresh=false)=>{
  // A second caller (a connect, say) waits for the read under way instead of skipping it.
  if(loading)return refreshing;
  if(now()<backoffUntil)return Promise.resolve();
  loading=true;
  const run=(async()=>{
   const baseline=modelSnapshot(bookIds,source.getSnapshot().states,source.getSnapshot().personal),baselineQueue=queueSignature(source.getSnapshot().personal);
   // A read that started without the key may be the CDN copy, up to five minutes old.
   const authenticated=repository.hasToken();
   if(!silent)setSync(value=>({...value,status:'loading',message:'GitHub durumu okunuyor.'}));
   try{
    const {document:remoteDocument,info:read}=await repository.loadRead({fresh});
    lastRefresh=now();
    let skip=blocked;
    if(!repository.hasCompletedInitialMigration()&&!firstSyncRemote){
     // A device that has never synced adds what only it knows. Where both sides
     // disagree, nothing is overwritten until the reader decides.
     const shared=projectPublicState(remoteDocument,bookIds);
     const plan=planFirstSync(baseline,source.getSnapshot().personal.queue,shared);
     for(const id of plan.localOnly){const fields=setFields(baseline.get(id));repository.queueBookState(id,fields,undefined,baseOf(shared.records[id],fields));}
     if(plan.queue==='local-only')repository.queueQueueState(source.getSnapshot().personal.queue,undefined,shared.queue);
     // These were compared with the file as it is now; a later connect asks only about what changes after.
     repository.recordBases(remoteDocument,{skipBooks:plan.conflicts,skipQueue:plan.queue==='conflict',forceBooks:plan.localOnly,forceQueue:plan.queue==='local-only'});
     if(plan.conflicts.length||plan.queue==='conflict'){
      backupBeforeChoice();
      skip={books:new Set(plan.conflicts),queue:plan.queue==='conflict'};
      blocked=skip;firstSyncRemote=remoteDocument;mergeReason='first-sync';
      setMergePrompt({conflicts:plan.conflicts,queueConflict:plan.queue==='conflict',reason:'first-sync'});
     }else repository.markInitialMigrationComplete();
    }
    const document=await repository.loadWithPending(remoteDocument);
    const shown=applyDocument(document,baseline,baselineQueue,skip);hydrated=true;
    // A book edited while this read was under way keeps its old base: its edit is not yet queued.
    // Judged on what was on the page as the read landed, or every book it changed would look edited.
    const showing=modelSnapshot(bookIds,shown.states,shown.personal);
    const editing=[...showing].filter(([id,view])=>signature(view)!==signature(baseline.get(id))).map(([id])=>id);
    repository.recordBases(remoteDocument,{skipBooks:[...skip.books,...editing],skipQueue:skip.queue||queueSignature(shown.personal)!==baselineQueue});
    // A connected device that has not yet compared its unsent edits does so now,
    // also after a reload or a failed first attempt. Only a read made with the key
    // is fresh enough to compare against; otherwise the comparison reads again.
    // A key removed or replaced while this read ran is not judged by it.
    const readState={lastReadAt:read.at,readSource:read.source,tokenRejected:read.tokenRejected&&repository.hasToken()};
    // A read GitHub answered without the stored key (it refused it) is no fresh comparison.
    setSync(value=>({...value,lastReadAt:readState.lastReadAt,readSource:readState.readSource}));
    if(reviewPending()&&repository.hasToken()&&!firstSyncRemote&&!readState.tokenRejected){await reviewConnection(authenticated&&read.authenticated?remoteDocument:undefined,shown);return;}
    const pending=repository.getPendingCount();
    // A read with the key that GitHub accepts again clears the refusal it had reported.
    const wasRejected=rejected;
    rejected=readState.tokenRejected;
    if(readState.tokenRejected){
     // Writes stop and the queue stays until the reader connects a new key; reads go on.
     batcher?.cancel();
     const message=writeMessage({code:'unauthorized'});
     setSync(value=>({...value,...readState,status:'error',message,writeError:message,pending}));
     return;
    }
    if(repository.hasToken()&&pending)batcher?.schedule();
    const readOnly=read.source==='cdn'?'GitHub durumu okundu. Bağlı olmayan cihaz GitHub’ın önbellek kopyasını okur; bu kopya en çok beş dakika gecikebilir.':'GitHub durumu salt okunur olarak güncel.';
    setSync(value=>({...value,...readState,...(wasRejected?{writeError:null}:{}),status:pending?'queued':'ready',message:pending?(value.hasToken?'Değişiklikler cihazda; ilk değişiklikten 30 saniye sonra toplu gönderilecek.':'Değişiklikler cihazda kuyrukta; GitHub’a göndermek için bu cihazı bağla.'):(value.hasToken?'GitHub durumu güncel.':readOnly),pending}));
   }catch(error){
    if(error.code==='rate-limited')backoffUntil=error.retryAt;
    if(!hydrated)for(const [id,value] of baseline)known.set(id,value);
    if(knownQueue===null)knownQueue=baselineQueue;
    hydrated=true;
    // While a connect still waits for its comparison, the notice says why nothing is sent.
    const waiting=reviewPending()&&repository.hasToken()?REVIEW_FAILED:null;
    setSync(value=>({...value,status:'error',message:waiting??readMessage(error),writeError:waiting??value.writeError,pending:pendingCount()}));
   }finally{loading=false;}
  })();
  refreshing=run;
  return run;
 };
 // Opening the page and the reader's own refresh ask for a fresh copy.
 const load=()=>refresh(false,true);

 // A newly connected device compares its unsent edits with the shared file before it
 // sends anything. Where another device saved a different value meanwhile, the reader
 // decides through the merge dialog (after a backup); everything else is sent at once.
 // `shownAtRead`: what the page held when the read being compared was taken over. That read has
 // already changed the data, and the copy kept for the reader must be of what they had.
 const reviewConnection=(remoteDocument,shownAtRead)=>{
  if(reviewing)return reviewing;
  const run=(async()=>{
  if(firstSyncRemote||!reviewPending())return;
  const shownNow=()=>remoteDocument&&shownAtRead?shownAtRead:source.getSnapshot();
  const baseline=modelSnapshot(bookIds,shownNow().states,shownNow().personal),baselineQueue=queueSignature(shownNow().personal);
  let remote=remoteDocument;
  if(!remote){
   // The comparison needs the file as the key reads it: a refused key keeps the marker
   // (nothing is sent) and asks to reconnect instead of comparing with an anonymous copy.
   try{
    const {document,info}=await repository.loadRead({fresh:true,requireToken:true});
    remote=document;lastRefresh=now();
    setSync(value=>({...value,lastReadAt:info.at,readSource:info.source}));
   }
   catch(error){
    const refused=error?.status===401;
    if(refused){rejected=true;batcher?.cancel();}
    const message=refused?writeMessage(error):REVIEW_FAILED;
    setSync(value=>({...value,status:'error',message,writeError:message,tokenRejected:refused||value.tokenRejected,pending:pendingCount()}));
    return;
   }
  }
  // The key may have been removed, or another review may have finished, while this one read.
  if(firstSyncRemote||!reviewPending()||!repository.hasToken())return;
  const catalogIds=new Set(bookIds);
  const plan=planConnect(repository.pendingMutations().filter(item=>item.kind==='queue'||catalogIds.has(item.bookId)),remote,repository.readBases());
  if(plan.conflicts.length||plan.queueConflict){
   backupBeforeChoice(shownNow());
   blocked={books:new Set(plan.conflicts),queue:plan.queueConflict};firstSyncRemote=remote;mergeReason='connect';
   applyDocument(await repository.loadWithPending(remote),baseline,baselineQueue,blocked);
   setMergePrompt({conflicts:plan.conflicts,queueConflict:plan.queueConflict,reason:'connect'});
   rejected=false;
   setSync(value=>({...value,status:'queued',writeError:null,tokenRejected:false,pending:pendingCount(),message:'Bu cihazdaki bazı kayıtları başka bir cihaz farklı kaydetmiş; seçimini yapınca gönderilecek.'}));
   return;
  }
  repository.clearConnectReview();
  const pending=repository.getPendingCount();
  if(pending){
   rejected=false;
   setSync(value=>({...value,status:'saving',writeError:null,tokenRejected:false,pending,message:`Bu cihazda bekleyen ${pending} değişiklik şimdi gönderiliyor.`}));
   await flush().catch(()=>undefined);
   return;
  }
  applyDocument(await repository.loadWithPending(remote),baseline,baselineQueue,blocked);
  rejected=false;
  setSync(value=>({...value,status:'ready',writeError:null,tokenRejected:false,pending:0,message:'Bu cihaz bağlandı; değişiklikleri artık GitHub’a gönderilecek.'}));
  })();
  reviewing=run;
  const settle=()=>{if(reviewing===run)reviewing=null};
  run.then(settle,settle);
  return run;
 };

 const resolveMerge=async choice=>{
  const remote=firstSyncRemote;if(!remote)return;
  const decision=blocked,reason=mergeReason;
  if(choice==='device'){
   if(reason==='connect'){
    // Exactly the fields this device changed win; fields it never touched keep the shared value.
    repository.requeuePendingFor(decision.books,decision.queue,remote);
   }else{
    // Based on the file the reader decided against: only what another device saves after
    // the decision is merged with these values.
    const snapshot=modelSnapshot(bookIds,source.getSnapshot().states,source.getSnapshot().personal),shared=projectPublicState(remote,bookIds);
    for(const id of decision.books){const view=snapshot.get(id);if(view&&(view.states.length||view.reading)){const fields=setFields(view);repository.queueBookState(id,fields,undefined,baseOf(shared.records[id],fields));}}
    if(decision.queue)repository.queueQueueState(source.getSnapshot().personal.queue,undefined,shared.queue);
   }
  }
  blocked=noSkip();firstSyncRemote=null;mergeReason=null;repository.markInitialMigrationComplete();setMergePrompt(null);
  if(choice!=='device')repository.discardPendingFor(decision.books,decision.queue);
  applyDocument(await repository.loadWithPending(remote));
  // The decided books were compared with this file; a later connect asks only about what changes after.
  repository.recordBases(remote,{forceBooks:decision.books,forceQueue:decision.queue});
  if(reason==='connect')repository.clearConnectReview();
  // A first-sync choice made while connecting: the rest of this device's edits are compared next.
  else if(reviewPending()&&repository.hasToken()){await reviewConnection();return;}
  const pending=repository.getPendingCount();
  if(repository.hasToken()&&pending){
   // The reader has just decided, so the result is sent now rather than after the window.
   setSync(value=>({...value,status:'saving',pending,message:'Seçimin kaydedildi; değişiklikler şimdi gönderiliyor.'}));
   void flush().catch(()=>undefined);
   return;
  }
  setSync(value=>({...value,status:pending?'queued':'ready',pending,message:pending?'Seçimin kaydedildi; değişiklikler bu cihaz bağlanınca gönderilecek.':'Seçimin kaydedildi.'}));
 };

 const flush=({fromBatcher=false,keepalive=false}={})=>{
  // While the reader chooses between this device and the shared file, or a newly
  // connected device has not yet compared its edits, nothing is sent: a write now
  // could send a value that the choice can no longer undo.
  if(firstSyncRemote||reviewPending())return Promise.resolve(undefined);
  // Leaving the page, the batcher and "Şimdi gönder" can ask at once; one write serves
  // them all, and a change made while it ran gets one more write right after it.
  if(flushing){flushAgain=true;return flushing;}
  // Nothing to send: "Şimdi gönder" reads the shared file again instead of claiming a send.
  if(!pendingCount())return fromBatcher||keepalive?Promise.resolve(undefined):refresh(false,true).then(()=>undefined);
  // A refused key writes nothing. The batcher stops; leaving the page sends nothing; the
  // reader's own "Şimdi gönder" checks the key again with a fresh read, which resumes the
  // writes if GitHub accepts it now (an organisation approved it, say).
  if(rejected){
   if(fromBatcher)return Promise.reject(new GitHubStateRepositoryError('unauthorized','GitHub refused the stored key.',401));
   return keepalive?Promise.resolve(undefined):refresh(false,true).then(()=>undefined);
  }
  // GitHub asked this device to wait: no path (the timer, "Şimdi gönder", leaving the
  // page) sends before then. The batcher is told when; the others leave the queue to it.
  if(now()<backoffUntil){
   const waiting=new GitHubStateRepositoryError('rate-limited','GitHub rate limit reached.',429,{retryAt:backoffUntil});
   if(!fromBatcher&&tokenPresent()&&pendingCount())batcher?.schedule();
   setSync(value=>({...value,status:'queued',message:writeMessage(waiting),pending:pendingCount()}));
   return fromBatcher?Promise.reject(waiting):Promise.resolve(undefined);
  }
  const run=(async()=>{
   batcher?.cancel();
   const baseline=modelSnapshot(bookIds,source.getSnapshot().states,source.getSnapshot().personal),baselineQueue=queueSignature(source.getSnapshot().personal);
   setSync(value=>({...value,status:'saving',message:'Değişiklikler GitHub’a yazılıyor.'}));
   try{
    const document=await repository.flushPending({keepalive});applyDocument(document,baseline,baselineQueue,blocked);
    repository.recordBases(document,{skipBooks:blocked.books,skipQueue:blocked.queue});
    lastRefresh=now();
    rejected=false;
    setSync(value=>({...value,status:'ready',message:'GitHub ile eşitlendi.',writeError:null,tokenRejected:false,lastSentAt:now(),pending:repository.getPendingCount()}));return document;
   }catch(error){
    if(error.code==='rate-limited')backoffUntil=error.retryAt;
    // A refused key or a broken file waits for the reader; anything else is retried.
    if(!fromBatcher&&repository.hasToken()&&pendingCount()&&!isPermanentSyncError(error))batcher?.schedule();
    const message=writeMessage(error);
    setSync(value=>({...value,status:'error',message,writeError:message,pending:pendingCount()}));
    throw error;
   }
  })();
  flushing=run;
  const settle=succeeded=>{
   if(flushing!==run)return;
   flushing=null;
   const again=flushAgain;flushAgain=false;
   // Not after a failure: the batcher's retries and GitHub's requested wait apply then.
   if(again&&succeeded&&now()>=backoffUntil&&tokenPresent()&&pendingCount())void flush({keepalive}).catch(()=>undefined);
  };
  run.then(()=>settle(true),()=>settle(false));
  return run;
 };

 const saveToken=async token=>{
  setSync(value=>({...value,status:'loading',message:'GitHub anahtarı doğrulanıyor.'}));
  try{
   await repository.validateToken(token);
   // The review marker goes down before the key: from here on nothing is sent until the
   // comparison has run, whatever asks to send (the batcher, leaving the page, a reload).
   repository.beginConnectReview();
   try{repository.setToken(token)}catch(error){try{repository.clearConnectReview()}catch{/* Nothing more to undo. */}throw error;}
  }catch(error){setSync(value=>({...value,status:'error',hasToken:tokenPresent(),message:error.code==='read-only'?`Bu anahtar ${GITHUB_STATE_REPOSITORY} deposuna yazamıyor. Anahtarın sahibi (Resource owner) ${GITHUB_STATE_OWNER} olmalı, Repository access bölümünde ${GITHUB_STATE_REPOSITORY} seçili ve Contents izni Read and write olmalı; kuruluş onayı bekleyen anahtar da yazamaz. Anahtar kaydedilmedi.`:error.code==='token-type'?`Yalnız ince ayarlı (fine-grained) ve yalnız ${GITHUB_STATE_OWNER}/${GITHUB_STATE_REPOSITORY} deposuna yetkili bir anahtar kabul edilir; anahtar kaydedilmedi.`:error.code==='storage'?'Anahtar bu tarayıcıya kaydedilemedi.':error.code==='rate-limited'?readMessage(error):'GitHub anahtarı doğrulanamadı; anahtar kaydedilmedi.'}));throw error;}
  rejected=false;
  setSync(value=>({...value,status:'loading',hasToken:true,writeError:null,tokenRejected:false,message:'Anahtar doğrulandı; bu cihazın kayıtları GitHub’dakiyle karşılaştırılıyor.'}));
  if(!repository.hasCompletedInitialMigration()&&!firstSyncRemote)await refresh(true,true);
  else if(loading)await refreshing;
  await reviewConnection();
 };
 const clearToken=()=>{try{repository.clearToken();repository.clearConnectReview();batcher?.cancel();rejected=false;setSync(value=>({...value,status:'ready',hasToken:false,writeError:null,tokenRejected:false,message:'Yazma anahtarı bu cihazdan kaldırıldı; GitHub durumu salt okunur.'}));}catch{setSync(value=>({...value,status:'error',message:'Anahtar tarayıcıdan kaldırılamadı.'}));}};

 batcher=new GitHubStateBatcher(repository,()=>flush({fromBatcher:true}),{now,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout});

 // Finds what the reader changed since the last look, and queues it.
 const compare=()=>{
  if(!hydrated)return;
  const {states,personal}=source.getSnapshot();
  try{
   const skip=blocked;
   for(const id of bookIds){
    if(skip.books.has(id))continue;
    const payload=publicPayload(id,states,personal),current=signature(payload),previous=known.get(id);
    if(previous&&signature(previous)===current)continue;
    if(!previous&&current===emptySignature){known.set(id,payload);continue;}
    const patch={};
    // A book never seen before is compared with the empty value, so only fields this device set travel.
    const before=previous??{states:[],reading:null};
    if(signature(before.states||[])!==signature(payload.states))patch.states=payload.states;
    if(signature(before.reading??null)!==signature(payload.reading))patch.reading=payload.reading;
    // The edit is based on what this device showed before it, so it can be merged with
    // what another device saved meanwhile rather than replace it.
    batcher.queueBookState(id,patch,undefined,false,baseOf(before,patch));known.set(id,payload);
   }
   const queue=queueSignature(personal);
   if(!skip.queue&&queue!==knownQueue){batcher.queueQueueState(personal.queue,undefined,false,knownQueue===null?[]:JSON.parse(knownQueue));knownQueue=queue;}
   const pending=repository.getPendingCount();
   // Returning the same object when nothing changed keeps listeners from being told for nothing.
   setSync(value=>{
    if(!pending)return value.pending===0?value:{...value,pending};
    // While the stored key is refused, the reconnect message stays; only the count moves.
    if(value.tokenRejected)return value.pending===pending?value:{...value,pending};
    const message=value.hasToken?(reviewPending()?'Değişiklikler cihazda; bu cihazın kayıtları GitHub’dakiyle karşılaştırıldıktan sonra gönderilecek.':'Değişiklikler cihazda; ilk değişiklikten 30 saniye sonra toplu gönderilecek.'):'Değişiklikler cihazda kuyrukta; GitHub’a göndermek için bu cihazı bağla.';
    return value.status==='queued'&&value.pending===pending&&value.message===message?value:{...value,status:'queued',message,pending};
   });
   if(sync.hasToken&&!sync.tokenRejected&&pending)batcher.schedule();else batcher.cancel();
  }catch{setSync(value=>({...value,status:'error',message:'Tarayıcının yerel eşitleme alanına yazılamadı.',pending:pendingCount()}));}
 };
 // After the step under way has finished: its bases and messages come first, as they always did.
 function comparePending(){
  if(comparison)return;
  comparison=true;
  void Promise.resolve().then(()=>{comparison=false;if(running)compare();});
 }

 let running=false,stopWatching=()=>undefined;
 const start=()=>{
  if(running)return;
  running=true;
  void load();
  const refreshIfDue=()=>{if(lifecycle.visibility()==='visible'&&now()-lastRefresh>=SHARED_REFRESH_MS)void refresh(true)};
  // A phone suspends a page as soon as the reader switches away, so the 30 second
  // window would hold a change until the next visit; leaving the page sends it now.
  // keepalive lets the write outlive the page once it has been sent.
  const sendBeforeLeaving=()=>{if(tokenPresent()&&pendingCount())void flush({keepalive:true}).catch(()=>undefined)};
  const visibilityChanged=()=>{
   if(lifecycle.visibility()==='hidden')sendBeforeLeaving();
   else if(now()-lastRefresh>=RETURN_REFRESH_MS)void refresh(true,true);
  };
  const interval=timers.setInterval(refreshIfDue,REFRESH_CHECK_MS);
  const stopVisibility=lifecycle.onVisibilityChange(visibilityChanged);
  const stopHide=lifecycle.onPageHide(sendBeforeLeaving);
  // `known` moves before a read is taken over, so comparing then finds nothing to send.
  const stopSource=source.subscribe(compare);
  stopWatching=()=>{timers.clearInterval(interval);stopVisibility();stopHide();stopSource();};
 };
 const stop=()=>{
  if(!running)return;
  running=false;
  stopWatching();
  batcher.dispose();
 };

 // reviewPending: this device's unsent edits wait for their comparison; recovery: what a damaged
 // pending queue left ({copies, kept, stored}) or null; retryAt: GitHub asked to wait until then.
 // These are read when asked for, so the snapshot only changes when one of them does.
 const compose=()=>({...sync,reviewPending:reviewPending(),recovery:recovery(),retryAt:backoffUntil>now()?backoffUntil:null,hydrated,mergePrompt});
 let snapshot=compose();
 const sameSnapshot=(left,right)=>Object.keys(right).every(key=>key==='recovery'?signature(left[key])===signature(right[key]):Object.is(left[key],right[key]));
 const getSnapshot=()=>{const next=compose();if(!sameSnapshot(snapshot,next))snapshot=next;return snapshot;};
 const subscribe=listener=>{listeners.add(listener);return()=>{listeners.delete(listener)};};
 const commands=Object.freeze({load,flush,saveToken,clearToken,resolveMerge,recoveryCopies,clearRecovery});
 return {getSnapshot,subscribe,commands,start,stop,dispose:stop};
}
