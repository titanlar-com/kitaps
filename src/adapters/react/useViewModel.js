import { useSyncExternalStore } from 'react';

// The React binding of the data core (ADR 003, K5): any store or view model with
// getSnapshot and subscribe. Static rendering reads the same snapshot.
export const useViewModel = store => useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
