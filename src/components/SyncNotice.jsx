import React,{useEffect,useState} from 'react';
import {Alert,Button,Group,Text} from '@mantine/core';
import {IconAlertTriangle,IconCloudOff} from '@tabler/icons-react';
import {RECOVERY_TITLE,recoveryNoticeText} from './SyncRecovery';

const DISMISS_KEY='kitapatlasi:sync-notice:dismissed:v1';
const readDismissed=()=>{try{return JSON.parse(sessionStorage.getItem(DISMISS_KEY)||'null')}catch{return null}};
const writeDismissed=value=>{try{if(value)sessionStorage.setItem(DISMISS_KEY,JSON.stringify(value));else sessionStorage.removeItem(DISMISS_KEY)}catch{/* Kept for this view only. */}};
const TITLES={local:'Bu cihazdaki işaretler yalnız burada',failed:'Değişiklikler GitHub’a gönderilemedi',recovery:RECOVERY_TITLE};

/** Which warning this device needs: its changes cannot leave it ('local'), GitHub
 * refused its last write ('failed'), or a damaged pending queue was kept aside
 * ('recovery', which the sync details also show). Nothing when changes can flow. */
export function syncNoticeKind(sync){
 if(sync.pending&&!sync.hasToken)return 'local';
 if(sync.pending&&sync.writeError)return 'failed';
 return sync.recovery?'recovery':null;
}

/** Says where the reader works that this device's marks are not reaching the
 * other devices. Hidden for the rest of the visit once dismissed, until more
 * changes wait, the reason changes, or the problem clears and comes back. */
export default function SyncNotice({sync,onOpen}){
 const [dismissed,setDismissed]=useState(readDismissed);
 const kind=syncNoticeKind(sync);
 useEffect(()=>{if(!kind&&dismissed){setDismissed(null);writeDismissed(null)}},[kind,dismissed]);
 // A dismissal holds until more changes wait, or for the recovery notice, more copies are kept.
 const count=kind==='recovery'?sync.recovery.copies:sync.pending;
 const shown=Boolean(kind)&&!(dismissed?.kind===kind&&count<=dismissed.count);
 const dismiss=()=>{
  const value={kind,count};setDismissed(value);writeDismissed(value);
  // The notice and the button that had focus disappear; the main content takes it.
  document.getElementById('main-content')?.focus({preventScroll:true});
 };
 const local=kind==='local';
 // A live region that is always present announces the notice when it appears;
 // the notice itself is not live, so its buttons are not read out as a message.
 return <>
  <div className="visually-hidden" role="status" aria-live="polite">{shown?TITLES[kind]:''}</div>
  {shown&&<Alert className="sync-notice" color="orange" role="note" mb="lg" icon={local?<IconCloudOff size={22}/>:<IconAlertTriangle size={22}/>} title={TITLES[kind]}>
   <Text>{local
    ?`${sync.pending} değişiklik bu cihazda bekliyor. Bu cihaz bağlanana kadar bu işaretler diğer cihazlarda görünmez; bağladığında hepsi hemen gönderilir.`
    :kind==='recovery'?recoveryNoticeText(sync.recovery)
     :`${sync.writeError} ${sync.pending} değişiklik bu cihazda bekliyor.`}</Text>
   <Group gap="xs" mt="sm"><Button onClick={onOpen}>{local?'Bu cihazı bağla':'Eşitleme ayrıntıları'}</Button><Button variant="subtle" onClick={dismiss}>Şimdilik gizle</Button></Group>
  </Alert>}
 </>;
}
