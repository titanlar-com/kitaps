import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitHubRouteRegistry, listRoutes, putRoute, removeRoute } from '../state/routeRegistry.ts';

const clock = ms => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/** Why a change did not reach GitHub, in the planner's words. The change always stays on the device. */
const failure = (error, what) => error?.code === 'unauthorized'
 ? `${what} GitHub’a yazılamadı, çünkü anahtar yazma iznine sahip değil. Değişiklik bu cihazda bekliyor.`
 : error?.code === 'rate-limited'
  ? `${what} GitHub’a gönderilemedi, çünkü GitHub istek sınırına ulaşıldı. Değişiklik bu cihazda bekliyor. Saat ${clock(error.retryAt)} sonrasındaki ilk kayıtta ya da sayfa yeniden açıldığında gönderilir.`
  : `${what} GitHub’a gönderilemedi. Değişiklik bu cihazda bekliyor ve sonraki kayıtta yeniden gönderilecek.`;

// The planner's view of the saved routes. A change shows at once from this device's copy; the
// registry then writes it to routes.json in kitaps-state when a GitHub key is connected, and
// keeps it waiting on this device otherwise. Waiting changes are sent when the page opens and
// when the browser comes back online, and the planner says how many still wait.
export function useRouteRegistry(registry) {
 const store = useMemo(() => registry ?? new GitHubRouteRegistry(), [registry]);
 const [document, setDocument] = useState(() => store.cached());
 const [status, setStatus] = useState(null);

 const apply = useCallback(async (mutate, what) => {
  try {
   const { document: next, saved } = await store.update(mutate);
   setDocument(next);
   setStatus(saved
    ? { kind: 'saved', text: `${what} GitHub’a kaydedildi.` }
    : { kind: 'local', text: `${what} bu cihazda saklandı. GitHub’a göndermek için cihaz eşitlemesini bağla.` });
  } catch (error) {
   setDocument(store.cached());
   setStatus({ kind: 'error', text: failure(error, what) });
  }
 }, [store]);

 useEffect(() => {
  let live = true;
  const sendWaiting = async () => {
   const waiting = store.pendingCount();
   if (!live || !waiting) return;
   if (!store.hasToken()) {
    setStatus({ kind: 'local', text: `Bu cihazda GitHub’a gönderilmemiş ${waiting} rota değişikliği var. Göndermek için cihaz eşitlemesini bağla.` });
    return;
   }
   try {
    const { document: next } = await store.flush();
    if (!live) return;
    setDocument(next);
    setStatus({ kind: 'saved', text: `Bu cihazda bekleyen ${waiting} rota değişikliği GitHub’a kaydedildi.` });
   } catch (error) {
    if (live) setStatus({ kind: 'error', text: failure(error, `Bekleyen ${waiting} rota değişikliği`) });
   }
  };
  store.load().then(next => { if (live) setDocument(next); }).then(sendWaiting, () => {
   if (live) setStatus({ kind: 'error', text: 'GitHub’daki rotalar okunamadı. Bu cihazdaki rotalar gösteriliyor.' });
  });
  window.addEventListener('online', sendWaiting);
  return () => { live = false; window.removeEventListener('online', sendWaiting); };
 }, [store]);

 return {
  routes: listRoutes(document),
  status,
  save: route => apply((doc, now) => putRoute(doc, route, now), 'Rota'),
  remove: id => apply((doc, now) => removeRoute(doc, id, now), 'Silme'),
 };
}
