import React from 'react';
import { Alert,Anchor,Button,Group,Paper,Text,Title } from '@mantine/core';
import { IconShoppingBag,IconPhoto,IconArrowUpRight,IconSchool } from '@tabler/icons-react';
import { pageCount } from '../pages';
import { editionSummaryScreen } from '../screens/book.js';

const Facts=({facts})=><dl className="edition-facts">
 {facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
</dl>;

/** An article or essay has no edition to buy: its page says where it appeared
 * and links to the text, or to its DOI record when the text is not free. */
function PublicationSummary({model}){
 return <Paper component="section" withBorder radius="lg" p="lg" className="edition-summary" aria-label={model.label}>
  <Title order={3} mb="md">{model.title}</Title>
  <Facts facts={model.facts}/>
  <Text c="dimmed" mt="md">{model.note}</Text>
  {model.links.map(link=><Anchor key={link.text} href={link.href} target="_blank" rel="noreferrer" className="source-link">{link.text} <IconArrowUpRight size={18}/></Anchor>)}
  {model.scholar&&<Group gap="sm" mt="lg" className="book-shopping-links"><Button component="a" href={`https://scholar.google.com/scholar?${new URLSearchParams({q:model.scholar.query})}`} target="_blank" rel="noreferrer" variant="light" leftSection={<IconSchool size={20}/>}>{model.scholar.text}</Button></Group>}
 </Paper>;
}

export default function EditionSummary({book}){
 const model=editionSummaryScreen({book,pages:pageCount(book)});
 if(model.kind==='publication')return <PublicationSummary model={model}/>;
 const params=new URLSearchParams({q:model.shopping.query});
 return <Paper component="section" withBorder radius="lg" p="lg" className="edition-summary" aria-label={model.label}>
  <Title order={3} mb="md">{model.title}</Title>{model.issue&&<Alert color="orange" title={model.issue.title} mb="md">{model.issue.text}</Alert>}
  <Facts facts={model.facts}/>
  {model.evidence&&<Text className="edition-evidence" mt="md">{model.evidence}</Text>}
  {model.pageSource&&<Text c="dimmed" mt="sm">{model.pageSource.before} <Anchor href={model.pageSource.link.href} target="_blank" rel="noreferrer">{model.pageSource.link.text}</Anchor> {model.pageSource.after}</Text>}
  {model.translatorNote&&<Text c="dimmed" mt="sm">{model.translatorNote}</Text>}
  {model.statusNote&&<Text c="dimmed" mt="md">{model.statusNote}</Text>}
  {model.sourceLink&&<Anchor href={model.sourceLink.href} target="_blank" rel="noreferrer" className="source-link">{model.sourceLink.text} <IconArrowUpRight size={18}/></Anchor>}
  <Group gap="sm" mt="lg" className="book-shopping-links">
   <Button component="a" href={`https://www.google.com/search?tbm=shop&${params}`} target="_blank" rel="noreferrer" variant="light" leftSection={<IconShoppingBag size={20}/>}>{model.shopping.google}</Button>
   <Button component="a" href={`https://www.google.com/search?tbm=isch&${params}`} target="_blank" rel="noreferrer" variant="light" leftSection={<IconPhoto size={20}/>}>{model.shopping.images}</Button>
   {model.amazon&&<Button component="a" href={`https://www.amazon.com/s?${new URLSearchParams({k:model.amazon.query})}`} target="_blank" rel="noreferrer" variant="default" rightSection={<IconArrowUpRight size={18}/>}>{model.amazon.text}</Button>}
  </Group>
 </Paper>;
}
