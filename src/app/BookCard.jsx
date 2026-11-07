// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { ActionIcon, Badge, Card, Group, Text, Title, Tooltip } from '@mantine/core';
import { IconShoppingBagCheck, IconHeart } from '@tabler/icons-react';
import { QueueButton } from '../components/ReadingPanel';
import TranslationStatus from '../components/TranslationStatus';
import { displayTitle, translationStatus, turkishEdition } from '../translation';
import { workFormat } from '../workFormat';
import ReadingPriorityBadge from '../components/ReadingPriorityBadge';
import StateRibbons, { StateSummary } from '../components/StateRibbons';
import { STATE_LABELS } from '../library';
import { BookCover } from './BookCover';

// A card names the Turkish publisher once a Turkish edition is known, and an
// article or essay names what it is and where it appeared.
export const cardPublisher=b=>{
 const format=workFormat(b);
 if(format)return [format.label,b.publication?.venue].filter(Boolean).join(' · ');
 return (['available','original'].includes(translationStatus(b).status)&&turkishEdition(b)?.publisher)||b.cover?.publisher||'';
};
export function BookCard({book:b,ranking,states,onOpen,onToggle,queue,onAdd,onQueue}) {
 const marks=states[b.id]||[],saved=marks.includes('onemli'),owned=marks.includes('alindi');
 const reading=marks.filter(s=>!['onemli','alindi','okundu'].includes(s)),publisher=cardPublisher(b),title=displayTitle(b);
 return <Card component="article" padding={0} className="book-card" data-book-id={b.id} onClick={e=>{if(!(e.target instanceof Element&&e.target.closest('button,a,input,select,textarea,[role="button"]')))onOpen(b.id)}}>
  <div className="book-visual"><BookCover book={b} onOpen={onOpen} read={marks.includes('okundu')}/><div className="cover-marks"><ReadingPriorityBadge ranking={ranking}/><StateRibbons marks={marks}/></div></div>
  <div className="book-card-body">
   <Title order={3}><button className="title-button" onClick={()=>onOpen(b.id)}>{title}</button></Title>
   <StateSummary marks={marks}/>
   <Text className="book-author">{b.author||'Yazar bilgisi kaynakta belirtilmemiş'}</Text>
   {b.childAge&&<Text className="book-age">{b.childAge} yaş</Text>}
   <div className="book-meta-row"><TranslationStatus book={b}/>{publisher&&<Text className="book-publisher">{publisher}</Text>}</div>
   {reading.length>0&&<Group gap={6} className="book-state-badges">{reading.map(s=><Badge key={s} color="brand">{STATE_LABELS[s]}</Badge>)}</Group>}
   <div className="book-actions">
    <Tooltip label={saved?'Favorilerden çıkar':'Favorilerime ekle'} withArrow><ActionIcon className="cover-save" variant="subtle" aria-label={`${title}: favori ${saved?'işaretini kaldır':'olarak işaretle'}`} aria-pressed={saved} onClick={()=>onToggle(b.id,'onemli')}><IconHeart size={21} fill={saved?'currentColor':'none'}/></ActionIcon></Tooltip>
    <Tooltip label={owned?'Kitaplığımdan çıkar':'Satın aldım'} withArrow><ActionIcon className="cover-owned" variant="subtle" aria-label={`${title}: ${owned?'kitaplığımdan çıkar':'satın aldım'}`} aria-pressed={owned} onClick={e=>onToggle(b.id,'alindi',e.currentTarget)}><IconShoppingBagCheck size={21}/></ActionIcon></Tooltip>
    <QueueButton id={b.id} title={title} queue={queue} onAdd={onAdd} onQueue={onQueue} iconOnly/>
   </div>
  </div>
 </Card>
}
