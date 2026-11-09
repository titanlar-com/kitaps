import { routeDraftSteps, routeTimeline } from '../core/places/stores.js';
import { STORE_SIDES } from './bookstores.js';

// The route planner on the Kitapçılar page: its words and what the draft and the saved routes show
// (ADR 003, K6). The screen keeps the draft and works out its length, and hands in the results.
const PLANNER_SIDES = STORE_SIDES.filter(([side]) => side !== 'both');
const km = value => value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const clock = ms => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/** The open stores a route can use, grouped by the side of the city. */
export const routeStoreOptions = stores => PLANNER_SIDES.map(([side, label]) => ({ group: label, items: stores.filter(store => store.status === 'open' && store.side === side).map(store => ({ value: store.id, label: store.name })) }));

/** The sentence that says where a stop landed after a move of one place. */
export const routeMovedText = (stop, direction) => `${stop.name} ${stop.position + direction}. sıraya taşındı.`;

/** A suggested route's name, from the districts of its stops, or nothing for an empty suggestion. */
export const suggestedRouteTitle = districts => (districts.length ? `Öneri: ${[...new Set(districts)].join(' ve ')}` : '');

const draftRow = count => stop => ({
 ...stop,
 up: { label: `${stop.name}: yukarı taşı`, disabled: stop.position === 1 },
 down: { label: `${stop.name}: aşağı taşı`, disabled: stop.position === count },
});

const savedCard = ({ byId, deleting, longDay }) => route => ({
 route,
 id: route.id,
 title: route.title,
 done: route.done,
 date: route.date ? longDay(route.date) : 'Tarihi belli değil',
 stops: routeTimeline(route.stops, byId),
 active: route.done ? route.stops.length - 1 : -1,
 doneLabel: 'Gezildi',
 edit: 'Düzenle',
 deleteLabel: `${route.title}: sil`,
 deleteAsk: deleting === route.id ? { label: `${route.title}: silinsin mi?`, question: 'Bu rota bütün cihazlarından silinsin mi?', keep: 'Vazgeç', confirm: 'Evet, sil' } : null,
});

export function routePlannerScreen({ stops, title, editing, length, status, moved, routes, deleting, byId, longDay }) {
 const progress = routeDraftSteps({ stops, title });
 return {
  title: 'Rota oluşturucu',
  intro: "Gitmek istediğin kitapçıları seç. Sistem sırayı yakınlığa göre önerir, sen de elle değiştirebilirsin. Cihaz eşitlemesi bağlıysa kaydettiğin rotalar GitHub'daki eşitleme deposuna yazılır ve her cihazında görünür.",
  stepsLabel: 'Rota hazırlama adımları',
  progress: { active: progress.active, steps: progress.steps.map(step => ({ ...step, doneNote: step.state === 'done' ? ' (tamamlandı)' : null })) },
  storesField: { label: 'Kitapçılar', placeholder: stops.length ? '' : 'Kitapçı seç', nothingFound: 'Bu adla bir kitapçı yok' },
  draftStops: stops.length > 0 ? routeTimeline(stops, byId).map(draftRow(stops.length)) : null,
  length: length !== null ? `Duraklar arası toplam yaklaşık ${km(length)} km, kuş uçuşu.` : null,
  tools: { order: { text: 'Sırayı yakınlığa göre düzenle', disabled: stops.length < 3 }, suggest: 'Sıradaki rotayı öner' },
  nameField: { label: 'Rota adı' },
  dateField: { label: 'Tarih', description: 'İsteğe bağlı' },
  submit: { text: editing ? 'Değişikliği kaydet' : 'Rotayı kaydet', disabled: !title.trim() || !stops.length },
  cancel: stops.length > 0 || editing ? 'Vazgeç' : null,
  status: { kind: moved ? undefined : status?.kind, text: moved || (status?.text ?? '') },
  saved: {
   title: 'Kaydettiğin rotalar',
   empty: routes.length === 0 ? 'Henüz kaydettiğin bir rota yok.' : null,
   cards: routes.map(savedCard({ byId, deleting, longDay })),
  },
 };
}

/** What a change is called in the planner's messages. */
export const routeRegistrySubjects = { save: 'Rota', remove: 'Silme' };

/** Why a change did not reach GitHub, in the planner's words. The change always stays on the device. */
const failureText = (error, what) => (error?.code === 'unauthorized'
 ? `${what} GitHub’a yazılamadı, çünkü anahtar yazma iznine sahip değil. Değişiklik bu cihazda bekliyor.`
 : error?.code === 'rate-limited'
  ? `${what} GitHub’a gönderilemedi, çünkü GitHub istek sınırına ulaşıldı. Değişiklik bu cihazda bekliyor. Saat ${clock(error.retryAt)} sonrasındaki ilk kayıtta ya da sayfa yeniden açıldığında gönderilir.`
  : `${what} GitHub’a gönderilemedi. Değişiklik bu cihazda bekliyor ve sonraki kayıtta yeniden gönderilecek.`);

/** The planner's status line for each thing the route registry can report. */
export const routeRegistryStatus = {
 applied: (what, saved) => (saved
  ? { kind: 'saved', text: `${what} GitHub’a kaydedildi.` }
  : { kind: 'local', text: `${what} bu cihazda saklandı. GitHub’a göndermek için cihaz eşitlemesini bağla.` }),
 waiting: count => ({ kind: 'local', text: `Bu cihazda GitHub’a gönderilmemiş ${count} rota değişikliği var. Göndermek için cihaz eşitlemesini bağla.` }),
 sent: count => ({ kind: 'saved', text: `Bu cihazda bekleyen ${count} rota değişikliği GitHub’a kaydedildi.` }),
 failed: (error, what) => ({ kind: 'error', text: failureText(error, what) }),
 waitingSubject: count => `Bekleyen ${count} rota değişikliği`,
 readFailed: () => ({ kind: 'error', text: 'GitHub’daki rotalar okunamadı. Bu cihazdaki rotalar gösteriliyor.' }),
};
