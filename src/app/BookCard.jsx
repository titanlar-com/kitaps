// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { catalog } from './catalogData';
import { ActionIcon, Badge, Card, Group, HoverCard, Text, Title, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { DataList } from './dataList';
import { IconShoppingBagCheck, IconHeart } from '@tabler/icons-react';
import { QueueButton } from '../components/ReadingPanel';
import TranslationStatus from '../components/TranslationStatus';
import { displayTitle, translationStatus, turkishEdition } from '../translation';
import { workFormat } from '../workFormat';
import ReadingPriorityBadge from '../components/ReadingPriorityBadge';
import StateRibbons, { StateSummary } from '../components/StateRibbons';
import { STATE_LABELS } from '../library';
import { BookCover } from './BookCover';
import { readingGuide } from '../recommendations';
import { pageCount } from '../pages';
import './BookCard.css';

// A card names the Turkish publisher once a Turkish edition is known, and an
// article or essay names what it is and where it appeared.
export const cardPublisher=b=>{
 const format=workFormat(b);
 if(format)return [format.label,b.publication?.venue].filter(Boolean).join(' · ');
 return (['available','original'].includes(translationStatus(b).status)&&turkishEdition(b)?.publisher)||b.cover?.publisher||'';
};
// What a mouse sees over a cover. Everything here is also on the book page, so it is never the only
// way to it. It is built only when it opens.
function BookPreview({book}) {
 const pages=pageCount(book),year=book.years[0];
 return <>
  <Text className="book-preview-purpose">{readingGuide(book,catalog).purpose}</Text>
  {(year||pages)&&<DataList orientation="horizontal" className="book-preview-facts">
   {year&&<DataList.Item><DataList.ItemLabel>İlk yayın</DataList.ItemLabel><DataList.ItemValue>{year}</DataList.ItemValue></DataList.Item>}
   {pages&&<DataList.Item><DataList.ItemLabel>Sayfa</DataList.ItemLabel><DataList.ItemValue>{pages.pages}</DataList.ItemValue></DataList.Item>}
  </DataList>}
 </>;
}
// A preview needs a mouse and room beside the card.
const HOVER_QUERY='(hover: hover) and (pointer: fine) and (min-width: 48em)';
export function BookCard({book:b,ranking,states,onOpen,onToggle,queue,onAdd,onQueue}) {
 const marks=states[b.id]||[],saved=marks.includes('onemli'),owned=marks.includes('alindi');
 const reading=marks.filter(s=>!['onemli','alindi','okundu'].includes(s)),publisher=cardPublisher(b),title=displayTitle(b);
 const canHover=useMediaQuery(HOVER_QUERY,false,{getInitialValueInEffect:false});
 const visual=<div className="book-visual"><BookCover book={b} onOpen={onOpen} read={marks.includes('okundu')}/><div className="cover-marks"><ReadingPriorityBadge ranking={ranking}/><StateRibbons marks={marks}/></div></div>;
 return <Card component="article" padding={0} className="book-card" data-book-id={b.id} onClick={e=>{if(!(e.target instanceof Element&&e.target.closest('button,a,input,select,textarea,[role="button"]')))onOpen(b.id)}}>
  <HoverCard disabled={!canHover} position="right-start" width="min(18rem, calc(100vw - 2rem))" withRoles={false}><HoverCard.Target>{visual}</HoverCard.Target><HoverCard.Dropdown className="book-preview"><BookPreview book={b}/></HoverCard.Dropdown></HoverCard>
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
