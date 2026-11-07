// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { Button, Group } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { download } from '../download';
import { STATE_LABELS, QUALITY_LABELS, ORIGIN_LABELS, formatDay } from '../library';
import { collectionMap, groupMap, categoryMap } from './catalogData';

export function ActiveFilters({filters:f,onChange}) {
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
