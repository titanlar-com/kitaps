import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Alert, Button, Container, FloatingIndicator, Group, MantineProvider, Modal, Paper, Text, TextInput, Tabs, ThemeIcon, Title, Switch, Tooltip, Transition, localStorageColorSchemeManager } from '@mantine/core';
import { IconLink, IconArrowRight, IconBook2, IconBuildingStore, IconCalendarEvent, IconLanguage, IconRefresh, IconShoppingBagX, IconFileText, IconBooks, IconCheck, IconDownload, IconFilter, IconHeart, IconLayersIntersect, IconListNumbers, IconSearch, IconX } from '@tabler/icons-react';
import '@mantine/core/styles.css';
import '@fontsource-variable/outfit/wght.css';
import catalog from './catalog.json';
import ReadingQueue from './components/ReadingQueue';
import CatalogPagination from './components/CatalogPagination';
import { applySeo, seoState } from './seo';
import { catalogListing } from './app/listing';
import { VIEWS, HEADER_VIEWS, viewById } from './views';
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
import { WIDE_QUERY, PHONE_LANDSCAPE_QUERY } from './app/media';
import { useGitHubStateSync } from './state/useGitHubStateSync';
import { PERSONAL_KEY, cleanPersonal, cleanReading, addToQueue, moveInQueue, todayLocal, stampReadingDate, readingSummary } from './reading';
import { emptyFilters, toggleState, filterCount, decodeRoute, encodeRoute, DEFAULT_PAGE_SIZE } from './library';
import { MOTION_EASE, MOTION_MS, MOTION_PX } from './motion';
import { cssVariablesResolver, theme } from './app/theme';
import { books, bookIds, readingRanking, byId, collectionMap, STATE_KEY, authorOptions, safeRead, loadStates, exportAllBooks } from './app/catalogData';
import { GirlIcon, BookshelfIcon, BrandMark } from './app/icons';
import { AgeLibrary } from './app/AgeLibrary';
import { onlyFilters, childrenShelf, resultsTitle } from './app/results';
import { ActiveFilters } from './app/ActiveFilters';
import { BookCover, ThumbCover } from './app/BookCover';
import { BookCard } from './app/BookCard';
import { BookDetail } from './app/BookDetail';
import { Collections } from './app/Collections';
import PageLoading from './components/PageLoading';
import './styles.css';
import './woods.css';

const AccessibilityAudit=import.meta.env.DEV?React.lazy(()=>import('./components/AccessibilityAudit')):null;
// Notes carry the Markdown renderer and the full source notes; load them on demand.
const NotesPage=React.lazy(()=>import('./components/NotesPage'));
// The bookstores page carries its own data (data/bookstores.json); it loads when opened.
const BookstoresPage=React.lazy(()=>import('./components/BookstoresPage'));
const BookFairsPage=React.lazy(()=>import('./components/BookFairsPage'));
const HIDE_OWNED_KEY='kitaplik:hide-owned:v1';
// Counts read as Turkish numbers ("1.019"), as in the reading band.
const countText=new Intl.NumberFormat('tr-TR').format;
// The pages themselves are listed once, in src/views.js; this is only each page's icon.
const VIEW_ICONS={books:IconBook2,queue:IconListNumbers,collections:IconLayersIntersect,bookstores:IconBuildingStore,fairs:IconCalendarEvent,notes:IconFileText,favorites:IconHeart,owned:BookshelfIcon};
// A leaving toast no longer takes the pointer.
/** @type {import('@mantine/core').MantineTransition} */
const TOAST_MOTION={in:{opacity:1,translate:'0 0'},out:{opacity:0,translate:`0 ${MOTION_PX.rise}px`,pointerEvents:'none'},transitionProperty:'opacity, translate'};

