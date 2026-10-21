import fs from 'node:fs';
import { DEFAULT_PAGE_SIZE, bookSlug } from '../src/library.js';
import { SITE_URL } from '../src/site.js';

const root=new URL('../',import.meta.url);
const catalog=JSON.parse(fs.readFileSync(new URL('src/catalog.json',root),'utf8'));
const base=`${SITE_URL}catalog/`;
const pageSize=DEFAULT_PAGE_SIZE;
const urls=new Set();
const addListing=(path,count)=>{
 urls.add(`${base}${path}`);
 for(let page=2;page<=Math.ceil(count/pageSize);page++)urls.add(`${base}${path}page/${page}/`);
};

addListing('',catalog.books.length);
for(const item of catalog.categories)addListing(`category/${encodeURIComponent(item.id)}/`,catalog.books.filter(book=>book.categories.includes(item.id)).length);
for(const item of catalog.collections)addListing(`collection/${encodeURIComponent(item.id)}/`,catalog.books.filter(book=>book.collectionIds.includes(item.id)).length);
for(const item of catalog.groups||[])addListing(`group/${encodeURIComponent(item.id)}/`,catalog.books.filter(book=>book.groupIds.includes(item.id)).length);
for(const book of catalog.books)urls.add(`${base}books/${encodeURIComponent(bookSlug(book))}/`);

const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const body=[...urls].map(url=>`  <url><loc>${escape(url)}</loc></url>`).join('\n');
fs.writeFileSync(new URL('public/sitemap.xml',root),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
console.log(`sitemap.xml: ${urls.size} static public URL`);
