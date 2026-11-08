import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// Mantine reads these browser APIs, which jsdom does not provide.
globalThis.matchMedia ??= query => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
