// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { useEffect, useRef, useState } from 'react';
import { Accordion, Alert, Anchor, Badge, Box, Button, Group, Paper, Spoiler, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconArrowUpRight, IconCheck } from '@tabler/icons-react';
import catalog from '../catalog.json';
import ReadingPanel, { QueueButton } from '../components/ReadingPanel';
import ReadingJourney from '../components/ReadingJourney';
import { DataList } from './dataList';
import './BookDetail.css';
import BookDiscovery, { ReadingPurpose } from '../components/BookDiscovery';
import EditionGuide from '../components/EditionGuide';
import TranslationStatus from '../components/TranslationStatus';
import { displayTitle, translationStatus } from '../translation';
import CategoryPill from '../components/CategoryPill';
import EditionSummary from '../components/EditionSummary';
import BookSheet from '../components/BookSheet';
import ReadingPriorityCard from '../components/ReadingPriorityCard';
import StateRibbons, { StateSummary } from '../components/StateRibbons';
import SyncStatusLine from '../components/SyncStatusLine';
import SourceBadge from '../components/SourceBadge';
import { STATE_LABELS, formatDay } from '../library';
import { collectionMap, groupMap, categoryMap } from './catalogData';
import { BookCover, ThumbCover } from './BookCover';

export function BookDetail({book:current,ranking:currentRanking,onClose,onOpen,onBack,hasBack,states,onToggle,onCollection,onCategory,personal,onReading,onAdd,onQueue,storageError,feedback,sync,onSync,covered}) {
 // Closing changes the address at once; the pages stay, closed to the reader, until the sheet has gone (ADR 004, K6).
 const [last,setLast]=useState(null);
 if(current&&(last?.book!==current||last?.ranking!==currentRanking))setLast({book:current,ranking:currentRanking});
 const b=current??last?.book,ranking=current?currentRanking:last?.ranking;
 const topRef=useRef(null);
 const shownTitle=b?displayTitle(b):'';
 // Only a known original title is shown under a Turkish title.
 const originalTitle=b&&translationStatus(b).status==='available'&&b.originalTitle&&b.originalTitle!==shownTitle?b.originalTitle:'';
 useEffect(()=>{if(b)topRef.current?.scrollIntoView({block:'start',behavior:'instant'})},[b?.id]);
 return <BookSheet opened={!!current} onClose={onClose} covered={covered}>
  {b&&<Stack gap="xl" pb="xl" key={b.id} className="detail-content" inert={!current||undefined}>
   <div ref={topRef} className="detail-top">{hasBack&&<Button variant="subtle" leftSection={<IconArrowLeft size={18}/>} onClick={onBack}>Önceki kitaba dön</Button>}</div>
   <div className="detail-hero"><div className="detail-cover-block"><BookCover key={b.id} book={b} detail read={(states[b.id]||[]).includes('okundu')}/><div className="cover-marks"><StateRibbons marks={states[b.id]||[]}/></div></div>
    <div className="detail-heading"><Title order={2}>{shownTitle}</Title><StateSummary marks={states[b.id]||[]}/><Text className="detail-author">{b.author||'Yazar bilgisi belirtilmemiş'}</Text>{originalTitle&&<Text className="detail-original">{originalTitle}</Text>}<DataList orientation="horizontal" className="detail-facts">{[['İlk yayın',b.years.join(', ')],['Önerilen yaş',b.childAge],['Kitaplığa eklendi',formatDay(b.addedAt)]].filter(([,value])=>value).map(([label,value])=><DataList.Item key={label}><DataList.ItemLabel>{label}</DataList.ItemLabel><DataList.ItemValue>{value}</DataList.ItemValue></DataList.Item>)}</DataList><div className="detail-translation-status"><TranslationStatus book={b}/></div>
     <Group gap={8} mt="md">{b.categories.map(id=><CategoryPill key={id} id={id} label={categoryMap[id].label} onNavigate={onCategory}/>)}</Group>
     {b.cover&&<div className="cover-caption"><Text c="dimmed">{b.cover.scope||(b.cover.language==='tr'?'Türkçe baskı kapağı':'Uluslararası baskı kapağı')}</Text><Anchor href={b.cover.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Kapaktaki baskıyı incele <IconArrowUpRight size={17}/></Anchor></div>}
    </div>
   </div>
   <Paper withBorder radius="lg" className="detail-actions"><Group gap={8}>{Object.entries(STATE_LABELS).filter(([key])=>['onemli','alinacak','alindi'].includes(key)).map(([key,label])=><Button variant={(states[b.id]||[]).includes(key)?'filled':'light'} key={key} aria-pressed={(states[b.id]||[]).includes(key)} onClick={e=>onToggle(b.id,key,e.currentTarget)} leftSection={(states[b.id]||[]).includes(key)?<IconCheck size={17}/>:null}>{label}</Button>)}</Group><QueueButton id={b.id} queue={personal.queue} onAdd={onAdd} onQueue={onQueue}/><SyncStatusLine sync={sync} onOpen={onSync}/></Paper>
   <ReadingJourney record={personal.reading[b.id]}/>
   {b.childCaution&&<Alert title="Ebeveyn notu" className="child-caution sync-alert" data-tone="warning">{b.childCaution}</Alert>}
   <EditionSummary book={b}/>
   <ReadingPurpose book={b} catalog={catalog}/>
   <BookDiscovery key={b.id} book={b} catalog={catalog} states={states} onOpen={onOpen} onCategory={onCategory} onCollection={onCollection} BookCover={ThumbCover}/>
   <EditionGuide book={b}/>
   <Accordion multiple variant="separated" radius="lg" className="detail-sections">
    <Accordion.Item value="personal"><Accordion.Control>Okuma kaydım ve kişisel notlarım</Accordion.Control><Accordion.Panel><ReadingPanel book={b} record={personal.reading[b.id]} states={states[b.id]||[]} onToggle={onToggle} onChange={onReading} queue={personal.queue} onAdd={onAdd} onQueue={onQueue} storageError={storageError}/></Accordion.Panel></Accordion.Item>
    <Accordion.Item value="sources"><Accordion.Control>Kaynaklar ve küme üyelikleri · {b.collectionIds.length}</Accordion.Control><Accordion.Panel><Stack gap="md"><Group gap={8}>{b.origins.map(id=><SourceBadge id={id} key={id}/>)}</Group>
     {b.notes.map((n,i)=><Box className="note-block" key={i}><Spoiler className="detail-note" maxHeight={132} showLabel="Devamını göster" hideLabel="Kısalt"><Text>{n.text}</Text></Spoiler><Text c="dimmed" mt={6}>{n.source}</Text></Box>)}
     {b.collectionIds.map(id=>{const memberships=b.memberships.filter(m=>m.collectionId===id);return <div key={id} className="membership"><Button variant="subtle" className="membership-link" onClick={()=>onCollection(id)} rightSection={<IconArrowRight size={18}/>}>{collectionMap[id].title}</Button><Text c="dimmed" mt="sm">{[...new Set(memberships.map(m=>groupMap[m.groupId].title))].join(' · ')}</Text>{memberships.filter(m=>m.award).map(m=><Badge key={m.groupId} mt="sm">{m.awardYear} · {m.award}</Badge>)}{[...new Set(memberships.map(m=>m.role).filter(Boolean))].map(role=><Badge key={role} mt="sm" variant="light">{role}</Badge>)}{memberships.find(m=>m.source)&&<Anchor className="source-link" href={memberships.find(m=>m.source).source} target="_blank" rel="noreferrer">Özgün kaynağı aç <IconArrowUpRight size={17}/></Anchor>}</div>})}
     {b.tags.length>0&&<Text c="dimmed">Kaynak dosyanın etiketleri: {b.tags.map(t=>catalog.sourceTags[t]).join(' · ')}.</Text>}
    </Stack></Accordion.Panel></Accordion.Item>
   </Accordion>
   <ReadingPriorityCard ranking={ranking}/>
  </Stack>}
  {current&&feedback}
 </BookSheet>
}
