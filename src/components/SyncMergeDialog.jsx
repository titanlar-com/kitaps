import React,{useEffect,useRef,useState} from 'react';
import {Button,Modal,Stack,Text} from '@mantine/core';
import {IconDownload} from '@tabler/icons-react';
import {download} from '../download';
import {readSyncBackup} from '../state/useGitHubStateSync';
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
   // With the book sheet open, focus stays in it rather than behind it.
   const target=document.querySelector('.sync-modal [role="status"]')??document.querySelector('.detail-drawer .sync-status-text')??document.getElementById('main-content');
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
 const parts=asked?[asked.conflicts.length?`${asked.conflicts.length} kitabın kaydı`:'',asked.queueConflict?'okuma sıran':''].filter(Boolean).join(' ve '):'';
 // Connecting from the book sheet can raise it, so it sits above the sheet (layer 200) and the sync dialog (300).
 return <Modal opened={Boolean(prompt)} onClose={()=>undefined} returnFocus={false} zIndex={305} withCloseButton={false} closeOnClickOutside={false} closeOnEscape={false} centered className="sync-merge-dialog" title="Bu cihazdaki kayıtlar farklı">
  {asked&&<Stack gap="md" inert={!prompt||undefined}>
   <Text>{asked.reason==='connect'
    ?`Bu cihaz bağlı değilken ${parts} değişti. Bu arada başka bir cihaz aynı kayıtları farklı kaydetti. Hangisinin kalacağını seç. Seçim yalnız bu kayıtları etkiler. Bu cihazın öteki değişiklikleri seçimden sonra gönderilir.`
    :`Bu cihazda ${parts}, GitHub’daki ortak kayıttan farklı. Hangisinin kalacağını seç. Seçim yalnız bu farklı kayıtları etkiler. Yalnız bu cihazda olan kayıtlar ayrıca ortak kayda eklenir.`}</Text>
   {backup&&<Text c="dimmed">Seçimden önce bu cihazdaki kayıtların yedeği alındı.</Text>}
   <div className="sync-merge-actions">
    <Button loading={busy} onClick={()=>void choose('device')}>Bu cihazdakini kullan</Button>
    <Button loading={busy} variant="default" onClick={()=>void choose('shared')}>GitHub’dakini kullan</Button>
    {backup&&<Button variant="subtle" leftSection={<IconDownload size={18}/>} onClick={()=>download('kitaplik-esitleme-oncesi-yedek.json',backup)}>Yedeği indir</Button>}
   </div>
  </Stack>}
 </Modal>;
}
