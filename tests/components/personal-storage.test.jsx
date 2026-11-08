import { describe, expect, it } from 'vitest';

// A browser that blocks storage throws on the very name `localStorage`, so the page's wiring must
// reach it only when it is used (ADR 003, phase 7a).
describe('the page\'s personal library on a browser that blocks storage', () => {
  it('opens, warns and keeps changes for the visit', async () => {
    const real = globalThis.localStorage;
    const { deviceStorage } = await import('../../src/adapters/browser/ports.js');
    const { createPersonalLibrary } = await import('../../src/core/personal/library.ts');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } });
    try {
      const library = createPersonalLibrary({ storage: deviceStorage, books: [], now: () => new Date(0) });
      expect(library.getSnapshot().saved).toBe(false);
      expect(library.getSnapshot().states).toEqual({});
      library.commands.addToQueue('x');
      expect(library.getSnapshot().personal.queue).toEqual(['x']);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: real });
    }
  });
});
