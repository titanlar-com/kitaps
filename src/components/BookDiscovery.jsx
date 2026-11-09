import React,{useState} from 'react';
import { Accordion, Anchor, Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { readingGuide, relatedBooks } from '../recommendations';
import { RELATED_STEP, bookDiscoveryScreen, readingPurposeScreen, relatedCardScreen } from '../screens/book.js';
import WrappingSelect from './WrappingSelect';

function RelatedCard({book,reason='',onOpen,BookCover,states}) {
 const model=relatedCardScreen({book,marks:states[book.id]||[]});
 return <Paper component="article" withBorder p="md" radius="md" className="related-card" onClick={e=>{if(!(e.target instanceof Element&&e.target.closest('button,a,input,select,textarea,[role="button"]')))onOpen(book.id)}}>
  <div className="related-book"><div className="related-cover"><BookCover book={book} onOpen={onOpen} read={model.read}/></div><div><Title order={4}><button className="title-button" onClick={()=>onOpen(book.id)}>{model.title}</button></Title><Text c="dimmed" mt="xs">{book.author}</Text><Group gap={6} mt="xs">{model.badges.map(badge=><Badge key={badge}>{badge}</Badge>)}</Group></div></div>
  {reason&&<Text mt="md" className="recommendation-reason">{reason}</Text>}
 </Paper>;
}
export function ReadingPurpose({book,catalog}) {
 const model=readingPurposeScreen({book,guide:readingGuide(book,catalog)});
 return <Paper withBorder p="lg" radius="lg" className="purpose-panel"><Text className="eyebrow">{model.eyebrow}</Text><Title order={3}>{model.title}</Title>{model.meaning&&<Text className="turkish-meaning" mt="sm"><strong>{model.meaning.label}</strong> {model.meaning.text}</Text>}<Text mt="md">{model.purpose}</Text><Text c="dimmed" mt="sm">{model.kind}</Text>{model.sources.map(s=><Anchor key={s.url} href={s.url} target="_blank" rel="noreferrer" className="source-link">{s.label}</Anchor>)}</Paper>;
}
export default function BookDiscovery({book,catalog,states,onOpen,onCategory,onCollection,BookCover}) {
 const guide=readingGuide(book,catalog);
 const [scope,setScope]=useState('category|'+guide.route.category);
 const [visible,setVisible]=useState(RELATED_STEP);
 const matches=relatedBooks(book,catalog,scope,states);
 const [type,id]=scope.split('|');
 const model=bookDiscoveryScreen({book,catalog,guide,matches,scope,visible});
 const openAll=()=>type==='category'?onCategory(id):onCollection(id);
 const linked=(item)=><RelatedCard key={item.id} book={catalog.books.find(b=>b.id===item.id)} reason={item.reason} onOpen={onOpen} BookCover={BookCover} states={states}/>;
 return <Stack gap="xl" className="discovery-panel">
  <div><Title order={3}>{model.route.title}</Title><Text c="dimmed" mt="sm">{model.route.intro}</Text></div>
  <Accordion multiple defaultValue={['before','after']} variant="separated" radius="md">
   {model.phases.map(phase=><Accordion.Item key={phase.value} value={phase.value}><Accordion.Control>{phase.title}</Accordion.Control><Accordion.Panel>{phase.links.length?<Stack gap="md">{phase.links.map(linked)}</Stack>:<Text>{phase.empty}</Text>}</Accordion.Panel></Accordion.Item>)}
  </Accordion>
  <div><Title order={3}>{model.heading}</Title><Text mt="sm" c="dimmed">{model.headingNote}</Text></div>
  <WrappingSelect label={model.scope.label} data={model.scope.options} value={scope} onChange={v=>{setScope(v);setVisible(RELATED_STEP)}}/>
  <Text role="status" c="dimmed">{model.status}</Text>
  <div className="related-grid">{model.shown.map(b=><RelatedCard key={b.id} book={b} onOpen={onOpen} BookCover={BookCover} states={states}/>)}</div>
  {model.empty&&<Text>{model.empty}</Text>}
  <Group gap="sm">{model.more&&<Button variant="light" onClick={()=>setVisible(v=>v+RELATED_STEP)}>{model.more}</Button>}<Button variant="default" onClick={openAll}>{model.openAll}</Button></Group>
 </Stack>;
}
