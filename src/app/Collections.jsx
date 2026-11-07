// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { useState } from 'react';
import { Accordion, Anchor, Box, Button, Group, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { IconArrowRight, IconArrowUpRight, IconChevronRight, IconSearch } from '@tabler/icons-react';
import catalog from '../catalog.json';
import { normalize, booksForShelf } from '../library';
import { books, groupMap } from './catalogData';

export function Collections({onCollection,onGroup,states}) {
 const [query,setQuery]=useState('');
 const available=booksForShelf(books,states);
 const collectionCount=id=>available.filter(b=>b.collectionIds.includes(id)).length;
 const groupCount=id=>available.filter(b=>b.groupIds.includes(id)).length;
 const shown=catalog.collections.filter(c=>normalize(c.title+' '+c.description).includes(normalize(query)));
 return <Stack gap="xl">
  <TextInput label="Kümeler arasında ara" placeholder="TIME, çocuk, strateji…" value={query} onChange={e=>setQuery(e.currentTarget.value)} leftSection={<IconSearch size={20}/>}/>
  <Accordion variant="separated" radius="lg" className="collections-accordion">{shown.map(c=><Accordion.Item key={c.id} value={c.id}>
   <Accordion.Control><Group gap="md"><ThemeIcon variant="light" size={48} color={c.origin==='kitaps'?'grape':'brand'} radius="md"><Text fw={600}>{c.mark}</Text></ThemeIcon><div className="collection-summary"><Text fw={600}>{c.title}</Text><Text c="dimmed">{collectionCount(c.id)} kitap · {c.count} kaynak kaydı · {c.groupIds.length} alt küme</Text></div></Group></Accordion.Control>
   <Accordion.Panel><Stack gap="md"><Text>{c.description}</Text>{c.context?.purpose&&<Text><strong>Okuma amacı:</strong> {c.context.purpose}</Text>}{c.context?.criterion&&<Text><strong>Seçim ölçütü:</strong> {c.context.criterion}</Text>}{c.context?.verdict&&<Box className="note-block"><Text>{c.context.verdict}</Text></Box>}<Text c="dimmed">{c.note}</Text><Button className="collection-books-button" onClick={()=>onCollection(c.id)} rightSection={<IconArrowRight size={18}/>}>Bu kümedeki kitaplar</Button><Stack gap={8}>{c.groupIds.map(id=><Button key={id} variant="default" onClick={()=>onGroup(c.id,id)} className="subset-button" justify="space-between" rightSection={<IconChevronRight size={19}/>}>{groupMap[id].title} · {groupCount(id)}</Button>)}</Stack>{c.source&&<Anchor href={c.source} target="_blank" rel="noreferrer">Özgün liste <IconArrowUpRight size={16}/></Anchor>}</Stack></Accordion.Panel>
  </Accordion.Item>)}</Accordion>{!shown.length&&<Text>Bu aramayla eşleşen küme yok.</Text>}
 </Stack>
}
