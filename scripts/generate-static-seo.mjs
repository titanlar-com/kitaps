import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PAGE_SIZE, bookSlug } from '../src/library.js';
import { displayTitle,recommendedTranslation,translationStatus,turkishEdition } from '../src/translation.js';
import { readingGuide } from '../src/recommendations.js';
import { splitAuthors } from '../src/authors.js';
import { publicationLine,publicationLinkLabel,publicationUrl,workFormat } from '../src/workFormat.js';
import { SITE_URL } from '../src/site.js';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(fs.readFileSync(path.join(projectRoot,'src/catalog.json'),'utf8'));
const outputRoot=path.resolve(process.argv[2]||path.join(projectRoot,'dist'));
if(path.basename(outputRoot)!=='dist')throw new Error(`Static SEO output must be a dist directory: ${outputRoot}`);
const catalogRoot=path.join(outputRoot,'catalog');
const publicBase=`${SITE_URL}catalog/`;
const appBase=SITE_URL;
const pageSize=DEFAULT_PAGE_SIZE;
const collator=new Intl.Collator('tr',{sensitivity:'base',numeric:true});
const byTitle=[...catalog.books].sort((a,b)=>collator.compare(displayTitle(a),displayTitle(b))||collator.compare(a.author,b.author));
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const collectionMap=Object.fromEntries(catalog.collections.map(item=>[item.id,item]));
const bookUrl=book=>`${publicBase}books/${encodeURIComponent(bookSlug(book))}/`;
// Several source lists reuse generic group names ("Kitap listesi"), so a group
// page is always named together with its collection.
const groupHeading=group=>`${collectionMap[group.collectionId]?.short||collectionMap[group.collectionId]?.title||''} · ${group.title}`;
const summary=(value,limit=158)=>{const clean=String(value||'').replace(/\s+/g,' ').trim();return clean.length>limit?`${clean.slice(0,limit-1).replace(/\s+\S*$/,'')}…`:clean;};

export const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const pagePath=(prefix,page)=>`${prefix}${page>1?`page/${page}/`:''}`;
const canonicalFor=(prefix,page)=>`${publicBase}${pagePath(prefix,page)}`;
const interactiveFor=({category,collection,group,book}={})=>{
 const query=new URLSearchParams();
 if(category)query.set('category',category);
 if(collection)query.set('collection',collection);
 if(group)query.set('group',group);
 if(book)query.set('book',bookSlug(book));
 return `${appBase}${query.size?`?${query}`:''}`;
};

function documentShell({title,description,canonical,type='website',structured,body,prev='',next='',image=''}) {
 return `<!doctype html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHtml(canonical)}">${prev?`<link rel="prev" href="${escapeHtml(prev)}">`:''}${next?`<link rel="next" href="${escapeHtml(next)}">`:''}
<meta property="og:type" content="${type}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${image?`<meta property="og:image" content="${escapeHtml(image)}">`:''}<meta name="twitter:card" content="summary">
<script type="application/ld+json">${json(structured)}</script>
<style>:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{max-width:52rem;margin:0 auto;padding:2rem 1rem;line-height:1.6}a{color:inherit;text-underline-offset:.2em}li{margin:.65rem 0}.meta{opacity:.75}.actions{display:flex;gap:1rem;flex-wrap:wrap;margin:1.5rem 0}.pagination{display:flex;justify-content:space-between;margin-top:2rem}main>img{float:right;max-width:38%;height:auto;margin:0 0 1rem 1rem;border-radius:6px}h2{font-size:1.15rem;margin-top:1.75rem}</style></head><body>${body}</body></html>\n`;
}

function write(relative,html) {
 const directory=path.join(catalogRoot,relative);
 fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'index.html'),html);
}

function renderListing({prefix='',heading='Tüm kitaplar',description='Araştırılmış seçkiler, konu rotaları, çeviri, çevirmen ve baskı bilgileriyle kitap kataloğu.',books=byTitle,interactive=interactiveFor()}) {
 const pages=Math.max(1,Math.ceil(books.length/pageSize));
 for(let page=1;page<=pages;page++){
  const canonical=canonicalFor(prefix,page);
  const shown=books.slice((page-1)*pageSize,page*pageSize);
  const title=`${heading}${page>1?` — Sayfa ${page}`:''} | Kitaplık`;
  const pageDescription=`${heading}: ${books.length} kitap; ${((page-1)*pageSize)+1}–${Math.min(page*pageSize,books.length)} arası eserler. Başlığa göre kararlı katalog sırası.`;
  const structured={'@context':'https://schema.org','@type':'CollectionPage',name:heading,description:pageDescription,url:canonical,mainEntity:{'@type':'ItemList',numberOfItems:books.length,itemListElement:shown.map((book,index)=>({'@type':'ListItem',position:(page-1)*pageSize+index+1,url:`${publicBase}books/${encodeURIComponent(bookSlug(book))}/`,name:displayTitle(book)}))}};
  const items=shown.map(book=>`<li><a href="${publicBase}books/${encodeURIComponent(bookSlug(book))}/">${escapeHtml(displayTitle(book))}</a><span class="meta"> — ${escapeHtml(book.author)}</span></li>`).join('');
  const prev=page>1?canonicalFor(prefix,page-1):'';
  const next=page<pages?canonicalFor(prefix,page+1):'';
  const body=`<header><a href="${publicBase}">Kitaplık</a><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p><p class="meta">${books.length} eser · başlığa göre sıralı · sayfa ${page}/${pages}</p><p class="actions"><a href="${escapeHtml(interactive)}">Etkileşimli katalogda aç</a></p></header><main><ol start="${(page-1)*pageSize+1}">${items}</ol><nav class="pagination" aria-label="Sayfalar">${prev?`<a rel="prev" href="${prev}">Önceki sayfa</a>`:'<span></span>'}${next?`<a rel="next" href="${next}">Sonraki sayfa</a>`:''}</nav></main>`;
  write(pagePath(prefix,page),documentShell({title,description:pageDescription,canonical,structured,body,prev,next}));
 }
}

