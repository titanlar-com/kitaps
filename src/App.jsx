import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, ActionIcon, Alert, Anchor, Badge, Box, Button, Card, Container, Group, MantineProvider, Modal, Paper, Stack, Text, TextInput, Tabs, ThemeIcon, Title, Tooltip, createTheme, defaultVariantColorsResolver, localStorageColorSchemeManager } from '@mantine/core';
import { IconLink, IconArrowLeft, IconArrowRight, IconArrowUpRight, IconBook2, IconFileText, IconShoppingBagCheck, IconBooks, IconCheck, IconChevronRight, IconDownload, IconFilter, IconHeart, IconLayersIntersect, IconListNumbers, IconSearch, IconX } from '@tabler/icons-react';
import '@mantine/core/styles.css';
import '@fontsource-variable/literata/wght.css';
import '@fontsource-variable/literata/wght-italic.css';
import catalog from './catalog.json';
import SpotlightCard from './components/SpotlightCard';
import ReadingPanel, { QueueButton } from './components/ReadingPanel';
import ReadingQueue from './components/ReadingQueue';
import BookDiscovery, { ReadingPurpose } from './components/BookDiscovery';
import EditionGuide from './components/EditionGuide';
import CatalogPagination from './components/CatalogPagination';
import TranslationStatus from './components/TranslationStatus';
import { displayTitle,translationStatus,turkishEdition } from './translation';
import { workFormat } from './workFormat';
import { applySeo,seoState } from './seo';
import ThemeToggle from './components/ThemeToggle';
import CategoryPill from './components/CategoryPill';
import EditionSummary from './components/EditionSummary';
import BookSheet from './components/BookSheet';
import FilterSheet from './components/FilterSheet';
import LibraryToast from './components/LibraryToast';
import WrappingSelect from './components/WrappingSelect';
import TranslationCriteria from './components/TranslationCriteria';
import ReadingPriorityCard from './components/ReadingPriorityCard';
import ReadingPrioritySummary from './components/ReadingPrioritySummary';
import ReadingPriorityBadge from './components/ReadingPriorityBadge';
import StateRibbons, { StateSummary } from './components/StateRibbons';
import SyncMergeDialog from './components/SyncMergeDialog';
import SyncNotice from './components/SyncNotice';
import SyncStatusLine from './components/SyncStatusLine';
import GitHubSyncPanel from './components/GitHubSyncPanel';
import SourceBadge from './components/SourceBadge';
import {download} from './download';
import {useGitHubStateSync} from './state/useGitHubStateSync';
import { ReadingPriorityEngine, ReadingRankingViewModel } from './ranking/ReadingPriorityEngine.ts';
import { PERSONAL_KEY, cleanPersonal, cleanReading, addToQueue, moveInQueue, todayLocal } from './reading';
import {createBooksExport} from './catalogExport';
import { STATE_LABELS, QUALITY_LABELS, ORIGIN_LABELS, emptyFilters, prepareBooks, filterBooks, sortBooks, toggleState, migrateStates, filterCount, decodeRoute, encodeRoute, normalize, booksForShelf, DEFAULT_PAGE_SIZE, formatDay } from './library';
import './styles.css';

const AccessibilityAudit=import.meta.env.DEV?React.lazy(()=>import('./components/AccessibilityAudit')):null;
// Notes carry the Markdown renderer and the full source notes; load them on demand.
const NotesPage=React.lazy(()=>import('./components/NotesPage'));
const theme = createTheme({
 fontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', primaryColor:'brand', primaryShade:{light:7,dark:3}, defaultRadius:'md', cursorType:'pointer', autoContrast:true,
 // Brick red: shade 7 carries white text in the light scheme, shade 3 dark text in the dark one.
 // Mantine picks filled text once, from the light shade, so the dark scheme kept white text on
 // the light brick (2.3:1); the accent ink is the checked pair for the accent in both schemes.
 variantColorResolver:input=>{const colors=defaultVariantColorsResolver(input);return input.variant==='filled'&&input.color==='brand'?{...colors,color:'var(--accent-ink)'}:colors},
 colors:{brand:['#fcf1ec','#f6e4da','#eec7b2','#ef9a70','#e07f52','#c9612f','#b04d24','#9a3f1e','#7a3014','#5c230e']},
 fontSizes:{xs:'1rem',sm:'1rem',md:'1rem',lg:'1.125rem',xl:'1.25rem'},
 headings:{fontFamily:'"Literata Variable", Georgia, serif',fontWeight:'600',sizes:{h1:{fontSize:'2.25rem',lineHeight:'1.15'},h2:{fontSize:'1.75rem',lineHeight:'1.2'},h3:{fontSize:'1.25rem',lineHeight:'1.3'},h4:{fontSize:'1.0625rem',lineHeight:'1.35'}}},
 components:{Button:{defaultProps:{size:'md'}},ActionIcon:{defaultProps:{size:44}},TextInput:{defaultProps:{size:'md'}},Select:{defaultProps:{size:'md'}},MultiSelect:{defaultProps:{size:'md'}},Badge:{defaultProps:{size:'lg',variant:'light',radius:'sm'}},Drawer:{defaultProps:{closeButtonProps:{'aria-label':'Kapat'},overlayProps:{backgroundOpacity:.35,blur:3}}}}
});
const books=prepareBooks(catalog.books);
const bookIds=books.map(book=>book.id);
// Reading priority is a pure function of the catalog: no personal state is an input.
const readingRanking=new ReadingRankingViewModel(new ReadingPriorityEngine(catalog)).build();
const byId=Object.fromEntries(books.map(b=>[b.id,b]));
const collectionMap=Object.fromEntries(catalog.collections.map(c=>[c.id,c]));

