import React from 'react';
import { Button, ScrollArea, Table, Text, Title } from '@mantine/core';
import { IconExternalLink, IconMapPin, IconPhone } from '@tabler/icons-react';
import data from '../../../../data/bookstores.json';
import { bookstoresScreen } from '../../../screens/bookstores.js';
import { FactList, LongNote, PlaceBadge, PlaceCard, StopTimeline } from './PlaceParts';
import RoutePlanner from './RoutePlanner';
import './BookstoresPage.css';
import { longDay } from '../../../dates.js';

// Istanbul bookstores from the owner's research notes, with the routes walked (data/bookstores.json).
const byId = Object.fromEntries(data.stores.map(store => [store.id, store]));
const model = bookstoresScreen({ data, longDay });

const opens = { target: '_blank', rel: 'noopener noreferrer' };
const NewTab = () => <span className="visually-hidden">{model.newTab}</span>;

// A link to a store's entry further down the page. The app reads the address hash as a route, so
// the link scrolls and moves focus itself instead of changing the hash.
function StoreLink({ id }) {
 const show = event => {
  const heading = document.getElementById(`store-${id}`)?.querySelector('h3');
  if (!heading) return;
  event.preventDefault();
  heading.scrollIntoView({ block: 'start' });
  heading.focus({ preventScroll: true });
 };
 return <a href={`#store-${id}`} onClick={show}>{byId[id].name}</a>;
}

function MapButton({ map }) {
 return <Button component="a" href={map.href} {...opens} variant="default" leftSection={<IconMapPin size={18} aria-hidden="true" />}>{map.text}<NewTab /></Button>;
}

function Store({ card }) {
 const facts = card.facts.map(fact => ({ label: fact.label, value: fact.href ? <a href={fact.href}>{fact.value}</a> : fact.value }));
 return <PlaceCard component="article" id={`store-${card.id}`} className="bookstore" data-status={card.status}>
  <div className="bookstore-head">
   <Title order={3} tabIndex={-1}>{card.name}</Title>
   <PlaceBadge badge={card.badge} />
  </div>
  <Text className="bookstore-place">{card.place}</Text>
  <LongNote title={card.name}>
   <Text>{card.about}</Text>
   {card.caution && <Text className="bookstore-caution"><strong>{card.caution.label}</strong> {card.caution.text}</Text>}
  </LongNote>
  <FactList facts={facts} />
  {card.lookFor && <div className="bookstore-look">
   <Text className="bookstore-label">{card.lookFor.label}</Text>
   <ul>{card.lookFor.titles.map(title => <li key={title}>{title}</li>)}</ul>
  </div>}
  {card.actions && <div className="bookstore-actions">
   <MapButton map={card.actions.map} />
   {card.actions.call && <Button component="a" href={card.actions.call.href} variant="subtle" leftSection={<IconPhone size={18} aria-hidden="true" />}>{card.actions.call.text}</Button>}
   {card.actions.web && <Button component="a" href={card.actions.web.href} {...opens} variant="subtle" leftSection={<IconExternalLink size={18} aria-hidden="true" />}>{card.actions.web.text}<NewTab /></Button>}
  </div>}
  {card.sources && <Text className="bookstore-sources">{card.sources.label}{card.sources.links.map(source => <React.Fragment key={source.url}>
   {source.before}<a href={source.url} {...opens}>{source.label}<NewTab /></a>
  </React.Fragment>)}</Text>}
 </PlaceCard>;
}

