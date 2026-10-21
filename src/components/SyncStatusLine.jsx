import React from 'react';
import {Button,Text} from '@mantine/core';
import {IconAlertTriangle,IconCloudCheck,IconCloudOff,IconCloudUpload} from '@tabler/icons-react';

const clock=ms=>new Date(ms).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});

/** Where this device's marks stand, said beside the buttons that make them:
 * 'local' (they cannot leave this device), 'failed' (GitHub refused them or the
 * key), 'saving', 'queued' (they leave soon) or 'sent'. Nothing before the first
 * change of a visit on a device that only reads. It speaks for the whole device,
 * not for one book: a single write carries every waiting change. */
export function syncStatusKind(sync){
 if(sync.pending&&!sync.hasToken)return 'local';
 if(sync.writeError&&(sync.pending||sync.tokenRejected))return 'failed';
 if(!sync.hasToken)return null;
 if(sync.status==='saving'&&sync.pending)return 'saving';
 if(sync.pending)return 'queued';
 return sync.lastSentAt?'sent':null;
}

const TEXT={
 local:sync=>`${sync.pending} değişiklik yalnız bu cihazda kayıtlı. Diğer cihazlarda görünmesi için bu cihazı bağla.`,
 failed:sync=>sync.pending?`GitHub’a gönderilemedi; ${sync.pending} değişiklik bu cihazda bekliyor.`:'GitHub bu cihazın anahtarını reddetti; bu cihazı yeniden bağla.',
 saving:()=>'Değişiklikler GitHub’a gönderiliyor.',
 queued:sync=>sync.reviewPending?'Bu cihazın kayıtları GitHub’dakiyle karşılaştırıldıktan sonra gönderilecek.'
  :sync.retryAt?`GitHub’ın istediği bekleme bitince, ${clock(sync.retryAt)} sonrasında gönderilecek.`
   :'GitHub’a gönderilecek: ilk değişiklikten iki dakika sonra ya da sayfadan ayrılınca.',
 sent:sync=>`GitHub’a gönderildi · ${clock(sync.lastSentAt)}`,
};
const ICONS={local:IconCloudOff,failed:IconAlertTriangle,saving:IconCloudUpload,queued:IconCloudUpload,sent:IconCloudCheck};

/** The text is a polite live region that is always present, so a mark that stays on
 * this device is announced; the button sits outside it, as in SyncNotice. The text
 * takes focus when the dialog it opened closes and the button is gone. */
export default function SyncStatusLine({sync,onOpen}){
 const kind=syncStatusKind(sync);
 const Icon=kind&&ICONS[kind];
 const action=kind==='local'?'Bu cihazı bağla':kind==='failed'?'Eşitleme ayrıntıları':null;
 return <div className="sync-status-line" data-kind={kind||undefined}>
  <Text className="sync-status-text" role="status" aria-live="polite" tabIndex={-1}>{kind&&<><Icon size={18} aria-hidden="true"/><span>{TEXT[kind](sync)}</span></>}</Text>
  {action&&<Button variant="light" onClick={onOpen}>{action}</Button>}
 </div>;
}