function AtlasApp() {
 const [route,setRoute]=useState(()=>decodeRoute(window.location.hash||window.location.search,catalog));
 const {filters,view,sort,book,page,pageSize}=route;
 const [states,setStates]=useState(loadStates);
 const [storageError,setStorageError]=useState(false);
 const [personal,setPersonal]=useState(()=>cleanPersonal(safeRead(PERSONAL_KEY),books.map(b=>b.id)));
 const githubSync=useGitHubStateSync({bookIds,states,setStates,personal,setPersonal});
 const [personalStorageError,setPersonalStorageError]=useState(false);
 const [opened,setOpened]=useState(false);
 const [draft,setDraft]=useState(emptyFilters);
 const [bookTrail,setBookTrail]=useState([]);
 const [copied,setCopied]=useState(false);
 // "Satın aldıklarımı gösterme": on by default, remembered on this device.
 const [hideOwned,setHideOwned]=useState(()=>{try{return localStorage.getItem(HIDE_OWNED_KEY)!=='off'}catch{return true}});
 useEffect(()=>{try{localStorage.setItem(HIDE_OWNED_KEY,hideOwned?'on':'off')}catch{}},[hideOwned]);
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
 const navigate=next=>{const encoded=encodeRoute(next,catalog);window.history.pushState(null,'',window.location.pathname+(encoded?'?'+encoded:''));setRoute(next)};
 const closeBook=()=>{if(openedFromCatalog.current){openedFromCatalog.current=false;window.history.back()}else setRoute(r=>({...r,book:null}))};
 useEffect(()=>{try{localStorage.setItem(STATE_KEY,JSON.stringify(states));setStorageError(false)}catch{setStorageError(true)}},[states]);
 useEffect(()=>{try{localStorage.setItem(PERSONAL_KEY,JSON.stringify(personal));setPersonalStorageError(false)}catch{setPersonalStorageError(true)}},[personal]);
 useEffect(()=>{const encoded=encodeRoute(route,catalog);const url=window.location.pathname+(encoded?'?'+encoded:'');window.history.replaceState(null,'',url)},[route]);
 useEffect(()=>{const change=()=>{openedFromCatalog.current=false;setBookTrail([]);setRoute(decodeRoute(window.location.hash||window.location.search,catalog))};window.addEventListener('hashchange',change);window.addEventListener('popstate',change);return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('popstate',change)}},[]);
 const changeFilters=next=>setRoute(r=>({...r,filters:next,page:1}));
 // The shelf, the filtered list and the page shown (src/app/listing.js, tested in Node).
 const {shelf:shelfBooks,ownedCount,favoriteCount,filtered,pages,currentPage,displayed,showsHiddenPurchases}=useMemo(()=>catalogListing({books,states,view,filters,sort,page,pageSize,rankings:readingRanking.byId,hideOwned}),[states,view,filters,sort,page,pageSize,hideOwned]);
 useEffect(()=>{if(page!==currentPage)setRoute(r=>({...r,page:currentPage}))},[page,currentPage]);
 useEffect(()=>applySeo(seoState({route:{...route,page:currentPage},catalog,count:filtered.length,currentPage,totalPages:pages,displayed})),[route,filtered.length,currentPage,pages,displayed]);
 // The reading band's numbers (src/reading.js, tested in Node); each count opens its shelf.
 const summary=useMemo(()=>readingSummary({books,states,queue:personal.queue}),[states,personal.queue]);
 // A phone keeps its first screen for book titles; there the band is on Sıram only.
 // A phone held sideways is a phone too (src/app/media.js, the grid's own rule).
 const wide=useMediaQuery(WIDE_QUERY,true,{getInitialValueInEffect:false});
 const phoneLandscape=useMediaQuery(PHONE_LANDSCAPE_QUERY,false,{getInitialValueInEffect:false});
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
 const activeCount=filterCount({...filters,query:''});
 const onToggle=(id,key,trigger=document.activeElement)=>{
  const before=states[id]||[];
  const marking=!before.includes(key);
  const owned=toggleState(before,key).includes('alindi');
  setStates(prev=>({...prev,[id]:toggleState(prev[id],key)}));
  // A reading mark also puts the book on Kitaplığım (toggleState), and the reader is told so.
  if(key==='alindi'||(owned&&!before.includes('alindi'))){transferOrigin.current=trigger;setTransfer({id,owned});setToastShown(true);}
  // Being read or read writes the day once (stampReadingDate in src/reading.js).
  if(marking)setPersonal(prev=>stampReadingDate(prev,id,key,todayLocal()));
 };
 const onReading=(id,patch)=>setPersonal(prev=>({...prev,reading:{...prev.reading,[id]:cleanReading({...prev.reading[id],...patch})}}));
 const onAdd=id=>setPersonal(prev=>({...prev,queue:addToQueue(prev.queue,id)}));
 const onQueue=()=>{navigate({...route,view:'queue',book:null,page:1});window.scrollTo({top:0,behavior:'instant'})};
 const onOpen=id=>{setBookTrail(book?[...bookTrail,book]:[]);if(!book){openedFromCatalog.current=true;navigate({...route,book:id})}else setRoute(r=>({...r,book:id}))};
 const previousBook=()=>{const id=bookTrail.at(-1);if(id){setBookTrail(bookTrail.slice(0,-1));setRoute(r=>({...r,book:id}))}};
 const goView=next=>{navigate({...route,view:next,book:null,page:1,...(viewById[next]?.shelf?{filters:emptyFilters()}:{})});window.scrollTo({top:0,behavior:'instant'})};
 const onBrowse=()=>{navigate({...route,view:'books',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})};
 const goCollection=(id,gid)=>{navigate({...route,view:'books',book:null,page:1,filters:{...emptyFilters(),collections:[id],groups:gid?[gid]:[]}});window.scrollTo({top:0,behavior:'instant'})};
 const goCategory=id=>{const next={...route,view:'books',book:null,page:1,filters:{...emptyFilters(),categories:[id]}};window.history.pushState(null,'',window.location.pathname+'?'+encodeRoute(next,catalog));setRoute(next);window.scrollTo({top:0,behavior:'instant'})};
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
 const copyLink=async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setCopied(false)}};
 // The toast leaves the way it came: the last notice stays rendered while it fades out.
 const transferNotice=<div className="library-toast-region" role="status" aria-live="polite" aria-atomic="true"><Transition mounted={toastShown&&Boolean(transfer)} duration={MOTION_MS.overlay} exitDuration={MOTION_MS.overlay} timingFunction={MOTION_EASE} transition={TOAST_MOTION} onExited={()=>setTransfer(null)}>{style=>transfer&&<LibraryToast key={`${transfer.id}-${transfer.owned}`} style={style} leaving={!toastShown} book={byId[transfer.id]} owned={transfer.owned} onClose={dismissTransfer} onUndo={()=>{setStates(prev=>({...prev,[transfer.id]:toggleState(prev[transfer.id],'alindi')}));dismissTransfer()}}/>}</Transition></div>;
 const activeTab=viewById[view]?.shelf?'books':HEADER_VIEWS.includes(view)?view:null;
 return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content').focus()}}>İçeriğe geç</a>
  <Tabs className="main-section-tabs" value={activeTab} onChange={v=>v&&navigate({...route,view:v,book:null,page:1})}>
    <header className="site-header" ref={headerRef}><div className="site-header-inner"><Group renderRoot={props=><a href="./" {...props}/>} className="brand-link" aria-label="Kitaplık · filtresiz ana sayfa" gap={6} wrap="nowrap" onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();window.history.pushState(null,'',window.location.pathname);setRoute({view:'books',book:null,sort:'reading',filters:emptyFilters(),page:1,pageSize:DEFAULT_PAGE_SIZE});setBookTrail([]);window.scrollTo({top:0,behavior:'instant'})}}}><ThemeIcon size={42} radius="md" color="brand"><BrandMark size={24}/></ThemeIcon></Group><Tabs.List ref={setTabList} className="main-tabs" aria-label="Kitaplık bölümleri">{HEADER_VIEWS.map(id=>{const Icon=VIEW_ICONS[id];return <Tabs.Tab key={id} ref={tabRefs[id]} value={id} data-edge="bottom" leftSection={<Icon size={19}/>}>{viewById[id].label}</Tabs.Tab>})}<FloatingIndicator className="main-tabs-indicator" data-edge="bottom" target={activeTab?tabNodes[activeTab]:null} parent={tabList} aria-hidden="true"/></Tabs.List><Tooltip label="Satın aldıklarımı gösterme" withArrow><Switch className="header-switch" label="Satın aldıklarımı gösterme" checked={hideOwned} onChange={e=>setHideOwned(e.currentTarget.checked)} thumbIcon={<IconShoppingBagX size={12} stroke={2.5} aria-hidden="true"/>}/></Tooltip><nav className="header-shortcuts" aria-label="Hızlı erişim"><Tooltip label="Kızım için"><ActionIcon className="header-children" size={48} variant={view==='books'&&filters.categories.length===1&&filters.categories[0]==='children'?'filled':'subtle'} aria-label="Kızım için" aria-current={view==='books'&&filters.categories.length===1&&filters.categories[0]==='children'?'page':undefined} onClick={()=>goCategory('children')}><GirlIcon size={29}/></ActionIcon></Tooltip><Tooltip label={`Favoriler: ${countText(favoriteCount)} kitap`}><ActionIcon className="header-favorites" size={48} variant={view==='favorites'?'filled':'subtle'} aria-label={`Favoriler: ${countText(favoriteCount)} kitap`} aria-current={view==='favorites'?'page':undefined} onClick={()=>{navigate({...route,view:'favorites',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})}}><IconHeart size={29} fill={view==='favorites'?'currentColor':'none'}/>{favoriteCount>0&&<span className="shortcut-count" aria-hidden="true">{countText(favoriteCount)}</span>}</ActionIcon></Tooltip><Tooltip label={`Kitaplığım: ${countText(ownedCount)} kitap`}><ActionIcon className="header-library" size={48} variant={view==='owned'?'filled':'subtle'} aria-label={`Kitaplığım: ${countText(ownedCount)} kitap`} aria-current={view==='owned'?'page':undefined} onClick={()=>{navigate({...route,view:'owned',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})}}><BookshelfIcon size={29}/>{ownedCount>0&&<span className="shortcut-count" aria-hidden="true">{countText(ownedCount)}</span>}</ActionIcon></Tooltip></nav><ThemeTweaker/></div></header>
  <Container size={1200} className="app-shell" px={{base:8,sm:24}}>

   <main id="main-content" tabIndex={-1}>

    {(storageError||personalStorageError)&&<Alert color="orange" mb="lg">Bu tarayıcı kişisel kayıtlarını kalıcı olarak saklayamıyor. Notlar bölümünden yedeğini indirebilirsin.</Alert>}
    {view!=='notes'&&<SyncNotice sync={githubSync} onOpen={openSync}/>}
    <Tabs.Panel value="books">
    {['books','owned','favorites'].includes(view)&&<>
     {['owned','favorites'].includes(view)&&<Title order={1} className="visually-hidden">{view==='owned'?'Kitaplığım':'Favorilerim'}</Title>}
     <div className="search-panel" role="search">
      <TextInput className="catalog-search" label={view==='owned'?'Kitaplığımda ara':view==='favorites'?'Favorilerimde ara':'Katalogda ara'} placeholder="Kitap, yazar, çevirmen…" leftSection={<IconSearch size={21}/>} rightSectionWidth={44} rightSection={filters.query?<ActionIcon variant="subtle" aria-label="Aramayı temizle" onClick={()=>changeFilters({...filters,query:''})}><IconX size={20}/></ActionIcon>:null} value={filters.query} onChange={e=>changeFilters({...filters,query:e.currentTarget.value})}/>
      <div className="search-tools"><Button variant="light" leftSection={<IconFilter size={20}/>} onClick={()=>{setToastShown(false);setDraft(filters);setSheetShown(true);setOpened(true)}}>Filtreler{activeCount?` · ${activeCount}`:''}</Button><WrappingSelect aria-label="Kitapları sırala" value={sort} onChange={v=>setRoute(r=>({...r,sort:v||'reading',page:1}))} data={[{value:'reading',label:'Okuma önceliği'},{value:'shared',label:'En çok kesişen'},{value:'title',label:'Kitap adı · A–Z'},{value:'author',label:'Yazar · A–Z'},{value:'newest',label:'Yayın yılı · yeni'},{value:'added',label:'Eklenme · yeni'},{value:'saved',label:'Favoriler önce'}]}/></div>
      <ActiveFilters filters={filters} onChange={changeFilters}/>
     </div>
     {wide&&!phoneLandscape&&view==='books'&&!filterCount(filters)&&<ReadingSummary summary={summary} onSelect={onSummary}/>}
     {view==='books'&&!filterCount(filters)&&<section className="reading-route" aria-label="Nereden başlamalı?"><div><Text fw={500}>Nereden başlamalı?</Text><Text>{collectionMap.core?.count} kitaplık çekirdek, düşünceden uygulamaya.</Text></div><Button variant="white" color="brand" rightSection={<IconArrowRight size={19}/>} onClick={()=>goCollection('core')}>Seçkiye git</Button></section>}
     {view==='books'&&childrenShelf(filters)&&onlyFilters(filters,['categories'])&&<AgeLibrary onGroup={goCollection}/>}
     {view==='books'&&sort==='reading'&&<ReadingPrioritySummary ranking={readingRanking}/>}
     <div className="results-heading" ref={resultsRef}><div><Title order={['owned','favorites'].includes(view)?2:1}>{resultsTitle(filters,view)}</Title><div role="status" aria-live="polite"><Text c="dimmed">{filtered.length} eser{filtered.length?`, ${((currentPage-1)*pageSize)+1}–${Math.min(currentPage*pageSize,filtered.length)} arası gösteriliyor`:''}</Text>{showsHiddenPurchases&&<Text className="purchases-note">Satın aldığın kitaplar da listede, çünkü okuma işaretine göre süzdün.</Text>}</div></div><Group gap={4}>{filterCount(filters)>0&&<Button variant="subtle" onClick={()=>changeFilters(emptyFilters())}>Temizle</Button>}<Tooltip label={copied?'Bağlantı kopyalandı':'Bağlantıyı kopyala'}><ActionIcon variant="subtle" aria-label={copied?'Bağlantı kopyalandı':'Bağlantıyı kopyala'} onClick={copyLink}>{copied?<IconCheck size={22}/>:<IconLink size={22}/>}</ActionIcon></Tooltip></Group></div>
     {filtered.length?<><div className="books-grid">{displayed.map(b=><BookCard key={b.id} book={b} ranking={readingRanking.byId[b.id]} states={states} onToggle={onToggle} onOpen={onOpen} queue={personal.queue} onAdd={onAdd} onQueue={onQueue}/>)}</div><CatalogPagination page={currentPage} total={pages} count={filtered.length} pageSize={pageSize} onChange={changePage} onPageSize={size=>navigate({...route,page:1,pageSize:size,book:null})} hrefForPage={p=>window.location.pathname+'?'+encodeRoute({...route,page:p,book:null},catalog)}/></>:<Paper withBorder className="empty-state" p="xl" radius="lg"><IconSearch size={36}/><Title order={2}>{view==='owned'&&!ownedCount?'Kitaplığın ilk kitabını bekliyor.':view==='favorites'&&!shelfBooks.length?'Henüz favori kitap yok.':'Bu seçimde kitap yok.'}</Title><Text c="dimmed" mt="sm">{view==='owned'&&!ownedCount?'Katalogda “Satın aldım” dediğin kitap burada da görünür.':view==='favorites'&&!shelfBooks.length?'Kartlardaki kalple favorilerini buraya ekleyebilirsin.':'Bir filtreyi kaldırabilir veya aramanı değiştirebilirsin.'}</Text><Button mt="lg" variant="light" onClick={()=>(view==='owned'&&!ownedCount)||(view==='favorites'&&!shelfBooks.length)?onBrowse():changeFilters(emptyFilters())}>{(view==='owned'&&!ownedCount)||(view==='favorites'&&!shelfBooks.length)?'Kataloğa git':'Filtreleri temizle'}</Button></Paper>}
    </>}
    </Tabs.Panel>
    <Tabs.Panel value="queue">{view==='queue'&&<><Title order={1} className="visually-hidden">Okuma sıram</Title><ReadingQueue queue={personal.queue} books={byId} reading={personal.reading} states={states} onMove={(id,direction)=>setPersonal(prev=>({...prev,queue:moveInQueue(prev.queue,id,direction)}))} onRemove={id=>setPersonal(prev=>({...prev,queue:prev.queue.filter(value=>value!==id)}))} onOpen={onOpen} onBrowse={onBrowse} BookCover={ThumbCover}/><ReadingSummary summary={summary} onSelect={onSummary}/></>}</Tabs.Panel>
    <Tabs.Panel value="collections">{view==='collections'&&<><Title order={1} className="visually-hidden">Kitap kümeleri</Title><Collections onCollection={goCollection} onGroup={goCollection} states={states}/></>}</Tabs.Panel>
    {view==='fairs'&&<React.Suspense fallback={<PageLoading>Kitap fuarları yükleniyor…</PageLoading>}><BookFairsPage/></React.Suspense>}
    <Tabs.Panel value="bookstores">{view==='bookstores'&&<React.Suspense fallback={<PageLoading>Kitapçılar yükleniyor…</PageLoading>}><BookstoresPage/></React.Suspense>}</Tabs.Panel>
    {view==='notes'&&<section aria-labelledby="notes-heading"><Title id="notes-heading" order={1} className="visually-hidden">Kaynaklar ve notlar</Title><React.Suspense fallback={<PageLoading>Notlar yükleniyor…</PageLoading>}><NotesPage states={states} setStates={setStates} personal={personal} setPersonal={setPersonal} sync={githubSync}/></React.Suspense></section>}
   </main>
   <FooterMenu current={viewById[view]?.label} groups={[
    {id:'sections',title:'Bölümler',items:[
     ...VIEWS.filter(v=>v.footer==='sections').map(v=>({label:v.label,icon:VIEW_ICONS[v.id],current:view===v.id,onSelect:v.id==='books'?onBrowse:v.id==='queue'?onQueue:()=>goView(v.id)})),
    ]},
    {id:'shortcuts',title:'Kısayollar',items:[
     {label:'Kızım için',icon:GirlIcon,current:view==='books'&&childrenShelf(filters),onSelect:()=>goCategory('children')},
     ...VIEWS.filter(v=>v.footer==='shortcuts').map(v=>({label:v.id==='owned'?`${v.label}: ${countText(ownedCount)} kitap`:v.id==='favorites'?`${v.label}: ${countText(favoriteCount)} kitap`:v.label,icon:VIEW_ICONS[v.id],current:view===v.id,onSelect:()=>goView(v.id)})),
    ]},
    {id:'tools',title:'Araçlar',items:[
     {label:'Çeviri rehberi',icon:IconLanguage,onSelect:()=>setGuideOpened(true)},
     {label:'Cihaz eşitleme',icon:IconRefresh,onSelect:()=>openSync()},
     {label:'Kitapları JSON indir',icon:IconDownload,onSelect:exportAllBooks},
    ]},
   ]} meta={<><Text fw={600}>Kitaplık</Text><Text>Yaratılış: 27 Eylül 2026</Text><Text>Güncelleme: {catalog.updated}</Text></>}/>
  </Container>
  </Tabs>
  <SyncMergeDialog sync={githubSync}/>
  {/* Opened from the book sheet too, so it sits above the sheet (Mantine's layer 200) and below the toast (310). */}
  <Modal opened={syncOpened} onClose={closeSync} zIndex={300} returnFocus={false} onExitTransitionEnd={syncClosed} title="Cihazlar arası eşitleme" size="lg" centered className="sync-modal" closeButtonProps={{'aria-label':'Kapat'}}><div inert={!syncOpened||undefined}><GitHubSyncPanel sync={githubSync} framed={false}/></div></Modal>
  <Modal opened={guideOpened} onClose={()=>setGuideOpened(false)} title="Çeviri seçme rehberi" size="lg" centered className="global-guide-modal" closeButtonProps={{'aria-label':'Kapat'}}><TranslationCriteria/></Modal>
  <FilterSheet opened={opened} onClose={()=>setOpened(false)} onExited={()=>setSheetShown(false)} value={draft} onChange={setDraft} onReset={()=>setDraft({...emptyFilters(),query:filters.query})} onApply={()=>{changeFilters(draft);setOpened(false)}} count={draftCount} catalog={catalog} authors={authorOptions} shelf={draftListing?.shelf??shelfBooks}/>
  {!book&&transferNotice}
  <BookDetail feedback={transferNotice} ranking={readingRanking.byId[book]} onOpen={onOpen} onBack={previousBook} hasBack={bookTrail.length>0} book={byId[book]} onClose={closeBook} states={states} onToggle={onToggle} onCollection={goCollection} onCategory={goCategory} personal={personal} onReading={onReading} onAdd={onAdd} onQueue={onQueue} storageError={storageError||personalStorageError} sync={githubSync} onSync={openSync} covered={syncCovering||Boolean(githubSync.mergePrompt)}/>
 </>;
}
export default function App(){return <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="dark" colorSchemeManager={localStorageColorSchemeManager({key:'kitapatlasi:color-scheme'})}><AtlasApp/>{AccessibilityAudit&&<React.Suspense fallback={null}><AccessibilityAudit/></React.Suspense>}</MantineProvider>}
