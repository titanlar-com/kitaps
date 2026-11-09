import React,{useEffect,useId,useRef,useState} from 'react';
import {Alert,Button,Group,Text} from '@mantine/core';
import {IconAlertTriangle,IconDownload} from '@tabler/icons-react';
import {syncRecoveryScreen} from '../screens/sync.js';
import './SyncPanels.css';

// The copies leave as a file the reader saves; nothing is sent anywhere. Safari reads a
// blob download after click() returns, so the address stays valid for a minute.
const downloadRecovery=(copies,file)=>{
 const url=URL.createObjectURL(new Blob([`${JSON.stringify({version:1,copies},null,2)}\n`],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=file;document.body.append(link);link.click();link.remove();
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
 const model=syncRecoveryScreen({kept,stored});
 return <Alert mt="md" data-tone="warning" role="note" className="sync-recovery sync-alert" icon={<IconAlertTriangle size={20}/>} title={model.title}>
  <Text>{model.body}</Text>
  {confirming
   ?<div role="group" aria-labelledby={warning}>
     <Text id={warning} mt="sm" fw={600}>{model.confirm}</Text>
     <Group gap="xs" mt="xs"><Button className="sync-danger-solid" onClick={()=>{sync.clearRecovery();setConfirming(false);onRemoved?.()}}>{model.yes}</Button><Button ref={cancel} variant="default" onClick={()=>{back.current=true;setConfirming(false)}}>{model.no}</Button></Group>
    </div>
   :<Group gap="xs" mt="sm"><Button variant="light" leftSection={<IconDownload size={18}/>} onClick={()=>downloadRecovery(sync.recoveryCopies(),model.file)}>{model.download}</Button><Button ref={remove} variant="subtle" className="sync-danger" onClick={()=>setConfirming(true)}>{model.remove}</Button></Group>}
 </Alert>;
}
