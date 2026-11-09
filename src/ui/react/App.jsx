import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Alert, Button, Container, FloatingIndicator, Group, MantineProvider, Modal, Paper, Text, TextInput, Tabs, ThemeIcon, Title, Switch, Tooltip, Transition, localStorageColorSchemeManager } from '@mantine/core';
import { IconLink, IconArrowRight, IconBook2, IconBuildingStore, IconCalendarEvent, IconLanguage, IconRefresh, IconShoppingBagX, IconFileText, IconBooks, IconCheck, IconDownload, IconFilter, IconHeart, IconLayersIntersect, IconListNumbers, IconSearch, IconX } from '@tabler/icons-react';
import '@mantine/core/styles.css';
import '@fontsource-variable/outfit/wght.css';
// The page's own styles come before any component's, so a component's stylesheet can refine them.
import '../../styles.css';
import '../../woods.css';
import ReadingQueue from './components/ReadingQueue';
import ShelfEmpty from './components/ShelfEmpty';
import EmptyState from './components/EmptyState';
import CatalogPagination from './components/CatalogPagination';
import { addressBase, applySeo, seoState } from '../../seo';
import { catalogListing } from './app/listing';
import { HEADER_VIEWS, viewById } from '../../views';
import ThemeTweaker from './components/ThemeTweaker';
import FooterMenu from './components/FooterMenu';
import FilterSheet from './components/FilterSheet';
import LibraryToast from './components/LibraryToast';
import WrappingSelect from './components/WrappingSelect';
import TranslationCriteria from './components/TranslationCriteria';
import ReadingPrioritySummary from './components/ReadingPrioritySummary';
import SyncMergeDialog from './components/SyncMergeDialog';
import SyncNotice from './components/SyncNotice';
import GitHubSyncPanel from './components/GitHubSyncPanel';
import ReadingSummary from './components/ReadingSummary';
import { useMediaQuery } from '@mantine/hooks';
import { useGitHubStateSync } from '../../state/useGitHubStateSync';
import { useViewModel } from '../../adapters/react/useViewModel.js';
import { readingSummary } from '../../reading';
import { emptyFilters, encodeRoute } from '../../library';
import { MOTION_EASE, MOTION_MS, MOTION_PX } from '../../motion';
import { cssVariablesResolver, theme } from './app/theme';
import { catalog, books, bookIds, readingRanking, byId, collectionMap, groupMap, authorOptions, exportAllBooks } from './app/catalogData';
import { GirlIcon, BookshelfIcon, BrandMark } from './app/icons';
import { AgeLibrary } from './app/AgeLibrary';
import { catalogScreen, marksAwaited } from '../../screens/catalog.js';
import { shellScreen } from '../../screens/shell.js';
import { ActiveFilters } from './app/ActiveFilters';
import { BookCover, ThumbCover } from './app/BookCover';
import { BookCard } from './app/BookCard';
import { BookDetail } from './app/BookDetail';
import { Collections } from './app/Collections';
import PageLoading from './components/PageLoading';

const AccessibilityAudit=import.meta.env.DEV?React.lazy(()=>import('./components/AccessibilityAudit')):null;
// Notes carry the Markdown renderer and the full source notes; load them on demand.
const NotesPage=React.lazy(()=>import('./components/NotesPage'));
// The bookstores page carries its own data (data/bookstores.json); it loads when opened.
const BookstoresPage=React.lazy(()=>import('./components/BookstoresPage'));
const BookFairsPage=React.lazy(()=>import('./components/BookFairsPage'));
// The pages themselves are listed once, in src/views.js; this is only each page's icon.
const VIEW_ICONS={books:IconBook2,queue:IconListNumbers,collections:IconLayersIntersect,bookstores:IconBuildingStore,fairs:IconCalendarEvent,notes:IconFileText,favorites:IconHeart,owned:BookshelfIcon};
const FOOTER_ICONS={...VIEW_ICONS,children:GirlIcon,guide:IconLanguage,sync:IconRefresh,export:IconDownload};
// A leaving toast no longer takes the pointer.
/** @type {import('@mantine/core').MantineTransition} */
const TOAST_MOTION={in:{opacity:1,translate:'0 0'},out:{opacity:0,translate:`0 ${MOTION_PX.rise}px`,pointerEvents:'none'},transitionProperty:'opacity, translate'};

