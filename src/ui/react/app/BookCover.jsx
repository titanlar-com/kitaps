// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { useState } from 'react';
import { Skeleton } from '@mantine/core';
import { useInViewport } from '@mantine/hooks';
import { IconBook2, IconFileText } from '@tabler/icons-react';
import { bookCoverScreen } from '../../../screens/catalog.js';
import { books } from './catalogData';

const COVER_SIZES={
 card:'(orientation: landscape) and (max-height: 31em) and (max-width: 64.99em) calc(50vw - 34px), (min-width: 75em) 270px, (min-width: 56em) calc(25vw - 30px), (min-width: 36em) calc(33.4vw - 30px), calc(50vw - 14px)',
 detail:'(min-width: 48em) 200px, 112px',
 thumb:'96px',
};
export const smallCover=src=>src.replace(/^covers\//,'covers/sm/');
export function BookCover({book:b,onOpen=null,detail=false,read=false,size=detail?'detail':'card'}) {
 const [failed,setFailed]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const {ref:frame,inViewport}=useInViewport();
 const cover=b.cover,model=bookCoverScreen(b);
 // The single-file export embeds one copy of each cover instead.
 const embedded=cover&&globalThis.__KITAP_COVERS__?.[cover.src];
 const content=cover&&!failed?<img src={embedded||`./${cover.src}`} srcSet={embedded?undefined:`./${smallCover(cover.src)} 400w, ./${cover.src} 720w`} sizes={embedded?undefined:COVER_SIZES[size]} alt={model.alt} width="240" height="360" loading={detail?'eager':'lazy'} decoding="async" data-loaded={loaded||undefined} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>:<span className="cover-placeholder" data-edge="start" aria-hidden="true">{model.kind&&<span className="cover-placeholder-kind">{model.kind}</span>}<span className="cover-placeholder-title">{model.title}</span><span className="cover-placeholder-author">{model.author}</span><span className="cover-placeholder-note">{model.kind?<IconFileText size={18} stroke={1.5}/>:<IconBook2 size={18} stroke={1.5}/>}</span></span>;
 const stage=`cover-stage${read?' is-read':''}`;
 // A cover on the screen and still on its way shows a moving placeholder. A cover further down has
 // not been requested yet, and a loop nobody can see would only cost the phone its battery.
 const waiting=cover&&!failed&&!loaded&&inViewport&&<Skeleton className="cover-skeleton" aria-hidden="true"/>;
 return detail?<div ref={frame} className={`${stage} cover-stage-detail`}>{waiting}{content}</div>:<button ref={frame} className={`${stage} cover-open`} onClick={()=>onOpen(b.id)} aria-label={model.openLabel}>{waiting}{content}</button>;
}
// Small covers beside related books and in the reading queue.
export const ThumbCover=props=><BookCover {...props} size="thumb"/>;
