import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_PAGE_SIZE,emptyFilters,bookSlug } from '../src/library.js';
import { seoState } from '../src/seo.js';
import { displayTitle } from '../src/translation.js';

const root=new URL('../',import.meta.url);
const catalog=JSON.parse(fs.readFileSync(new URL('src/catalog.json',root)));
const route=overrides=>({view:'books',sort:'reading',book:null,page:1,pageSize:DEFAULT_PAGE_SIZE,filters:emptyFilters(),...overrides});

test('personalized reading order is noindex and points at the stable catalog',()=>{
 const state=seoState({route:route({page:5}),catalog,count:catalog.books.length,currentPage:5,totalPages:31,displayed:catalog.books.slice(4*DEFAULT_PAGE_SIZE,5*DEFAULT_PAGE_SIZE)});
 assert.equal(state.robots,'noindex,follow');
 assert.equal(state.canonical,'https://karacaismail.github.io/kitaps/catalog/');
 assert.equal(state.prev,'');
 assert.equal(state.next,'');
 assert.equal(Object.hasOwn(state.structured,'mainEntity'),false);
});

test('title-sorted public catalog pages have stable canonicals and pagination',()=>{
 const state=seoState({route:route({sort:'title',page:5}),catalog,count:catalog.books.length,currentPage:5,totalPages:31,displayed:catalog.books.slice(4*DEFAULT_PAGE_SIZE,5*DEFAULT_PAGE_SIZE)});
 assert.equal(state.robots,'index,follow');
 assert.match(state.title,/Sayfa 5/);
 assert.equal(state.canonical,'https://karacaismail.github.io/kitaps/catalog/page/5/');
 assert.equal(state.prev,'https://karacaismail.github.io/kitaps/catalog/page/4/');
 assert.equal(state.next,'https://karacaismail.github.io/kitaps/catalog/page/6/');
 assert.equal(state.structured.mainEntity.itemListElement.length,DEFAULT_PAGE_SIZE);
});

test('search and personal result URLs stay out of the index',()=>{
 const search=seoState({route:route({sort:'title',filters:{...emptyFilters(),query:'strateji'}}),catalog,count:3,currentPage:1,totalPages:1,displayed:[]});
 assert.equal(search.robots,'noindex,follow');
 assert.equal(search.canonical,'https://karacaismail.github.io/kitaps/catalog/');
 const personal=seoState({route:route({view:'owned'}),catalog,count:4,currentPage:1,totalPages:1,displayed:[]});
 assert.equal(personal.robots,'noindex,follow');
});

test('book pages use unique static canonical URLs',()=>{
 const book=catalog.books[0];
 const state=seoState({route:route({book:book.id,page:8}),catalog,count:catalog.books.length,currentPage:8,totalPages:31,displayed:[]});
 assert.equal(state.robots,'index,follow');
 assert.equal(state.canonical,`https://karacaismail.github.io/kitaps/catalog/books/${bookSlug(book)}/`);
 assert.equal(state.structured['@type'],'Book');
});

test('articles and essays are described as what they are, a journal only for an article',()=>{
 const state=id=>seoState({route:route({book:id}),catalog,count:catalog.books.length,currentPage:1,totalPages:1,displayed:[]});
 const article=state('dilemmasinageneraltheoryofplanning');
 assert.equal(article.structured['@type'],'ScholarlyArticle');
 assert.deepEqual(article.structured.isPartOf,{'@type':'Periodical',name:'Policy Sciences'});
 assert.equal(article.ogType,'article');
 const essay=state('dothingsthatdontscale');
 assert.equal(essay.structured['@type'],'Article');
 assert.equal(essay.structured.isPartOf,undefined);
});

test('build generator emits crawlable catalog and unique book HTML',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kitaps-seo-'));
 const output=path.join(temporary,'dist');
 fs.mkdirSync(output);
 try{
  execFileSync(process.execPath,[new URL('../scripts/generate-static-seo.mjs',import.meta.url).pathname,output]);
  const listing=fs.readFileSync(path.join(output,'catalog/index.html'),'utf8');
  const book=catalog.books[0];
  const detail=fs.readFileSync(path.join(output,'catalog/books',bookSlug(book),'index.html'),'utf8');
  assert.match(listing,/<h1>Tüm kitaplar<\/h1>/);
  assert.match(listing,/<meta name="robots" content="index,follow">/);
  assert.match(listing,/Başlığa göre kararlı katalog sırası/);
  // Static listing pages follow the app's page size: no page is missing or left over.
  const lastPage=Math.ceil(catalog.books.length/DEFAULT_PAGE_SIZE);
  assert.ok(fs.existsSync(path.join(output,'catalog/page',String(lastPage),'index.html')),`page ${lastPage}`);
  assert.equal(fs.existsSync(path.join(output,'catalog/page',String(lastPage+1))),false);
  assert.match(detail,new RegExp(`<h1>${displayTitle(book)}<\\/h1>`));
  assert.match(detail,new RegExp(`<link rel="canonical" href="https://karacaismail.github.io/kitaps/catalog/books/${bookSlug(book)}/">`));
 }finally{fs.rmSync(temporary,{recursive:true,force:true})}
});

test('sitemap exposes static routes instead of personalized query pages',()=>{
 const sitemap=fs.readFileSync(new URL('public/sitemap.xml',root),'utf8');
 assert.match(sitemap,/https:\/\/karacaismail.github.io\/kitaps\/catalog\//);
 assert.doesNotMatch(sitemap,/\?page=|\?book=|\?category=/);
});

test('raw SPA shell does not advertise personalized content as indexable',()=>{
 const shell=fs.readFileSync(new URL('index.html',root),'utf8');
 assert.match(shell,/<meta name="robots" content="noindex,follow" \/>/);
 assert.match(shell,/<link rel="canonical" href="https:\/\/karacaismail.github.io\/kitaps\/catalog\/" \/>/);
});
