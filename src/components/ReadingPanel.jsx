import React from 'react';
import { ActionIcon, Tooltip, Button, Group, NumberInput, Paper, Progress, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconArrowRight, IconCheck, IconPlus, IconPlaylistAdd, IconPlaylist } from '@tabler/icons-react';
import { STATE_LABELS } from '../library';
import { emptyReading, progressPercent, readingErrors } from '../reading';

export function QueueButton({id,queue,onAdd,onQueue,fullWidth=false,iconOnly=false,title=''}) {
 const present=queue.includes(id),full=queue.length>=5;
 const label=present?`Sıramda · ${queue.indexOf(id)+1}. kitap. Sıramı aç`:full?'Sıram dolu · 5 kitap. Sıramı düzenle':'Sırama ekle';
 if(iconOnly)return <Tooltip label={label} withArrow><ActionIcon className="cover-queue" variant="subtle" aria-label={`${title}: ${label}`} aria-pressed={present} onClick={()=>present||full?onQueue():onAdd(id)}>{present?<IconPlaylist size={21}/>:<IconPlaylistAdd size={21}/>}</ActionIcon></Tooltip>;
 return <Button fullWidth={fullWidth} variant={present?'light':'subtle'} onClick={()=>present||full?onQueue():onAdd(id)} leftSection={present?<IconCheck size={18}/>:full?null:<IconPlus size={18}/>} rightSection={full&&!present?<IconArrowRight size={18}/>:null}>{present?`Sıramda · ${queue.indexOf(id)+1}. kitap`:full?'Sıramı düzenle · 5/5':'Sırama ekle'}</Button>;
}
export default function ReadingPanel({book,record,states,onToggle,onChange,queue,onAdd,onQueue,storageError}) {
 const r={...emptyReading(),...record};const percent=progressPercent(r),errors=readingErrors(r);
 // A four-digit year: without a max, Chromium sizes the date field for six-digit years.
 const lastDay='9999-12-31';
 return <Paper className="reading-panel">
  <Stack gap="lg">
   <div><Title order={3}>Benim okuma kaydım</Title><Text c="dimmed" mt="xs" aria-live="polite">{storageError?'Kayıt yapılamıyor. Notlar bölümünden yedek indir.':'Bu kayıtlar tarayıcıya kaydedilir ve GitHub eşitlemesi bağlıysa herkese açık kitaps-state deposuna gönderilir.'}</Text></div>
   <QueueButton id={book.id} queue={queue} onAdd={onAdd} onQueue={onQueue} fullWidth/>
   <div><Text fw={500} mb="sm">Okuma durumu</Text><Group gap={8}>{['okunuyor','araverildi','birakildi','okundu'].map(key=><Button key={key} variant={states.includes(key)?'filled':'light'} aria-pressed={states.includes(key)} onClick={()=>onToggle(book.id,key)}>{STATE_LABELS[key]}</Button>)}</Group></div>
   <div className="reading-fields"><TextInput type="date" max={lastDay} label="Başlama tarihi" value={r.startedAt} onChange={e=>onChange(book.id,{startedAt:e.currentTarget.value})} onInput={e=>onChange(book.id,{startedAt:e.currentTarget.value})}/><TextInput type="date" max={lastDay} label="Bitiş tarihi" value={r.finishedAt} error={errors.dates} onChange={e=>onChange(book.id,{finishedAt:e.currentTarget.value})} onInput={e=>onChange(book.id,{finishedAt:e.currentTarget.value})}/></div>
   <div className="reading-fields"><NumberInput label="Kaldığım sayfa" min={0} max={999999} allowDecimal={false} hideControls size="md" placeholder="Henüz başlamadım" value={r.page} onChange={page=>onChange(book.id,{page})}/><NumberInput label="Toplam sayfa" min={1} max={999999} allowDecimal={false} hideControls size="md" placeholder="Baskına göre" value={r.totalPages} error={errors.pages} onChange={totalPages=>onChange(book.id,{totalPages})}/></div>
   {percent!==null&&!errors.pages&&<div><Group justify="space-between" mb="xs"><Text>{r.page} / {r.totalPages} sayfa</Text><Text fw={500}>%{percent}</Text></Group><Progress value={percent} size="md" aria-label="Okuma ilerlemesi"/></div>}
   <Textarea label="Neden okuyorum?" description="Bu kitaptan ne öğrenmek veya neyi anlamak istiyorum?" placeholder="Bu kitabı seçme nedenim…" autosize minRows={3} value={r.why} onChange={e=>onChange(book.id,{why:e.currentTarget.value})}/>
   <Textarea label="Bundan neyi uygulayacağım?" description="Bitirince denemek istediğin somut bir adım." placeholder="İlk uygulayacağım fikir…" autosize minRows={3} value={r.apply} onChange={e=>onChange(book.id,{apply:e.currentTarget.value})}/>
  </Stack>
 </Paper>;
}
