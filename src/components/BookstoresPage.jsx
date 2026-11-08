import React from 'react';
import { Button, ScrollArea, Table, Text, Title } from '@mantine/core';
import { IconExternalLink, IconMapPin, IconPhone } from '@tabler/icons-react';
import data from '../../data/bookstores.json';
import { planTimeline, routeTimeline, storeBadge, storePlace } from '../core/places/stores.js';
import { FactList, LongNote, PlaceBadge, PlaceCard, StopTimeline } from './PlaceParts';
import RoutePlanner from './RoutePlanner';
import './BookstoresPage.css';
import { longDay } from '../dates.js';

// Istanbul bookstores from the owner's research notes, with the routes walked (data/bookstores.json).
const byId = Object.fromEntries(data.stores.map(store => [store.id, store]));
const plan = planTimeline(data.plan, byId);
const SIDES = [['europe', 'Avrupa yakası'], ['asia', 'Anadolu yakası'], ['both', 'İki yakada']];

const mapUrl = store => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name}, ${store.address}`)}`;
const telUrl = phone => `tel:+90${phone.replace(/\D/g, '').replace(/^0/, '')}`;
const opens = { target: '_blank', rel: 'noopener noreferrer' };
const NewTab = () => <span className="visually-hidden"> (yeni sekmede açılır)</span>;

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

function MapButton({ store }) {
 return <Button component="a" href={mapUrl(store)} {...opens} variant="default" leftSection={<IconMapPin size={18} aria-hidden="true" />}>Haritada aç<NewTab /></Button>;
}

function Store({ store }) {
 const facts = [
  { label: 'Adres', value: store.address },
  { label: 'Telefon', value: store.phone && <a href={telUrl(store.phone)}>{store.phone}</a> },
  { label: 'Saat', value: store.hours },
  { label: 'Ulaşım', value: store.transit },
  { label: 'Büyüklük', value: store.size },
 ];
 return <PlaceCard component="article" id={`store-${store.id}`} className="bookstore" data-status={store.status}>
  <div className="bookstore-head">
   <Title order={3} tabIndex={-1}>{store.name}</Title>
   <PlaceBadge badge={storeBadge(store.status)} />
  </div>
  <Text className="bookstore-place">{storePlace(store)}</Text>
  <LongNote title={store.name}>
   <Text>{store.about}</Text>
   {store.caution && <Text className="bookstore-caution"><strong>Dikkat:</strong> {store.caution}</Text>}
  </LongNote>
  <FactList facts={facts} />
  {store.lookFor && <div className="bookstore-look">
   <Text className="bookstore-label">Rafta aranabilecek kitaplar</Text>
   <ul>{store.lookFor.map(title => <li key={title}>{title}</li>)}</ul>
  </div>}
  {store.status !== 'closed' && <div className="bookstore-actions">
   <MapButton store={store} />
   {store.phone && <Button component="a" href={telUrl(store.phone)} variant="subtle" leftSection={<IconPhone size={18} aria-hidden="true" />}>Ara</Button>}
   {store.web && <Button component="a" href={store.web} {...opens} variant="subtle" leftSection={<IconExternalLink size={18} aria-hidden="true" />}>Web sitesi<NewTab /></Button>}
  </div>}
  {store.sources?.length > 0 && <Text className="bookstore-sources">Kaynak: {store.sources.map((source, index) => <React.Fragment key={source.url}>
   {index > 0 && ', '}<a href={source.url} {...opens}>{source.label}<NewTab /></a>
  </React.Fragment>)}</Text>}
 </PlaceCard>;
}

const inWords = list => list.map((id, index) => <React.Fragment key={id}>{index > 0 && (index === list.length - 1 ? ' ve ' : ', ')}<StoreLink id={id} /></React.Fragment>);

