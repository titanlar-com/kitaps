import React,{useState} from 'react';
import { Anchor, Popover, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconCheck,IconX } from '@tabler/icons-react';
import { displayTitle,translationStatus } from '../translation';
import { publicationLinkLabel,workFormat } from '../workFormat';
export default function TranslationStatus({book}) {
 const [opened,setOpened]=useState(false),info=translationStatus(book);
 if(info.status==='original')return null;
 const Mark=info.status==='available'?IconCheck:IconX;
 const label=info.status==='available'?'Türkçe çeviri var':info.status==='unavailable'?'Türkçe çeviri yok':'Türkçe çeviri doğrulanamadı';
 const word=info.status==='available'?'Türkçe':info.status==='unavailable'?'Türkçesi yok':'Doğrulanmadı';
 const tooltip=info.status==='available'?'Türkçe çevirisi var':info.status==='unavailable'?'Türkçe çevirisi yok':'Çeviri durumu doğrulanmadı';
 return <Popover opened={opened} onChange={setOpened} width={280} position="bottom-start" withArrow shadow="md" trapFocus returnFocus>
  <Popover.Target><Tooltip label={tooltip} openDelay={250} withArrow><UnstyledButton className="translation-status" data-status={info.status} aria-label={`${displayTitle(book)}: ${label}. Baskı bilgisi`} aria-expanded={opened} onClick={()=>setOpened(v=>!v)}><span className="translation-status-mark" aria-hidden="true"><Mark size={14} stroke={3}/></span><span className="translation-status-word" aria-hidden="true">{word}</span></UnstyledButton></Tooltip></Popover.Target>
  <Popover.Dropdown><Text fw={600}>{label}</Text><Text mt="xs">{info.description}</Text>{info.source&&<Anchor className="source-link" href={info.source} target="_blank" rel="noreferrer">{workFormat(book)&&!book.verifiedEdition?publicationLinkLabel(book.publication):'Baskı kaynağını aç'}</Anchor>}</Popover.Dropdown>
 </Popover>;
}