export default function BookstoresPage() {
 return <div className="bookstores-page">
  <header className="bookstores-intro">
   <Title order={1}>{model.intro.title}</Title>
   <Text>{model.intro.body}</Text>
   <Text className="bookstores-updated">{model.intro.updated}</Text>
  </header>

  <section className="bookstore-plan" aria-labelledby="bookstore-plan">
   <Title order={2} id="bookstore-plan">{model.plan.title}</Title>
   <Text>{model.plan.body}</Text>
   <div className="bookstore-visits">{model.plan.visits.map(visit => <PlaceCard key={visit.id} component="article" className="bookstore-visit" data-suggested={visit.suggested || undefined} aria-labelledby={`visit-${visit.id}`}>
    <div className="bookstore-head">
     <Title order={3} id={`visit-${visit.id}`}>{visit.title}</Title>
     <PlaceBadge badge={visit.badge} />
    </div>
    <Text>{visit.note}</Text>
    <StopTimeline className="bookstore-stops" stops={visit.stops}>{stop => <div className="bookstore-stop">
     <div className="bookstore-stop-text">
      <Title order={4}><StoreLink id={stop.id} /></Title>
      <Text className="bookstore-place">{stop.place}</Text>
      <Text>{stop.address}</Text>
     </div>
     <MapButton map={stop.map} />
    </div>}</StopTimeline>
   </PlaceCard>)}</div>
  </section>

  <RoutePlanner stores={data.stores} plannedStops={data.plan.filter(visit => !visit.suggested).flatMap(visit => visit.stops)} />

  <section className="bookstore-topics" aria-labelledby="bookstore-topics">
   <Title order={2} id="bookstore-topics">{model.topics.title}</Title>
   <ScrollArea type="auto" scrollbars="x" offsetScrollbars="x" className="place-table-scroll" viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': model.topics.tableLabel }}>
    <Table className="bookstore-topic-table" aria-labelledby="bookstore-topics" verticalSpacing="sm" horizontalSpacing="md" borderColor="var(--line)">
     <Table.Thead>
      <Table.Tr>{model.topics.columns.map(column => <Table.Th key={column} scope="col">{column}</Table.Th>)}</Table.Tr>
     </Table.Thead>
     <Table.Tbody>{model.topics.rows.map(topic => <Table.Tr key={topic.topic}>
      <Table.Th scope="row">{topic.topic}</Table.Th>
      <Table.Td>{topic.stores.map(store => <React.Fragment key={store.id}>{store.before}<StoreLink id={store.id} /></React.Fragment>)}</Table.Td>
      <Table.Td className="bookstore-why">{topic.why}</Table.Td>
     </Table.Tr>)}</Table.Tbody>
    </Table>
   </ScrollArea>
  </section>

  {model.sides.map(({ side, label, cards }) => <section key={side} className="bookstore-side" aria-labelledby={`side-${side}`}>
   <Title order={2} id={`side-${side}`}>{label}</Title>
   <div className="bookstore-list">{cards.map(card => <Store key={card.id} card={card} />)}</div>
  </section>)}

  <section className="bookstore-routes" aria-labelledby="bookstore-routes">
   <Title order={2} id="bookstore-routes">{model.routes.title}</Title>
   <div className="bookstore-list">{model.routes.cards.map(route => <PlaceCard key={route.id} component="article" className="bookstore-route">
    <Title order={3}>{route.title}</Title>
    {route.either
     ? <>
      <Text>{route.either.text}</Text>
      <ul>{route.either.stops.map(id => <li key={id}><StoreLink id={id} /></li>)}</ul>
     </>
     : <StopTimeline stops={route.timeline}>{stop => <StoreLink id={stop.id} />}</StopTimeline>}
    <Text className="bookstore-why">{route.why}</Text>
   </PlaceCard>)}</div>
  </section>

  <section className="bookstores-closed" aria-labelledby="bookstores-closed">
   <Title order={2} id="bookstores-closed">{model.closed.title}</Title>
   <Text>{model.closed.body}</Text>
   <div className="bookstore-list">{model.closed.cards.map(card => <Store key={card.id} card={card} />)}</div>
  </section>

  <section className="bookstore-notes" aria-labelledby="bookstore-notes">
   <Title order={2} id="bookstore-notes">{model.notes.title}</Title>
   <ul>{model.notes.items.map(note => <li key={note}>{note}</li>)}</ul>
  </section>
 </div>;
}
