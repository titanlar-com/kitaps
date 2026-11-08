// The browser side of the data core's ports (ADR 003, K4). Only the composition root uses
// these; the core and the views never touch window, history or storage themselves.

/** The address bar and history as a LocationPort (src/core/navigation/navigator.ts). */
export function browserLocation(view = window) {
 return {
  // The hash wins, as decodeRoute reads it: old shared links used the hash.
  current: () => view.location.hash || view.location.search,
  path: () => view.location.pathname,
  push: url => view.history.pushState(null, '', url),
  replace: url => view.history.replaceState(null, '', url),
  back: () => view.history.back(),
  onChange(listener) {
   view.addEventListener('popstate', listener);
   view.addEventListener('hashchange', listener);
   return () => { view.removeEventListener('popstate', listener); view.removeEventListener('hashchange', listener); };
  },
 };
}

/** Storage that fails softly: a blocked read is "nothing kept", a failed write says so. */
export function browserStorage(storage) {
 return {
  read(key) { try { return storage.getItem(key); } catch { return null; } },
  write(key, value) { try { storage.setItem(key, value); return true; } catch { return false; } },
  remove(key) { try { storage.removeItem(key); } catch { /* Nothing to remove. */ } },
 };
}

/** The page being shown, hidden or closed, as sync's LifecyclePort (src/core/sync/controller.js). */
export function browserLifecycle(view = window) {
 return {
  visibility: () => view.document.visibilityState,
  onVisibilityChange(listener) { view.document.addEventListener('visibilitychange', listener); return () => view.document.removeEventListener('visibilitychange', listener); },
  onPageHide(listener) { view.addEventListener('pagehide', listener); return () => view.removeEventListener('pagehide', listener); },
 };
}

/** The page's timers, reached at each use. */
export function browserTimers(view = window) {
 return {
  setInterval: (callback, delay) => view.setInterval(callback, delay),
  clearInterval: handle => view.clearInterval(handle),
  setTimeout: (callback, delay) => view.setTimeout(callback, delay),
  clearTimeout: handle => view.clearTimeout(handle),
 };
}
