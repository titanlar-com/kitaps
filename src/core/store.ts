/**
 * The one reactive contract of the data core (ADR 003, K5). A snapshot stays the same object
 * until its content changes, which is what React's useSyncExternalStore requires and what
 * keeps any UI from drawing for nothing. Vue, Svelte, Solid, web components or plain code
 * bind to the same two methods.
 */
export type Unsubscribe = () => void;

export interface ReadableStore<S> {
  getSnapshot(): S;
  subscribe(onChange: () => void): Unsubscribe;
}

export interface WritableStore<S> extends ReadableStore<S> {
  set(next: S): void;
  update(change: (current: S) => S): void;
}

/** A feature's state with the commands that change it (ADR 003, K6 and K7). */
export interface ViewModel<S, C> extends ReadableStore<S> {
  readonly commands: C;
  dispose(): void;
}

type Equals<S> = (left: S, right: S) => boolean;

/** Calls each listener once. A listener added during the round waits for the next one;
 * one removed during the round is not called if it has not run yet. */
function notifier() {
  const listeners = new Set<() => void>();
  return {
    add(listener: () => void): Unsubscribe {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    notify(): void {
      for (const listener of [...listeners]) if (listeners.has(listener)) listener();
    },
    get size(): number { return listeners.size; },
  };
}

export function createStore<S>(initial: S, equals: Equals<S> = Object.is): WritableStore<S> {
  let value = initial;
  const listeners = notifier();
  const set = (next: S): void => {
    if (equals(value, next)) return;
    value = next;
    listeners.notify();
  };
  return {
    getSnapshot: () => value,
    subscribe: listener => listeners.add(listener),
    set,
    update: change => set(change(value)),
  };
}

type Snapshots<T extends readonly ReadableStore<unknown>[]> = { [K in keyof T]: T[K] extends ReadableStore<infer S> ? S : never };

/**
 * A value computed from other stores. It is computed again only when a source snapshot is a
 * different object, so it keeps its snapshot even while nobody observes it (React reads the
 * snapshot before it subscribes). It observes its sources only while it is observed itself,
 * and notifies only when its own value changes.
 */
export function derived<const T extends readonly ReadableStore<unknown>[], R>(
  sources: T,
  compute: (...values: Snapshots<T>) => R,
  equals: Equals<R> = Object.is,
): ReadableStore<R> {
  let inputs: unknown[] | undefined;
  let value: R;
  const listeners = notifier();
  let stops: Unsubscribe[] = [];
  const read = (): R => {
    const current = sources.map(source => source.getSnapshot());
    if (inputs && current.every((input, index) => Object.is(input, inputs![index]))) return value;
    const next = compute(...(current as Snapshots<T>));
    if (!inputs || !equals(value, next)) value = next;
    inputs = current;
    return value;
  };
  const sourceChanged = (): void => {
    const before = value;
    if (!Object.is(read(), before)) listeners.notify();
  };
  return {
    getSnapshot: read,
    subscribe(listener) {
      if (!listeners.size) {
        read();
        stops = sources.map(source => source.subscribe(sourceChanged));
      }
      const stop = listeners.add(listener);
      return () => {
        stop();
        if (!listeners.size) { for (const release of stops) release(); stops = []; }
      };
    },
  };
}