export default function BookstoresPage() {
 const open = data.stores.filter(store => store.status !== 'closed');
 const closed = data.stores.filter(store => store.status === 'closed');
 return <div className="bookstores-page">
  <header className="bookstores-intro">
   <Title order={1}>Kitapçılar</Title>
   <Text>{data.intro}</Text>
   <Text className="bookstores-updated">Son güncelleme {longDay(data.updated)}. Bilgiler {longDay(data.checkedAt)} tarihli notlardan alındı.</Text>
  </header>

  <section className="bookstore-plan" aria-labelledby="bookstore-plan">
   <Title order={2} id="bookstore-plan">Gezi planı</Title>
   <Text>Geziler sırayla. Tarihi belli olmayanlar sıradaki günlere kalıyor, sonuncusu benim önerim.</Text>
   <div className="bookstore-visits">{plan.map(visit => <PlaceCard key={visit.id} component="article" className="bookstore-visit" data-suggested={visit.suggested || undefined} aria-labelledby={`visit-${visit.id}`}>
    <div className="bookstore-head">
     <Title order={3} id={`visit-${visit.id}`}>{visit.title}</Title>
     <PlaceBadge badge={{ label: visit.mark.date ? longDay(visit.mark.date) : visit.mark.label, tone: visit.mark.tone }} />
    </div>
    <Text>{visit.note}</Text>
    <StopTimeline className="bookstore-stops" stops={visit.stops}>{stop => <div className="bookstore-stop">
     <div className="bookstore-stop-text">
      <Title order={4}><StoreLink id={stop.id} /></Title>
      <Text className="bookstore-place">{stop.place}</Text>
      <Text>{stop.address}</Text>
     </div>
     <MapButton store={stop.store} />
    </div>}</StopTimeline>
   </PlaceCard>)}</div>
  </section>

  <RoutePlanner stores={data.stores} plannedStops={data.plan.filter(visit => !visit.suggested).flatMap(visit => visit.stops)} />

  <section className="bookstore-topics" aria-labelledby="bookstore-topics">
   <Title order={2} id="bookstore-topics">Konuya göre nereye gidilir?</Title>
   <ScrollArea type="auto" scrollbars="x" offsetScrollbars="x" className="place-table-scroll" viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': 'Konu tablosu' }}>
    <Table className="bookstore-topic-table" aria-labelledby="bookstore-topics" verticalSpacing="sm" horizontalSpacing="md" borderColor="var(--line)">
     <Table.Thead>
      <Table.Tr><Table.Th scope="col">Konu</Table.Th><Table.Th scope="col">Nereye gidilir</Table.Th><Table.Th scope="col">Neden</Table.Th></Table.Tr>
     </Table.Thead>
     <Table.Tbody>{data.topics.map(topic => <Table.Tr key={topic.topic}>
      <Table.Th scope="row">{topic.topic}</Table.Th>
      <Table.Td>{inWords(topic.stores)}</Table.Td>
      <Table.Td className="bookstore-why">{topic.why}</Table.Td>
     </Table.Tr>)}</Table.Tbody>
    </Table>
   </ScrollArea>
  </section>

  {SIDES.map(([side, label]) => {
   const stores = open.filter(store => store.side === side);
   return stores.length > 0 && <section key={side} className="bookstore-side" aria-labelledby={`side-${side}`}>
    <Title order={2} id={`side-${side}`}>{label}</Title>
    <div className="bookstore-list">{stores.map(store => <Store key={store.id} store={store} />)}</div>
   </section>;
  })}

  <section className="bookstore-routes" aria-labelledby="bookstore-routes">
   <Title order={2} id="bookstore-routes">Önerilen rotalar</Title>
   <div className="bookstore-list">{data.routes.map(route => <PlaceCard key={route.id} component="article" className="bookstore-route">
    <Title order={3}>{route.title}</Title>
    {route.either
     ? <>
      <Text>Şu kitapçılardan birine git.</Text>
      <ul>{route.stops.map(id => <li key={id}><StoreLink id={id} /></li>)}</ul>
     </>
     : <StopTimeline stops={routeTimeline(route.stops, byId)}>{stop => <StoreLink id={stop.id} />}</StopTimeline>}
    <Text className="bookstore-why">{route.why}</Text>
   </PlaceCard>)}</div>
  </section>

  <section className="bookstores-closed" aria-labelledby="bookstores-closed">
   <Title order={2} id="bookstores-closed">Kapanan kitapçılar</Title>
   <Text>Bu mağazalar notlarda geçiyor, ama artık açık değil.</Text>
   <div className="bookstore-list">{closed.map(store => <Store key={store.id} store={store} />)}</div>
  </section>

  <section className="bookstore-notes" aria-labelledby="bookstore-notes">
   <Title order={2} id="bookstore-notes">Gitmeden önce</Title>
   <ul>{data.notes.map(note => <li key={note}>{note}</li>)}</ul>
  </section>
 </div>;
}
