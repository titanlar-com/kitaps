import { createStore, type ViewModel } from '../store.ts';

/** Browser storage as the core sees it (ADR 003, K4): a failed write says so instead of throwing. */
export interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  remove(key: string): void;
}

export const HIDE_OWNED_KEY = 'kitaplik:hide-owned:v1';

export interface SettingsSnapshot {
  /** "Satın aldıklarımı gösterme": on unless the reader turned it off. */
  readonly hideOwned: boolean;
  /** False when the browser refused to keep the last choice; it still holds for this visit. */
  readonly saved: boolean;
}

/** The reader's device settings, read and written as App.jsx does today. */
export function createSettings(storage: KeyValueStore): ViewModel<SettingsSnapshot, { setHideOwned(on: boolean): void }> {
  const write = (hideOwned: boolean): SettingsSnapshot => ({ hideOwned, saved: storage.write(HIDE_OWNED_KEY, hideOwned ? 'on' : 'off') });
  const state = createStore(write(storage.read(HIDE_OWNED_KEY) !== 'off'), (a, b) => a.hideOwned === b.hideOwned && a.saved === b.saved);
  return {
    getSnapshot: state.getSnapshot,
    subscribe: state.subscribe,
    commands: { setHideOwned: on => state.set(write(on)) },
    dispose: () => undefined,
  };
}
