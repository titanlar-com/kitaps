import {useRef, useMemo, useState } from 'react';
import { Accordion, Anchor, Avatar, Badge, Box, Button, Card, Group, Progress, SimpleGrid, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { IconArrowRight, IconArrowUpRight, IconBook2, IconChevronRight, IconLayersIntersect, IconSearch } from '@tabler/icons-react';
import { collectionCards } from '../../../core/catalog/collections';
import { collectionsScreen } from '../../../screens/collections.js';
import EmptyState from '../components/EmptyState';
import { smallCover } from './BookCover';
import { catalog, books, groupMap } from './catalogData';
import './Collections.css';

// The single-file export carries one embedded copy of each cover (see BookCover).
const coverSrc=cover=>globalThis.__KITAP_COVERS__?.[cover.src]||`./${smallCover(cover.src)}`;
function CollectionCard({card,onCollection,onGroup}){
 return <Card className="collection-card" padding={0}><Accordion.Item value={card.id}>
  {card.previews.length>0&&<Avatar.Group className="collection-covers" aria-hidden="true">{card.previews.map(book=><Avatar key={book.id} src={coverSrc(book.cover)} alt="" imageProps={{loading:'lazy',decoding:'async'}}><IconBook2 size={20}/></Avatar>)}</Avatar.Group>}
  <Accordion.Control><Group gap="md"><ThemeIcon variant="light" size={48} radius="md" aria-hidden="true"><Text fw={600}>{card.mark}</Text></ThemeIcon><div className="collection-summary"><Text fw={600}>{card.title}</Text><Text c="dimmed" className="collection-meta tabular-nums">{card.meta}</Text></div></Group></Accordion.Control>
  <div className="collection-read">
   <div className="collection-read-line"><Text c="dimmed" className="collection-read-text tabular-nums">{card.readSentence}</Text><span className="collection-read-share tabular-nums">{card.share}</span></div>
   <Progress value={card.percent} size="sm" color={card.done?'var(--tone-read)':undefined} aria-label={card.progressLabel}/>
   <Button className="collection-books-button" variant="light" onClick={()=>onCollection(card.id)} rightSection={<IconArrowRight size={18}/>} aria-label={card.booksButton.label}>{card.booksButton.text}</Button>
  </div>
  <Accordion.Panel><Stack gap="md">
   {card.badges.length>0&&<Group gap={6}>{card.badges.map(badge=><Badge key={badge}>{badge}</Badge>)}</Group>}
   <Text>{card.description}</Text>
   {card.context.map(line=><Text key={line.label}><strong>{line.label}</strong> {line.text}</Text>)}
   {card.verdict&&<Box className="note-block"><Text>{card.verdict}</Text></Box>}
   <Text c="dimmed">{card.note}</Text>
   {card.sourceCount&&<Text c="dimmed" className="tabular-nums">{card.sourceCount}</Text>}
   <Stack gap={8}>{card.groups.map(group=><Button key={group.id} variant="default" onClick={()=>onGroup(card.id,group.id)} className="subset-button" justify="space-between" rightSection={<IconChevronRight size={19}/>} aria-label={group.label}><span>{group.title}</span> <span className="subset-count tabular-nums">{group.count}</span></Button>)}</Stack>
   {card.sourceLink&&<Anchor href={card.sourceLink.href} target="_blank" rel="noreferrer">{card.sourceLink.text} <IconArrowUpRight size={16}/></Anchor>}
  </Stack></Accordion.Panel>
 </Accordion.Item></Card>;
}

export function Collections({onCollection,onGroup,states}) {
 const [query,setQuery]=useState('');
 const search=useRef(null);
 const model=useMemo(()=>collectionsScreen({cards:collectionCards({collections:catalog.collections,books,states,groups:groupMap,query})}),[states,query]);
 return <Stack gap="lg">
  <TextInput ref={search} label={model.search.label} placeholder={model.search.placeholder} value={query} onChange={e=>setQuery(e.currentTarget.value)} leftSection={<IconSearch size={20}/>}/>
  <Text c="dimmed" className="collection-count tabular-nums" role="status">{model.status}</Text>
  {model.empty?<EmptyState icon={IconLayersIntersect} title={model.empty.title} action={<Button variant="light" onClick={()=>{setQuery('');search.current?.focus()}}>{model.empty.clear}</Button>}>{model.empty.body}</EmptyState>
  :<Accordion className="collections-accordion" order={2}><SimpleGrid type="container" cols={{base:1,'38rem':2,'60rem':3}} spacing="md" className="collections-grid">{model.cards.map(card=><CollectionCard key={card.id} card={card} onCollection={onCollection} onGroup={onGroup}/>)}</SimpleGrid></Accordion>}
 </Stack>;
}
