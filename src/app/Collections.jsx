import {useRef, useMemo, useState } from 'react';
import { Accordion, Anchor, Avatar, Badge, Box, Button, Card, Group, Progress, SimpleGrid, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { IconArrowRight, IconArrowUpRight, IconBook2, IconChevronRight, IconLayersIntersect, IconSearch } from '@tabler/icons-react';
import catalog from '../catalog.json';
import { collectionCards, sharePercent } from '../core/catalog/collections';
import EmptyState from '../components/EmptyState';
import { smallCover } from './BookCover';
import { books, groupMap } from './catalogData';
import './Collections.css';

// The single-file export carries one embedded copy of each cover (see BookCover).
const coverSrc=cover=>globalThis.__KITAP_COVERS__?.[cover.src]||`./${smallCover(cover.src)}`;
// A count says how many, a sentence says what it means: the bar and the share repeat it for the eye.
const readSentence=({read,total,done})=>done?`${total} kitabın tamamı okundu.`:read?`${total} kitaptan ${read} tanesi okundu.`:'Bu kümeden henüz okunan kitap yok.';

function CollectionCard({card,onCollection,onGroup}){
 const {collection:c,total,previews,share,done,groups}=card;
 return <Card className="collection-card" padding={0}><Accordion.Item value={c.id}>
  {previews.length>0&&<Avatar.Group className="collection-covers" aria-hidden="true">{previews.map(book=><Avatar key={book.id} src={coverSrc(book.cover)} alt="" imageProps={{loading:'lazy',decoding:'async'}}><IconBook2 size={20}/></Avatar>)}</Avatar.Group>}
  <Accordion.Control><Group gap="md"><ThemeIcon variant="light" size={48} radius="md" aria-hidden="true"><Text fw={600}>{c.mark}</Text></ThemeIcon><div className="collection-summary"><Text fw={600}>{c.title}</Text><Text c="dimmed" className="collection-meta tabular-nums">{total} kitap, {groups.length} alt küme</Text></div></Group></Accordion.Control>
  <div className="collection-read">
   <div className="collection-read-line"><Text c="dimmed" className="collection-read-text tabular-nums">{readSentence(card)}</Text><span className="collection-read-share tabular-nums">{sharePercent(share)}</span></div>
   <Progress value={Number((share*100).toFixed(1))} size="sm" color={done?'var(--tone-read)':undefined} aria-label={`${c.title}: okunan oranı`}/>
   <Button className="collection-books-button" variant="light" onClick={()=>onCollection(c.id)} rightSection={<IconArrowRight size={18}/>} aria-label={`Bu kümedeki kitaplar: ${c.title}`}>Bu kümedeki kitaplar</Button>
  </div>
  <Accordion.Panel><Stack gap="md">
   {c.tag&&<Group gap={6}><Badge>{c.tag}</Badge>{done&&<Badge>Tamamlandı</Badge>}</Group>}
   <Text>{c.description}</Text>
   {c.context?.purpose&&<Text><strong>Okuma amacı:</strong> {c.context.purpose}</Text>}
   {c.context?.criterion&&<Text><strong>Seçim ölçütü:</strong> {c.context.criterion}</Text>}
   {c.context?.verdict&&<Box className="note-block"><Text>{c.context.verdict}</Text></Box>}
   <Text c="dimmed">{c.note}</Text>
   <Text c="dimmed" className="tabular-nums">Kaynak listesinde {c.count} kayıt var.</Text>
   <Stack gap={8}>{groups.map(group=><Button key={group.id} variant="default" onClick={()=>onGroup(c.id,group.id)} className="subset-button" justify="space-between" rightSection={<IconChevronRight size={19}/>} aria-label={`${group.title}: ${group.count} kitap`}><span>{group.title}</span> <span className="subset-count tabular-nums">{group.count}</span></Button>)}</Stack>
   {c.source&&<Anchor href={c.source} target="_blank" rel="noreferrer">Özgün liste <IconArrowUpRight size={16}/></Anchor>}
  </Stack></Accordion.Panel>
 </Accordion.Item></Card>;
}

export function Collections({onCollection,onGroup,states}) {
 const [query,setQuery]=useState('');
 const search=useRef(null);
 const cards=useMemo(()=>collectionCards({collections:catalog.collections,books,states,groups:groupMap,query}),[states,query]);
 return <Stack gap="lg">
  <TextInput ref={search} label="Kümeler arasında ara" placeholder="TIME, çocuk, strateji…" value={query} onChange={e=>setQuery(e.currentTarget.value)} leftSection={<IconSearch size={20}/>}/>
  <Text c="dimmed" className="collection-count tabular-nums" role="status">{cards.length} küme bulundu.</Text>
  {cards.length>0?<Accordion className="collections-accordion" order={2}><SimpleGrid type="container" cols={{base:1,'38rem':2,'60rem':3}} spacing="md" className="collections-grid">{cards.map(card=><CollectionCard key={card.collection.id} card={card} onCollection={onCollection} onGroup={onGroup}/>)}</SimpleGrid></Accordion>
  :<EmptyState icon={IconLayersIntersect} title="Bu aramayla eşleşen küme yok." action={<Button variant="light" onClick={()=>{setQuery('');search.current?.focus()}}>Aramayı temizle</Button>}>Başka bir kelime deneyebilir ya da aramayı temizleyip bütün kümelere dönebilirsin.</EmptyState>}
 </Stack>;
}
