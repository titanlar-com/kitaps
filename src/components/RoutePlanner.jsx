import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, MultiSelect, Stepper, Text, TextInput, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconRoute, IconSparkles, IconTrash } from '@tabler/icons-react';
import { newRouteId } from '../state/routeRegistry.ts';
import { orderStops, routeLengthKm, suggestNextRoute } from '../routes/planner.js';
import { useRouteRegistry } from '../routes/useRouteRegistry.js';
import { routeMovedText, routePlannerScreen, routeStoreOptions, suggestedRouteTitle } from '../screens/routePlanner.js';
import { PlaceCard, StopTimeline } from './PlaceParts';
import './RoutePlanner.css';
import { longDay } from '../dates.js';

// The route planner on the Kitapçılar page: pick stores, order them by distance or by hand, give
// the route a name and a day, and save it. Saved routes go to routes.json in kitaps-state.
const MAX_STOPS = 12;
const move =(list, index, step) => { const next = [...list]; const [item] = next.splice(index, 1); next.splice(index + step, 0, item); return next; };
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
  setMoved(routeMovedText(stop, direction));
 };
 const byId = useMemo(() => Object.fromEntries(stores.map(store => [store.id, store])), [stores]);
 const coords = useMemo(() => new Map(stores.filter(store => store.geo).map(store => [store.id, store.geo])), [stores]);
 const options = useMemo(() => routeStoreOptions(stores), [stores]);
 const length = stops.length > 1 && stops.every(id => coords.has(id)) ? routeLengthKm(stops, coords) : null;
 const model = routePlannerScreen({ stops, title, editing, length, status, moved, routes, deleting, byId, longDay });

 const reset = () => { setStops([]); setTitle(''); setDate(''); setEditing(null); setMoved(''); focusNext.current = { field: true }; };
 const suggest = () => {
  const taken = [...plannedStops, ...routes.flatMap(route => route.stops)];
  const next = suggestNextRoute(stores, taken, coords, 3);
  setStops(next); setEditing(null);
  setTitle(suggestedRouteTitle(next.map(id => byId[id].district)));
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
  <Title order={2} id="route-planner">{model.title}</Title>
  <Text>{model.intro}</Text>

  <PlaceCard component="form" className="route-draft" onSubmit={submit}>
   <Stepper className="route-steps" active={model.progress.active} iconSize={36} labelPosition="bottom" wrap={false} attributes={{ steps: { role: 'list', 'aria-label': model.stepsLabel } }}>
    {model.progress.steps.map(step => <Stepper.Step key={step.label} {...STEP_ITEM} aria-current={step.state === 'current' ? 'step' : undefined} label={<>{step.label}{step.doneNote && <span className="visually-hidden">{step.doneNote}</span>}</>} />)}
   </Stepper>

   <div className="route-draft-parts">
    <div className="route-draft-part">
     <MultiSelect label={model.storesField.label} placeholder={model.storesField.placeholder} data={options} value={stops} onChange={setStops} searchable maxValues={MAX_STOPS} hidePickedOptions nothingFoundMessage={model.storesField.nothingFound} />
     {model.draftStops && <StopTimeline className="route-draft-stops" stops={model.draftStops}>{stop => <div className="route-draft-stop" data-stop={stop.id}>
      <span className="route-draft-name">{stop.name}</span>
      <span className="route-draft-moves">
       <ActionIcon variant="subtle" aria-label={stop.up.label} data-move="-1" disabled={stop.up.disabled} onClick={() => moveStop(stop, -1)}><IconArrowUp size={18} aria-hidden="true" /></ActionIcon>
       <ActionIcon variant="subtle" aria-label={stop.down.label} data-move="1" disabled={stop.down.disabled} onClick={() => moveStop(stop, 1)}><IconArrowDown size={18} aria-hidden="true" /></ActionIcon>
      </span>
     </div>}</StopTimeline>}
     {model.length !== null && <Text className="route-draft-length">{model.length}</Text>}
     <div className="route-draft-tools">
      <Button type="button" variant="default" leftSection={<IconRoute size={18} aria-hidden="true" />} disabled={model.tools.order.disabled} onClick={() => setStops(orderStops(stops, coords))}>{model.tools.order.text}</Button>
      <Button type="button" variant="subtle" leftSection={<IconSparkles size={18} aria-hidden="true" />} onClick={suggest}>{model.tools.suggest}</Button>
     </div>
    </div>

    <div className="route-draft-part">
     <div className="route-draft-fields">
      <TextInput ref={nameField} label={model.nameField.label} value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={120} required />
      <TextInput label={model.dateField.label} description={model.dateField.description} type="date" value={date} onChange={event => setDate(event.currentTarget.value)} max="2099-12-31" />
     </div>
     <div className="route-draft-tools">
      <Button type="submit" disabled={model.submit.disabled}>{model.submit.text}</Button>
      {model.cancel && <Button type="button" variant="subtle" onClick={reset}>{model.cancel}</Button>}
     </div>
     <Text role="status" aria-live="polite" className="route-status" data-kind={model.status.kind}>{model.status.text}</Text>
    </div>
   </div>
  </PlaceCard>

  <Title order={3} id="saved-routes" tabIndex={-1}>{model.saved.title}</Title>
  {model.saved.empty ? <Text>{model.saved.empty}</Text> : <div className="route-saved-list">{model.saved.cards.map(card => <PlaceCard key={card.id} component="article" className="route-saved" data-route={card.id} data-done={card.done || undefined}>
   <Title order={4}>{card.title}</Title>
   <Text className="route-saved-date">{card.date}</Text>
   <StopTimeline stops={card.stops} active={card.active}>{stop => stop.name}</StopTimeline>
   <div className="route-saved-actions">
    <Checkbox label={card.doneLabel} checked={card.done} onChange={event => save({ ...card.route, done: event.currentTarget.checked })} />
    <Button variant="subtle" onClick={() => edit(card.route)}>{card.edit}</Button>
    {card.deleteAsk
     ? <div className="route-delete-ask" role="group" aria-label={card.deleteAsk.label}><Text>{card.deleteAsk.question}</Text><Button variant="subtle" data-keep onClick={() => keepRoute(card.id)}>{card.deleteAsk.keep}</Button><Button variant="subtle" className="route-delete" onClick={() => deleteRoute(card.id)}>{card.deleteAsk.confirm}</Button></div>
     : <ActionIcon variant="subtle" className="route-delete" data-delete aria-label={card.deleteLabel} onClick={() => askDelete(card.id)}><IconTrash size={18} aria-hidden="true" /></ActionIcon>}
   </div>
  </PlaceCard>)}</div>}
 </section>;
}