function AtlasApp({kitaplik}) {
 // Everything this page asks of the core goes through one door (ADR 003, K7).
 const {execute}=kitaplik;
 const {route}=useViewModel(kitaplik.navigation);
 const {filters,view,sort,book,pageSize}=route;
 // The reader's marks, records and queue have one owner (src/core/personal/library.ts).
 const library=kitaplik.personal;
 const {states,personal,saved:personalSaved}=useViewModel(library);
 const githubSync=useGitHubStateSync({bookIds,source:library});
 const [opened,setOpened]=useState(false);
 const [draft,setDraft]=useState(emptyFilters);
 const [bookTrail,setBookTrail]=useState([]);
 const [copied,setCopied]=useState(false);
 // "Satın aldıklarımı gösterme": on by default, remembered on this device.
 const {hideOwned}=useViewModel(kitaplik.settings);
 const setHideOwned=on=>execute({type:'setHideOwned',on});
 const [transfer,setTransfer]=useState(null);const [toastShown,setToastShown]=useState(false);
 // The sticky header's height, for the main content's focus bar just under it (styles.css).
 const headerRef=useRef(null);
 useEffect(()=>{
  const header=headerRef.current;
  if(!header||typeof ResizeObserver!=='function')return;
  const root=document.documentElement;
  const observer=new ResizeObserver(()=>root.style.setProperty('--header-block',`${header.getBoundingClientRect().height}px`));
  observer.observe(header);
  return()=>{observer.disconnect();root.style.removeProperty('--header-block')};
 },[]);
 // The header lifts off the page with a shadow once the page has scrolled (docs/UI-REDESIGN.md, phase 2).
 // The attribute is set on the header itself, so scrolling never re-renders the app.
 useEffect(()=>{const header=headerRef.current;if(!header)return;const check=()=>{if(window.scrollY>4)header.setAttribute('data-scrolled','true');else header.removeAttribute('data-scrolled')};check();window.addEventListener('scroll',check,{passive:true});return()=>window.removeEventListener('scroll',check)},[]);
 // The marker under the chosen section slides from tab to tab (Mantine FloatingIndicator).
 const [tabList,setTabList]=useState(null);
 const [tabNodes,setTabNodes]=useState({});
 // One stable callback per tab: a new function on every render would detach and reattach the ref each time.
 const tabRefs=useMemo(()=>Object.fromEntries(HEADER_VIEWS.map(id=>[id,node=>{if(node)setTabNodes(nodes=>nodes[id]===node?nodes:{...nodes,[id]:node})}])),[]);
 const [guideOpened,setGuideOpened]=useState(false);
 const [syncOpened,setSyncOpened]=useState(false);
 const transferOrigin=useRef(null);
 // The toast fades out the way it came in and is removed once its exit has run. A toast that would
 // cover the control just focused is removed at once instead (AGENT.md: hidden content is not kept
 // visible for an animation, and WCAG 2.4.11).
 const dismissTransfer=useCallback(how=>{
  const restoreFocus=document.activeElement?.closest('.library-toast');
  setToastShown(false);
  if(how==='at-once')setTransfer(null);
  if(restoreFocus){
   const target=transferOrigin.current?.isConnected?transferOrigin.current:document.querySelector('.header-library');
   target?.focus({preventScroll:true});
  }
 },[]);
 const resultsRef=useRef(null);
 const openedFromCatalog=useRef(false);
 const navigate=next=>execute({type:'go',route:next});
 const closeBook=()=>{if(openedFromCatalog.current){openedFromCatalog.current=false;execute({type:'back'})}else execute({type:'closeBook'})};
// The back button forgets the books walked through; the route itself follows in the Navigator.
 useEffect(()=>{const change=()=>{openedFromCatalog.current=false;setBookTrail([])};window.addEventListener('hashchange',change);window.addEventListener('popstate',change);return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('popstate',change)}},[]);
 const changeFilters=next=>execute({type:'changeFilters',filters:next});
 // The shelf, the filtered list and the page shown (src/core/catalog/listingViewModel.ts).
 const {shelf:shelfBooks,ownedCount,favoriteCount,total,pages,page:currentPage,books:displayed,showsHiddenPurchases,publicListing}=useViewModel(kitaplik.listing);
 useEffect(()=>applySeo(seoState({route:{...route,page:currentPage},catalog,count:publicListing.total,currentPage,totalPages:publicListing.pages,displayed:publicListing.books,base:addressBase(window.location)})),[route,currentPage,publicListing]);
 // The reading band's numbers (src/reading.js, tested in Node); each count opens its shelf.
 const summary=useMemo(()=>readingSummary({books,states,queue:personal.queue}),[states,personal.queue]);
 // A phone keeps its first screen for book titles; there the band is on Sıram only.
 // A phone held sideways is a phone too (src/app/media.js, the grid's own rule).
 // A count opens its shelf and the band goes with the old page, so focus moves to the main
 // content instead of falling to the page (review, 8 November 2026). Sıram's own count stays put.
 const focusMain=()=>requestAnimationFrame(()=>document.getElementById('main-content')?.focus({preventScroll:true}));
 const onSummary=key=>{
  if(key==='queued'&&view==='queue'){window.scrollTo({top:0,behavior:'instant'});return focusMain();}
  if(key==='read'||key==='reading'){navigate({...route,view:'books',book:null,page:1,filters:{...emptyFilters(),states:[key==='read'?'okundu':'okunuyor']}});window.scrollTo({top:0,behavior:'instant'})}
  else if(key==='queued')onQueue();
  else goView(key);
  focusMain();
 };
 // The sheet counts the draft exactly as the page will list it, the purchases rule included.
 // The sheet's listing is computed while the sheet is on screen, opening, open or closing, so its
 // live line never reads 0 on the way out; nothing is written during render.
 const [sheetShown,setSheetShown]=useState(false);
 const draftListing=useMemo(()=>sheetShown?catalogListing({books,states,view,filters:draft,sort,page:1,pageSize,rankings:readingRanking.byId,hideOwned}):null,[sheetShown,states,view,draft,sort,pageSize,hideOwned]);
 const draftCount=draftListing?.filtered.length??0;
 const onToggle=(id,key,trigger=document.activeElement)=>{
  const {before,after}=execute({type:'toggleMark',id,key});
  const owned=after.includes('alindi');
  // A reading mark also puts the book on Kitaplığım (toggleState), and the reader is told so.
  if(key==='alindi'||(owned&&!before.includes('alindi'))){transferOrigin.current=trigger;setTransfer({id,owned});setToastShown(true);}
 };
 const onReading=(id,patch)=>execute({type:'editReading',id,patch});
 const onAdd=id=>execute({type:'addToQueue',id});
 const onQueue=()=>{navigate({...route,view:'queue',book:null,page:1});window.scrollTo({top:0,behavior:'instant'})};
 const onOpen=id=>{setBookTrail(book?[...bookTrail,book]:[]);if(!book){openedFromCatalog.current=true;execute({type:'openBook',id})}else execute({type:'showBook',id})};
 const previousBook=()=>{const id=bookTrail.at(-1);if(id){setBookTrail(bookTrail.slice(0,-1));execute({type:'showBook',id})}};
 const goView=next=>{navigate({...route,view:next,book:null,page:1,...(viewById[next]?.shelf?{filters:emptyFilters()}:{})});window.scrollTo({top:0,behavior:'instant'})};
 const onBrowse=()=>{navigate({...route,view:'books',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})};
 const goCollection=(id,gid)=>{navigate({...route,view:'books',book:null,page:1,filters:{...emptyFilters(),collections:[id],groups:gid?[gid]:[]}});window.scrollTo({top:0,behavior:'instant'})};
 const goCategory=id=>{execute({type:'openCategory',id});window.scrollTo({top:0,behavior:'instant'})};
 const changePage=p=>{navigate({...route,page:p,book:null});resultsRef.current?.scrollIntoView({behavior:'instant',block:'start'})};
 // The library toast sits above dialogs, so it closes before the connect dialog opens over it.
 const syncOpener=useRef(null);
 // The sync dialog covers the book sheet from opening until its closing transition ends. Mantine
 // closes both on one Escape otherwise: the dialog's handler runs first and closes it, React
 // re-renders between the two window listeners, and the sheet's handler then sees itself uncovered.
 const [syncCovering,setSyncCovering]=useState(false);
 const openSync=event=>{syncOpener.current=event?.currentTarget??document.activeElement;setToastShown(false);setSyncCovering(true);setSyncOpened(true)};
 // Connecting removes the notice whose button opened the dialog; focus then goes to the main content.
 // Focus returns to the button that opened the dialog. When connecting removed it, focus stays
 // in the open book sheet (on its sync status), never behind it; otherwise on the main content.
 // Focus goes back as soon as the dialog closes, not when its exit ends (ADR 004, K6).
 const restoreSyncFocus=()=>{const opener=syncOpener.current;(opener?.isConnected&&opener!==document.body?opener:document.querySelector('.detail-drawer .sync-status-text')??document.getElementById('main-content'))?.focus({preventScroll:true})};
 const closeSync=()=>{setSyncOpened(false);restoreSyncFocus()};
 const syncClosed=()=>setSyncCovering(false);
 // While the question about differing records is open it is the only thing Escape may reach, and it has no Escape of its own.
 const asking=Boolean(githubSync.mergePrompt);
 const copyLink=async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setCopied(false)}};
 // The toast leaves the way it came: the last notice stays rendered while it fades out.
 const transferNotice=<div className="library-toast-region" role="status" aria-live="polite" aria-atomic="true"><Transition mounted={toastShown&&Boolean(transfer)} duration={MOTION_MS.overlay} exitDuration={MOTION_MS.overlay} timingFunction={MOTION_EASE} transition={TOAST_MOTION} onExited={()=>setTransfer(null)}>{style=>transfer&&<LibraryToast key={`${transfer.id}-${transfer.owned}`} style={style} leaving={!toastShown} book={byId[transfer.id]} owned={transfer.owned} onClose={dismissTransfer} onUndo={()=>{execute({type:'toggleMark',id:transfer.id,key:'alindi'});dismissTransfer()}}/>}</Transition></div>;
 const activeTab=viewById[view]?.shelf?'books':HEADER_VIEWS.includes(view)?view:null;
 // This page's words and what it shows come from its screen models (ADR 003, K6).
 const shell=shellScreen({view,filters,favoriteCount,ownedCount,updated:catalog.updated,personalSaved});
 const catalogue=catalogScreen({view,filters,sort,total,page:currentPage,pageSize,showsHiddenPurchases,copied,ownedCount,favoriteCount,coreCount:collectionMap.core?.count,collections:collectionMap,groups:groupMap});
 // What each footer item does. Every other page, Notes included, opens through goView.
 const footerActions={books:onBrowse,queue:onQueue,children:()=>goCategory('children'),guide:()=>setGuideOpened(true),sync:()=>openSync(),export:exportAllBooks};
 const footerGroups=shell.footer.groups.map(group=>({...group,items:group.items.map(item=>({...item,icon:FOOTER_ICONS[item.id],onSelect:footerActions[item.id]??(()=>goView(item.id))}))}));
 return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content').focus()}}>{shell.skipLink}</a>
  <Tabs className="main-section-tabs" value={activeTab} onChange={v=>v&&navigate({...route,view:v,book:null,page:1})}>
    <header className="site-header" ref={headerRef}><div className="site-header-inner"><Group renderRoot={props=><a href="./" {...props}/>} className="brand-link" aria-label={shell.brand} gap={6} wrap="nowrap" onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();execute({type:'goHome'});setBookTrail([]);window.scrollTo({top:0,behavior:'instant'})}}}><ThemeIcon size={42} radius="md" color="brand"><BrandMark size={24}/></ThemeIcon></Group><Tabs.List ref={setTabList} className="main-tabs" aria-label={shell.tabs.label}>{shell.tabs.items.map(({id,label})=>{const Icon=VIEW_ICONS[id];return <Tabs.Tab key={id} ref={tabRefs[id]} value={id} data-edge="bottom" leftSection={<Icon size={19}/>}>{label}</Tabs.Tab>})}<FloatingIndicator className="main-tabs-indicator" data-edge="bottom" target={activeTab?tabNodes[activeTab]:null} parent={tabList} aria-hidden="true"/></Tabs.List><Tooltip label={shell.hideOwned} withArrow><Switch className="header-switch" label={shell.hideOwned} checked={hideOwned} onChange={e=>setHideOwned(e.currentTarget.checked)} thumbIcon={<IconShoppingBagX size={12} stroke={2.5} aria-hidden="true"/>}/></Tooltip><nav className="header-shortcuts" aria-label={shell.shortcuts.label}><Tooltip label={shell.shortcuts.children.label}><ActionIcon className="header-children" size={48} variant={shell.shortcuts.children.current?'filled':'subtle'} aria-label={shell.shortcuts.children.label} aria-current={shell.shortcuts.children.current?'page':undefined} onClick={()=>goCategory('children')}><GirlIcon size={29}/></ActionIcon></Tooltip><Tooltip label={shell.shortcuts.favorites.label}><ActionIcon className="header-favorites" size={48} variant={shell.shortcuts.favorites.current?'filled':'subtle'} aria-label={shell.shortcuts.favorites.label} aria-current={shell.shortcuts.favorites.current?'page':undefined} onClick={()=>{navigate({...route,view:'favorites',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})}}><IconHeart size={29} fill={shell.shortcuts.favorites.current?'currentColor':'none'}/>{shell.shortcuts.favorites.count&&<span className="shortcut-count" aria-hidden="true">{shell.shortcuts.favorites.count}</span>}</ActionIcon></Tooltip><Tooltip label={shell.shortcuts.owned.label}><ActionIcon className="header-library" size={48} variant={shell.shortcuts.owned.current?'filled':'subtle'} aria-label={shell.shortcuts.owned.label} aria-current={shell.shortcuts.owned.current?'page':undefined} onClick={()=>{navigate({...route,view:'owned',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})}}><BookshelfIcon size={29}/>{shell.shortcuts.owned.count&&<span className="shortcut-count" aria-hidden="true">{shell.shortcuts.owned.count}</span>}</ActionIcon></Tooltip></nav><ThemeTweaker/></div></header>
  <Container size={1200} className="app-shell" px={{base:8,sm:24}}>

   <main id="main-content" tabIndex={-1}>

    {shell.storageWarning&&<Alert color="orange" mb="lg">{shell.storageWarning}</Alert>}
    {view!=='notes'&&<SyncNotice sync={githubSync} onOpen={openSync}/>}
    <Tabs.Panel value="books">
    {['books','owned','favorites'].includes(view)&&<>
     {catalogue.shelfHeading&&<Title order={1} className="visually-hidden">{catalogue.shelfHeading}</Title>}
     <div className="catalog-bar">
     <div className="search-panel" role="search">
      <TextInput className="catalog-search" label={catalogue.search.label} placeholder={catalogue.search.placeholder} leftSection={<IconSearch size={21}/>} rightSectionWidth={44} rightSection={catalogue.search.clear?<ActionIcon variant="subtle" aria-label={catalogue.search.clear} onClick={()=>changeFilters({...filters,query:''})}><IconX size={20}/></ActionIcon>:null} value={filters.query} onChange={e=>changeFilters({...filters,query:e.currentTarget.value})}/>
      <div className="search-tools"><Button variant="light" leftSection={<IconFilter size={20}/>} onClick={()=>{setToastShown(false);setDraft(filters);setSheetShown(true);setOpened(true)}}>{catalogue.filtersButton}</Button><WrappingSelect aria-label={catalogue.sort.label} value={sort} onChange={next=>execute({type:'changeSort',sort:next})} data={catalogue.sort.options}/></div>
      <ActiveFilters filters={filters} onChange={changeFilters}/>
     </div>
     {catalogue.showsReadingSummary&&<ReadingSummary summary={summary} waiting={marksAwaited(githubSync,summary)} onSelect={onSummary}/>}
     </div>
     {catalogue.route&&<section className="reading-route" aria-label={catalogue.route.label}><div><Text fw={500}>{catalogue.route.title}</Text><Text>{catalogue.route.body}</Text></div><Button variant="white" color="brand" rightSection={<IconArrowRight size={19}/>} onClick={()=>goCollection('core')}>{catalogue.route.action}</Button></section>}
     {catalogue.showsAgeLibrary&&<AgeLibrary onGroup={goCollection}/>}
     {catalogue.showsPrioritySummary&&<ReadingPrioritySummary ranking={readingRanking}/>}
     <div className="results-heading" ref={resultsRef}><div><Title order={catalogue.results.order}>{catalogue.results.title}</Title><div role="status" aria-live="polite"><Text c="dimmed">{catalogue.results.count}</Text>{catalogue.results.purchasesNote&&<Text className="purchases-note">{catalogue.results.purchasesNote}</Text>}</div></div><Group gap={4}>{catalogue.results.clear&&<Button variant="subtle" onClick={()=>changeFilters(emptyFilters())}>{catalogue.results.clear}</Button>}<Tooltip label={catalogue.results.copy}><ActionIcon variant="subtle" aria-label={catalogue.results.copy} onClick={copyLink}>{copied?<IconCheck size={22}/>:<IconLink size={22}/>}</ActionIcon></Tooltip></Group></div>
     {!catalogue.empty?<><div className="books-grid">{displayed.map(b=><BookCard key={b.id} book={b} ranking={readingRanking.byId[b.id]} states={states} onToggle={onToggle} onOpen={onOpen} queue={personal.queue} onAdd={onAdd} onQueue={onQueue}/>)}</div><CatalogPagination page={currentPage} total={pages} count={total} pageSize={pageSize} onChange={changePage} onPageSize={size=>navigate({...route,page:1,pageSize:size,book:null})} hrefForPage={p=>window.location.pathname+'?'+encodeRoute({...route,page:p,book:null},catalog)}/></>:catalogue.empty.shelf?<ShelfEmpty shelf={catalogue.empty.shelf} onBrowse={onBrowse}/>:<EmptyState icon={IconSearch} title={catalogue.empty.title} action={<Button variant="light" onClick={()=>changeFilters(emptyFilters())}>{catalogue.empty.clear}</Button>}>{catalogue.empty.body}</EmptyState>}
    </>}
    </Tabs.Panel>
    <Tabs.Panel value="queue">{view==='queue'&&<><Title order={1} className="visually-hidden">{shell.headings.queue}</Title><ReadingQueue queue={personal.queue} books={byId} reading={personal.reading} states={states} onMove={(id,direction)=>execute({type:'moveInQueue',id,direction})} onRemove={id=>execute({type:'removeFromQueue',id})} onOpen={onOpen} onBrowse={onBrowse} BookCover={ThumbCover}/><ReadingSummary summary={summary} waiting={marksAwaited(githubSync,summary)} onSelect={onSummary}/></>}</Tabs.Panel>
    <Tabs.Panel value="collections">{view==='collections'&&<><Title order={1} className="visually-hidden">{shell.headings.collections}</Title><Collections onCollection={goCollection} onGroup={goCollection} states={states}/></>}</Tabs.Panel>
    {view==='fairs'&&<React.Suspense fallback={<PageLoading>{shell.loading.fairs}</PageLoading>}><BookFairsPage/></React.Suspense>}
    <Tabs.Panel value="bookstores">{view==='bookstores'&&<React.Suspense fallback={<PageLoading>{shell.loading.bookstores}</PageLoading>}><BookstoresPage/></React.Suspense>}</Tabs.Panel>
    {view==='notes'&&<section aria-labelledby="notes-heading"><Title id="notes-heading" order={1} className="visually-hidden">{shell.headings.notes}</Title><React.Suspense fallback={<PageLoading>{shell.loading.notes}</PageLoading>}><NotesPage states={states} personal={personal} onRestore={(marks,input)=>execute({type:'restoreBackup',marks,input})} sync={githubSync}/></React.Suspense></section>}
   </main>
   <FooterMenu covered={asking} current={shell.footer.current} groups={footerGroups} meta={<><Text fw={600}>{shell.footer.meta.name}</Text><Text>{shell.footer.meta.created}</Text><Text>{shell.footer.meta.updated}</Text></>}/>
  </Container>
  </Tabs>
  <SyncMergeDialog sync={githubSync}/>
  {/* Opened from the book sheet too, so it sits above the sheet (Mantine's layer 200) and below the toast (310). */}
  <Modal opened={syncOpened} onClose={closeSync} closeOnEscape={!asking} zIndex={300} returnFocus={false} onExitTransitionEnd={syncClosed} title={shell.modals.sync} size="lg" centered className="sync-modal" closeButtonProps={{'aria-label':shell.modals.close}}><div inert={!syncOpened||undefined}><GitHubSyncPanel sync={githubSync} framed={false}/></div></Modal>
  <Modal opened={guideOpened} onClose={()=>setGuideOpened(false)} closeOnEscape={!asking} title={shell.modals.guide} size="lg" centered className="global-guide-modal" closeButtonProps={{'aria-label':shell.modals.close}}><TranslationCriteria/></Modal>
  <FilterSheet opened={opened} covered={asking} onClose={()=>setOpened(false)} onExited={()=>setSheetShown(false)} value={draft} onChange={setDraft} onReset={()=>setDraft({...emptyFilters(),query:filters.query})} onApply={()=>{changeFilters(draft);setOpened(false)}} count={draftCount} catalog={catalog} authors={authorOptions} shelf={draftListing?.shelf??shelfBooks}/>
  {!book&&transferNotice}
  <BookDetail feedback={transferNotice} ranking={readingRanking.byId[book]} onOpen={onOpen} onBack={previousBook} hasBack={bookTrail.length>0} book={byId[book]} onClose={closeBook} states={states} onToggle={onToggle} onCollection={goCollection} onCategory={goCategory} personal={personal} onReading={onReading} onAdd={onAdd} onQueue={onQueue} storageError={!personalSaved} sync={githubSync} onSync={openSync} covered={syncCovering||asking}/>
 </>;
}
export default function App({kitaplik}){return <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="dark" colorSchemeManager={localStorageColorSchemeManager({key:'kitapatlasi:color-scheme'})}><AtlasApp kitaplik={kitaplik}/>{AccessibilityAudit&&<React.Suspense fallback={null}><AccessibilityAudit/></React.Suspense>}</MantineProvider>}
