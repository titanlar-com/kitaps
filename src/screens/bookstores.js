import { planTimeline, routeTimeline, storeBadge, storePlace, storeShelves } from '../core/places/stores.js';

// The Kitapçılar screen: its words and what each card shows (ADR 003, K6). The parts it shares with
// the route planner and the fair calendar are here too. Text that comes from data/bookstores.json
// stays data. The screen hands in `longDay`, because dates are formatted outside the core.
export const STORE_SIDES = [['europe', 'Avrupa yakası'], ['asia', 'Anadolu yakası'], ['both', 'İki yakada']];
export const NEW_TAB = ' (yeni sekmede açılır)';

const mapUrl = store => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name}, ${store.address}`)}`;
const telUrl = phone => `tel:+90${phone.replace(/\D/g, '').replace(/^0/, '')}`;
const mapButton = store => ({ href: mapUrl(store), text: 'Haritada aç' });
const withSeparator = (list, between) => list.map((item, index) => ({ ...item, before: index > 0 ? between(index) : null }));

/** A place's source links as one line, or null when it names no source. */
export const sourcesLine = sources => (sources?.length > 0
 ? { label: 'Kaynak: ', links: withSeparator(sources.map(({ url, label }) => ({ url, label })), () => ', ') }
 : null);

/** The control of a long note, which names the place it opens and closes. */
export const longNoteWords = title => ({ show: 'Devamını oku', hide: 'Daralt', showLabel: `${title}: devamını oku`, hideLabel: `${title}: daralt` });

function storeCard(store) {
 return {
  id: store.id,
  name: store.name,
  status: store.status,
  badge: storeBadge(store.status),
  place: storePlace(store),
  about: store.about,
  caution: store.caution ? { label: 'Dikkat:', text: store.caution } : null,
  facts: [
   { label: 'Adres', value: store.address },
   { label: 'Telefon', value: store.phone, ...(store.phone ? { href: telUrl(store.phone) } : {}) },
   { label: 'Saat', value: store.hours },
   { label: 'Ulaşım', value: store.transit },
   { label: 'Büyüklük', value: store.size },
  ].filter(fact => fact.value),
  lookFor: store.lookFor ? { label: 'Rafta aranabilecek kitaplar', titles: store.lookFor } : null,
  actions: store.status === 'closed' ? null : {
   map: mapButton(store),
   call: store.phone ? { href: telUrl(store.phone), text: 'Ara' } : null,
   web: store.web ? { href: store.web, text: 'Web sitesi' } : null,
  },
  sources: sourcesLine(store.sources),
 };
}

const visitCard = longDay => visit => ({
 id: visit.id,
 title: visit.title,
 suggested: visit.suggested,
 note: visit.note,
 badge: { label: visit.mark.date ? longDay(visit.mark.date) : visit.mark.label, tone: visit.mark.tone },
 stops: visit.stops.map(stop => ({ ...stop, map: mapButton(stop.store) })),
});

const routeCard = byId => route => ({
 id: route.id,
 title: route.title,
 why: route.why,
 either: route.either ? { text: 'Şu kitapçılardan birine git.', stops: route.stops } : null,
 timeline: route.either ? null : routeTimeline(route.stops, byId),
});

const topicRow = topic => ({
 topic: topic.topic,
 why: topic.why,
 stores: withSeparator(topic.stores.map(id => ({ id })), index => (index === topic.stores.length - 1 ? ' ve ' : ', ')),
});

export function bookstoresScreen({ data, longDay }) {
 const byId = Object.fromEntries(data.stores.map(store => [store.id, store]));
 const { sides, closed } = storeShelves(data.stores, STORE_SIDES);
 return {
  newTab: NEW_TAB,
  intro: {
   title: 'Kitapçılar',
   body: data.intro,
   updated: `Son güncelleme ${longDay(data.updated)}. Bilgiler ${longDay(data.checkedAt)} tarihli notlardan alındı.`,
  },
  plan: {
   title: 'Gezi planı',
   body: 'Geziler sırayla. Tarihi belli olmayanlar sıradaki günlere kalıyor, sonuncusu benim önerim.',
   visits: planTimeline(data.plan, byId).map(visitCard(longDay)),
  },
  topics: {
   title: 'Konuya göre nereye gidilir?',
   tableLabel: 'Konu tablosu',
   columns: ['Konu', 'Nereye gidilir', 'Neden'],
   rows: data.topics.map(topicRow),
  },
  sides: sides.map(({ side, label, stores }) => ({ side, label, cards: stores.map(storeCard) })),
  routes: { title: 'Önerilen rotalar', cards: data.routes.map(routeCard(byId)) },
  closed: { title: 'Kapanan kitapçılar', body: 'Bu mağazalar notlarda geçiyor, ama artık açık değil.', cards: closed.map(storeCard) },
  notes: { title: 'Gitmeden önce', items: data.notes },
 };
}
