// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { catalog } from './catalogData';
import { ActionIcon, Badge, Card, Group, HoverCard, Text, Title, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { DataList } from './dataList';
import { IconShoppingBagCheck, IconHeart } from '@tabler/icons-react';
import { QueueButton } from '../components/ReadingPanel';
import TranslationStatus from '../components/TranslationStatus';
import ReadingPriorityBadge from '../components/ReadingPriorityBadge';
import StateRibbons, { StateSummary } from '../components/StateRibbons';
import { bookCardScreen, bookPreviewScreen } from '../screens/catalog.js';
import { BookCover } from './BookCover';
import { readingGuide } from '../recommendations';
import { pageCount } from '../pages';
import './BookCard.css';

// What a mouse sees over a cover. Everything here is also on the book page, so it is never the only
// way to it. It is built only when it opens.
function BookPreview({book}) {
 const model=bookPreviewScreen({purpose:readingGuide(book,catalog).purpose,year:book.years[0],pages:pageCount(book)});
 return <>
  <Text className="book-preview-purpose">{model.purpose}</Text>
  {model.facts.length>0&&<DataList orientation="horizontal" className="book-preview-facts">
   {model.facts.map(fact=><DataList.Item key={fact.label}><DataList.ItemLabel>{fact.label}</DataList.ItemLabel><DataList.ItemValue>{fact.value}</DataList.ItemValue></DataList.Item>)}
  </DataList>}
 </>;
}
// A preview needs a mouse and room beside the card.
const HOVER_QUERY='(hover: hover) and (pointer: fine) and (min-width: 48em)';
export function BookCard({book:b,ranking,states,onOpen,onToggle,queue,onAdd,onQueue}) {
 const marks=states[b.id]||[],model=bookCardScreen({book:b,marks});
 const canHover=useMediaQuery(HOVER_QUERY,false,{getInitialValueInEffect:false});
 const visual=<div className="book-visual"><BookCover book={b} onOpen={onOpen} read={model.read}/><div className="cover-marks"><ReadingPriorityBadge ranking={ranking}/><StateRibbons marks={marks}/></div></div>;
 return <Card component="article" padding={0} className="book-card" data-book-id={b.id} onClick={e=>{if(!(e.target instanceof Element&&e.target.closest('button,a,input,select,textarea,[role="button"]')))onOpen(b.id)}}>
  <HoverCard disabled={!canHover} position="right-start" width="min(18rem, calc(100vw - 2rem))" withRoles={false}><HoverCard.Target>{visual}</HoverCard.Target><HoverCard.Dropdown className="book-preview"><BookPreview book={b}/></HoverCard.Dropdown></HoverCard>
  <div className="book-card-body">
   <Title order={3}><button className="title-button" onClick={()=>onOpen(b.id)}>{model.title}</button></Title>
   <StateSummary marks={marks}/>
   <Text className="book-author">{model.author}</Text>
   {model.age&&<Text className="book-age">{model.age}</Text>}
   <div className="book-meta-row"><TranslationStatus book={b}/>{model.publisher&&<Text className="book-publisher">{model.publisher}</Text>}</div>
   {model.readingBadges.length>0&&<Group gap={6} className="book-state-badges">{model.readingBadges.map(badge=><Badge key={badge.id} color="brand">{badge.label}</Badge>)}</Group>}
   <div className="book-actions">
    <Tooltip label={model.favorite.tooltip} withArrow><ActionIcon className="cover-save" variant="subtle" aria-label={model.favorite.label} aria-pressed={model.favorite.pressed} onClick={()=>onToggle(b.id,'onemli')}><IconHeart size={21} fill={model.favorite.pressed?'currentColor':'none'}/></ActionIcon></Tooltip>
    <Tooltip label={model.owned.tooltip} withArrow><ActionIcon className="cover-owned" variant="subtle" aria-label={model.owned.label} aria-pressed={model.owned.pressed} onClick={e=>onToggle(b.id,'alindi',e.currentTarget)}><IconShoppingBagCheck size={21}/></ActionIcon></Tooltip>
    <QueueButton id={b.id} title={model.title} queue={queue} onAdd={onAdd} onQueue={onQueue} iconOnly/>
   </div>
  </div>
 </Card>
}
