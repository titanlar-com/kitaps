// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { Button, Text, Title } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { ageLibraryScreen } from '../screens/catalog.js';
import { collectionMap, groupMap } from './catalogData';

const AGE_LIBRARY='temel-kutuphane';
export function AgeLibrary({onGroup}) {
 const library=collectionMap[AGE_LIBRARY];
 if(!library)return null;
 const model=ageLibraryScreen({library,groups:groupMap});
 return <section className="age-library" aria-labelledby="age-library-heading">
  <Text className="eyebrow">{model.eyebrow}</Text>
  <Title order={2} id="age-library-heading">{model.title}</Title>
  <Text>{model.description}</Text>
  <div className="age-bands">{model.bands.map(band=><Button key={band.id} variant="default" onClick={()=>onGroup(library.id,band.id)}>{band.label}</Button>)}<Button onClick={()=>onGroup(library.id)} rightSection={<IconArrowRight size={18}/>}>{model.all}</Button></div>
 </section>;
}
// Filters other than the ones named are empty (the search text included).
