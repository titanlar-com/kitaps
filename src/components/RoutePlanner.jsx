import React, { useMemo, useState } from 'react';
import { ActionIcon, Button, Checkbox, MultiSelect, Text, TextInput, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconRoute, IconSparkles, IconTrash } from '@tabler/icons-react';
import { newRouteId } from '../state/routeRegistry.ts';
import { orderStops, routeLengthKm, suggestNextRoute } from '../routes/planner.js';
import { useRouteRegistry } from '../routes/useRouteRegistry.js';
import './RoutePlanner.css';

// The route planner on the Kitapçılar page: pick stores, order them by distance or by hand, give
// the route a name and a day, and save it. Saved routes go to routes.json in kitaps-state.
const MAX_STOPS = 12;
const SIDES = [['europe', 'Avrupa yakası'], ['asia', 'Anadolu yakası']];
const longDay = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
const km = value => value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const move = (list, index, step) => { const next = [...list]; const [item] = next.splice(index, 1); next.splice(index + step, 0, item); return next; };

export default function RoutePlanner({ stores, plannedStops = [], registry = null }) {
 const { routes, status, save, remove } = useRouteRegistry(registry);
 const [stops, setStops] = useState([]);
 const [title, setTitle] = useState('');
 const [date, setDate] = useState('');
 const [editing, setEditing] = useState(null);
 const byId = useMemo(() => Object.fromEntries(stores.map(store => [store.id, store])), [stores]);
 const coords = useMemo(() => new Map(stores.filter(store => store.geo).map(store => [store.id, store.geo])), [stores]);
 const options = useMemo(() => SIDES.map(([side, label]) => ({ group: label, items: stores.filter(store => store.status === 'open' && store.side === side).map(store => ({ value: store.id, label: store.name })) })), [stores]);
 const length = stops.length > 1 && stops.every(id => coords.has(id)) ? routeLengthKm(stops, coords) : null;

 const reset = () => { setStops([]); setTitle(''); setDate(''); setEditing(null); };
 const suggest = () => {
  const taken = [...plannedStops, ...routes.flatMap(route => route.stops)];
  const next = suggestNextRoute(stores, taken, coords, 3);
  setStops(next); setEditing(null);
  setTitle(next.length ? `Öneri: ${[...new Set(next.map(id => byId[id].district))].join(' ve ')}` : '');
 };
 const submit = event => {
  event.preventDefault();
  const name = title.trim();
  if (!name || !stops.length) return;
  const id = editing ?? newRouteId(name, routes.map(route => route.id));
  const done = routes.find(route => route.id === id)?.done ?? false;
  save({ id, title: name, date: date || null, stops, note: '', done });
  reset();
 };
 const edit = route => { setStops(route.stops); setTitle(route.title); setDate(route.date ?? ''); setEditing(route.id); };

 return <section className="route-planner" aria-labelledby="route-planner">
  <Title order={2} id="route-planner">Rota oluşturucu</Title>
  <Text>Gitmek istediğin kitapçıları seç. Sistem sırayı yakınlığa göre önerir, sen de elle değiştirebilirsin. Cihaz eşitlemesi bağlıysa kaydettiğin rotalar GitHub'daki eşitleme deposuna yazılır ve her cihazında görünür.</Text>

  <form className="route-draft" onSubmit={submit}>
   <MultiSelect label="Kitapçılar" placeholder={stops.length ? '' : 'Kitapçı seç'} data={options} value={stops} onChange={setStops} searchable maxValues={MAX_STOPS} hidePickedOptions nothingFoundMessage="Bu adla bir kitapçı yok" />
   {stops.length > 0 && <ol className="route-draft-stops">{stops.map((id, index) => <li key={id}>
    <span className="route-draft-name">{byId[id]?.name ?? id}</span>
    <span className="route-draft-moves">
     <ActionIcon variant="subtle" aria-label={`${byId[id]?.name}: yukarı taşı`} disabled={index === 0} onClick={() => setStops(move(stops, index, -1))}><IconArrowUp size={18} /></ActionIcon>
     <ActionIcon variant="subtle" aria-label={`${byId[id]?.name}: aşağı taşı`} disabled={index === stops.length - 1} onClick={() => setStops(move(stops, index, 1))}><IconArrowDown size={18} /></ActionIcon>
    </span>
   </li>)}</ol>}
   {length !== null && <Text className="route-draft-length">Duraklar arası toplam yaklaşık {km(length)} km, kuş uçuşu.</Text>}
   <div className="route-draft-tools">
    <Button type="button" variant="default" leftSection={<IconRoute size={18} />} disabled={stops.length < 3} onClick={() => setStops(orderStops(stops, coords))}>Sırayı yakınlığa göre düzenle</Button>
    <Button type="button" variant="subtle" leftSection={<IconSparkles size={18} />} onClick={suggest}>Sıradaki rotayı öner</Button>
   </div>
   <div className="route-draft-fields">
    <TextInput label="Rota adı" value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={120} required />
    <TextInput label="Tarih" description="İsteğe bağlı" type="date" value={date} onChange={event => setDate(event.currentTarget.value)} max="2099-12-31" />
   </div>
   <div className="route-draft-tools">
    <Button type="submit" disabled={!title.trim() || !stops.length}>{editing ? 'Değişikliği kaydet' : 'Rotayı kaydet'}</Button>
    {(stops.length > 0 || editing) && <Button type="button" variant="subtle" onClick={reset}>Vazgeç</Button>}
   </div>
   <Text role="status" aria-live="polite" className="route-status" data-kind={status?.kind}>{status?.text ?? ''}</Text>
  </form>

  <Title order={3}>Kaydettiğin rotalar</Title>
  {routes.length === 0 ? <Text>Henüz kaydettiğin bir rota yok.</Text> : <div className="route-saved-list">{routes.map(route => <article key={route.id} className="route-saved" data-done={route.done || undefined}>
   <Title order={4}>{route.title}</Title>
   <Text className="route-saved-date">{route.date ? longDay(route.date) : 'Tarihi belli değil'}</Text>
   <ol>{route.stops.map(id => <li key={id}>{byId[id]?.name ?? id}</li>)}</ol>
   <div className="route-saved-actions">
    <Checkbox label="Gezildi" checked={route.done} onChange={event => save({ ...route, done: event.currentTarget.checked })} />
    <Button variant="subtle" onClick={() => edit(route)}>Düzenle</Button>
    <ActionIcon variant="subtle" color="red" aria-label={`${route.title}: sil`} onClick={() => remove(route.id)}><IconTrash size={18} /></ActionIcon>
   </div>
  </article>)}</div>}
 </section>;
}
