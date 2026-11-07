import { sibling } from './sibling.js';
// Names a browser has, used here only as local names, keys, properties and text.
const document = { title: 'Kitaplık' };
export const parts = { navigator: './navigation/navigator.ts', history: [sibling], location: document.title };
export function title(page) { const window = page.window; return window.document + parts.location; }
export const route = ({ location }) => location;
