import React,{useEffect,useRef,useState} from 'react';
import {Button,Modal,Stack,Text} from '@mantine/core';
import {IconDownload} from '@tabler/icons-react';
import {download} from '../download';
import {readSyncBackup} from '../state/useGitHubStateSync';
import {syncMergeScreen} from '../screens/sync.js';
import './SyncPanels.css';

/** Shown when this device's records differ from the shared file: on a device's first
 * read ('first-sync'), or when a device that worked unconnected is connected and another
 * device saved the same records meanwhile ('connect'). */
export default function SyncMergeDialog({sync}){
 const [busy,setBusy]=useState(false);
 const prompt=sync.mergePrompt;
 // The choice takes effect at once; the words and the backup stay while the dialog leaves (ADR 004, K6).
 const [shown,setShown]=useState(()=>prompt?{prompt,backup:readSyncBackup()}:null);
 if(prompt&&prompt!==shown?.prompt)setShown({prompt,backup:readSyncBackup()});
 const asked=prompt??shown?.prompt;
 const backup=shown?.backup;
 const latest=useRef(prompt);
 const chose=useRef(false);
 // The dialog disappears with the choice, and the button that had focus with it: focus moves
 // to the connect dialog's status when that is open, otherwise to the main content. It goes as
 // soon as the choice closes the dialog, whatever GitHub still has to answer.
 useEffect(()=>{
  latest.current=prompt;
  if(prompt||!chose.current)return;
  chose.current=false;
  requestAnimationFrame(()=>{
   // A further question (a connect right after a first-sync choice) keeps the focus.
   if(latest.current)return;
   // With the book sheet or another panel open, focus stays in it rather than behind it.
   const panel=[...document.querySelectorAll('[role="dialog"]')].find(dialog=>!dialog.closest('.sync-merge-dialog'));
   const target=document.querySelector('.sync-modal [role="status"]')??document.querySelector('.detail-drawer .sync-status-text')??panel??document.getElementById('main-content');
   if(target instanceof HTMLElement)target.focus({preventScroll:true});
  });
 },[prompt]);
 const choose=async choice=>{
  // A click during the exit finds nothing left to answer.
  if(!latest.current)return;
  chose.current=true;
  setBusy(true);
  try{await sync.resolveMerge(choice)}finally{setBusy(false);chose.current=false}
 };
 const model=syncMergeScreen({asked,hasBackup:Boolean(backup)});
 // Connecting from the book sheet can raise it, so it sits above the sheet (layer 200) and the sync dialog (300).
 return <Modal opened={Boolean(prompt)} onClose={()=>undefined} returnFocus={false} zIndex={305} withCloseButton={false} closeOnClickOutside={false} closeOnEscape={false} centered className="sync-merge-dialog" title={model.title}>
  {asked&&<Stack gap="md" inert={!prompt||undefined}>
   <Text>{model.body}</Text>
   {model.backupNote&&<Text c="dimmed">{model.backupNote}</Text>}
   <div className="sync-merge-actions">
    <Button loading={busy} onClick={()=>void choose('device')}>{model.useDevice}</Button>
    <Button loading={busy} variant="default" onClick={()=>void choose('shared')}>{model.useShared}</Button>
    {model.download&&<Button variant="subtle" leftSection={<IconDownload size={18}/>} onClick={()=>download(model.download.file,backup)}>{model.download.text}</Button>}
   </div>
  </Stack>}
 </Modal>;
}
