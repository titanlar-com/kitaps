import React,{useEffect,useId,useRef,useState} from 'react';
import {Alert,Anchor,Button,Paper,PasswordInput,Stepper,Text,Title} from '@mantine/core';
import {IconAlertTriangle,IconArrowUpRight,IconBrandGithub,IconRefresh} from '@tabler/icons-react';
import SyncRecoveryAlert from './SyncRecovery';
import {GITHUB_STATE_OWNER,GITHUB_STATE_REPOSITORY} from '../state/types.ts';
import {SITE_URL} from '../site';
import './SyncPanels.css';

// The token is kept in this origin's storage, which every Pages site on the same host can read.
const SITE_HOST=new URL(SITE_URL).host;

// Pre-filled creation form: the organisation that owns the state repository as
// resource owner, Contents read and write, 90 days. GitHub cannot pre-select the
// repository, so the steps below name it.
const TOKEN_FORM='https://github.com/settings/personal-access-tokens/new?'+new URLSearchParams({name:'Kitaplık eşitleme',description:`Yalnız ${GITHUB_STATE_OWNER}/${GITHUB_STATE_REPOSITORY}: Contents read and write`,target_name:GITHUB_STATE_OWNER,expires_in:'90',contents:'write'});

const clock=ms=>new Date(ms).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
// What the last read and write were, so a stale copy is never presented as fresh.
const lastActivity=sync=>[
 sync.lastReadAt&&`Son okuma saat ${clock(sync.lastReadAt)}. Kaynak ${sync.readSource==='cdn'?'GitHub önbelleği, en çok beş dakika gecikebilir':'GitHub'}.`,
 sync.lastSentAt&&`Son gönderim saat ${clock(sync.lastSentAt)}.`,
].filter(Boolean).join(' ');

/** Connects this browser to the shared state file. Inside a dialog that already
 * carries the title, `framed={false}` drops the panel's own frame and heading. */
