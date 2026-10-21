import React,{useState} from 'react';
import {Button,Group,Modal,Stack,Text} from '@mantine/core';
import {IconDownload} from '@tabler/icons-react';
import {download} from '../download';
import {readSyncBackup} from '../state/useGitHubStateSync';

/** Shown when this device's records differ from the shared file: on a device's first
 * read ('first-sync'), or when a device that worked unconnected is connected and another
 * device saved the same records meanwhile ('connect'). */
export default function SyncMergeDialog({sync}){
 const [busy,setBusy]=useState(false);
 const prompt=sync.mergePrompt;
 if(!prompt)return null;
 // The dialog disappears with the choice, and the button that had focus with it: focus moves
 // to the connect dialog's status when that is open, otherwise to the main content.
 const choose=async choice=>{
  setBusy(true);
  try{await sync.resolveMerge(choice)}finally{setBusy(false)}
  requestAnimationFrame(()=>{
   // A further question (a connect right after a first-sync choice) keeps the focus.
   if(document.querySelector('.sync-merge-dialog'))return;
   // With the book sheet open, focus stays in it rather than behind it.
   const target=document.querySelector('.sync-modal [role="status"]')??document.querySelector('.detail-drawer .sync-status-text')??document.getElementById('main-content');
   if(target instanceof HTMLElement)target.focus({preventScroll:true});
  });
 };
 const backup=readSyncBackup();
 const parts=[prompt.conflicts.length?`${prompt.conflicts.length} kitabın kaydı`:'',prompt.queueConflict?'okuma sıran':''].filter(Boolean).join(' ve ');
 // Connecting from the book sheet can raise it, so it sits above the sheet (layer 200) and the sync dialog (300).
 return <Modal opened onClose={()=>undefined} zIndex={305} withCloseButton={false} closeOnClickOutside={false} closeOnEscape={false} centered className="sync-merge-dialog" title="Bu cihazdaki kayıtlar farklı">
  <Stack gap="md">
   <Text>{prompt.reason==='connect'
    ?`Bu cihaz bağlı değilken ${parts} değişti; bu arada başka bir cihaz aynı kayıtları farklı kaydetti. Hangisinin kalacağını seç. Seçim yalnız bu kayıtları etkiler; bu cihazın öteki değişiklikleri seçimden sonra gönderilir.`
    :`Bu cihazda ${parts}, GitHub’daki ortak kayıttan farklı. Hangisinin kalacağını seç; seçim yalnız bu farklı kayıtları etkiler. Yalnız bu cihazda olan kayıtlar ayrıca ortak kayda eklenir.`}</Text>
   {backup&&<Text c="dimmed">Seçimden önce bu cihazdaki kayıtların yedeği alındı.</Text>}
   <Group>
    <Button loading={busy} onClick={()=>void choose('device')}>Bu cihazdakini kullan</Button>
    <Button loading={busy} variant="default" onClick={()=>void choose('shared')}>GitHub’dakini kullan</Button>
    {backup&&<Button variant="subtle" leftSection={<IconDownload size={18}/>} onClick={()=>download('kitaplik-esitleme-oncesi-yedek.json',backup)}>Yedeği indir</Button>}
   </Group>
  </Stack>
 </Modal>;
}
