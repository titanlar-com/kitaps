// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { filterCount } from '../library';
import { collectionMap, groupMap } from './catalogData';

export const onlyFilters=(filters,keys)=>!filters.query.trim()&&Object.entries(filters).every(([key,value])=>keys.includes(key)||['query','categoryMode','collectionMode'].includes(key)||(Array.isArray(value)?!value.length:typeof value==='boolean'?!value:value===''));
export const childrenShelf=filters=>filters.categories.length===1&&filters.categories[0]==='children';
// A single collection or subset is named instead of the generic heading.
export function resultsTitle(filters,view){
 if(childrenShelf(filters))return 'Kızım için';
 if(filters.collections.length===1&&filters.groups.length<=1&&onlyFilters(filters,['collections','groups'])){
  const collection=collectionMap[filters.collections[0]],group=groupMap[filters.groups[0]];
  if(collection)return group?`${collection.short||collection.title} · ${group.title}`:collection.title;
 }
 if(filterCount(filters))return 'Seçtiğin kitaplar';
 return view==='owned'?'Kitaplığımdakiler':view==='favorites'?'Favorilerim':'Tüm kitaplar';
}
