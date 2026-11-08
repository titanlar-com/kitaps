// What the bookstores and route screens show, worked out from data/bookstores.json and the saved
// routes (ADR 003, K14). The screens draw these results and calculate nothing themselves. A tone
// is a name the stylesheet turns into colour tokens; the core knows no colours.

const STORE_BADGES = Object.freeze({
 open: Object.freeze({ label: 'Açık', tone: 'ok', icon: 'open' }),
 closed: Object.freeze({ label: 'Kapandı', tone: 'muted', icon: 'closed' }),
 unverified: Object.freeze({ label: 'Doğrulanmadı', tone: 'accent', icon: 'unverified' }),
});

/** The badge of a store's status, or null for a status the page does not know. */
export const storeBadge = status => (Object.hasOwn(STORE_BADGES, status) ? STORE_BADGES[status] : null);

/** The stores as the page shelves them: the closed ones apart, and the rest by side of the city.
 * A side with no open store is left out. `sides` lists `[id, label]` in the page's order. */
export function storeShelves(stores, sides) {
 const open = stores.filter(store => store.status !== 'closed');
 return {
  closed: stores.filter(store => store.status === 'closed'),
  sides: sides.map(([side, label]) => ({ side, label, stores: open.filter(store => store.side === side) })).filter(entry => entry.stores.length > 0),
 };
}

/** "Tepebaşı, Beyoğlu", or only the district when the area says nothing more. */
export const storePlace = store => (store.area && store.area !== store.district ? `${store.area}, ${store.district}` : store.district);

/**
 * The stops of a route in the order they are walked, numbered from one. A stop whose store is no
 * longer listed keeps its place and shows its id, so a saved route never changes shape.
 */
export function routeTimeline(stopIds, storesById) {
 return stopIds.map((id, index) => {
  const store = storesById[id];
  return { position: index + 1, id, name: store?.name ?? id, place: store ? storePlace(store) : '', address: store?.address ?? '', store: store ?? null };
 });
}

const visitMark = (visit, index) => {
 if (visit.suggested) return { label: 'Öneri', tone: 'neutral' };
 if (visit.date) return { date: visit.date, tone: 'accent' };
 return { label: `${index + 1}. gezi`, tone: 'accent' };
};

/** The planned visits in the owner's order, each with what its badge says and its stops in order. */
export function planTimeline(plan, storesById) {
 return plan.map((visit, index) => ({ ...visit, mark: visitMark(visit, index), stops: routeTimeline(visit.stops, storesById) }));
}

const DRAFT_STEPS = Object.freeze(['Seç', 'Sırala', 'Kaydet']);

/** Where a route being drawn up stands: stores first, then a name. Saving is the last step. */
export function routeDraftSteps({ stops, title }) {
 const active = !stops.length ? 0 : !title.trim() ? 1 : 2;
 return { active, steps: DRAFT_STEPS.map((label, index) => ({ label, state: index < active ? 'done' : index === active ? 'current' : 'todo' })) };
}
