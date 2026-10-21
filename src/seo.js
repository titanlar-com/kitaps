import { DEFAULT_PAGE_SIZE, bookSlug, emptyFilters, encodeRoute } from './library.js';
import { displayTitle } from './translation.js';
import { workFormat } from './workFormat.js';
import { SITE_URL } from './site.js';

const SITE_NAME='Kitaplık';
const baseDescription=catalog=>`${catalog.books.length} kitap; araştırılmış seçkiler, konu rotaları, çeviri, çevirmen ve baskı bilgileriyle tek katalogda.`;

function publicListing(route) {
 const f=route.filters;
 const privateOrThin=f.query||f.states.length||f.authors.length||f.origins.length||f.awards.length||f.awardYears.length||f.qualities.length||f.addedDates.length||f.hasEdition||f.shared||f.yearMin!==''||f.yearMax!==''||f.categoryMode==='all'||f.collectionMode==='all';
 const taxonomyCount=f.categories.length+f.collections.length+f.groups.length;
 return route.view==='books'&&route.sort==='title'&&(route.pageSize||DEFAULT_PAGE_SIZE)===DEFAULT_PAGE_SIZE&&!privateOrThin&&taxonomyCount<=1;
}

const cleanRoute=(route,book=null)=>({filters:emptyFilters(),view:'books',sort:'reading',book,page:1,pageSize:DEFAULT_PAGE_SIZE});

function siteBase() {
 const site=new URL(SITE_URL);
 const origin=globalThis.location?.origin||site.origin;
 const pathname=globalThis.location?.pathname||site.pathname;
 const root=pathname.endsWith('/')?pathname:pathname.slice(0,pathname.lastIndexOf('/')+1);
 return `${origin}${root}`;
}

export function staticListingUrl(route,page=1) {
 const root=`${siteBase()}catalog/`;
 const f=route.filters;
 let path='';
 const taxonomyCount=f.categories.length+f.collections.length+f.groups.length;
 if(taxonomyCount===1&&f.categories.length===1)path=`category/${encodeURIComponent(f.categories[0])}/`;
 else if(taxonomyCount===1&&f.collections.length===1)path=`collection/${encodeURIComponent(f.collections[0])}/`;
 else if(taxonomyCount===1&&f.groups.length===1)path=`group/${encodeURIComponent(f.groups[0])}/`;
 return `${root}${path}${page>1?`page/${page}/`:''}`;
}

export function staticBookUrl(book) {
 return `${siteBase()}catalog/books/${encodeURIComponent(bookSlug(book))}/`;
}

export function seoState({route,catalog,count,currentPage,totalPages,displayed}) {
 const book=route.book?catalog.books.find(item=>item.id===route.book):null;
 const category=route.filters.categories.length===1?catalog.categories.find(item=>item.id===route.filters.categories[0]):null;
 const collection=route.filters.collections.length===1?catalog.collections.find(item=>item.id===route.filters.collections[0]):null;
 const group=route.filters.groups.length===1?catalog.groups.find(item=>item.id===route.filters.groups[0]):null;
 const indexable=!!book||publicListing(route);
 const pageSuffix=currentPage>1?` — Sayfa ${currentPage}`:'';
 const groupCollection=group?catalog.collections.find(item=>item.id===group.collectionId):null;
 let heading=category?.label||collection?.title||(group?`${groupCollection?.short||groupCollection?.title||''} · ${group.title}`:'')||'Tüm kitaplar';
 if(route.view==='collections')heading='Kitap kümeleri';
 if(route.view==='notes')heading='Kaynaklar ve notlar';
 if(route.view==='queue')heading='Okuma sıram';
 if(route.view==='owned')heading='Kitaplığım';
 if(route.view==='favorites')heading='Favorilerim';
 const title=book?`${displayTitle(book)} — ${book.author} | ${SITE_NAME}`:`${heading}${pageSuffix} | ${SITE_NAME}`;
 const start=count?((currentPage-1)*(route.pageSize||DEFAULT_PAGE_SIZE))+1:0;
 const end=Math.min(currentPage*(route.pageSize||DEFAULT_PAGE_SIZE),count);
 const description=book?`${displayTitle(book)}, ${book.author}. Türkçe baskı, çeviri, yayınevi, kaynak kümeleri ve okuma rotası bilgileri.`:`${heading}: ${count} kitap${count?`; ${start}–${end} arası eserler`:''}. Kaynakları ve baskı bilgileriyle insan odaklı okuma kataloğu.`;
 const canonicalQuery=encodeRoute(book?cleanRoute(route,book.id):cleanRoute(route),catalog);
 const href=query=>`${siteBase()}${query?'?'+query:''}`;
 const canonical=book?staticBookUrl(book):staticListingUrl(route,indexable?currentPage:1);
 const structured=book?{
  '@context':'https://schema.org','@type':workFormat(book)?.schema||'Book',name:displayTitle(book),author:{'@type':'Person',name:book.author},inLanguage:book.cover?.language||undefined,isbn:book.verifiedEdition?.isbn||book.cover?.isbn||undefined,isPartOf:book.format==='article'&&book.publication?.venue?{'@type':'Periodical',name:book.publication.venue}:undefined,url:canonical
 }:{
  '@context':'https://schema.org','@type':'CollectionPage',name:heading,description,url:canonical,
  ...(indexable?{mainEntity:{'@type':'ItemList',numberOfItems:count,itemListElement:displayed.map((item,index)=>({'@type':'ListItem',position:start+index,url:staticBookUrl(item),name:displayTitle(item)}))}}:{})
 };
 return {title,description:description||baseDescription(catalog),robots:indexable?'index,follow':'noindex,follow',canonical,prev:indexable&&currentPage>1?staticListingUrl(route,currentPage-1):'',next:indexable&&currentPage<totalPages?staticListingUrl(route,currentPage+1):'',structured,interactive:href(canonicalQuery),ogType:book?(workFormat(book)?'article':'book'):'website'};
}

function upsertMeta(name,content) {
 let element=document.head.querySelector(`meta[name="${name}"]`);
 if(!element){element=document.createElement('meta');element.setAttribute('name',name);document.head.append(element)}
 element.setAttribute('content',content);
}
function upsertProperty(property,content) {
 let element=document.head.querySelector(`meta[property="${property}"]`);
 if(!element){element=document.createElement('meta');element.setAttribute('property',property);document.head.append(element)}
 element.setAttribute('content',content);
}
function upsertLink(rel,href) {
 let element=document.head.querySelector(`link[rel="${rel}"]`);
 if(!href){element?.remove();return}
 if(!element){element=document.createElement('link');element.setAttribute('rel',rel);document.head.append(element)}
 element.setAttribute('href',href);
}

export function applySeo(state) {
 document.title=state.title;
 upsertMeta('description',state.description);
 upsertMeta('robots',state.robots);
 upsertMeta('twitter:card','summary');
 upsertMeta('twitter:title',state.title);
 upsertMeta('twitter:description',state.description);
 upsertProperty('og:type',state.ogType||'website');
 upsertProperty('og:title',state.title);
 upsertProperty('og:description',state.description);
 upsertProperty('og:url',state.canonical);
 upsertLink('canonical',state.canonical);
 upsertLink('prev',state.prev);
 upsertLink('next',state.next);
 let script=document.getElementById('page-structured-data');
 if(!script){script=document.createElement('script');script.id='page-structured-data';script.setAttribute('type','application/ld+json');document.head.append(script)}
 script.textContent=JSON.stringify(state.structured);
}
