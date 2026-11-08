import { viewById, viewFromParam } from './views.js';
import { booksForShelf, emptyFilters, filterBooks, normalize, prepareBooks, sortBooks } from './core/catalog/query.js';
import { STATE_LABELS, migrateStates, toggleState } from './core/personal/marks.js';

// The filter, sort and shelf rules live in the data core (ADR 003, phase 3).
export { booksForShelf, emptyFilters, filterBooks, normalize, prepareBooks, sortBooks };
// The rules of a reader's marks live with the personal library (ADR 003, phase 7a).
export { STATE_LABELS, migrateStates, toggleState };

export const QUALITY_LABELS = { ok: 'Kaynakta doğrulanmış', warn: 'Baskı / çeviri uyarısı', unverified: 'Künye eksik', avoid: 'Kaçınılacak baskı notu' };
export const ORIGIN_LABELS = { atlas: 'Kitap Atlası', local: 'Okuma Kümeleri', kitaps: 'Kitaps', entrepreneurship: 'Girişimcilik araştırması', foundations: 'Temel okumalar araştırması', preparation: 'Ön hazırlık araştırması', children: 'Çocuk kütüphanesi araştırması', shelf: 'Raf taraması değerlendirmesi', originals: 'Özgün kaynaklar araştırması', founders: 'Yönetim kurucuları araştırması', managerprep: 'Yönetici adayı programı', managerareas: 'Yöneticinin okuma alanları', shelfphotos: 'Raf fotoğrafları', peker: 'Sedat Peker videoları', stoic: 'Yönetici için Stoacılık' };
// A day such as "2026-10-04" read as "4 Ekim 2026", independent of the reader's time zone.
const dayFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function formatDay(day) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
 const date = new Date(`${day}T00:00:00Z`);
 // A day that does not exist (2026-02-30) is not shown rather than shown wrong.
 return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day ? dayFormat.format(date) : '';
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
  const view=viewFromParam(p.get('view'));
  const requestedPage=/^\d+$/.test(p.get('page')||'')?Math.max(1,Number(p.get('page'))):1;
  const requestedSize=Number(p.get('page-size')),legacySize=LEGACY_PAGE_SIZES[requestedSize];
  const pageSize=PAGE_SIZES.includes(requestedSize)?requestedSize:legacySize||DEFAULT_PAGE_SIZE;
  const page=legacySize?Math.floor((requestedPage-1)*requestedSize/pageSize)+1:requestedPage;
  return {...defaults,view,sort:['reading','title','author','shared','newest','added','saved'].includes(p.get('sort'))?p.get('sort'):'reading',book:selected?.id||null,page,pageSize};
 }catch{return defaults}
}
export function encodeRoute(route,catalog) {
 const p=new URLSearchParams(),f=route.filters;
 const param=viewById[route.view]?.param;
 if(param)p.set('view',param);
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

