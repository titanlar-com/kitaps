import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, MultiSelect, Stepper, Text, TextInput, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconRoute, IconSparkles, IconTrash } from '@tabler/icons-react';
import { newRouteId } from '../state/routeRegistry.ts';
import { orderStops, routeLengthKm, suggestNextRoute } from '../routes/planner.js';
import { useRouteRegistry } from '../routes/useRouteRegistry.js';
import { routeDraftSteps, routeTimeline } from '../core/places/stores.js';
import { PlaceCard, StopTimeline } from './PlaceParts';
import './RoutePlanner.css';
import { longDay } from '../dates.js';

// The route planner on the Kitapçılar page: pick stores, order them by distance or by hand, give
// the route a name and a day, and save it. Saved routes go to routes.json in kitaps-state.
const MAX_STOPS = 12;
const SIDES = [['europe', 'Avrupa yakası'], ['asia', 'Anadolu yakası']];
const km = value => value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const move = (list, index, step) => { const next = [...list]; const [item] = next.splice(index, 1); next.splice(index + step, 0, item); return next; };
// Mantine draws a step as a button. These steps only say where the draft stands, so they are list items.
const STEP_ITEM = { component: 'div', role: 'listitem' };

export default function RoutePlanner({ stores, plannedStops = [], registry = null }) {
 const { routes, status, save, remove } = useRouteRegistry(registry);
 const [stops, setStops] = useState([]);
 const [title, setTitle] = useState('');
 const [date, setDate] = useState('');
 const [editing, setEditing] = useState(null);
 const [deleting, setDeleting] = useState(null);
 const [moved, setMoved] = useState('');
 // A control that moves, turns off or leaves the page takes the focus with it, so each of those
 // says here where the focus goes next. The effect puts it there once the page has changed.
 const root = useRef(null);
 const nameField = useRef(null);
 const focusNext = useRef(null);
 useEffect(() => {
  const wanted = focusNext.current;
  if (!wanted) return;
  focusNext.current = null;
  if (wanted.field) { nameField.current?.focus(); return; }
  if (wanted.heading) { root.current?.querySelector('#saved-routes')?.focus(); return; }
  if (wanted.route) { root.current?.querySelector(`[data-route="${wanted.route}"] ${wanted.control}`)?.focus(); return; }
  const row = root.current?.querySelector(`[data-stop="${wanted.stop}"]`);
  const same = row?.querySelector(`[data-move="${wanted.direction}"]`);
  (same && !same.disabled ? same : row?.querySelector(`[data-move="${-wanted.direction}"]`))?.focus();
 });
 const moveStop = (stop, direction) => {
  const next = move(stops, stop.position - 1, direction);
  focusNext.current = { stop: stop.id, direction };
  setStops(next);
  setMoved(`${stop.name} ${stop.position + direction}. sıraya taşındı.`);
 };
 const byId = useMemo(() => Object.fromEntries(stores.map(store => [store.id, store])), [stores]);
 const coords = useMemo(() => new Map(stores.filter(store => store.geo).map(store => [store.id, store.geo])), [stores]);
 const options = useMemo(() => SIDES.map(([side, label]) => ({ group: label, items: stores.filter(store => store.status === 'open' && store.side === side).map(store => ({ value: store.id, label: store.name })) })), [stores]);
 const length = stops.length > 1 && stops.every(id => coords.has(id)) ? routeLengthKm(stops, coords) : null;
 const progress = routeDraftSteps({ stops, title });

 const reset = () => { setStops([]); setTitle(''); setDate(''); setEditing(null); setMoved(''); focusNext.current = { field: true }; };
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
 const edit = route => { setStops(route.stops); setTitle(route.title); setDate(route.date ?? ''); setEditing(route.id); focusNext.current = { field: true }; };
 const askDelete = id => { setDeleting(id); focusNext.current = { route: id, control: '[data-keep]' }; };
 const keepRoute = id => { setDeleting(null); focusNext.current = { route: id, control: '[data-delete]' }; };
 const deleteRoute = id => { setDeleting(null); remove(id); focusNext.current = { heading: true }; };

 return <section ref={root} className="route-planner" aria-labelledby="route-planner">
  <Title order={2} id="route-planner">Rota oluşturucu</Title>
  <Text>Gitmek istediğin kitapçıları seç. Sistem sırayı yakınlığa göre önerir, sen de elle değiştirebilirsin. Cihaz eşitlemesi bağlıysa kaydettiğin rotalar GitHub'daki eşitleme deposuna yazılır ve her cihazında görünür.</Text>

  <PlaceCard component="form" className="route-draft" onSubmit={submit}>
   <Stepper className="route-steps" active={progress.active} iconSize={36} labelPosition="bottom" wrap={false} attributes={{ steps: { role: 'list', 'aria-label': 'Rota hazırlama adımları' } }}>
    {progress.steps.map(step => <Stepper.Step key={step.label} {...STEP_ITEM} aria-current={step.state === 'current' ? 'step' : undefined} label={<>{step.label}{step.state === 'done' && <span className="visually-hidden"> (tamamlandı)</span>}</>} />)}
   </Stepper>

   <div className="route-draft-parts">
    <div className="route-draft-part">
     <MultiSelect label="Kitapçılar" placeholder={stops.length ? '' : 'Kitapçı seç'} data={options} value={stops} onChange={setStops} searchable maxValues={MAX_STOPS} hidePickedOptions nothingFoundMessage="Bu adla bir kitapçı yok" />
     {stops.length > 0 && <StopTimeline className="route-draft-stops" stops={routeTimeline(stops, byId)}>{stop => <div className="route-draft-stop" data-stop={stop.id}>
      <span className="route-draft-name">{stop.name}</span>
      <span className="route-draft-moves">
       <ActionIcon variant="subtle" aria-label={`${stop.name}: yukarı taşı`} data-move="-1" disabled={stop.position === 1} onClick={() => moveStop(stop, -1)}><IconArrowUp size={18} aria-hidden="true" /></ActionIcon>
       <ActionIcon variant="subtle" aria-label={`${stop.name}: aşağı taşı`} data-move="1" disabled={stop.position === stops.length} onClick={() => moveStop(stop, 1)}><IconArrowDown size={18} aria-hidden="true" /></ActionIcon>
      </span>
     </div>}</StopTimeline>}
     {length !== null && <Text className="route-draft-length">Duraklar arası toplam yaklaşık {km(length)} km, kuş uçuşu.</Text>}
     <div className="route-draft-tools">
      <Button type="button" variant="default" leftSection={<IconRoute size={18} aria-hidden="true" />} disabled={stops.length < 3} onClick={() => setStops(orderStops(stops, coords))}>Sırayı yakınlığa göre düzenle</Button>
      <Button type="button" variant="subtle" leftSection={<IconSparkles size={18} aria-hidden="true" />} onClick={suggest}>Sıradaki rotayı öner</Button>
     </div>
    </div>

    <div className="route-draft-part">
     <div className="route-draft-fields">
      <TextInput ref={nameField} label="Rota adı" value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={120} required />
      <TextInput label="Tarih" description="İsteğe bağlı" type="date" value={date} onChange={event => setDate(event.currentTarget.value)} max="2099-12-31" />
     </div>
     <div className="route-draft-tools">
      <Button type="submit" disabled={!title.trim() || !stops.length}>{editing ? 'Değişikliği kaydet' : 'Rotayı kaydet'}</Button>
      {(stops.length > 0 || editing) && <Button type="button" variant="subtle" onClick={reset}>Vazgeç</Button>}
     </div>
     <Text role="status" aria-live="polite" className="route-status" data-kind={moved ? undefined : status?.kind}>{moved || (status?.text ?? '')}</Text>
    </div>
   </div>
  </PlaceCard>

  <Title order={3} id="saved-routes" tabIndex={-1}>Kaydettiğin rotalar</Title>
  {routes.length === 0 ? <Text>Henüz kaydettiğin bir rota yok.</Text> : <div className="route-saved-list">{routes.map(route => <PlaceCard key={route.id} component="article" className="route-saved" data-route={route.id} data-done={route.done || undefined}>
   <Title order={4}>{route.title}</Title>
   <Text className="route-saved-date">{route.date ? longDay(route.date) : 'Tarihi belli değil'}</Text>
   <StopTimeline stops={routeTimeline(route.stops, byId)} active={route.done ? route.stops.length - 1 : -1}>{stop => stop.name}</StopTimeline>
   <div className="route-saved-actions">
    <Checkbox label="Gezildi" checked={route.done} onChange={event => save({ ...route, done: event.currentTarget.checked })} />
    <Button variant="subtle" onClick={() => edit(route)}>Düzenle</Button>
    {deleting === route.id
     ? <div className="route-delete-ask" role="group" aria-label={`${route.title}: silinsin mi?`}><Text>Bu rota bütün cihazlarından silinsin mi?</Text><Button variant="subtle" data-keep onClick={() => keepRoute(route.id)}>Vazgeç</Button><Button variant="subtle" className="route-delete" onClick={() => deleteRoute(route.id)}>Evet, sil</Button></div>
     : <ActionIcon variant="subtle" className="route-delete" data-delete aria-label={`${route.title}: sil`} onClick={() => askDelete(route.id)}><IconTrash size={18} aria-hidden="true" /></ActionIcon>}
   </div>
  </PlaceCard>)}</div>}
 </section>;
}
