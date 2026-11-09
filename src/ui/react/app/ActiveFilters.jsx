// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { Button, Group } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { download } from '../../../download';
import { activeFiltersScreen } from '../../../screens/catalog.js';
import { collectionMap, groupMap, categoryMap } from './catalogData';

export function ActiveFilters({filters:f,onChange}) {
 const model=activeFiltersScreen({filters:f,categories:categoryMap,collections:collectionMap,groups:groupMap});
 return model?<Group gap={8} className="active-filters" role="group" aria-label={model.label}>{model.chips.map(c=><Button key={c.id} variant="light" rightSection={<IconX size={17}/>} onClick={()=>onChange(c.next)} aria-label={c.removeLabel}>{c.label}</Button>)}</Group>:null;
}
// Every cover comes in two sizes: covers/sm/ (400 px wide) and covers/ (up to 720 px). The
// browser picks by the size the cover is shown at and the screen's density, so a phone does not
// download what only a 2x desktop screen needs. A card is a column of the grid in styles.css:
// the page padding (8 px, 24 px from 48em) and the column gaps (12, 20, 24 px) come off first.
