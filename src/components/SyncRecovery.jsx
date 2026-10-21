import React,{useEffect,useId,useRef,useState} from 'react';
import {Alert,Button,Group,Text} from '@mantine/core';
import {IconAlertTriangle,IconDownload} from '@tabler/icons-react';

export const RECOVERY_TITLE='Bekleyen değişikliklerin kaydı tam okunamadı';
const RECOVERY_FILE='kitaplik-bekleyen-degisiklikler.json';

/** The page notice's words for what a damaged pending queue left (`sync.recovery`). */
export const recoveryNoticeText=({kept,stored})=>stored
 ?`${kept?'Okunabilen değişiklikler kuyrukta kaldı; kaydın':'Kaydın'} bir kopyası bu tarayıcıda saklanıyor. Kopyayı eşitleme ayrıntılarından indirebilirsin.`
 :'Tarayıcının alanı dolu; kayıt olduğu yerde duruyor ve yeni değişiklikler kuyruğa yazılamıyor. Kaydı eşitleme ayrıntılarından indirebilirsin.';

// The copies leave as a file the reader saves; nothing is sent anywhere. Safari reads a
// blob download after click() returns, so the address stays valid for a minute.
const downloadRecovery=copies=>{
 const url=URL.createObjectURL(new Blob([`${JSON.stringify({version:1,copies},null,2)}\n`],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=RECOVERY_FILE;document.body.append(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
};

/** In the sync details: what a damaged pending queue left, a download of the kept copy
 * and its deletion, which asks first because it cannot be undone. `onRemoved` moves
 * focus once the alert, and the button that had focus, are gone. */
export default function SyncRecoveryAlert({sync,onRemoved}){
 const {kept,stored}=sync.recovery;
 const [confirming,setConfirming]=useState(false);
 const cancel=useRef(null),remove=useRef(null),back=useRef(false);
 const warning=useId();
 useEffect(()=>{
  if(confirming)cancel.current?.focus();
  else if(back.current){back.current=false;remove.current?.focus()}
 },[confirming]);
 const thing=stored?'Kopya':'Kayıt';
 return <Alert mt="md" color="orange" role="note" className="sync-recovery" icon={<IconAlertTriangle size={20}/>} title={RECOVERY_TITLE}>
  <Text>{kept?`Bu cihazda gönderilmeyi bekleyen değişikliklerin kaydı bozulmuş. Okunabilen ${kept} değişiklik kuyrukta kaldı.`:'Bu cihazda gönderilmeyi bekleyen değişikliklerin kaydı bozulmuş; kayıttaki değişikliklerin hiçbiri okunamadı.'} {stored
   ?'Kaydın bulunduğu hâliyle bir kopyası bu tarayıcıda saklanıyor. Kopyayı indirip saklayabilir, gerekmiyorsa silebilirsin.'
   :'Tarayıcının alanı dolu olduğu için kopya ayrıca saklanamadı; kayıt olduğu yerde duruyor ve o silinene ya da yer açılana kadar yeni değişiklikler kuyruğa yazılamaz. Kaydı indirip saklayabilir, sonra silebilirsin.'}</Text>
  {confirming
   ?<div role="group" aria-labelledby={warning}>
     <Text id={warning} mt="sm" fw={600}>{stored?'Kopya bu tarayıcıdan kalıcı olarak silinir.':'Kayıt bu tarayıcıdan kalıcı olarak silinir; okunabilen değişiklikler kuyrukta kalır.'}</Text>
     <Group gap="xs" mt="xs"><Button color="red" onClick={()=>{sync.clearRecovery();setConfirming(false);onRemoved?.()}}>Evet, sil</Button><Button ref={cancel} variant="default" onClick={()=>{back.current=true;setConfirming(false)}}>Vazgeç</Button></Group>
    </div>
   :<Group gap="xs" mt="sm"><Button variant="light" leftSection={<IconDownload size={18}/>} onClick={()=>downloadRecovery(sync.recoveryCopies())}>{thing==='Kopya'?'Kopyayı indir':'Kaydı indir'}</Button><Button ref={remove} variant="subtle" color="red" onClick={()=>setConfirming(true)}>{thing==='Kopya'?'Kopyayı sil':'Kaydı sil'}</Button></Group>}
 </Alert>;
}
