import React from 'react';
import { Accordion, Alert, Anchor, Badge, Paper, Stack, Text, Title } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { formatDay } from '../library';
import { editionGuideScreen } from '../screens/book.js';

export default function EditionGuide({book}) {
 const model=editionGuideScreen({book,formatDay});
 if(!model)return null;
 const {edition:e,missing,archive}=model;
 return <section className="edition-guide" aria-label={model.label}>
  <Title order={3} mb="md">{model.title}</Title>
  <Accordion variant="separated"><Accordion.Item value="edition"><Accordion.Control>{model.sourcesTitle}</Accordion.Control><Accordion.Panel>{e?<Paper withBorder p="lg" radius="lg">
   <Badge color={e.badge.confirmed?'brand':'orange'}>{e.badge.text}</Badge>
   <Title order={4} mt="md">{e.translators}</Title>
   <Text mt="sm">{e.work}</Text>{e.isbn&&<Text c="dimmed" mt="xs">{e.isbn}</Text>}
   {e.lines.map(line=><Text key={line} mt="sm">{line}</Text>)}
   <Text c="dimmed" mt="sm">{e.cover}</Text>
   {e.correction&&<Alert mt="md" color="orange" title={e.correction.title}>{e.correction.text}</Alert>}
   {e.note&&<Text mt="md">{e.note}</Text>}
   {e.links.map(link=><Anchor key={link.text} className="source-link" href={link.href} target="_blank" rel="noreferrer">{link.text} <IconArrowUpRight size={18}/></Anchor>)}
   <Text c="dimmed" mt="sm">{e.checked}</Text>
  </Paper>:<Paper withBorder p="lg" radius="lg"><Badge color="gray">{missing.badge}</Badge><Text mt="md">{missing.body}</Text>{missing.coverLink&&<Anchor className="source-link" href={missing.coverLink.href} target="_blank" rel="noreferrer">{missing.coverLink.text} <IconArrowUpRight size={18}/></Anchor>}</Paper>}</Accordion.Panel></Accordion.Item></Accordion>
  {archive&&<Accordion variant="separated" mt="md"><Accordion.Item value="archive"><Accordion.Control>{archive.title}</Accordion.Control><Accordion.Panel><Text c="dimmed" mb="md">{archive.intro}</Text><Stack gap="md">{archive.items.map((old,i)=><Paper withBorder p="md" key={i}><Text fw={600}>{old.translator}</Text><Text>{old.publisher}</Text>{old.note&&<Text mt="sm">{old.note}</Text>}{old.alt&&<Text mt="sm">{old.alt}</Text>}</Paper>)}</Stack></Accordion.Panel></Accordion.Item></Accordion>}
 </section>;
}
