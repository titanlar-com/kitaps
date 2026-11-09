import React,{useState} from 'react';
import { HINT_DELAY_MS } from '../motion';
import { Anchor, Popover, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconCheck,IconX } from '@tabler/icons-react';
import { translationStatusScreen } from '../screens/book.js';
export default function TranslationStatus({book}) {
 const [opened,setOpened]=useState(false),model=translationStatusScreen({book});
 if(!model)return null;
 const Mark=model.status==='available'?IconCheck:IconX;
 return <Popover opened={opened} onChange={setOpened} width={280} position="bottom-start" withArrow shadow="md" trapFocus returnFocus>
  <Popover.Target><Tooltip label={model.tooltip} openDelay={HINT_DELAY_MS} withArrow><UnstyledButton className="translation-status" data-status={model.status} aria-label={model.ariaLabel} aria-expanded={opened} onClick={()=>setOpened(v=>!v)}><span className="translation-status-mark" aria-hidden="true"><Mark size={14} stroke={3}/></span><span className="translation-status-word" aria-hidden="true">{model.word}</span></UnstyledButton></Tooltip></Popover.Target>
  <Popover.Dropdown><Text fw={600}>{model.label}</Text><Text mt="xs">{model.description}</Text>{model.sourceLink&&<Anchor className="source-link" href={model.sourceLink.href} target="_blank" rel="noreferrer">{model.sourceLink.text}</Anchor>}</Popover.Dropdown>
 </Popover>;
}
