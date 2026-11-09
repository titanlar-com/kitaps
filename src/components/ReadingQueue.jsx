import React, { useLayoutEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Progress, Text, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowUpRight, IconListNumbers, IconX } from '@tabler/icons-react';
import { queueView } from '../core/personal/queue';
import { queueScreen } from '../screens/queue.js';
import EmptyState from './EmptyState';
import './ReadingQueue.css';

// Sıram (docs/UI-REDESIGN.md, phase 5). The rows and their numbers come from queueView; this
// component only shows them and keeps the keyboard in place. React moves a row by taking it out
// of the page, and a focused control that leaves the page or turns off loses focus. So after each
// move or removal the focus is put back where the reader would expect it.
export default function ReadingQueue({queue,books,reading,states,onMove,onRemove,onOpen,onBrowse,BookCover}) {
 const model=queueScreen(queueView({queue,books,reading,states}));
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
  setMessage(row.moved[direction]);
  onMove(row.id,direction);
 };
 const remove=(row,index)=>{
  pending.current={kind:'remove',index};
  setMessage(row.removed);
  onRemove(row.id);
 };
 return <div className="queue-desk" ref={desk}>
  {model.empty?<EmptyState className="queue-empty" icon={IconListNumbers} title={model.empty.title} action={<Button onClick={onBrowse}>{model.empty.browse}</Button>}>{model.empty.body}</EmptyState>:<>
   <div className="queue-head">
    <Text className="queue-count tabular-nums">{model.count}</Text>
    <Button variant="default" onClick={onBrowse}>{model.browse}</Button>
   </div>
   <ol className="reading-queue" role="list">{model.rows.map((row,index)=>{
    return <li key={row.id} className="queue-row" role="listitem" data-book-id={row.id} data-next={row.next||undefined}>
     <Text component="div" className="queue-position tabular-nums"><span aria-hidden="true">{row.position}</span><span className="visually-hidden">{row.positionLabel}</span></Text>
     <div className="queue-cover"><BookCover book={row.book} onOpen={onOpen} read={row.read}/></div>
     <div className="queue-body">
      {row.eyebrow&&<Text className="queue-eyebrow">{row.eyebrow}</Text>}
      <Title order={2} className="queue-title"><button className="title-button" onClick={()=>onOpen(row.id)}>{row.title}</button></Title>
      <Text c="dimmed">{row.author}</Text>
      {row.marks.length>0&&<Group gap={6} className="queue-marks">{row.marks.map(mark=><Badge key={mark.id}>{mark.label}</Badge>)}</Group>}
      {row.progress&&<div className="queue-progress">
       <div className="queue-progress-line"><Text c="dimmed" className="tabular-nums">{row.progress.sentence}</Text><span className="queue-progress-share tabular-nums">{row.progress.share}</span></div>
       <Progress value={row.progress.percent} size="sm" aria-label={row.progress.label}/>
      </div>}
     </div>
     <div className="queue-controls">
      <ActionIcon.Group>
       <ActionIcon variant="default" data-move="-1" disabled={row.moveUp.disabled} onClick={()=>move(row,-1)} aria-label={row.moveUp.label}><IconArrowUp size={20}/></ActionIcon>
       <ActionIcon variant="default" data-move="1" disabled={row.moveDown.disabled} onClick={()=>move(row,1)} aria-label={row.moveDown.label}><IconArrowDown size={20}/></ActionIcon>
       <ActionIcon variant="default" data-remove="" onClick={()=>remove(row,index)} aria-label={row.remove}><IconX size={20}/></ActionIcon>
      </ActionIcon.Group>
      <Button variant="light" rightSection={<IconArrowUpRight size={18}/>} onClick={()=>onOpen(row.id)} aria-label={row.record.label}>{row.record.text}</Button>
     </div>
    </li>;
   })}</ol>
  </>}
  <div className="queue-status visually-hidden" role="status" aria-live="polite">{message}</div>
 </div>;
}
