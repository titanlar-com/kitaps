import { afterEach, describe, expect, it } from 'vitest';
import { browserLocation, browserStorage } from '../../src/adapters/browser/ports.js';

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
