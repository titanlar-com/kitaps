// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { useEffect, useRef, useState } from 'react';
import { Accordion, Alert, Anchor, Badge, Box, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconArrowUpRight, IconCheck } from '@tabler/icons-react';
import ReadingPanel, { QueueButton } from '../components/ReadingPanel';
import ReadingJourney from '../components/ReadingJourney';
import { FoldedNote } from '../components/FoldedNote';
import { DataList } from './dataList';
import './BookDetail.css';
import BookDiscovery, { ReadingPurpose } from '../components/BookDiscovery';
import EditionGuide from '../components/EditionGuide';
import TranslationStatus from '../components/TranslationStatus';
import CategoryPill from '../components/CategoryPill';
import EditionSummary from '../components/EditionSummary';
import BookSheet from '../components/BookSheet';
import ReadingPriorityCard from '../components/ReadingPriorityCard';
import StateRibbons, { StateSummary } from '../components/StateRibbons';
import SyncStatusLine from '../components/SyncStatusLine';
import SourceBadge from '../components/SourceBadge';
import { formatDay } from '../library';
import { bookDetailScreen } from '../screens/book.js';
import { catalog, collectionMap, groupMap, categoryMap } from './catalogData';
import { BookCover, ThumbCover } from './BookCover';

export function BookDetail({book:current,ranking:currentRanking,onClose,onOpen,onBack,hasBack,states,onToggle,onCollection,onCategory,personal,onReading,onAdd,onQueue,storageError,feedback,sync,onSync,covered}) {
 // Closing changes the address at once; the pages stay, closed to the reader, until the sheet has gone (ADR 004, K6).
 const [last,setLast]=useState(null);
 if(current&&(last?.book!==current||last?.ranking!==currentRanking))setLast({book:current,ranking:currentRanking});
 const b=current??last?.book,ranking=current?currentRanking:last?.ranking;
 const topRef=useRef(null);
 const marks=b?states[b.id]||[]:[];
 const model=b?bookDetailScreen({book:b,marks,catalog,collections:collectionMap,groups:groupMap,formatDay}):null;
 useEffect(()=>{if(b)topRef.current?.scrollIntoView({block:'start',behavior:'instant'})},[b?.id]);
 return <BookSheet opened={!!current} onClose={onClose} covered={covered}>
  {b&&<Stack gap="xl" pb="xl" key={b.id} className="detail-content" inert={!current||undefined}>
   <div ref={topRef} className="detail-top">{hasBack&&<Button variant="subtle" leftSection={<IconArrowLeft size={18}/>} onClick={onBack}>{model.back}</Button>}</div>
   <div className="detail-hero"><div className="detail-cover-block"><BookCover key={b.id} book={b} detail read={marks.includes('okundu')}/><div className="cover-marks"><StateRibbons marks={marks}/></div></div>
    <div className="detail-heading"><Title order={2}>{model.title}</Title><StateSummary marks={marks}/><Text className="detail-author">{model.author}</Text>{model.originalTitle&&<Text className="detail-original">{model.originalTitle}</Text>}<DataList orientation="horizontal" className="detail-facts">{model.facts.map(fact=><DataList.Item key={fact.label}><DataList.ItemLabel>{fact.label}</DataList.ItemLabel><DataList.ItemValue>{fact.value}</DataList.ItemValue></DataList.Item>)}</DataList><div className="detail-translation-status"><TranslationStatus book={b}/></div>
     <Group gap={8} mt="md">{b.categories.map(id=><CategoryPill key={id} id={id} label={categoryMap[id].label} onNavigate={onCategory}/>)}</Group>
     {model.coverCaption&&<div className="cover-caption"><Text c="dimmed">{model.coverCaption.text}</Text><Anchor href={model.coverCaption.link.href} target="_blank" rel="noreferrer" className="source-link">{model.coverCaption.link.text} <IconArrowUpRight size={17}/></Anchor></div>}
    </div>
   </div>
   <Paper withBorder radius="lg" className="detail-actions"><Group gap={8}>{model.marks.map(mark=><Button variant={mark.pressed?'filled':'light'} key={mark.key} aria-pressed={mark.pressed} onClick={e=>onToggle(b.id,mark.key,e.currentTarget)} leftSection={mark.pressed?<IconCheck size={17}/>:null}>{mark.label}</Button>)}</Group><QueueButton id={b.id} queue={personal.queue} onAdd={onAdd} onQueue={onQueue}/><SyncStatusLine sync={sync} onOpen={onSync}/></Paper>
   <ReadingJourney record={personal.reading[b.id]}/>
   {model.childCaution&&<Alert title={model.childCaution.title} className="child-caution sync-alert" data-tone="warning">{model.childCaution.text}</Alert>}
   <EditionSummary book={b}/>
   <ReadingPurpose book={b} catalog={catalog}/>
   <BookDiscovery key={b.id} book={b} catalog={catalog} states={states} onOpen={onOpen} onCategory={onCategory} onCollection={onCollection} BookCover={ThumbCover}/>
   <EditionGuide book={b}/>
   <Accordion multiple variant="separated" radius="lg" className="detail-sections">
    <Accordion.Item value="personal"><Accordion.Control>{model.sections.personal}</Accordion.Control><Accordion.Panel><ReadingPanel book={b} record={personal.reading[b.id]} states={states[b.id]||[]} onToggle={onToggle} onChange={onReading} queue={personal.queue} onAdd={onAdd} onQueue={onQueue} storageError={storageError}/></Accordion.Panel></Accordion.Item>
    <Accordion.Item value="sources"><Accordion.Control>{model.sections.sources}</Accordion.Control><Accordion.Panel><Stack gap="md"><Group gap={8}>{b.origins.map(id=><SourceBadge id={id} key={id}/>)}</Group>
     {b.notes.map((n,i)=><Box className="note-block" key={i}><FoldedNote className="detail-note" fold={132} showLabel={model.note.show} hideLabel={model.note.hide}><Text>{n.text}</Text></FoldedNote><Text c="dimmed" mt={6}>{n.source}</Text></Box>)}
     {model.memberships.map(membership=><div key={membership.id} className="membership"><Button variant="subtle" className="membership-link" onClick={()=>onCollection(membership.id)} rightSection={<IconArrowRight size={18}/>}>{membership.title}</Button><Text c="dimmed" mt="sm">{membership.groups}</Text>{membership.awards.map(award=><Badge key={award.key} mt="sm">{award.text}</Badge>)}{membership.roles.map(role=><Badge key={role} mt="sm" variant="light">{role}</Badge>)}{membership.source&&<Anchor className="source-link" href={membership.source.href} target="_blank" rel="noreferrer">{membership.source.text} <IconArrowUpRight size={17}/></Anchor>}</div>)}
     {model.tags&&<Text c="dimmed">{model.tags}</Text>}
    </Stack></Accordion.Panel></Accordion.Item>
   </Accordion>
   <ReadingPriorityCard ranking={ranking}/>
  </Stack>}
  {current&&feedback}
 </BookSheet>
}
