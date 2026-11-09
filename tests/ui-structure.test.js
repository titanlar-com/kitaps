import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The application shell: App.jsx and the modules split out of it into src/app/ (phase 1 of the
// architecture plan). The assertions below read the shell as one text, wherever a part now lives.
const shellFiles=['App.jsx',...fs.readdirSync(new URL('../src/app/',import.meta.url)).map(file=>`app/${file}`)];
import { VIEWS as VIEWS_TABLE } from '../src/views.js';
const app=shellFiles.map(file=>fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8')).join('\n');
const badge=fs.readFileSync(new URL('../src/components/ReadingPriorityBadge.jsx',import.meta.url),'utf8');
const card=fs.readFileSync(new URL('../src/components/ReadingPriorityCard.jsx',import.meta.url),'utf8');

test('primary tabs always render a matching panel and Notes is outside the tabset',()=>{
 for(const value of ['books','queue','collections'])assert.match(app,new RegExp(`<Tabs\\.Panel value="${value}">`));
 assert.match(app,/const activeTab=.*\?view:null;/);
 assert.match(app,/<section aria-labelledby="notes-heading">/);
});

test('personal sections keep one semantic h1 without restoring intro copy',()=>{
 assert.match(app,/<Title order=\{1\} className="visually-hidden">\{view==='owned'\?'Kitaplığım':'Favorilerim'\}<\/Title>/);
 for(const heading of ['Okuma sıram','Kitap kümeleri','Kaynaklar ve notlar'])assert.match(app,new RegExp(`order=\\{1\\} className="visually-hidden">${heading}`));
});

test('footer Notes navigation writes browser history through navigate',()=>{
 // The footer menu (FooterMenu.jsx) reaches Notes through goView, which writes history with navigate.
 assert.match(app,/const goView=next=>\{navigate\(\{\.\.\.route,view:next,book:null,page:1/);
 // Every footer section but the catalogue and the queue, Notes included, opens through goView (src/views.js lists them).
 assert.match(app,/VIEWS\.filter\(v=>v\.footer==='sections'\)\.map\(v=>\(\{label:v\.label,icon:VIEW_ICONS\[v\.id\],current:view===v\.id,onSelect:v\.id==='books'\?onBrowse:v\.id==='queue'\?onQueue:\(\)=>goView\(v\.id\)\}\)\)/);
 assert.equal(VIEWS_TABLE.find(view=>view.id==='notes').footer,'sections');
});

test('footer exports every catalog book as a self-describing JSON file',()=>{
 assert.match(app,/const exportAllBooks=\(\)=>download\('kitaplik-tum-kitaplar\.json',createBooksExport\(catalog\)\)/);
 assert.match(app,/\{label:'Kitapları JSON indir',icon:IconDownload,onSelect:exportAllBooks\}/);
});

test('footer shows creation and catalog update dates separately in one format',()=>{
 assert.match(app,/Yaratılış: 27 Eylül 2026/);
 assert.match(app,/Güncelleme: \{catalog\.updated\}/);
 assert.match(app,/<Text fw=\{600\}>Kitaplık<\/Text>/,'the footer uses the product name');
});

test('priority summaries expose full text and labelled progress values',()=>{
 assert.match(badge,/className="visually-hidden">Okuma önceliği:/);
 assert.match(badge,/aria-hidden="true"/);
 assert.match(card,/aria-label=\{`\$\{item\.label\}: yüzde/);
});

test('reading priority is built once from the catalog, with no personal or synced state',()=>{
 assert.match(app,/export const readingRanking=catalogIndex\.ranking;/);
 assert.doesNotMatch(app,/githubSync\.shared/);
 assert.doesNotMatch(app,/\.build\(\{/);
});

test('priority copy states that purchases and reading activity never change the score',()=>{
 assert.doesNotMatch(card,/okuma durumları değiştiğinde/);
 assert.match(card,/Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez/);
 const summary=fs.readFileSync(new URL('../src/components/ReadingPrioritySummary.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(summary,/Şu an ilk/);
 assert.match(app,/view==='books'&&sort==='reading'&&<ReadingPrioritySummary/,'personal shelves carry no priority paragraph');
});

test('customer copy and icon requests stay applied',()=>{
 assert.doesNotMatch(app,/yıldız/i,'favorites use a heart');
 assert.doesNotMatch(app,/IconWoman/,'the daughter shortcut uses the girl icon');
 assert.match(app,/<GirlIcon size=\{29\}\/>/);
 const queue=fs.readFileSync(new URL('../src/components/ReadingQueue.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(queue,/Sıradan çıkarmak okuma kaydını/,'the queue page has no explanatory footnote');
});

test('removed card category component stays unused',()=>{
 assert.equal(fs.existsSync(new URL('../src/components/CardCategories.jsx',import.meta.url)),false);
 assert.doesNotMatch(app,/CardCategories/);
 const bookCard=fs.readFileSync(new URL('../src/app/BookCard.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(bookCard,/CategoryPill|card-categories|category-more/);
});

