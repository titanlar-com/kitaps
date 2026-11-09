import React from 'react';
import { Pill,UnstyledButton } from '@mantine/core';
import { categoryPillScreen } from '../../../screens/catalog.js';
const tones={strategy:'sage',management:'blue',systems:'lavender',psychology:'peach',finance:'sand',literature:'rose',children:'rose',history:'sand',philosophy:'lavender',communication:'blue',productivity:'mint',marketing:'peach',enterprise:'sage',innovation:'lavender',technology:'blue',economy:'sand',politics:'rose',biography:'peach',science:'mint',climate:'sage',ethics:'rose'};
export default function CategoryPill({id,label,onNavigate,compact=false}){
 const model=categoryPillScreen({id,label,compact});
 return <UnstyledButton component="a" href={`?category=${encodeURIComponent(id)}`} className="category-link" aria-label={model.label} data-tone={tones[id]||'sage'} onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onNavigate(id)}}}><Pill className="category-pill">{model.text}</Pill></UnstyledButton>;
}
