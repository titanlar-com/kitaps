import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The application shell: App.jsx, the modules split out of it into src/app/ (phase 1 of the
// architecture plan) and the screen models that hold its words (ADR 003, K6). The assertions
// below read the shell as one text, wherever a part now lives.
const shellFiles=['App.jsx',...['app','screens'].flatMap(folder=>fs.readdirSync(new URL(`../src/${folder}/`,import.meta.url)).map(file=>`${folder}/${file}`))];
import { VIEWS as VIEWS_TABLE } from '../src/views.js';
import { emptyFilters } from '../src/library.js';
import { catalogScreen } from '../src/screens/catalog.js';
import { shellScreen } from '../src/screens/shell.js';
const app=shellFiles.map(file=>fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8')).join('\n');
const badge=fs.readFileSync(new URL('../src/components/ReadingPriorityBadge.jsx',import.meta.url),'utf8');
const card=fs.readFileSync(new URL('../src/components/ReadingPriorityCard.jsx',import.meta.url),'utf8');
// The priority components take their words from the catalogue's screen model (ADR 003, K6).
const catalogModel=fs.readFileSync(new URL('../src/screens/catalog.js',import.meta.url),'utf8');

test('primary tabs always render a matching panel and Notes is outside the tabset',()=>{
 for(const value of ['books','queue','collections'])assert.match(app,new RegExp(`<Tabs\\.Panel value="${value}">`));
 assert.match(app,/const activeTab=.*\?view:null;/);
 assert.match(app,/<section aria-labelledby="notes-heading">/);
});

test('personal sections keep one semantic h1 without restoring intro copy',()=>{
 assert.match(app,/<Title order=\{1\} className="visually-hidden">\{catalogue\.shelfHeading\}<\/Title>/);
 const shelfHeading=view=>catalogScreen({view,filters:emptyFilters(),sort:'title',total:0,page:1,pageSize:24,collections:{},groups:{}}).shelfHeading;
 assert.deepEqual(['owned','favorites','books'].map(shelfHeading),['Kitaplığım','Favorilerim',null]);
 const {headings}=shellScreen({view:'books',filters:emptyFilters(),favoriteCount:0,ownedCount:0,updated:'',personalSaved:true});
 for(const [page,heading] of [['queue','Okuma sıram'],['collections','Kitap kümeleri'],['notes','Kaynaklar ve notlar']]){
  assert.match(app,new RegExp(`order=\\{1\\} className="visually-hidden">\\{shell\\.headings\\.${page}\\}`));
  assert.equal(headings[page],heading);
 }
});

test('footer Notes navigation writes browser history through navigate',()=>{
 // The footer menu (FooterMenu.jsx) reaches Notes through goView, which writes history with navigate.
 assert.match(app,/const goView=next=>\{navigate\(\{\.\.\.route,view:next,book:null,page:1/);
 // Every footer section but the catalogue and the queue, Notes included, opens through goView (src/views.js lists them).
 assert.match(app,/VIEWS\.filter\(v => v\.footer === 'sections'\)\.map\(v => \(\{ id: v\.id, label: v\.label, current: view === v\.id \}\)\)/);
 assert.match(app,/const FOOTER_ICONS=\{\.\.\.VIEW_ICONS,/);
 assert.match(app,/const footerActions=\{books:onBrowse,queue:onQueue,children:\(\)=>goCategory\('children'\),guide:\(\)=>setGuideOpened\(true\),sync:\(\)=>openSync\(\),export:exportAllBooks\};/);
 assert.match(app,/icon:FOOTER_ICONS\[item\.id\],onSelect:footerActions\[item\.id\]\?\?\(\(\)=>goView\(item\.id\)\)/);
 assert.equal(VIEWS_TABLE.find(view=>view.id==='notes').footer,'sections');
});

test('footer exports every catalog book as a self-describing JSON file',()=>{
 assert.match(app,/const exportAllBooks=\(\)=>download\('kitaplik-tum-kitaplar\.json',createBooksExport\(catalog\)\)/);
 assert.match(app,/\{ id: 'export', label: 'Kitapları JSON indir' \}/);
 assert.match(app,/export:IconDownload/);
 assert.match(app,/export:exportAllBooks/);
});

test('footer shows creation and catalog update dates separately in one format',()=>{
 assert.match(app,/Yaratılış: 27 Eylül 2026/);
 assert.match(app,/`Güncelleme: \$\{updated\}`/);
 assert.match(app,/updated:catalog\.updated/);
 assert.match(app,/name: 'Kitaplık'/,'the footer uses the product name');
 assert.match(app,/<Text fw=\{600\}>\{shell\.footer\.meta\.name\}<\/Text><Text>\{shell\.footer\.meta\.created\}<\/Text><Text>\{shell\.footer\.meta\.updated\}<\/Text>/);
});

test('priority summaries expose full text and labelled progress values',()=>{
 assert.match(badge,/className="visually-hidden">\{model\.spoken\}/);
 assert.match(catalogModel,/spoken: `Okuma önceliği:/);
 assert.match(badge,/aria-hidden="true"/);
 assert.match(card,/aria-label=\{item\.progressLabel\}/);
 assert.match(catalogModel,/progressLabel: `\$\{item\.label\}: yüzde/);
});

test('reading priority is built once from the catalog, with no personal or synced state',()=>{
 assert.match(app,/export const readingRanking=catalogIndex\.ranking;/);
 assert.doesNotMatch(app,/githubSync\.shared/);
 assert.doesNotMatch(app,/\.build\(\{/);
});

test('priority copy states that purchases and reading activity never change the score',()=>{
 assert.doesNotMatch(card+catalogModel,/okuma durumları değiştiğinde/);
 assert.match(catalogModel,/Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez/);
 const summary=fs.readFileSync(new URL('../src/components/ReadingPrioritySummary.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(summary+catalogModel,/Şu an ilk/);
 assert.match(catalogModel,/showsPrioritySummary: view === 'books' && sort === 'reading'/,'personal shelves carry no priority paragraph');
 assert.match(app,/catalogue\.showsPrioritySummary&&<ReadingPrioritySummary/);
});

test('customer copy and icon requests stay applied',()=>{
 assert.doesNotMatch(app,/yıldız/i,'favorites use a heart');
 assert.doesNotMatch(app,/IconWoman/,'the daughter shortcut uses the girl icon');
 assert.match(app,/<GirlIcon size=\{29\}\/>/);
 const queue=['components/ReadingQueue.jsx','screens/queue.js'].map(file=>fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8')).join('\n');
 assert.doesNotMatch(queue,/Sıradan çıkarmak okuma kaydını/,'the queue page has no explanatory footnote');
});

test('removed card category component stays unused',()=>{
 assert.equal(fs.existsSync(new URL('../src/components/CardCategories.jsx',import.meta.url)),false);
 assert.doesNotMatch(app,/CardCategories/);
 const bookCard=fs.readFileSync(new URL('../src/app/BookCard.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(bookCard,/CategoryPill|card-categories|category-more/);
});

