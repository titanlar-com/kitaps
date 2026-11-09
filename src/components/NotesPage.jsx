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
import {createBackup,readBackup} from '../core/personal/backup.js';
import {backupRefusedText,backupRestoredText,notesScreen} from '../screens/notes.js';
import {SOURCE_URL} from '../site';
import {plainTextMarkers} from '../library';

const bookIds=catalog.books.map(book=>book.id);

// Raw source archives are only needed for the full download, so they load on demand.
async function downloadEverything(file){
 const [atlas,okumaKumeleri,kitaps,kitapsCovers,entrepreneurship,foundations,preparation]=(await Promise.all([
  import('../../data/sources/atlas-v1.json'),
  import('../../data/sources/okuma-kumeleri.json'),
  import('../../data/sources/kitaps.json'),
  import('../../data/sources/kitaps-covers.json'),
  import('../../data/sources/entrepreneurship-curriculum.json'),
  import('../../data/foundational-reading.json'),
  import('../../data/preparatory-reading-tr.json'),
 ])).map(module=>module.default);
 download(file,{catalog,sources:{atlas,okumaKumeleri,kitaps,kitapsCovers,entrepreneurship,foundations,preparation,kitapsNotes:readingNotes}});
}

export default function NotesPage({states,personal,onRestore,sync}) {
 const [message,setMessage]=useState('');
 const model=useMemo(()=>notesScreen({counts:catalog.sourceCounts,total:catalog.books.length,notes:plainTextMarkers(readingNotes)}),[]);
 const importStates=async file=>{
  if(!file)return;
  try {
   const backup=readBackup(JSON.parse(await file.text()),bookIds);
   onRestore(backup.marks,backup.input);
   setMessage(backupRestoredText(backup));
  }catch(error){setMessage(backupRefusedText(error?.kind));}
 };

 return <Stack gap="xl">
  <Paper p="lg" radius="lg" className="notes-panel"><Title order={3}>{model.coverage.title}</Title>
   <dl className="source-counts">
    {model.coverage.rows.map(row=><div key={row.id}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
   </dl>
   <Group mt="md" gap={8}>{model.coverage.badges.map(id=><SourceBadge id={id} key={id}/>)}</Group>
  </Paper>
  <Paper p="lg" radius="lg" className="notes-panel"><Title order={3}>{model.backup.title}</Title><Group mt="md"><Button variant="light" leftSection={<IconDownload size={19}/>} onClick={()=>download(model.backup.download.file,createBackup({states,personal}))}>{model.backup.download.text}</Button><FileButton onChange={importStates} accept="application/json">{props=><Button {...props} variant="default" leftSection={<IconUpload size={19}/>}>{model.backup.restore}</Button>}</FileButton></Group>{message&&<Text mt="md" role="status">{message}</Text>}</Paper>
  <GitHubSyncPanel sync={sync}/>
  <div><Title order={3}>{model.fullData.title}</Title><Group mt="md"><Button variant="light" leftSection={<IconDownload size={19}/>} onClick={()=>void downloadEverything(model.fullData.catalog.file)}>{model.fullData.catalog.text}</Button><Button variant="default" leftSection={<IconDownload size={19}/>} onClick={()=>download(model.fullData.notes.file,plainTextMarkers(readingNotes),'text/markdown')}>{model.fullData.notes.text}</Button></Group><Group mt="md"><Anchor href={SOURCE_URL} target="_blank" rel="noreferrer">{model.fullData.sourceLink}</Anchor></Group></div>
  <Divider/>
  <Title order={2}>{model.sources.title}</Title>
  <Accordion variant="separated" radius="lg">{model.sources.sections.map((section,i)=><Accordion.Item value={String(i)} key={i}><Accordion.Control>{section.title}</Accordion.Control><Accordion.Panel><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{table:NoteCards,blockquote:({children})=><blockquote data-edge="start">{children}</blockquote>,a:({href,children})=><Anchor href={href} target="_blank" rel="noreferrer">{children}</Anchor>}}>{section.body}</ReactMarkdown></div></Accordion.Panel></Accordion.Item>)}</Accordion>
 </Stack>
}