function GirlIcon({size=28}) {
 return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="14" cy="7.8" r="3.4"/><circle cx="8.9" cy="8.6" r="1.6"/><circle cx="19.1" cy="8.6" r="1.6"/><path d="M14 12.4 9.3 21h9.4z"/><path d="M11.8 15 9 17.4M16.2 15l2.8 2.4M12.3 21v3.6M15.7 21v3.6"/></svg>;
}
function BookshelfIcon({size=28}) {
 return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 23.5h21M5 4.5h5v16H5zM11.5 6.5h4.5v14h-4.5zM18 5.5l4-1 3.5 15.5-4 1z"/><path d="M3.5 21h21v3H3.5z"/></svg>;
}
const groupMap=Object.fromEntries(catalog.groups.map(g=>[g.id,g]));
const categoryMap=Object.fromEntries(catalog.categories.map(c=>[c.id,c]));
const STATE_KEY='kitapatlasi:states:v2';

const authorOptions=[...new Set(books.map(b=>b.author).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
const safeRead=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}};
const loadStates=()=>migrateStates(books,safeRead(STATE_KEY),safeRead('kitaps:states:v1'));
const exportAllBooks=()=>download('kitaplik-tum-kitaplar.json',createBooksExport(catalog));
const AGE_LIBRARY='temel-kutuphane';
function AgeLibrary({onGroup}) {
 const library=collectionMap[AGE_LIBRARY];
 if(!library)return null;
 return <section className="age-library" aria-labelledby="age-library-heading">
  <Text className="eyebrow">Kızım için</Text>
  <Title order={2} id="age-library-heading">{library.title}</Title>
  <Text>{library.description}</Text>
  <div className="age-bands">{library.groupIds.map(id=><Button key={id} variant="default" onClick={()=>onGroup(library.id,id)}>{groupMap[id].title.split(' · ')[0]} · {groupMap[id].count}</Button>)}<Button onClick={()=>onGroup(library.id)} rightSection={<IconArrowRight size={18}/>}>Tümü · {library.count}</Button></div>
 </section>;
}
// Filters other than the ones named are empty (the search text included).
const onlyFilters=(filters,keys)=>!filters.query.trim()&&Object.entries(filters).every(([key,value])=>keys.includes(key)||['query','categoryMode','collectionMode'].includes(key)||(Array.isArray(value)?!value.length:typeof value==='boolean'?!value:value===''));
const childrenShelf=filters=>filters.categories.length===1&&filters.categories[0]==='children';
// A single collection or subset is named instead of the generic heading.
function resultsTitle(filters,view){
 if(childrenShelf(filters))return 'Kızım için';
 if(filters.collections.length===1&&filters.groups.length<=1&&onlyFilters(filters,['collections','groups'])){
  const collection=collectionMap[filters.collections[0]],group=groupMap[filters.groups[0]];
  if(collection)return group?`${collection.short||collection.title} · ${group.title}`:collection.title;
 }
 if(filterCount(filters))return 'Seçtiğin kitaplar';
 return view==='owned'?'Kitaplığımdakiler':view==='favorites'?'Favorilerim':'Tüm kitaplar';
}
function ActiveFilters({filters:f,onChange}) {
 const chips=[];
 const labels={categories:id=>categoryMap[id]?.label,collections:id=>collectionMap[id]?.short,groups:id=>groupMap[id]?.title,states:id=>STATE_LABELS[id],authors:id=>id,origins:id=>ORIGIN_LABELS[id],awards:id=>id,awardYears:id=>`FT ${id}`,qualities:id=>QUALITY_LABELS[id],addedDates:day=>`Eklenme · ${formatDay(day)}`};
 for(const [key,label] of Object.entries(labels))for(const value of f[key])chips.push({id:`${key}-${value}`,label:label(value)||value,remove:()=>onChange({...f,[key]:f[key].filter(v=>v!==value)})});
 if(f.hasEdition)chips.push({id:'edition',label:'Künye bilgisi var',remove:()=>onChange({...f,hasEdition:false})});
 if(f.shared)chips.push({id:'shared',label:'Birden fazla kümede',remove:()=>onChange({...f,shared:false})});
 if(f.yearMin!==''||f.yearMax!=='')chips.push({id:'years',label:`Yayın: ${f.yearMin||'…'}–${f.yearMax||'…'}`,remove:()=>onChange({...f,yearMin:'',yearMax:''})});
 return chips.length?<Group gap={8} className="active-filters" role="group" aria-label="Etkin filtreler">{chips.map(c=><Button key={c.id} variant="light" rightSection={<IconX size={17}/>} onClick={c.remove} aria-label={`${c.label} filtresini kaldır`}>{c.label}</Button>)}</Group>:null;
}
// Every cover comes in two sizes: covers/sm/ (400 px wide) and covers/ (up to 720 px). The
// browser picks by the size the cover is shown at and the screen's density, so a phone does not
// download what only a 2x desktop screen needs. A card is a column of the grid in styles.css:
// the page padding (8 px, 24 px from 48em) and the column gaps (12, 20, 24 px) come off first.
const COVER_SIZES={
 card:'(orientation: landscape) and (max-height: 31em) and (max-width: 64.99em) calc(50vw - 34px), (min-width: 75em) 270px, (min-width: 56em) calc(25vw - 30px), (min-width: 36em) calc(33.4vw - 30px), calc(50vw - 14px)',
 detail:'(min-width: 48em) 200px, 112px',
 thumb:'96px',
};
const smallCover=src=>src.replace(/^covers\//,'covers/sm/');
function BookCover({book:b,onOpen=null,detail=false,read=false,size=detail?'detail':'card'}) {
 const [failed,setFailed]=useState(false);
 const cover=b.cover,format=workFormat(b);
 // The single-file export embeds one copy of each cover instead.
 const embedded=cover&&globalThis.__KITAP_COVERS__?.[cover.src];
 const content=cover&&!failed?<img src={embedded||`./${cover.src}`} srcSet={embedded?undefined:`./${smallCover(cover.src)} 400w, ./${cover.src} 720w`} sizes={embedded?undefined:COVER_SIZES[size]} alt={`${cover.title} — ${cover.publisher}, ${cover.language==='tr'?'Türkçe':'Uluslararası'} baskı kapağı`} width="240" height="360" loading={detail?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>:<span className="cover-placeholder" aria-hidden="true">{format&&<span className="cover-placeholder-kind">{format.label}</span>}<span className="cover-placeholder-title">{displayTitle(b)}</span><span className="cover-placeholder-author">{b.author}</span><span className="cover-placeholder-note">{format?<IconFileText size={18} stroke={1.5}/>:<IconBook2 size={18} stroke={1.5}/>}</span></span>;
 const stage=`cover-stage${read?' is-read':''}`;
 return detail?<div className={`${stage} cover-stage-detail`}>{content}</div>:<button className={`${stage} cover-open`} onClick={()=>onOpen(b.id)} aria-label={`${displayTitle(b)} ayrıntılarını aç`}>{content}</button>;
}
// Small covers beside related books and in the reading queue.
const ThumbCover=props=><BookCover {...props} size="thumb"/>;
// A card names the Turkish publisher once a Turkish edition is known, and an
// article or essay names what it is and where it appeared.
const cardPublisher=b=>{
 const format=workFormat(b);
 if(format)return [format.label,b.publication?.venue].filter(Boolean).join(' · ');
 return (['available','original'].includes(translationStatus(b).status)&&turkishEdition(b)?.publisher)||b.cover?.publisher||'';
};
function BookCard({book:b,ranking,states,onOpen,onToggle,queue,onAdd,onQueue}) {
 const marks=states[b.id]||[],saved=marks.includes('onemli'),owned=marks.includes('alindi');
 const reading=marks.filter(s=>!['onemli','alindi','okundu'].includes(s)),publisher=cardPublisher(b),title=displayTitle(b);
 return <Card component="article" padding={0} className="book-card" data-book-id={b.id} onClick={e=>{if(!(e.target instanceof Element&&e.target.closest('button,a,input,select,textarea,[role="button"]')))onOpen(b.id)}}>
  <div className="book-visual"><BookCover book={b} onOpen={onOpen} read={marks.includes('okundu')}/><div className="cover-marks"><ReadingPriorityBadge ranking={ranking}/><StateRibbons marks={marks}/></div></div>
  <div className="book-card-body">
   <Title order={3}><button className="title-button" onClick={()=>onOpen(b.id)}>{title}</button></Title>
   <StateSummary marks={marks}/>
   <Text className="book-author">{b.author||'Yazar bilgisi kaynakta belirtilmemiş'}</Text>
   {b.childAge&&<Text className="book-age">{b.childAge} yaş</Text>}
   <div className="book-meta-row"><TranslationStatus book={b}/>{publisher&&<Text className="book-publisher">{publisher}</Text>}</div>
   {reading.length>0&&<Group gap={6} className="book-state-badges">{reading.map(s=><Badge key={s} color="brand">{STATE_LABELS[s]}</Badge>)}</Group>}
   <div className="book-actions">
    <Tooltip label={saved?'Favorilerden çıkar':'Favorilerime ekle'} withArrow><ActionIcon className="cover-save" variant="subtle" aria-label={`${title}: favori ${saved?'işaretini kaldır':'olarak işaretle'}`} aria-pressed={saved} onClick={()=>onToggle(b.id,'onemli')}><IconHeart size={21} fill={saved?'currentColor':'none'}/></ActionIcon></Tooltip>
    <Tooltip label={owned?'Kitaplığımdan çıkar':'Satın aldım'} withArrow><ActionIcon className="cover-owned" variant="subtle" aria-label={`${title}: ${owned?'kitaplığımdan çıkar':'satın aldım'}`} aria-pressed={owned} onClick={e=>onToggle(b.id,'alindi',e.currentTarget)}><IconShoppingBagCheck size={21}/></ActionIcon></Tooltip>
    <QueueButton id={b.id} title={title} queue={queue} onAdd={onAdd} onQueue={onQueue} iconOnly/>
   </div>
  </div>
 </Card>
}
function BookDetail({book:b,ranking,onClose,onOpen,onBack,hasBack,states,onToggle,onCollection,onCategory,personal,onReading,onAdd,onQueue,storageError,feedback,sync,onSync}) {
 const topRef=useRef(null);
 const shownTitle=b?displayTitle(b):'';
 // Only a known original title is shown under a Turkish title.
 const originalTitle=b&&translationStatus(b).status==='available'&&b.originalTitle&&b.originalTitle!==shownTitle?b.originalTitle:'';
 useEffect(()=>{if(b)topRef.current?.scrollIntoView({block:'start',behavior:'instant'})},[b?.id]);
 return <BookSheet opened={!!b} onClose={onClose}>
  {b&&<Stack gap="xl" pb="xl" key={b.id} className="detail-content">
   <div ref={topRef} className="detail-top">{hasBack&&<Button variant="subtle" leftSection={<IconArrowLeft size={18}/>} onClick={onBack}>Önceki kitaba dön</Button>}</div>
   <div className="detail-hero"><div className="detail-cover-block"><BookCover key={b.id} book={b} detail read={(states[b.id]||[]).includes('okundu')}/><div className="cover-marks"><StateRibbons marks={states[b.id]||[]}/></div></div>
    <div className="detail-heading"><Title order={2}>{shownTitle}</Title><StateSummary marks={states[b.id]||[]}/><Text className="detail-author">{b.author||'Yazar bilgisi belirtilmemiş'}</Text>{originalTitle&&<Text className="detail-original">{originalTitle}</Text>}{b.years.length>0&&<Text className="detail-year">İlk yayın · {b.years.join(' / ')}</Text>}{b.childAge&&<Text className="detail-year">Önerilen yaş · {b.childAge}</Text>}{formatDay(b.addedAt)&&<Text className="detail-year">Kitaplığa eklendi · {formatDay(b.addedAt)}</Text>}<div className="detail-translation-status"><TranslationStatus book={b}/></div>
     <Group gap={8} mt="md">{b.categories.map(id=><CategoryPill key={id} id={id} label={categoryMap[id].label} onNavigate={onCategory}/>)}</Group>
     {b.cover&&<div className="cover-caption"><Text c="dimmed">{b.cover.scope||(b.cover.language==='tr'?'Türkçe baskı kapağı':'Uluslararası baskı kapağı')}</Text><Anchor href={b.cover.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Kapaktaki baskıyı incele <IconArrowUpRight size={17}/></Anchor></div>}
    </div>
   </div>
   {b.childCaution&&<Alert color="orange" title="Ebeveyn notu" className="child-caution">{b.childCaution}</Alert>}
   <EditionSummary book={b}/>
   <Paper withBorder radius="lg" className="detail-actions"><Group gap={8}>{Object.entries(STATE_LABELS).filter(([key])=>['onemli','alinacak','alindi'].includes(key)).map(([key,label])=><Button variant={(states[b.id]||[]).includes(key)?'filled':'light'} key={key} aria-pressed={(states[b.id]||[]).includes(key)} onClick={e=>onToggle(b.id,key,e.currentTarget)} leftSection={(states[b.id]||[]).includes(key)?<IconCheck size={17}/>:null}>{label}</Button>)}</Group><QueueButton id={b.id} queue={personal.queue} onAdd={onAdd} onQueue={onQueue}/><SyncStatusLine sync={sync} onOpen={onSync}/></Paper>
   <ReadingPurpose book={b} catalog={catalog}/>
   <BookDiscovery key={b.id} book={b} catalog={catalog} states={states} onOpen={onOpen} onCategory={onCategory} onCollection={onCollection} BookCover={ThumbCover}/>
   <EditionGuide book={b}/>
   <Accordion multiple variant="separated" radius="lg" className="detail-sections">
    <Accordion.Item value="personal"><Accordion.Control>Okuma kaydım ve kişisel notlarım</Accordion.Control><Accordion.Panel><ReadingPanel book={b} record={personal.reading[b.id]} states={states[b.id]||[]} onToggle={onToggle} onChange={onReading} queue={personal.queue} onAdd={onAdd} onQueue={onQueue} storageError={storageError}/></Accordion.Panel></Accordion.Item>
    <Accordion.Item value="sources"><Accordion.Control>Kaynaklar ve küme üyelikleri · {b.collectionIds.length}</Accordion.Control><Accordion.Panel><Stack gap="md"><Group gap={8}>{b.origins.map(id=><SourceBadge id={id} key={id}/>)}</Group>
     {b.notes.map((n,i)=><Box className="note-block" key={i}><Text>{n.text}</Text><Text c="dimmed" mt={6}>{n.source}</Text></Box>)}
     {b.collectionIds.map(id=>{const memberships=b.memberships.filter(m=>m.collectionId===id);return <Paper key={id} withBorder p="md"><Button variant="subtle" className="membership-link" onClick={()=>onCollection(id)} rightSection={<IconArrowRight size={18}/>}>{collectionMap[id].title}</Button><Text c="dimmed" mt="sm">{[...new Set(memberships.map(m=>groupMap[m.groupId].title))].join(' · ')}</Text>{memberships.filter(m=>m.award).map(m=><Badge key={m.groupId} mt="sm">{m.awardYear} · {m.award}</Badge>)}{[...new Set(memberships.map(m=>m.role).filter(Boolean))].map(role=><Badge key={role} mt="sm" variant="light">{role}</Badge>)}{memberships.find(m=>m.source)&&<Anchor className="source-link" href={memberships.find(m=>m.source).source} target="_blank" rel="noreferrer">Özgün kaynağı aç <IconArrowUpRight size={17}/></Anchor>}</Paper>})}
     {b.tags.length>0&&<Text c="dimmed">Kaynak dosyanın etiketleri: {b.tags.map(t=>catalog.sourceTags[t]).join(' · ')}.</Text>}
    </Stack></Accordion.Panel></Accordion.Item>
   </Accordion>
   <ReadingPriorityCard ranking={ranking}/>
  </Stack>}
  {feedback}
 </BookSheet>
}
function Collections({onCollection,onGroup,states}) {
 const [query,setQuery]=useState('');
 const available=booksForShelf(books,states);
 const collectionCount=id=>available.filter(b=>b.collectionIds.includes(id)).length;
 const groupCount=id=>available.filter(b=>b.groupIds.includes(id)).length;
 const shown=catalog.collections.filter(c=>normalize(c.title+' '+c.description).includes(normalize(query)));
 return <Stack gap="xl">
  <TextInput label="Kümeler arasında ara" placeholder="TIME, çocuk, strateji…" value={query} onChange={e=>setQuery(e.currentTarget.value)} leftSection={<IconSearch size={20}/>}/>
  <Accordion variant="separated" radius="lg" className="collections-accordion">{shown.map(c=><Accordion.Item key={c.id} value={c.id}>
   <Accordion.Control><Group gap="md"><ThemeIcon variant="light" size={48} color={c.origin==='kitaps'?'grape':'brand'} radius="md"><Text fw={600}>{c.mark}</Text></ThemeIcon><div className="collection-summary"><Text fw={600}>{c.title}</Text><Text c="dimmed">{collectionCount(c.id)} kitap · {c.count} kaynak kaydı · {c.groupIds.length} alt küme</Text></div></Group></Accordion.Control>
   <Accordion.Panel><Stack gap="md"><Text>{c.description}</Text>{c.context?.purpose&&<Text><strong>Okuma amacı:</strong> {c.context.purpose}</Text>}{c.context?.criterion&&<Text><strong>Seçim ölçütü:</strong> {c.context.criterion}</Text>}{c.context?.verdict&&<Box className="note-block"><Text>{c.context.verdict}</Text></Box>}<Text c="dimmed">{c.note}</Text><Button className="collection-books-button" onClick={()=>onCollection(c.id)} rightSection={<IconArrowRight size={18}/>}>Bu kümedeki kitaplar</Button><Stack gap={8}>{c.groupIds.map(id=><Button key={id} variant="default" onClick={()=>onGroup(c.id,id)} className="subset-button" justify="space-between" rightSection={<IconChevronRight size={19}/>}>{groupMap[id].title} · {groupCount(id)}</Button>)}</Stack>{c.source&&<Anchor href={c.source} target="_blank" rel="noreferrer">Özgün liste <IconArrowUpRight size={16}/></Anchor>}</Stack></Accordion.Panel>
  </Accordion.Item>)}</Accordion>{!shown.length&&<Text>Bu aramayla eşleşen küme yok.</Text>}
 </Stack>
}
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
 const [transfer,setTransfer]=useState(null);
 const [guideOpened,setGuideOpened]=useState(false);
 const [syncOpened,setSyncOpened]=useState(false);
 const transferOrigin=useRef(null);
 const dismissTransfer=useCallback(()=>{
  const restoreFocus=document.activeElement?.closest('.library-toast');
  setTransfer(null);
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
 const shelfBooks=useMemo(()=>booksForShelf(books,states,view==='owned'?'owned':view==='favorites'?'favorites':'catalog'),[states,view]);
 const ownedCount=useMemo(()=>booksForShelf(books,states,'owned').length,[states]);
 const filtered=useMemo(()=>sortBooks(filterBooks(shelfBooks,filters,states),sort,states,readingRanking.byId),[shelfBooks,filters,sort,states]);
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const currentPage=Math.min(page,pages);
 const displayed=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
 useEffect(()=>{if(page!==currentPage)setRoute(r=>({...r,page:currentPage}))},[page,currentPage]);
 useEffect(()=>applySeo(seoState({route:{...route,page:currentPage},catalog,count:filtered.length,currentPage,totalPages:pages,displayed})),[route,filtered.length,currentPage,pages,displayed]);
 const draftCount=useMemo(()=>filterBooks(shelfBooks,draft,states).length,[shelfBooks,draft,states]);
 const activeCount=filterCount({...filters,query:''});
 const onToggle=(id,key,trigger=document.activeElement)=>{
  const marking=!(states[id]||[]).includes(key);
  setStates(prev=>({...prev,[id]:toggleState(prev[id],key)}));
  if(key==='alindi'){transferOrigin.current=trigger;setTransfer({id,owned:marking});}
  if(marking&&['okunuyor','okundu'].includes(key))setPersonal(prev=>{
   const field=key==='okunuyor'?'startedAt':'finishedAt';const record=cleanReading(prev.reading[id]);
   return {...prev,reading:{...prev.reading,[id]:{...record,[field]:record[field]||todayLocal()}}};
  });
 };
 const onReading=(id,patch)=>setPersonal(prev=>({...prev,reading:{...prev.reading,[id]:cleanReading({...prev.reading[id],...patch})}}));
 const onAdd=id=>setPersonal(prev=>({...prev,queue:addToQueue(prev.queue,id)}));
 const onQueue=()=>{navigate({...route,view:'queue',book:null,page:1});window.scrollTo({top:0,behavior:'instant'})};
 const onOpen=id=>{setBookTrail(book?[...bookTrail,book]:[]);if(!book){openedFromCatalog.current=true;navigate({...route,book:id})}else setRoute(r=>({...r,book:id}))};
 const previousBook=()=>{const id=bookTrail.at(-1);if(id){setBookTrail(bookTrail.slice(0,-1));setRoute(r=>({...r,book:id}))}};
 const onBrowse=()=>{navigate({...route,view:'books',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})};
 const goCollection=(id,gid)=>{navigate({...route,view:'books',book:null,page:1,filters:{...emptyFilters(),collections:[id],groups:gid?[gid]:[]}});window.scrollTo({top:0,behavior:'instant'})};
 const goCategory=id=>{const next={...route,view:'books',book:null,page:1,filters:{...emptyFilters(),categories:[id]}};window.history.pushState(null,'',window.location.pathname+'?'+encodeRoute(next,catalog));setRoute(next);window.scrollTo({top:0,behavior:'instant'})};
 const changePage=p=>{navigate({...route,page:p,book:null});resultsRef.current?.scrollIntoView({behavior:'instant',block:'start'})};
 // The library toast sits above dialogs, so it closes before the connect dialog opens over it.
 const syncOpener=useRef(null);
 const openSync=event=>{syncOpener.current=event?.currentTarget??document.activeElement;setTransfer(null);setSyncOpened(true)};
 // Connecting removes the notice whose button opened the dialog; focus then goes to the main content.
 const syncClosed=()=>{const opener=syncOpener.current;(opener?.isConnected?opener:document.getElementById('main-content'))?.focus({preventScroll:true})};
 const copyLink=async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setCopied(false)}};
 const transferNotice=<div className="library-toast-region" role="status" aria-live="polite" aria-atomic="true">{transfer&&<LibraryToast key={`${transfer.id}-${transfer.owned}`} book={byId[transfer.id]} owned={transfer.owned} onClose={dismissTransfer} onUndo={()=>{setStates(prev=>({...prev,[transfer.id]:toggleState(prev[transfer.id],'alindi')}));dismissTransfer()}}/>}</div>;
 const activeTab=['owned','favorites'].includes(view)?'books':['books','queue','collections'].includes(view)?view:null;
 return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content').focus()}}>İçeriğe geç</a>
  <Tabs className="main-section-tabs" value={activeTab} onChange={v=>v&&navigate({...route,view:v,book:null,page:1})}>
    <header className="site-header"><div className="site-header-inner"><Group renderRoot={props=><a href="./" {...props}/>} className="brand-link" aria-label="Kitaplık · filtresiz ana sayfa" gap={6} wrap="nowrap" onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();window.history.pushState(null,'',window.location.pathname);setRoute({view:'books',book:null,sort:'reading',filters:emptyFilters(),page:1,pageSize:DEFAULT_PAGE_SIZE});setBookTrail([]);window.scrollTo({top:0,behavior:'instant'})}}}><ThemeIcon size={42} radius="md" color="brand"><IconBooks size={26} stroke={1.6}/></ThemeIcon><Text className="brand">Kitaplık</Text></Group><Tabs.List className="main-tabs" aria-label="Kitaplık bölümleri">{[{id:'books',name:'Kitaplar',icon:IconBook2},{id:'queue',name:'Sıram',icon:IconListNumbers},{id:'collections',name:'Kümeler',icon:IconLayersIntersect}].map(item=><Tabs.Tab key={item.id} value={item.id} leftSection={<item.icon size={19}/>}>{item.name}</Tabs.Tab>)}</Tabs.List><nav className="header-shortcuts" aria-label="Hızlı erişim"><Tooltip label="Kızım için"><ActionIcon className="header-children" size={48} variant={view==='books'&&filters.categories.length===1&&filters.categories[0]==='children'?'filled':'subtle'} aria-label="Kızım için" aria-current={view==='books'&&filters.categories.length===1&&filters.categories[0]==='children'?'page':undefined} onClick={()=>goCategory('children')}><GirlIcon size={29}/></ActionIcon></Tooltip><Tooltip label="Favoriler"><ActionIcon className="header-favorites" size={48} variant={view==='favorites'?'filled':'subtle'} aria-label="Favoriler" aria-current={view==='favorites'?'page':undefined} onClick={()=>{navigate({...route,view:'favorites',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})}}><IconHeart size={29} fill={view==='favorites'?'currentColor':'none'}/></ActionIcon></Tooltip><Tooltip label={`Kitaplığım · ${ownedCount} kitap`}><ActionIcon className="header-library" size={48} variant={view==='owned'?'filled':'subtle'} aria-label={`Kitaplığım · ${ownedCount} kitap`} aria-current={view==='owned'?'page':undefined} onClick={()=>{navigate({...route,view:'owned',book:null,filters:emptyFilters(),page:1});window.scrollTo({top:0,behavior:'instant'})}}><BookshelfIcon size={29}/></ActionIcon></Tooltip></nav><ThemeToggle/></div></header>
  <Container size={1200} className="app-shell" px={{base:8,sm:24}}>

   <main id="main-content" tabIndex={-1}>

    {(storageError||personalStorageError)&&<Alert color="orange" mb="lg">Bu tarayıcı kişisel kayıtlarını kalıcı olarak saklayamıyor. Notlar bölümünden yedeğini indirebilirsin.</Alert>}
    {view!=='notes'&&<SyncNotice sync={githubSync} onOpen={openSync}/>}
    <Tabs.Panel value="books">
    {['books','owned','favorites'].includes(view)&&<>
     {['owned','favorites'].includes(view)&&<Title order={1} className="visually-hidden">{view==='owned'?'Kitaplığım':'Favorilerim'}</Title>}
     <div className="search-panel" role="search">
      <TextInput className="catalog-search" label={view==='owned'?'Kitaplığımda ara':view==='favorites'?'Favorilerimde ara':'Katalogda ara'} placeholder="Kitap, yazar, çevirmen…" leftSection={<IconSearch size={21}/>} rightSectionWidth={44} rightSection={filters.query?<ActionIcon variant="subtle" aria-label="Aramayı temizle" onClick={()=>changeFilters({...filters,query:''})}><IconX size={20}/></ActionIcon>:null} value={filters.query} onChange={e=>changeFilters({...filters,query:e.currentTarget.value})}/>
      <div className="search-tools"><Button variant="light" leftSection={<IconFilter size={20}/>} onClick={()=>{setTransfer(null);setDraft(filters);setOpened(true)}}>Filtreler{activeCount?` · ${activeCount}`:''}</Button><WrappingSelect aria-label="Kitapları sırala" value={sort} onChange={v=>setRoute(r=>({...r,sort:v||'reading',page:1}))} data={[{value:'reading',label:'Okuma önceliği'},{value:'shared',label:'En çok kesişen'},{value:'title',label:'Kitap adı · A–Z'},{value:'author',label:'Yazar · A–Z'},{value:'newest',label:'Yayın yılı · yeni'},{value:'added',label:'Eklenme · yeni'},{value:'saved',label:'Favoriler önce'}]}/></div>
      <ActiveFilters filters={filters} onChange={changeFilters}/>
     </div>
     {view==='books'&&!filterCount(filters)&&<SpotlightCard className="reading-route" spotlightColor="rgba(225,238,173,.13)"><div><Text fw={500}>Nereden başlamalı?</Text><Text>{collectionMap.core?.count} kitaplık çekirdek, düşünceden uygulamaya.</Text></div><Button variant="white" color="brand" rightSection={<IconArrowRight size={19}/>} onClick={()=>goCollection('core')}>Seçkiye git</Button></SpotlightCard>}
     {view==='books'&&childrenShelf(filters)&&onlyFilters(filters,['categories'])&&<AgeLibrary onGroup={goCollection}/>}
     {view==='books'&&sort==='reading'&&<ReadingPrioritySummary ranking={readingRanking}/>}
     <div className="results-heading" ref={resultsRef}><div><Title order={['owned','favorites'].includes(view)?2:1}>{resultsTitle(filters,view)}</Title><Text c="dimmed" role="status" aria-live="polite">{filtered.length} eser{filtered.length?` · ${((currentPage-1)*pageSize)+1}–${Math.min(currentPage*pageSize,filtered.length)} gösteriliyor`:''}</Text></div><Group gap={4}>{filterCount(filters)>0&&<Button variant="subtle" onClick={()=>changeFilters(emptyFilters())}>Temizle</Button>}<Tooltip label={copied?'Bağlantı kopyalandı':'Bağlantıyı kopyala'}><ActionIcon variant="subtle" aria-label={copied?'Bağlantı kopyalandı':'Bağlantıyı kopyala'} onClick={copyLink}>{copied?<IconCheck size={22}/>:<IconLink size={22}/>}</ActionIcon></Tooltip></Group></div>
     {filtered.length?<><div className="books-grid">{displayed.map(b=><BookCard key={b.id} book={b} ranking={readingRanking.byId[b.id]} states={states} onToggle={onToggle} onOpen={onOpen} queue={personal.queue} onAdd={onAdd} onQueue={onQueue}/>)}</div><CatalogPagination page={currentPage} total={pages} count={filtered.length} pageSize={pageSize} onChange={changePage} onPageSize={size=>navigate({...route,page:1,pageSize:size,book:null})} hrefForPage={p=>window.location.pathname+'?'+encodeRoute({...route,page:p,book:null},catalog)}/></>:<Paper withBorder className="empty-state" p="xl" radius="lg"><IconSearch size={36}/><Title order={2}>{view==='owned'&&!ownedCount?'Kitaplığın ilk kitabını bekliyor.':view==='favorites'&&!shelfBooks.length?'Henüz favori kitap yok.':'Bu seçimde kitap yok.'}</Title><Text c="dimmed" mt="sm">{view==='owned'&&!ownedCount?'Katalogda “Satın aldım” dediğin kitap burada da görünür.':view==='favorites'&&!shelfBooks.length?'Kartlardaki kalple favorilerini buraya ekleyebilirsin.':'Bir filtreyi kaldırabilir veya aramanı değiştirebilirsin.'}</Text><Button mt="lg" variant="light" onClick={()=>(view==='owned'&&!ownedCount)||(view==='favorites'&&!shelfBooks.length)?onBrowse():changeFilters(emptyFilters())}>{(view==='owned'&&!ownedCount)||(view==='favorites'&&!shelfBooks.length)?'Kataloğa git':'Filtreleri temizle'}</Button></Paper>}
    </>}
    </Tabs.Panel>
    <Tabs.Panel value="queue">{view==='queue'&&<><Title order={1} className="visually-hidden">Okuma sıram</Title><ReadingQueue queue={personal.queue} books={byId} reading={personal.reading} states={states} onMove={(id,direction)=>setPersonal(prev=>({...prev,queue:moveInQueue(prev.queue,id,direction)}))} onRemove={id=>setPersonal(prev=>({...prev,queue:prev.queue.filter(value=>value!==id)}))} onOpen={onOpen} onBrowse={onBrowse} BookCover={ThumbCover}/></>}</Tabs.Panel>
    <Tabs.Panel value="collections">{view==='collections'&&<><Title order={1} className="visually-hidden">Kitap kümeleri</Title><Collections onCollection={goCollection} onGroup={goCollection} states={states}/></>}</Tabs.Panel>
    {view==='notes'&&<section aria-labelledby="notes-heading"><Title id="notes-heading" order={1} className="visually-hidden">Kaynaklar ve notlar</Title><React.Suspense fallback={<Text c="dimmed" role="status">Notlar yükleniyor…</Text>}><NotesPage states={states} setStates={setStates} personal={personal} setPersonal={setPersonal} sync={githubSync}/></React.Suspense></section>}
   </main>
   <footer className="site-footer"><div className="footer-meta"><Text fw={600}>Kitaplık</Text><Text>Yaratılış · 27 Eylül 2026</Text><Text>Güncelleme · {catalog.updated}</Text></div><div className="footer-links"><Button variant="subtle" leftSection={<IconDownload size={18}/>} onClick={exportAllBooks}>Kitapları JSON indir</Button><Button variant="subtle" onClick={()=>setGuideOpened(true)}>Çeviri rehberi</Button><Button variant="subtle" onClick={openSync}>Cihaz eşitleme</Button><Button variant="subtle" onClick={()=>{navigate({...route,view:'notes',book:null,page:1});window.scrollTo({top:0,behavior:'instant'})}}>Notlar</Button></div></footer>
  </Container>
  </Tabs>
  <SyncMergeDialog sync={githubSync}/>
  {/* Opened from the book sheet too, so it sits above the sheet (Mantine's layer 200) and below the toast (310). */}
  <Modal opened={syncOpened} onClose={()=>setSyncOpened(false)} zIndex={300} returnFocus={false} onExitTransitionEnd={syncClosed} title="Cihazlar arası eşitleme" size="lg" centered className="sync-modal" closeButtonProps={{'aria-label':'Kapat'}}><GitHubSyncPanel sync={githubSync} framed={false}/></Modal>
  <Modal opened={guideOpened} onClose={()=>setGuideOpened(false)} title="Çeviri seçme rehberi" size="lg" centered className="global-guide-modal" closeButtonProps={{'aria-label':'Kapat'}}><TranslationCriteria/></Modal>
  <FilterSheet opened={opened} onClose={()=>setOpened(false)} value={draft} onChange={setDraft} onReset={()=>setDraft({...emptyFilters(),query:filters.query})} onApply={()=>{changeFilters(draft);setOpened(false)}} count={draftCount} catalog={catalog} authors={authorOptions} shelf={shelfBooks}/>
  {!book&&transferNotice}
  <BookDetail feedback={transferNotice} ranking={readingRanking.byId[book]} onOpen={onOpen} onBack={previousBook} hasBack={bookTrail.length>0} book={byId[book]} onClose={closeBook} states={states} onToggle={onToggle} onCollection={goCollection} onCategory={goCategory} personal={personal} onReading={onReading} onAdd={onAdd} onQueue={onQueue} storageError={storageError||personalStorageError} sync={githubSync} onSync={openSync}/>
 </>;
}
export default function App(){return <MantineProvider theme={theme} defaultColorScheme="auto" colorSchemeManager={localStorageColorSchemeManager({key:'kitapatlasi:color-scheme'})}><AtlasApp/>{AccessibilityAudit&&<React.Suspense fallback={null}><AccessibilityAudit/></React.Suspense>}</MantineProvider>}
