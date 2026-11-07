// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { Button, Text, Title } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { collectionMap, groupMap } from './catalogData';

const AGE_LIBRARY='temel-kutuphane';
export function AgeLibrary({onGroup}) {
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
