import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitHubRouteRegistry, listRoutes, putRoute, removeRoute } from '../state/routeRegistry.ts';
import { routeRegistryStatus, routeRegistrySubjects } from '../screens/routePlanner.js';

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
   setStatus(routeRegistryStatus.applied(what, saved));
  } catch (error) {
   setDocument(store.cached());
   setStatus(routeRegistryStatus.failed(error, what));
  }
 }, [store]);

 useEffect(() => {
  let live = true;
  const sendWaiting = async () => {
   const waiting = store.pendingCount();
   if (!live || !waiting) return;
   if (!store.hasToken()) {
    setStatus(routeRegistryStatus.waiting(waiting));
    return;
   }
   try {
    const { document: next } = await store.flush();
    if (!live) return;
    setDocument(next);
    setStatus(routeRegistryStatus.sent(waiting));
   } catch (error) {
    if (live) setStatus(routeRegistryStatus.failed(error, routeRegistryStatus.waitingSubject(waiting)));
   }
  };
  store.load().then(next => { if (live) setDocument(next); }).then(sendWaiting, () => {
   if (live) setStatus(routeRegistryStatus.readFailed());
  });
  window.addEventListener('online', sendWaiting);
  return () => { live = false; window.removeEventListener('online', sendWaiting); };
 }, [store]);

 return {
  routes: listRoutes(document),
  status,
  save: route => apply((doc, now) => putRoute(doc, route, now), routeRegistrySubjects.save),
  remove: id => apply((doc, now) => removeRoute(doc, id, now), routeRegistrySubjects.remove),
 };
}
