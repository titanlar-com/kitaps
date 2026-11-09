import React from 'react';
import { ActionIcon, Tooltip, Button, Group, NumberInput, Paper, Progress, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconArrowRight, IconCheck, IconPlus, IconPlaylistAdd, IconPlaylist } from '@tabler/icons-react';
import { queueButtonScreen, readingPanelScreen } from '../../../screens/book.js';

export function QueueButton({id,queue,onAdd,onQueue,fullWidth=false,iconOnly=false,title=''}) {
 const model=queueButtonScreen({id,queue,title});
 const {present,full}=model;
 if(iconOnly)return <Tooltip label={model.label} withArrow><ActionIcon className="cover-queue" variant="subtle" aria-label={model.ariaLabel} aria-pressed={present} onClick={()=>present||full?onQueue():onAdd(id)}>{present?<IconPlaylist size={21}/>:<IconPlaylistAdd size={21}/>}</ActionIcon></Tooltip>;
 return <Button fullWidth={fullWidth} variant={present?'light':'subtle'} onClick={()=>present||full?onQueue():onAdd(id)} leftSection={present?<IconCheck size={18}/>:full?null:<IconPlus size={18}/>} rightSection={full&&!present?<IconArrowRight size={18}/>:null}>{model.text}</Button>;
}
export default function ReadingPanel({book,record,states,onToggle,onChange,queue,onAdd,onQueue,storageError}) {
 const model=readingPanelScreen({record,marks:states,storageError}),r=model.record;
 // A four-digit year: without a max, Chromium sizes the date field for six-digit years.
 const lastDay='9999-12-31';
 return <Paper className="reading-panel">
  <Stack gap="lg">
   <div><Title order={3}>{model.title}</Title><Text c="dimmed" mt="xs" aria-live="polite">{model.notice}</Text></div>
   <QueueButton id={book.id} queue={queue} onAdd={onAdd} onQueue={onQueue} fullWidth/>
   <div><Text fw={500} mb="sm">{model.statusTitle}</Text><Group gap={8}>{model.marks.map(mark=><Button key={mark.key} variant={mark.pressed?'filled':'light'} aria-pressed={mark.pressed} onClick={()=>onToggle(book.id,mark.key)}>{mark.label}</Button>)}</Group></div>
   <div className="reading-fields"><TextInput type="date" max={lastDay} label={model.started.label} value={r.startedAt} onChange={e=>onChange(book.id,{startedAt:e.currentTarget.value})} onInput={e=>onChange(book.id,{startedAt:e.currentTarget.value})}/><TextInput type="date" max={lastDay} label={model.finished.label} value={r.finishedAt} error={model.finished.error} onChange={e=>onChange(book.id,{finishedAt:e.currentTarget.value})} onInput={e=>onChange(book.id,{finishedAt:e.currentTarget.value})}/></div>
   <div className="reading-fields"><NumberInput label={model.page.label} min={0} max={999999} allowDecimal={false} hideControls size="md" placeholder={model.page.placeholder} value={r.page} onChange={page=>onChange(book.id,{page})}/><NumberInput label={model.total.label} min={1} max={999999} allowDecimal={false} hideControls size="md" placeholder={model.total.placeholder} value={r.totalPages} error={model.total.error} onChange={totalPages=>onChange(book.id,{totalPages})}/></div>
   {model.progress&&<div><Group justify="space-between" mb="xs"><Text>{model.progress.pages}</Text><Text fw={500}>{model.progress.percent}</Text></Group><Progress value={model.progress.value} size="md" aria-label={model.progress.label}/></div>}
   <Textarea label={model.why.label} description={model.why.description} placeholder={model.why.placeholder} autosize minRows={3} value={r.why} onChange={e=>onChange(book.id,{why:e.currentTarget.value})}/>
   <Textarea label={model.apply.label} description={model.apply.description} placeholder={model.apply.placeholder} autosize minRows={3} value={r.apply} onChange={e=>onChange(book.id,{apply:e.currentTarget.value})}/>
  </Stack>
 </Paper>;
}
