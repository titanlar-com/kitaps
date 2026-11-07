import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createStore, derived } from '../../src/core/store.ts';
import { useViewModel } from '../../src/adapters/react/useViewModel.js';

// React is one adapter over the core's store contract (ADR 003, K5). Replacing React means
// rewriting this hook and the components, never the data core.
describe('useViewModel', () => {
  it('shows the snapshot and follows its changes', () => {
    const store = createStore({ count: 1 });
    const { result } = renderHook(() => useViewModel(store));
    expect(result.current).toEqual({ count: 1 });
    act(() => store.set({ count: 2 }));
    expect(result.current).toEqual({ count: 2 });
  });

  it('does not draw again when a source changes but the derived value does not', () => {
    const marks = createStore({ a: ['onemli'] });
    const favourites = derived([marks], states => Object.keys(states).filter(id => states[id].includes('onemli')).length);
    let renders = 0;
    renderHook(() => { renders += 1; return useViewModel(favourites); });
    const before = renders;
    act(() => marks.set({ a: ['onemli', 'alindi'] }));
    expect(renders).toBe(before);
    act(() => marks.set({ a: ['onemli'], b: ['onemli'] }));
    expect(renders).toBe(before + 1);
  });

  it('lets go of the store when the component unmounts', () => {
    const store = createStore(0);
    let listeners = 0;
    const counted = { getSnapshot: store.getSnapshot, subscribe: listener => { listeners += 1; const stop = store.subscribe(listener); return () => { listeners -= 1; stop(); }; } };
    const { unmount } = renderHook(() => useViewModel(counted));
    expect(listeners).toBe(1);
    unmount();
    expect(listeners).toBe(0);
  });
});
