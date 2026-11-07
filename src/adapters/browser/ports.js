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
