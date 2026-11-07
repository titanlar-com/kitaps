import React from 'react';
import { Badge, Button, Text, Title } from '@mantine/core';
import { IconExternalLink, IconMapPin, IconPhone } from '@tabler/icons-react';
import data from '../../data/bookstores.json';
import RoutePlanner from './RoutePlanner';
import './BookstoresPage.css';
import { longDay } from '../dates.js';

// Istanbul bookstores from the owner's research notes, with the routes walked (data/bookstores.json).
const byId = Object.fromEntries(data.stores.map(store => [store.id, store]));
const SIDES = [['europe', 'Avrupa yakası'], ['asia', 'Anadolu yakası'], ['both', 'İki yakada']];
const STATUS = { closed: 'Kapandı', unverified: 'Durumu belirsiz' };
const FACTS = [['address', 'Adres'], ['phone', 'Telefon'], ['hours', 'Saat'], ['transit', 'Ulaşım'], ['size', 'Büyüklük']];

const mapUrl = store => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name}, ${store.address}`)}`;
const telUrl = phone => `tel:+90${phone.replace(/\D/g, '').replace(/^0/, '')}`;
const place = store => store.area && store.area !== store.district ? `${store.area}, ${store.district}` : store.district;
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
 return <Button component="a" href={mapUrl(store)} {...opens} variant="default" leftSection={<IconMapPin size={18} />}>Haritada aç<NewTab /></Button>;
}

function Store({ store }) {
 const facts = FACTS.filter(([key]) => store[key]);
 return <article id={`store-${store.id}`} className="bookstore" data-status={store.status}>
  <div className="bookstore-head">
   <Title order={3} tabIndex={-1}>{store.name}</Title>
   {STATUS[store.status] && <Badge color={store.status === 'closed' ? 'gray' : 'brand'}>{STATUS[store.status]}</Badge>}
  </div>
  <Text className="bookstore-place">{place(store)}</Text>
  <Text className="bookstore-about">{store.about}</Text>
  {facts.length > 0 && <dl className="bookstore-facts">{facts.map(([key, label]) => <div key={key}>
   <dt>{label}</dt>
   <dd>{key === 'phone' ? <a href={telUrl(store.phone)}>{store.phone}</a> : store[key]}</dd>
  </div>)}</dl>}
  {store.lookFor && <div className="bookstore-look">
   <Text className="bookstore-label">Rafta aranabilecek kitaplar</Text>
   <ul>{store.lookFor.map(title => <li key={title}>{title}</li>)}</ul>
  </div>}
  {store.caution && <Text className="bookstore-caution"><strong>Dikkat:</strong> {store.caution}</Text>}
  {store.status !== 'closed' && <div className="bookstore-actions">
   <MapButton store={store} />
   {store.phone && <Button component="a" href={telUrl(store.phone)} variant="subtle" leftSection={<IconPhone size={18} />}>Ara</Button>}
   {store.web && <Button component="a" href={store.web} {...opens} variant="subtle" leftSection={<IconExternalLink size={18} />}>Web sitesi<NewTab /></Button>}
  </div>}
  {store.sources?.length > 0 && <Text className="bookstore-sources">Kaynak: {store.sources.map((source, index) => <React.Fragment key={source.url}>
   {index > 0 && ', '}<a href={source.url} {...opens}>{source.label}<NewTab /></a>
  </React.Fragment>)}</Text>}
 </article>;
}

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
   {data.plan.map((visit, index) => <article key={visit.id} className="bookstore-visit" data-suggested={visit.suggested || undefined} aria-labelledby={`visit-${visit.id}`}>
    <div className="bookstore-head">
     <Title order={3} id={`visit-${visit.id}`}>{visit.title}</Title>
     <Badge color={visit.suggested ? 'gray' : 'brand'}>{visit.suggested ? 'Öneri' : visit.date ? longDay(visit.date) : `${index + 1}. gezi`}</Badge>
    </div>
    <Text>{visit.note}</Text>
    <ol className="bookstore-stops">{visit.stops.map(id => <li key={id}>
     <Title order={4}><StoreLink id={id} /></Title>
     <Text className="bookstore-place">{place(byId[id])}</Text>
     <Text>{byId[id].address}</Text>
     <MapButton store={byId[id]} />
    </li>)}</ol>
   </article>)}
  </section>

  <RoutePlanner stores={data.stores} plannedStops={data.plan.filter(visit => !visit.suggested).flatMap(visit => visit.stops)} />

  <section className="bookstore-topics" aria-labelledby="bookstore-topics">
   <Title order={2} id="bookstore-topics">Konuya göre nereye gidilir?</Title>
   <ul>{data.topics.map(topic => <li key={topic.topic}>
    <Text className="bookstore-topic">{topic.topic}</Text>
    <Text>{topic.stores.map((id, index) => <React.Fragment key={id}>{index > 0 && (index === topic.stores.length - 1 ? ' ve ' : ', ')}<StoreLink id={id} /></React.Fragment>)}</Text>
    <Text className="bookstore-why">{topic.why}</Text>
   </li>)}</ul>
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
   <div className="bookstore-list">{data.routes.map(route => {
    const List = route.either ? 'ul' : 'ol';
    return <article key={route.id} className="bookstore-route">
     <Title order={3}>{route.title}</Title>
     {route.either && <Text>Şu kitapçılardan birine git.</Text>}
     <List>{route.stops.map(id => <li key={id}><StoreLink id={id} /></li>)}</List>
     <Text className="bookstore-why">{route.why}</Text>
    </article>;
   })}</div>
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