export default function GitHubSyncPanel({sync,framed=true}){
 const [token,setToken]=useState('');const [submitting,setSubmitting]=useState(false);
 const [formOpened,setFormOpened]=useState(false);
 const status=useRef(null);const submitted=useRef(false);const stepsTitle=useId();
 // A successful connect replaces the form, and the focused button with it; the status takes focus.
 useEffect(()=>{if(sync.hasToken&&submitted.current){submitted.current=false;status.current?.focus()}},[sync.hasToken]);
 const submit=async event=>{event.preventDefault();setSubmitting(true);submitted.current=true;try{await sync.saveToken(token);setToken('')}catch{submitted.current=false}finally{setSubmitting(false)}};
 const stateTitle=sync.status==='saving'?'Kaydediliyor':sync.status==='queued'?'Gönderim bekliyor':sync.status==='error'?'Dikkat':sync.hasToken?'Yazma bağlı':'Salt okunur';
 const failing=sync.status==='error';
 // The steps follow only what this page can see: the form was opened, a key was typed. What the reader does on GitHub stays unmarked.
 const activeStep=token.trim()?3:formOpened?1:0;
 const steps=[
  {label:'Anahtarı oluştur',description:<><Anchor href={TOKEN_FORM} target="_blank" rel="noreferrer" onClick={()=>setFormOpened(true)}>Anahtarı hazır ayarlarla <span className="sync-link-end">oluştur<IconArrowUpRight size={15} aria-hidden="true"/></span></Anchor> Form, sahibi {GITHUB_STATE_OWNER} olarak, Contents yazma izniyle ve 90 gün süreyle açılır.</>},
  {label:'Sahibi seç',description:`Resource owner olarak ${GITHUB_STATE_OWNER} seçili kalsın. Kişisel hesabına bağlı bir anahtar bu depoya yazamaz, önceki anahtarın için de bu geçerlidir. Kuruluş yeni anahtarları onaya bağlıyorsa anahtar, bir kuruluş sahibi onaylayınca yazabilir. Onaydan sonra anahtarı yeniden yapıştır.`},
  {label:'Depoyu seç',description:`Repository access bölümünde “Only select repositories” seç ve yalnız ${GITHUB_STATE_REPOSITORY} deposunu işaretle. Contents iznini “Read and write” bırak ve başka izin ekleme.`},
  {label:'Anahtarı yapıştır',description:'Anahtarı aşağıdaki alana yapıştır. Aynı anahtarı telefonda da kullanabilirsin. Anahtarı e-posta ya da mesajla gönderme. Telefonda yeniden oluştur veya cihazlar arası güvenli kopyala-yapıştır kullan.'},
 ];
 const content=<>
  {framed&&<Title order={3} mb="sm">Cihazlar arası eşitleme</Title>}
  <Alert ref={status} tabIndex={-1} role="status" className="sync-alert" data-tone={failing?'danger':undefined} icon={failing?<IconAlertTriangle size={20}/>:<IconBrandGithub size={20}/>} title={stateTitle}>{sync.message}{sync.pending?` ${sync.pending} değişiklik gönderilmeyi bekliyor.`:''}</Alert>
  {lastActivity(sync)&&<Text c="dimmed" className="sync-activity">{lastActivity(sync)}</Text>}
  {sync.recovery&&<SyncRecoveryAlert sync={sync} onRemoved={()=>status.current?.focus()}/>}
  <Text c="dimmed" className="sync-intro">Favoriler, kitaplık, okuma durumları, sıra, tarihler, ilerleme ve notlar herkese açık kitaps-state deposunda ve onun GitHub geçmişinde görünür. Bir cihazdaki değişiklik ancak o cihaz bağlıysa diğer cihazlara ulaşır. Bağlı cihaz değişiklikleri sayfadan ayrılırken ya da ilk değişiklikten 30 saniye sonra tek güncellemeyle gönderir. Açık sayfa ortak kaydı 30 saniyede bir yeniden okur.</Text>
  {sync.hasToken
   ?<div className="sync-actions"><Button variant="light" leftSection={<IconRefresh size={18}/>} onClick={()=>void sync.flush().catch(()=>undefined)}>Şimdi gönder</Button><Button variant="default" onClick={()=>void sync.load()}>GitHub’dan yenile</Button><Button variant="subtle" className="sync-danger" onClick={sync.clearToken}>Anahtarı kaldır</Button></div>
   :<>
    <div className="sync-actions"><Button type="button" variant="default" leftSection={<IconRefresh size={18}/>} onClick={()=>void sync.load()}>GitHub’dan yenile</Button></div>
    <form onSubmit={submit} className="sync-connect">
     <Text id={stepsTitle} className="sync-connect-title">Bu cihazı bağla</Text>
     <Stepper role="list" aria-labelledby={stepsTitle} aria-busy={submitting||undefined} className="sync-steps" orientation="vertical" size="sm" iconSize={32} active={activeStep}>
      {steps.map((step,index)=><Stepper.Step key={step.label} component="div" role="listitem" aria-current={index===activeStep?'step':undefined} label={step.label} description={step.description} loading={submitting&&index===activeStep}/>)}
     </Stepper>
     <PasswordInput className="sync-token-field" label="İnce ayarlı (fine-grained) GitHub anahtarı" description="github_pat_ ile başlar. Klasik ve OAuth anahtarları kabul edilmez. Anahtar kaydedilmeden önce GitHub ile okuma ve yazma izni denetlenir." value={token} onChange={event=>setToken(event.currentTarget.value)} autoComplete="off" required/>
     <Button className="sync-submit" type="submit" loading={submitting} disabled={!token.trim()}>Bu cihazda bağla</Button>
     <Text c="dimmed" className="sync-storage-note">Anahtar bu tarayıcıda saklanır. {SITE_HOST} altındaki diğer sayfalar aynı tarayıcı alanını paylaştığı için yalnız bu depoya yetkili, süreli bir anahtar kullan.</Text>
    </form>
   </>}
 </>;
 return framed?<Paper p="lg" radius="lg" className="github-sync-panel">{content}</Paper>:content;
}
