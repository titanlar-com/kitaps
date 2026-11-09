import { VIEW_TEXT } from './core/text.js';

// Every page of the app in one table (ADR 002, phase 2). The address, the header tabs, the
// footer menu and the page titles all read it, so a new page is added here once. This module
// stays free of JSX and CSS: the sitemap and static SEO scripts import it through library.js.
//
// id: the route's view. param: its ?view= value (none for the catalogue). Its words (label: its
// name in the header and the footer menu, heading: the title of its page) are in src/core/text.js. header: one of the header's tabs,
// at most four (the owner's rule, AGENTS.md). footer: its group in the footer menu. shelf: a
// personal shelf of the catalogue, which opens without the catalogue's filters.
/** @type {{id:string,param:string|null,label:string,heading:string,description?:string,header?:boolean,footer:string,shelf?:boolean}[]} */
export const VIEWS = [
 { id: 'books', param: null, ...VIEW_TEXT.books, header: true, footer: 'sections' },
 { id: 'queue', param: 'queue', ...VIEW_TEXT.queue, header: true, footer: 'sections' },
 { id: 'collections', param: 'collections', ...VIEW_TEXT.collections, header: true, footer: 'sections' },
 { id: 'bookstores', param: 'bookstores', ...VIEW_TEXT.bookstores, header: true, footer: 'sections' },
 { id: 'fairs', param: 'fairs', ...VIEW_TEXT.fairs, footer: 'sections' },
 { id: 'notes', param: 'notes', ...VIEW_TEXT.notes, footer: 'sections' },
 { id: 'favorites', param: 'favorites', ...VIEW_TEXT.favorites, footer: 'shortcuts', shelf: true },
 { id: 'owned', param: 'library', ...VIEW_TEXT.owned, footer: 'shortcuts', shelf: true },
];

export const viewById = Object.fromEntries(VIEWS.map(view => [view.id, view]));
export const HEADER_VIEWS = VIEWS.filter(view => view.header).map(view => view.id);

/** The view a ?view= value names; its id is accepted too, and anything else is the catalogue. */
export function viewFromParam(value) {
 return VIEWS.find(view => value && (view.param === value || view.id === value))?.id ?? 'books';
}
