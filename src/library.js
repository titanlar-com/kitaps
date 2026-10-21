import { displayTitle } from './translation.js';

export const STATE_LABELS = { onemli: 'Favori', alinacak: 'Alınacak', alindi: 'Satın alındı', okunuyor: 'Okunuyor', okundu: 'Okundu', araverildi: 'Ara verdim', birakildi: 'Bıraktım' };
export const QUALITY_LABELS = { ok: 'Kaynakta doğrulanmış', warn: 'Baskı / çeviri uyarısı', unverified: 'Künye eksik', avoid: 'Kaçınılacak baskı notu' };
export const ORIGIN_LABELS = { atlas: 'Kitap Atlası', local: 'Okuma Kümeleri', kitaps: 'Kitaps', entrepreneurship: 'Girişimcilik araştırması', foundations: 'Temel okumalar araştırması', preparation: 'Ön hazırlık araştırması', children: 'Çocuk kütüphanesi araştırması', shelf: 'Raf taraması değerlendirmesi', originals: 'Özgün kaynaklar araştırması' };
export const emptyFilters = () => ({ query: '', categories: [], collections: [], groups: [], states: [], authors: [], origins: [], awards: [], awardYears: [], qualities: [], addedDates: [], categoryMode: 'any', collectionMode: 'any', hasEdition: false, shared: false, yearMin: '', yearMax: '' });
// A day such as "2026-10-04" read as "4 Ekim 2026", independent of the reader's time zone.
const dayFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function formatDay(day) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
 const date = new Date(`${day}T00:00:00Z`);
 // A day that does not exist (2026-02-30) is not shown rather than shown wrong.
 return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day ? dayFormat.format(date) : '';
}
export const normalize = value => String(value ?? '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");
export function prepareBooks(books) {
 return books.map(book => ({ ...book, searchText: normalize([book.title, book.titleTr, book.cover?.title, book.cover?.publisher, book.cover?.isbn, book.author, ...book.aliases, ...(book.verifiedEdition?.translators||[]), book.verifiedEdition?.publisher, book.verifiedEdition?.isbn, ...book.editions.flatMap(e => [e.translator,e.publisher,e.turkish,e.original]), ...book.notes.map(n=>n.text)].join(' ')) }));
}
const matchesValues = (actual, selected, mode = 'any') => !selected.length || (mode === 'all' ? selected.every(x => actual.includes(x)) : selected.some(x => actual.includes(x)));
export function filterBooks(books, filters, states = {}) {
 const f = { ...emptyFilters(), ...filters };
 const tokens = normalize(f.query).trim().split(/\s+/).filter(Boolean);
 return books.filter(b => {
  if (!tokens.every(t => b.searchText.includes(t))) return false;
  if (!matchesValues(b.categories, f.categories, f.categoryMode)) return false;
  if (!matchesValues(b.collectionIds, f.collections, f.collectionMode)) return false;
  if (!matchesValues(b.groupIds, f.groups)) return false;
  if (!matchesValues(states[b.id] || [], f.states)) return false;
  if (!matchesValues([b.author], f.authors)) return false;
  if (!matchesValues(b.origins, f.origins)) return false;
  if (!matchesValues([b.addedAt], f.addedDates)) return false;
  if (!matchesValues(b.editions.flatMap(e => e.status || []), f.qualities)) return false;
  if (f.hasEdition && !b.verifiedEdition && !b.editions.some(e => e.translator || e.publisher)) return false;
  if (f.shared && b.collectionIds.length < 2) return false;
  if ((f.yearMin !== '' || f.yearMax !== '') && !b.years.some(y => (f.yearMin === '' || y >= Number(f.yearMin)) && (f.yearMax === '' || y <= Number(f.yearMax)))) return false;
  // The award and its year must match the SAME membership, not two unrelated records.
  if ((f.awards.length || f.awardYears.length) && !b.memberships.some(m => m.collectionId === 'ft' && matchesValues([m.award],f.awards) && matchesValues([String(m.awardYear)],f.awardYears))) return false;
  return true;
 });
}
export function sortBooks(books, sort, states = {}, rankings = {}) {
 const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
 const title = b => displayTitle(b);
 return [...books].sort((a,b) => {
  const tie = () => collator.compare(title(a),title(b));
  // General books come before children's books, which are ranked among
  // themselves. Books with an equal priority share a rank and read
  // alphabetically by the title the reader sees, never by internal identifiers.
  const audience = id => rankings[id]?.audience === 'children' ? 1 : 0;
  const byReading = () => audience(a.id)-audience(b.id)||(rankings[a.id]?.rank??Number.MAX_SAFE_INTEGER)-(rankings[b.id]?.rank??Number.MAX_SAFE_INTEGER)||tie();
  if (sort === 'reading') return byReading();
  // Latest additions first; books added on the same day keep their reading order.
  if (sort === 'added') return (b.addedAt||'').localeCompare(a.addedAt||'') || byReading();
  if (sort === 'shared') return b.collectionIds.length - a.collectionIds.length || tie();
  if (sort === 'author') return collator.compare(a.author,b.author) || tie();
  if (sort === 'newest') return Math.max(0,...b.years) - Math.max(0,...a.years) || tie();
  if (sort === 'saved') return Number((states[b.id]||[]).includes('onemli')) - Number((states[a.id]||[]).includes('onemli')) || tie();
  return tie();
 });
}
export function toggleState(current, key) {
 const result = new Set(current || []);
 if (result.has(key)) result.delete(key);
 else {
  result.add(key);
  const opposite = { alinacak: 'alindi', alindi: 'alinacak', okunuyor: 'okundu', okundu: 'okunuyor' }[key];
  if (opposite) result.delete(opposite);
  const readingStates=['okunuyor','okundu','araverildi','birakildi'];
  if(readingStates.includes(key))for(const state of readingStates)if(state!==key)result.delete(state);
 }
 return [...result];
}
export function migrateStates(books, own, legacy) {
 const result = Object.fromEntries(Object.entries(own || {}).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.filter(s=>s in STATE_LABELS)]));
 for (const b of books) {
  if (Object.hasOwn(result,b.id)) continue;
  const values = b.legacyKeys.flatMap(k => Array.isArray(legacy?.[k]) ? legacy[k] : []).filter(s => s in STATE_LABELS);
  if (values.length) result[b.id] = [...new Set(values)];
 }
 return result;
}
export function filterCount(f) {
 return Object.entries(f).reduce((n,[k,v])=>n + (k.endsWith('Mode') ? 0 : Array.isArray(v) ? v.length : v ? 1 : 0),0);
}
const routeFields={categories:'category',collections:'collection',groups:'group',states:'status',authors:'author',origins:'source',awards:'award',awardYears:'award-year',qualities:'edition-status',addedDates:'added'};
const englishValues={onemli:'important',alinacak:'wishlist',alindi:'purchased',okunuyor:'reading',araverildi:'paused',birakildi:'abandoned',okundu:'finished',Kazanan:'winner','Kısa liste':'shortlist','Uzun liste':'longlist'};
const originalValues=Object.fromEntries(Object.entries(englishValues).map(([key,value])=>[value,key]));
const englishBookTitles={'преступлениеинаказание':'Crime and Punishment','братьякарамазовы':'The Brothers Karamazov','запискиизподполья':'Notes from Underground','идиот':'The Idiot','воинаимир':'War and Peace','аннакаренина':'Anna Karenina','смертьиванаильича':'The Death of Ivan Ilyich','чемлюдиживы':'What Men Live By','шинель':'The Overcoat','нос':'The Nose',
 // Bandura's 1977 article and his 1997 book share the words before their colon.
 'selfefficacytowardaunifyingtheoryofbehavioralchange':'Self-Efficacy Toward a Unifying Theory of Behavioral Change'};
