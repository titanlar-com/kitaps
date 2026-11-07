// Every page of the app in one table (ADR 002, phase 2). The address, the header tabs, the
// footer menu and the page titles all read it, so a new page is added here once. This module
// stays free of JSX and CSS: the sitemap and static SEO scripts import it through library.js.
//
// id: the route's view. param: its ?view= value (none for the catalogue). label: its name in the
// header and the footer menu. heading: the title of its page. header: one of the header's tabs,
// at most four (the owner's rule, AGENTS.md). footer: its group in the footer menu. shelf: a
// personal shelf of the catalogue, which opens without the catalogue's filters.
export const VIEWS = [
 { id: 'books', param: null, label: 'Kitaplar', heading: 'Tüm kitaplar', header: true, footer: 'sections' },
 { id: 'queue', param: 'queue', label: 'Sıram', heading: 'Okuma sıram', header: true, footer: 'sections' },
 { id: 'collections', param: 'collections', label: 'Kümeler', heading: 'Kitap kümeleri', header: true, footer: 'sections' },
 { id: 'bookstores', param: 'bookstores', label: 'Kitapçılar', heading: 'Kitapçılar', header: true, footer: 'sections',
  description: 'İstanbul\'da strateji, işletme ve düşünce kitapları için gezilecek kitapçılar, adresleri ve önerilen rotalar.' },
 { id: 'fairs', param: 'fairs', label: 'Kitap fuarları', heading: 'Kitap fuarları', footer: 'sections',
  description: 'Türkiye\'de ve dünyada yaklaşan kitap fuarları, tarihleri, yerleri ve kaynaklarıyla.' },
 { id: 'notes', param: 'notes', label: 'Notlar ve kaynaklar', heading: 'Kaynaklar ve notlar', footer: 'sections' },
 { id: 'favorites', param: 'favorites', label: 'Favoriler', heading: 'Favorilerim', footer: 'shortcuts', shelf: true },
 { id: 'owned', param: 'library', label: 'Kitaplığım', heading: 'Kitaplığım', footer: 'shortcuts', shelf: true },
];

export const viewById = Object.fromEntries(VIEWS.map(view => [view.id, view]));
export const HEADER_VIEWS = VIEWS.filter(view => view.header).map(view => view.id);

/** The view a ?view= value names; its id is accepted too, and anything else is the catalogue. */
export function viewFromParam(value) {
 return VIEWS.find(view => value && (view.param === value || view.id === value))?.id ?? 'books';
}
