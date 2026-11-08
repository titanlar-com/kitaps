import React, { useLayoutEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Progress, Text, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowUpRight, IconListNumbers, IconX } from '@tabler/icons-react';
import { queueView } from '../core/personal/queue';
import { STATE_LABELS } from '../library';
import { displayTitle } from '../translation';
import EmptyState from './EmptyState';
import './ReadingQueue.css';

// Sıram (docs/UI-REDESIGN.md, phase 5). The rows and their numbers come from queueView; this
// component only shows them and keeps the keyboard in place. React moves a row by taking it out
// of the page, and a focused control that leaves the page or turns off loses focus. So after each
// move or removal the focus is put back where the reader would expect it.
export default function ReadingQueue({queue,books,reading,states,onMove,onRemove,onOpen,onBrowse,BookCover}) {
 const {rows,free,full}=queueView({queue,books,reading,states});
 const [message,setMessage]=useState('');
 const desk=useRef(null);
 const pending=useRef(null);
 useLayoutEffect(()=>{
  const wanted=pending.current;
  if(!wanted)return;
  pending.current=null;
  const list=desk.current?.querySelector('.reading-queue');
  const items=list?[...list.children]:[];
  if(wanted.kind==='move'){
   const row=items.find(item=>item.dataset.bookId===wanted.id);
   const same=row?.querySelector(`[data-move="${wanted.direction}"]`);
   (same&&!same.disabled?same:row?.querySelector(`[data-move="${-wanted.direction}"]`))?.focus();
  }else (items[Math.min(wanted.index,items.length-1)]?.querySelector('[data-remove]')??desk.current?.querySelector('.desk-empty-action button'))?.focus();
 },[queue]);
 const move=(row,direction)=>{
  pending.current={kind:'move',id:row.id,direction};
  setMessage(`${displayTitle(row.book)} ${row.position+direction}. sıraya taşındı.`);
  onMove(row.id,direction);
 };
 const remove=(row,index)=>{
  pending.current={kind:'remove',index};
  setMessage(`${displayTitle(row.book)} sıradan çıkarıldı.`);
  onRemove(row.id);
 };
 return <div className="queue-desk" ref={desk}>
  {rows.length===0?<EmptyState className="queue-empty" icon={IconListNumbers} title="Bir sonraki kitabına yer aç." action={<Button onClick={onBrowse}>Kitap seç</Button>}>Katalogdan en fazla beş kitap seç. Her kartta “Sırama ekle” düğmesi var.</EmptyState>:<>
   <div className="queue-head">
    <Text className="queue-count tabular-nums">{full?`Sıran dolu. En çok ${rows.length} kitap sıraya girebilir.`:`Sırada ${rows.length} kitap var. ${free} kitaplık yerin kaldı.`}</Text>
    <Button variant="default" onClick={onBrowse}>{full?'Kataloğa dön':'Sırama kitap seç'}</Button>
   </div>
   <ol className="reading-queue" role="list">{rows.map((row,index)=>{
    const title=displayTitle(row.book);
    return <li key={row.id} className="queue-row" role="listitem" data-book-id={row.id} data-next={index===0||undefined}>
     <Text component="div" className="queue-position tabular-nums"><span aria-hidden="true">{row.position}</span><span className="visually-hidden">{row.position}. sırada</span></Text>
     <div className="queue-cover"><BookCover book={row.book} onOpen={onOpen} read={row.read}/></div>
     <div className="queue-body">
      {index===0&&<Text className="queue-eyebrow">Sıradaki kitabın</Text>}
      <Title order={2} className="queue-title"><button className="title-button" onClick={()=>onOpen(row.id)}>{title}</button></Title>
      <Text c="dimmed">{row.book.author}</Text>
      {row.marks.length>0&&<Group gap={6} className="queue-marks">{row.marks.map(mark=><Badge key={mark}>{STATE_LABELS[mark]}</Badge>)}</Group>}
      {row.progress&&<div className="queue-progress">
       <div className="queue-progress-line"><Text c="dimmed" className="tabular-nums">{row.progress.totalPages} sayfadan {row.progress.page} tanesi okundu.</Text><span className="queue-progress-share tabular-nums">%{row.progress.percent}</span></div>
       <Progress value={row.progress.percent} size="sm" aria-label={`${title}: okuma ilerlemesi`}/>
      </div>}
     </div>
     <div className="queue-controls">
      <ActionIcon.Group>
       <ActionIcon variant="default" data-move="-1" disabled={!row.canMoveUp} onClick={()=>move(row,-1)} aria-label={`${title}: sırada yukarı taşı`}><IconArrowUp size={20}/></ActionIcon>
       <ActionIcon variant="default" data-move="1" disabled={!row.canMoveDown} onClick={()=>move(row,1)} aria-label={`${title}: sırada aşağı taşı`}><IconArrowDown size={20}/></ActionIcon>
       <ActionIcon variant="default" data-remove="" onClick={()=>remove(row,index)} aria-label={`${title}: sıradan çıkar`}><IconX size={20}/></ActionIcon>
      </ActionIcon.Group>
      <Button variant="light" rightSection={<IconArrowUpRight size={18}/>} onClick={()=>onOpen(row.id)} aria-label={`Okuma kaydım: ${title}`}>Okuma kaydım</Button>
     </div>
    </li>;
   })}</ol>
  </>}
  <div className="queue-status visually-hidden" role="status" aria-live="polite">{message}</div>
 </div>;
}