function renderBook(book) {
 const slug=bookSlug(book);
 const canonical=bookUrl(book);
 const shown=displayTitle(book);
 const status=translationStatus(book);
 const edition=['available','original'].includes(status.status)?turkishEdition(book):null;
 const translation=recommendedTranslation(book);
 const guide=readingGuide(book,catalog);
 const title=`${shown} — ${book.author} | Kitaplık`;
 const description=summary(`${shown}, ${book.author}. ${guide.purpose}`);
 const image=book.cover?`${appBase}${book.cover.src}`:'';
 const authors=splitAuthors(book.author).map(name=>({'@type':'Person',name}));
 const format=workFormat(book);
 const structured={'@context':'https://schema.org','@type':format?.schema||'Book',name:shown,author:authors.length>1?authors:authors[0],inLanguage:edition?'tr':book.cover?.language||undefined,isbn:edition?.isbn||book.cover?.isbn||undefined,publisher:edition?.publisher?{'@type':'Organization',name:edition.publisher}:undefined,translator:translation?.translators.map(name=>({'@type':'Person',name})),alternateName:book.originalTitle&&book.originalTitle!==shown?book.originalTitle:undefined,isPartOf:book.format==='article'&&book.publication?.venue?{'@type':'Periodical',name:book.publication.venue}:undefined,image:image||undefined,url:canonical};
 const categories=book.categories.map(id=>catalog.categories.find(item=>item.id===id)).filter(Boolean);
 const facts=[
  book.originalTitle&&book.originalTitle!==shown?`Özgün ad: ${book.originalTitle}`:'',
  book.years.length?`İlk yayın: ${book.years.join(' / ')}`:'',
  format?`${format.label}: ${publicationLine(book.publication)}`:'',
  `Türkçe baskı: ${status.label}`,
  edition?.publisher?`Yayınevi: ${edition.publisher}`:'',
  translation?.translators.length?`Önerilen çeviri: ${translation.translators.join(', ')}${translation.publisher?` (${translation.publisher})`:''}`:'',
  edition?.isbn?`ISBN: ${edition.isbn}`:'',
 ].filter(Boolean).map(item=>`<li>${escapeHtml(item)}</li>`).join('');
 const links=(items,label)=>items.length?`<h2>${label}</h2><ul>${items.map(link=>`<li><a href="${escapeHtml(bookUrl(byId[link.id]))}">${escapeHtml(displayTitle(byId[link.id]))}</a> — ${escapeHtml(link.reason)}</li>`).join('')}</ul>`:'';
 const topics=categories.length?`<p>Konular: ${categories.map(item=>`<a href="${publicBase}category/${encodeURIComponent(item.id)}/">${escapeHtml(item.label)}</a>`).join(', ')}</p>`:'';
 const collections=book.collectionIds.length?`<p>Kaynak kümeleri: ${book.collectionIds.map(id=>collectionMap[id]).filter(Boolean).map(item=>`<a href="${publicBase}collection/${encodeURIComponent(item.id)}/">${escapeHtml(item.title)}</a>`).join(', ')}</p>`:'';
 const cover=book.cover?`<img src="${escapeHtml(`${appBase}${book.cover.src.replace(/^covers\//,'covers/sm/')}`)}" alt="${escapeHtml(`${book.cover.title} — ${book.cover.publisher||''} baskı kapağı`)}" width="160" height="240" loading="lazy">`:'';
 const body=`<header><a href="${publicBase}">Kitaplık</a><h1>${escapeHtml(shown)}</h1><p>${escapeHtml(book.author)}</p></header><main>${cover}<ul>${facts}</ul><h2>Ne için okumalı?</h2><p>${escapeHtml(guide.purpose)}</p>${links(guide.before,'Önce okunabilecekler')}${links(guide.after,'Sonra okunabilecekler')}${links(guide.companions,'Birlikte okunabilecekler')}${topics}${collections}${format&&publicationUrl(book.publication)?`<p><a href="${escapeHtml(publicationUrl(book.publication))}">${escapeHtml(publicationLinkLabel(book.publication))}</a></p>`:''}<p class="actions"><a href="${escapeHtml(interactiveFor({book}))}">Kitabı etkileşimli katalogda aç</a></p></main>`;
 write(`books/${slug}/`,documentShell({title,description,canonical,type:format?'article':'book',structured,body,image}));
}

fs.rmSync(catalogRoot,{recursive:true,force:true});
renderListing({});
for(const item of catalog.categories)renderListing({prefix:`category/${item.id}/`,heading:item.label,books:byTitle.filter(book=>book.categories.includes(item.id)),interactive:interactiveFor({category:item.id})});
for(const item of catalog.collections)renderListing({prefix:`collection/${item.id}/`,heading:item.title,description:item.description,books:byTitle.filter(book=>book.collectionIds.includes(item.id)),interactive:interactiveFor({collection:item.id})});
for(const item of catalog.groups||[])renderListing({prefix:`group/${item.id}/`,heading:groupHeading(item),books:byTitle.filter(book=>book.groupIds.includes(item.id)),interactive:interactiveFor({group:item.id})});
for(const book of catalog.books)renderBook(book);
console.log(`static SEO: ${catalog.books.length} book pages and stable catalog listings`);
