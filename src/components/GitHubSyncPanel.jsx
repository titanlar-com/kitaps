import React,{useEffect,useRef,useState} from 'react';
import {Alert,Anchor,Badge,Button,Group,List,Paper,PasswordInput,Stack,Text,Title} from '@mantine/core';
import {IconArrowUpRight,IconBrandGithub,IconRefresh} from '@tabler/icons-react';
import {GITHUB_STATE_OWNER,GITHUB_STATE_REPOSITORY} from '../state/types.ts';
import {SITE_URL} from '../site';

// The token is kept in this origin's storage, which every Pages site on the same host can read.
const SITE_HOST=new URL(SITE_URL).host;

// Pre-filled creation form: the organisation that owns the state repository as
// resource owner, Contents read and write, 90 days. GitHub cannot pre-select the
// repository, so the steps below name it.
const TOKEN_FORM='https://github.com/settings/personal-access-tokens/new?'+new URLSearchParams({name:'Kitaplık eşitleme',description:`Yalnız ${GITHUB_STATE_OWNER}/${GITHUB_STATE_REPOSITORY}: Contents read and write`,target_name:GITHUB_STATE_OWNER,expires_in:'90',contents:'write'});

const clock=ms=>new Date(ms).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
// What the last read and write were, so a stale copy is never presented as fresh.
const lastActivity=sync=>[
 sync.lastReadAt&&`Son okuma ${clock(sync.lastReadAt)} · ${sync.readSource==='cdn'?'GitHub önbelleği, en çok beş dakika gecikebilir':'GitHub'}`,
 sync.lastSentAt&&`Son gönderim ${clock(sync.lastSentAt)}`,
].filter(Boolean).join(' · ');

/** Connects this browser to the shared state file. Inside a dialog that already
 * carries the title, `framed={false}` drops the panel's own frame and heading. */
export default function GitHubSyncPanel({sync,framed=true}){
 const [token,setToken]=useState('');const [submitting,setSubmitting]=useState(false);
 const status=useRef(null);const submitted=useRef(false);
 // A successful connect replaces the form, and the focused button with it; the status takes focus.
 useEffect(()=>{if(sync.hasToken&&submitted.current){submitted.current=false;status.current?.focus()}},[sync.hasToken]);
 const submit=async event=>{event.preventDefault();setSubmitting(true);submitted.current=true;try{await sync.saveToken(token);setToken('')}catch{submitted.current=false}finally{setSubmitting(false)}};
 const badge=sync.status==='saving'?'Kaydediliyor':sync.status==='queued'?'Gönderim bekliyor':sync.status==='error'?'Dikkat':sync.hasToken?'Yazma bağlı':'Salt okunur';
 const content=<><Group justify="space-between" align="flex-start"><div>{framed&&<Title order={3}>Cihazlar arası eşitleme</Title>}<Text c="dimmed" mt={framed?4:0}>Favoriler, kitaplık, okuma durumları, sıra, tarihler, ilerleme ve notlar herkese açık kitaps-state deposunda ve onun GitHub geçmişinde görünür. Bir cihazdaki değişiklik ancak o cihaz bağlıysa diğer cihazlara ulaşır. Bağlı cihaz değişiklikleri sayfadan ayrılırken ya da ilk değişiklikten 120 saniye sonra tek güncellemeyle gönderir.</Text></div><Badge variant="light" color={sync.status==='error'?'red':sync.status==='saving'||sync.status==='queued'?'yellow':sync.hasToken?'green':'gray'}>{badge}</Badge></Group>
  <Alert ref={status} tabIndex={-1} mt="md" role="status" icon={<IconBrandGithub size={20}/>} color={sync.status==='error'?'red':'brand'}>{sync.message}{sync.pending?` · ${sync.pending} bekleyen değişiklik`:''}</Alert>
  {lastActivity(sync)&&<Text c="dimmed" mt="xs" className="sync-activity">{lastActivity(sync)}</Text>}
  {sync.hasToken?<Group mt="md"><Button variant="light" leftSection={<IconRefresh size={18}/>} onClick={()=>void sync.flush().catch(()=>undefined)}>Şimdi gönder</Button><Button variant="default" onClick={()=>void sync.load()}>GitHub’dan yenile</Button><Button variant="subtle" color="red" onClick={sync.clearToken}>Anahtarı kaldır</Button></Group>:<form onSubmit={submit}><Stack mt="md" gap="sm">
   <Group><Button type="button" variant="default" leftSection={<IconRefresh size={18}/>} onClick={()=>void sync.load()}>GitHub’dan yenile</Button></Group>
   <Text fw={600}>Bu cihazı bağla</Text>
   <List size="sm" spacing={4} className="token-steps" type="ordered">
    <List.Item><Anchor href={TOKEN_FORM} target="_blank" rel="noreferrer">Anahtarı hazır ayarlarla oluştur <IconArrowUpRight size={15}/></Anchor> (sahibi {GITHUB_STATE_OWNER}, Contents yazma, 90 gün).</List.Item>
    <List.Item>Resource owner olarak {GITHUB_STATE_OWNER} seçili kalsın: kişisel hesabına bağlı bir anahtar, önceki anahtarın da, bu depoya yazamaz. Kuruluş yeni anahtarları onaya bağlıyorsa anahtar, bir kuruluş sahibi onaylayınca yazabilir; onaydan sonra anahtarı yeniden yapıştır.</List.Item>
    <List.Item>Repository access bölümünde “Only select repositories” seçip yalnız {GITHUB_STATE_REPOSITORY} deposunu işaretle; Contents iznini “Read and write” bırak, başka izin ekleme.</List.Item>
    <List.Item>Anahtarı aşağıya yapıştır. Aynı anahtarı telefonda da kullanabilirsin; e-posta ya da mesajla gönderme, telefonda yeniden oluştur veya cihazlar arası güvenli kopyala-yapıştır kullan.</List.Item>
    <List.Item>Anahtar bu tarayıcıda saklanır. {SITE_HOST} altındaki diğer sayfalar aynı tarayıcı alanını paylaştığı için yalnız bu depoya yetkili, süreli bir anahtar kullan.</List.Item>
   </List>
   <PasswordInput label="İnce ayarlı (fine-grained) GitHub anahtarı" description="github_pat_ ile başlar. Klasik ve OAuth anahtarları kabul edilmez; anahtar kaydedilmeden önce GitHub ile okuma ve yazma izni denetlenir." value={token} onChange={event=>setToken(event.currentTarget.value)} autoComplete="off" required/>
   <Button type="submit" loading={submitting} disabled={!token.trim()}>Bu cihazda bağla</Button>
  </Stack></form>}</>;
 return framed?<Paper withBorder p="lg" radius="lg" className="github-sync-panel">{content}</Paper>:content;
}
