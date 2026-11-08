import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserLifecycle, browserLocation, browserStorage, browserTimers } from '../../src/adapters/browser/ports.js';

// The browser side of the core's ports (ADR 003, K4): the address bar and history, and
// storage that fails softly, as App.jsx uses them today.
describe('browserLocation', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('reads the hash before the query, as decodeRoute expects', () => {
    window.history.replaceState(null, '', '/kitaps/?sort=title');
    const location = browserLocation(window);
    expect(location.current()).toBe('?sort=title');
    expect(location.path()).toBe('/kitaps/');
    window.history.replaceState(null, '', '/kitaps/?sort=title#overview');
    expect(location.current()).toBe('#overview');
  });

  it('pushes and replaces history entries', () => {
    window.history.replaceState(null, '', '/kitaps/');
    const location = browserLocation(window);
    const before = window.history.length;
    location.push('/kitaps/?view=queue');
    expect(window.location.search).toBe('?view=queue');
    expect(window.history.length).toBe(before + 1);
    location.replace('/kitaps/?view=notes');
    expect(window.location.search).toBe('?view=notes');
    expect(window.history.length).toBe(before + 1);
  });

  it('tells about the back button and a changed hash until it is stopped', () => {
    const location = browserLocation(window);
    let calls = 0;
    const stop = location.onChange(() => { calls += 1; });
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(calls).toBe(2);
    stop();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(calls).toBe(2);
  });
});

describe('browserStorage', () => {
  it('reads and writes, and reports a failed write instead of throwing', () => {
    const storage = browserStorage(window.localStorage);
    expect(storage.write('kitaplik:test:v1', 'a')).toBe(true);
    expect(storage.read('kitaplik:test:v1')).toBe('a');
    storage.remove('kitaplik:test:v1');
    expect(storage.read('kitaplik:test:v1')).toBe(null);
    const full = browserStorage({ getItem() { throw new Error('blocked'); }, setItem() { throw new DOMException('full', 'QuotaExceededError'); }, removeItem() { throw new Error('blocked'); } });
    expect(full.read('x')).toBe(null);
    expect(full.write('x', 'y')).toBe(false);
    expect(() => full.remove('x')).not.toThrow();
  });
});

describe('browserLifecycle', () => {
  afterEach(() => { delete document.visibilityState; });

  it('reports the page being hidden or closed until it is stopped', () => {
    const lifecycle = browserLifecycle(window);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    expect(lifecycle.visibility()).toBe('hidden');
    let shown = 0;
    let closed = 0;
    const stopShown = lifecycle.onVisibilityChange(() => { shown += 1; });
    const stopClosed = lifecycle.onPageHide(() => { closed += 1; });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    expect([shown, closed]).toEqual([1, 1]);
    stopShown();
    stopClosed();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    expect([shown, closed]).toEqual([1, 1]);
  });
});

describe('browserTimers', () => {
  it('reaches the page timers when they are used', () => {
    const timers = browserTimers(window);
    const spy = vi.spyOn(window, 'setInterval').mockReturnValue(7);
    const clear = vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
    const callback = () => undefined;
    expect(timers.setInterval(callback, 5000)).toBe(7);
    expect(spy).toHaveBeenCalledWith(callback, 5000);
    timers.clearInterval(7);
    expect(clear).toHaveBeenCalledWith(7);
    vi.restoreAllMocks();
  });

  it('runs and cancels a single delay', async () => {
    const timers = browserTimers(window);
    let runs = 0;
    timers.clearTimeout(timers.setTimeout(() => { runs += 10; }, 0));
    await new Promise(resolve => timers.setTimeout(() => { runs += 1; resolve(); }, 0));
    expect(runs).toBe(1);
  });
});
