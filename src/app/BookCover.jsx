// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { useState } from 'react';
import { IconBook2, IconFileText } from '@tabler/icons-react';
import { displayTitle } from '../translation';
import { workFormat } from '../workFormat';
import { books } from './catalogData';

const COVER_SIZES={
 card:'(orientation: landscape) and (max-height: 31em) and (max-width: 64.99em) calc(50vw - 34px), (min-width: 75em) 270px, (min-width: 56em) calc(25vw - 30px), (min-width: 36em) calc(33.4vw - 30px), calc(50vw - 14px)',
 detail:'(min-width: 48em) 200px, 112px',
 thumb:'96px',
};
export const smallCover=src=>src.replace(/^covers\//,'covers/sm/');
export function BookCover({book:b,onOpen=null,detail=false,read=false,size=detail?'detail':'card'}) {
 const [failed,setFailed]=useState(false);
 const cover=b.cover,format=workFormat(b);
 // The single-file export embeds one copy of each cover instead.
 const embedded=cover&&globalThis.__KITAP_COVERS__?.[cover.src];
 const content=cover&&!failed?<img src={embedded||`./${cover.src}`} srcSet={embedded?undefined:`./${smallCover(cover.src)} 400w, ./${cover.src} 720w`} sizes={embedded?undefined:COVER_SIZES[size]} alt={`${cover.title} — ${cover.publisher}, ${cover.language==='tr'?'Türkçe':'Uluslararası'} baskı kapağı`} width="240" height="360" loading={detail?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>:<span className="cover-placeholder" data-edge="start" aria-hidden="true">{format&&<span className="cover-placeholder-kind">{format.label}</span>}<span className="cover-placeholder-title">{displayTitle(b)}</span><span className="cover-placeholder-author">{b.author}</span><span className="cover-placeholder-note">{format?<IconFileText size={18} stroke={1.5}/>:<IconBook2 size={18} stroke={1.5}/>}</span></span>;
 const stage=`cover-stage${read?' is-read':''}`;
 return detail?<div className={`${stage} cover-stage-detail`}>{content}</div>:<button className={`${stage} cover-open`} onClick={()=>onOpen(b.id)} aria-label={`${displayTitle(b)} ayrıntılarını aç`}>{content}</button>;
}
// Small covers beside related books and in the reading queue.
export const ThumbCover=props=><BookCover {...props} size="thumb"/>;
