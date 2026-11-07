import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitHubRouteRegistry, listRoutes, putRoute, removeRoute } from '../state/routeRegistry.ts';

// The planner's view of the saved routes. A change shows at once from this device's copy; the
// registry then writes it to routes.json in kitaps-state when a GitHub key is connected, and
// keeps it waiting on this device otherwise.
export function useRouteRegistry(registry) {
 const store = useMemo(() => registry ?? new GitHubRouteRegistry(), [registry]);
 const [document, setDocument] = useState(() => store.cached());
 const [status, setStatus] = useState(null);

 useEffect(() => {
  let live = true;
  store.load().then(next => { if (live) setDocument(next); }).catch(() => {
   if (live) setStatus({ kind: 'error', text: 'GitHub’daki rotalar okunamadı. Bu cihazdaki rotalar gösteriliyor.' });
  });
  return () => { live = false; };
 }, [store]);

 const apply = useCallback(async (mutate, what) => {
  try {
   const { document: next, saved } = await store.update(mutate);
   setDocument(next);
   setStatus(saved
    ? { kind: 'saved', text: `${what} GitHub’a kaydedildi.` }
    : { kind: 'local', text: `${what} bu cihazda saklandı. GitHub’a göndermek için cihaz eşitlemesini bağla.` });
  } catch (error) {
   setDocument(store.cached());
   setStatus({ kind: 'error', text: error?.code === 'unauthorized'
    ? `${what} GitHub’a yazılamadı, çünkü anahtar yazma iznine sahip değil. Değişiklik bu cihazda bekliyor.`
    : `${what} GitHub’a gönderilemedi. Değişiklik bu cihazda bekliyor ve sonraki kayıtta yeniden gönderilecek.` });
  }
 }, [store]);

 return {
  routes: listRoutes(document),
  status,
  save: route => apply((doc, now) => putRoute(doc, route, now), 'Rota'),
  remove: id => apply((doc, now) => removeRoute(doc, id, now), 'Silme'),
 };
}