const asciiSlug=value=>String(value||'').normalize('NFKD').replace(/ı/g,'i').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// A book whose author credit was corrected keeps the author line its URL was first built from.
export function bookSlug(book){
 const original=englishBookTitles[book.id]||book.title.split(':')[0];
 const readableTitle=asciiSlug(original)||asciiSlug(book.titleTr)||asciiSlug(book.id)||'book';
 return `${readableTitle}-by-${asciiSlug(book.slugAuthor||book.author)||'unknown'}`.slice(0,200);
}
// The owner's fixed rule (AGENTS.md): page sizes are multiples of 24, so the 2-, 3- and
// 4-column catalog grids always end on a full row. The first one is the default.
export const PAGE_SIZES=[24,48,96,192,384];
export const DEFAULT_PAGE_SIZE=PAGE_SIZES[0];
// The column counts the catalog grid may use (styles.css sets them through --books-columns).
export const GRID_COLUMNS=[2,3,4];
// Links shared before a change still open on the page holding their first book.
const LEGACY_PAGE_SIZES={12:24,25:24,50:48,75:96,100:96};
export function decodeRoute(location, catalog) {
 const defaults={filters:emptyFilters(),view:'books',sort:'reading',book:null,page:1,pageSize:DEFAULT_PAGE_SIZE};
 const raw=location.replace(/^[#?]/,'');
 if(catalog.collections.some(c=>c.id===raw))return {...defaults,filters:{...emptyFilters(),collections:[raw]}};
 if(raw==='overview')return {...defaults,view:'collections'};
 if(raw==='sources')return {...defaults,view:'notes'};
 try {
  const p=new URLSearchParams(raw),f=defaults.filters;
  // Retain old shared hash links containing JSON filters.
  const parsed=JSON.parse(p.get('f')||'{}');
  for(const [key,value] of Object.entries(parsed)){
   if(!(key in f))continue;
   if(Array.isArray(f[key])&&Array.isArray(value))f[key]=value.filter(x=>typeof x==='string');
   else if(typeof value===typeof f[key]||['yearMin','yearMax'].includes(key)&&typeof value==='number')f[key]=value;
  }
  for(const [key,param] of Object.entries(routeFields))if(p.has(param))f[key]=p.getAll(param).map(v=>originalValues[v]||v);
  if(p.has('q'))f.query=p.get('q');
  if(p.has('category-match'))f.categoryMode=p.get('category-match')==='all'?'all':'any';
  if(p.has('collection-match'))f.collectionMode=p.get('collection-match')==='all'?'all':'any';
  if(p.has('edition'))f.hasEdition=p.get('edition')==='known';
  if(p.has('shared'))f.shared=p.get('shared')==='true';
  for(const [key,param] of [['yearMin','year-from'],['yearMax','year-to']])if(p.has(param)&&p.get(param).trim()!==''&&Number.isFinite(Number(p.get(param))))f[key]=Number(p.get(param));
  const known={categories:catalog.categories?.map(c=>c.id),collections:catalog.collections.map(c=>c.id),groups:catalog.groups?.map(g=>g.id),states:Object.keys(STATE_LABELS),qualities:Object.keys(QUALITY_LABELS),origins:Object.keys(ORIGIN_LABELS),addedDates:[...new Set(catalog.books.map(b=>b.addedAt).filter(Boolean))]};
  for(const [key,values] of Object.entries(known))if(values)f[key]=[...new Set(f[key])].filter(v=>values.includes(v));
  const selected=catalog.books.find(b=>b.id===p.get('book'))||catalog.books.find(b=>bookSlug(b)===p.get('book'));
  const view=p.get('view')==='library'?'owned':p.get('view');
  const requestedPage=/^\d+$/.test(p.get('page')||'')?Math.max(1,Number(p.get('page'))):1;
  const requestedSize=Number(p.get('page-size')),legacySize=LEGACY_PAGE_SIZES[requestedSize];
  const pageSize=PAGE_SIZES.includes(requestedSize)?requestedSize:legacySize||DEFAULT_PAGE_SIZE;
  const page=legacySize?Math.floor((requestedPage-1)*requestedSize/pageSize)+1:requestedPage;
  return {...defaults,view:['books','owned','favorites','queue','collections','notes'].includes(view)?view:'books',sort:['reading','title','author','shared','newest','added','saved'].includes(p.get('sort'))?p.get('sort'):'reading',book:selected?.id||null,page,pageSize};
 }catch{return defaults}
}
export function encodeRoute(route,catalog) {
 const p=new URLSearchParams(),f=route.filters;
 if(route.view!=='books')p.set('view',route.view==='owned'?'library':route.view);
 if(f.query)p.set('q',f.query);
 for(const [key,param] of Object.entries(routeFields))for(const value of f[key])p.append(param,englishValues[value]||value);
 if(f.categoryMode==='all')p.set('category-match','all');
 if(f.collectionMode==='all')p.set('collection-match','all');
 if(f.hasEdition)p.set('edition','known');
 if(f.shared)p.set('shared','true');
 if(f.yearMin!=='')p.set('year-from',f.yearMin);
 if(f.yearMax!=='')p.set('year-to',f.yearMax);
 if(route.sort!=='reading')p.set('sort',route.sort);
 if((route.page||1)>1)p.set('page',String(Math.floor(route.page)));
 if((route.pageSize||DEFAULT_PAGE_SIZE)!==DEFAULT_PAGE_SIZE)p.set('page-size',String(route.pageSize));
 if(route.book){const book=catalog?.books.find(b=>b.id===route.book);p.set('book',book?bookSlug(book):route.book)}
 return p.toString();
}

// Keep source meaning while rendering the user's library without emoji.
export function plainTextMarkers(text) {
 return text.replace(/\u2705\uFE0F?/gu,'[Doğrulandı]')
  .replace(/\u26A0\uFE0F?/gu,'[Dikkat]')
  .replace(/\u2753\uFE0F?/gu,'[Doğrulanmadı]')
  .replace(/\u{1F6AB}\uFE0F?/gu,'[Bu baskıdan kaçın]');
}

export function booksForShelf(books,states,shelf='catalog') {
 return books.filter(book=>shelf==='owned'?(states[book.id]||[]).includes('alindi'):shelf==='favorites'?(states[book.id]||[]).includes('onemli'):true);
}
