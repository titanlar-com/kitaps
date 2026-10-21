import React,{useMemo,useState} from 'react';
import {Accordion,Anchor,Button,Divider,FileButton,Group,Paper,Stack,Text,Title} from '@mantine/core';
import {IconDownload,IconUpload} from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import catalog from '../catalog.json';
import readingNotes from '../../data/sources/kitaplar.md?raw';
import NoteCards from './NoteCards';
import GitHubSyncPanel from './GitHubSyncPanel';
import SourceBadge from './SourceBadge';
import {download} from '../download';
import {cleanPersonal,restorePersonal} from '../reading';
import {SOURCE_URL} from '../site';
import {ORIGIN_LABELS,STATE_LABELS,plainTextMarkers} from '../library';

const bookIds=catalog.books.map(book=>book.id);
const knownIds=new Set(bookIds);
const counts=catalog.sourceCounts;

// Raw source archives are only needed for the full download, so they load on demand.
async function downloadEverything(){
 const [atlas,okumaKumeleri,kitaps,kitapsCovers,entrepreneurship,foundations,preparation]=(await Promise.all([
  import('../../data/sources/atlas-v1.json'),
  import('../../data/sources/okuma-kumeleri.json'),
  import('../../data/sources/kitaps.json'),
  import('../../data/sources/kitaps-covers.json'),
  import('../../data/sources/entrepreneurship-curriculum.json'),
  import('../../data/foundational-reading.json'),
  import('../../data/preparatory-reading-tr.json'),
 ])).map(module=>module.default);
 download('kitaplik-tum-veri.json',{catalog,sources:{atlas,okumaKumeleri,kitaps,kitapsCovers,entrepreneurship,foundations,preparation,kitapsNotes:readingNotes}});
}

export default function NotesPage({states,setStates,personal,setPersonal,sync}) {
 const [message,setMessage]=useState('');
 const sections=useMemo(()=>plainTextMarkers(readingNotes).split(/(?=^## )/m),[]);
 const importStates=async file=>{
  if(!file)return;
  try {
   const input=JSON.parse(await file.text());
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error();
   const supplied=input.states||(('queue' in input||'reading' in input)?{}:input);
   if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))throw Error();
   const valid=Object.fromEntries(Object.entries(supplied).filter(([id,v])=>knownIds.has(id)&&Array.isArray(v)).map(([id,v])=>[id,v.filter(s=>s in STATE_LABELS)]));
   setStates(prev=>({...prev,...valid}));
   setPersonal(prev=>restorePersonal(prev,input,bookIds));
   const clean=cleanPersonal(input,bookIds);
   setMessage(`${Object.keys(valid).length} kitabın işaretleri ve ${Object.keys(clean.reading).length} okuma kaydı içe aktarıldı.${Array.isArray(input.queue)?` Okuma sırası ${clean.queue.length} kitapla geri yüklendi.`:''}`);
  }catch{setMessage('Dosya okunamadı. Bu siteden dışa aktarılmış bir JSON dosyası seç.');}
 };

 return <Stack gap="xl">
  <Paper withBorder p="lg" radius="lg"><Title order={3}>Birleşimin kapsamı</Title>
   <dl className="source-counts">
    <div><dt>{ORIGIN_LABELS.atlas}</dt><dd>{counts.atlasEntries} liste kaydı</dd></div>
    <div><dt>{ORIGIN_LABELS.local}</dt><dd>{counts.localBooks} kitap</dd></div>
    <div><dt>{ORIGIN_LABELS.kitaps}</dt><dd>{counts.kitapsRecords} künye kaydı</dd></div>
    <div><dt>{ORIGIN_LABELS.entrepreneurship}</dt><dd>{counts.entrepreneurshipBooks} kitap</dd></div>
    <div><dt>{ORIGIN_LABELS.foundations}</dt><dd>{counts.foundationalBooks} kitap</dd></div>
    <div><dt>{ORIGIN_LABELS.preparation}</dt><dd>{counts.preparationRecommendations} kitap</dd></div>
    {counts.childrenLibraryBooks>0&&<div><dt>{ORIGIN_LABELS.children}</dt><dd>{counts.childrenLibraryBooks} kitap</dd></div>}
    {counts.shelfReviewBooks>0&&<div><dt>{ORIGIN_LABELS.shelf}</dt><dd>{counts.shelfReviewBooks} kitap</dd></div>}
    {counts.originalSourceWorks>0&&<div><dt>{ORIGIN_LABELS.originals}</dt><dd>{counts.originalSourceWorks} kitap ve makale</dd></div>}
    {counts.managementFounderWorks>0&&<div><dt>{ORIGIN_LABELS.founders}</dt><dd>{counts.managementFounderWorks} kitap</dd></div>}
    {counts.managerProgramBooks>0&&<div><dt>{ORIGIN_LABELS.managerprep}</dt><dd>{counts.managerProgramBooks} kitap</dd></div>}
    <div><dt>Birleşik katalog</dt><dd>{catalog.books.length} benzersiz eser</dd></div>
   </dl>
   <Group mt="md" gap={8}>{Object.keys(ORIGIN_LABELS).map(id=><SourceBadge id={id} key={id}/>)}</Group>
  </Paper>
  <Paper withBorder p="lg" radius="lg"><Title order={3}>Kişisel kitaplığını yedekle</Title><Group mt="md"><Button variant="light" leftSection={<IconDownload size={19}/>} onClick={()=>download('kitaplik-kisisel-yedek.json',{version:3,exportedAt:new Date().toISOString(),states,...personal})}>Kişisel yedeğimi indir</Button><FileButton onChange={importStates} accept="application/json">{props=><Button {...props} variant="default" leftSection={<IconUpload size={19}/>}>Yedekten aktar</Button>}</FileButton></Group>{message&&<Text mt="md" role="status">{message}</Text>}</Paper>
  <GitHubSyncPanel sync={sync}/>
  <div><Title order={3}>Tam veri ve kaynaklar</Title><Group mt="md"><Button variant="light" leftSection={<IconDownload size={19}/>} onClick={()=>void downloadEverything()}>Tüm kataloğu indir</Button><Button variant="default" leftSection={<IconDownload size={19}/>} onClick={()=>download('kitaps-kaynak-notlari.md',plainTextMarkers(readingNotes),'text/markdown')}>Kaynak notlarını indir</Button></Group><Group mt="md"><Anchor href={SOURCE_URL} target="_blank" rel="noreferrer">Kaynak kod ve veri arşivi</Anchor></Group></div>
  <Divider/>
  <Title order={2}>Kaynak dosyanın tamamı</Title>
  <Accordion variant="separated" radius="lg">{sections.map((s,i)=>{const title=i===0?'Dosyaya giriş':s.split('\n')[0].replace(/^## /,'').replace(/\*/g,'');return <Accordion.Item value={String(i)} key={i}><Accordion.Control>{title}</Accordion.Control><Accordion.Panel><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{table:NoteCards,a:({href,children})=><Anchor href={href} target="_blank" rel="noreferrer">{children}</Anchor>}}>{i===0?s:s.slice(s.indexOf('\n')+1)}</ReactMarkdown></div></Accordion.Panel></Accordion.Item>})}</Accordion>
 </Stack>
}
