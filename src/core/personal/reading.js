export const PERSONAL_KEY = 'kitapatlasi:personal:v1';
export const emptyReading = () => ({ startedAt:'', finishedAt:'', page:'', totalPages:'', why:'', apply:'' });
const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value ? value : '';
const pageNumber = value => (typeof value==='number'||typeof value==='string')&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0 ? Math.min(999999,Math.floor(Number(value))) : '';
export function cleanReading(value) {
 const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return {startedAt:validDate(v.startedAt),finishedAt:validDate(v.finishedAt),page:pageNumber(v.page),totalPages:pageNumber(v.totalPages),why:typeof v.why==='string'?v.why:'',apply:typeof v.apply==='string'?v.apply:''};
}
export function cleanPersonal(input, bookIds) {
 const ids=new Set(bookIds);const value=input&&typeof input==='object'?input:{};
 return {
  queue:Array.isArray(value.queue)?[...new Set(value.queue.filter(id=>ids.has(id)))].slice(0,5):[],
  reading:Object.fromEntries(Object.entries(value.reading&&typeof value.reading==='object'&&!Array.isArray(value.reading)?value.reading:{}).filter(([id])=>ids.has(id)).map(([id,r])=>[id,cleanReading(r)]))
 };
}
export function addToQueue(queue,id) {return queue.includes(id)||queue.length>=5?queue:[...queue,id];}
export function moveInQueue(queue,id,direction) {
 const index=queue.indexOf(id),target=index+direction;
 if(index<0||target<0||target>=queue.length||![-1,1].includes(direction))return queue;
 const next=[...queue];[next[index],next[target]]=[next[target],next[index]];return next;
}
const numberOrNull=value=>typeof value==='number'?value:null;
export function progressPercent(record) {
 const r=cleanReading(record),page=numberOrNull(r.page),total=numberOrNull(r.totalPages);
 return total!==null&&total>0&&page!==null?Math.min(100,Math.round(page/total*100)):null;
}
export function readingErrors(record) {
 const r=cleanReading(record),page=numberOrNull(r.page),total=numberOrNull(r.totalPages);return {
  pages:total!==null&&total>0&&page!==null&&page>total?'Kaldığın sayfa, toplam sayfadan büyük.':total===0?'Toplam sayfa en az 1 olmalı.':null,
  dates:r.startedAt&&r.finishedAt&&r.finishedAt<r.startedAt?'Bitiş tarihi, başlama tarihinden önce olamaz.':null
 };
}
// What the book page shows of a reading at a glance: how far it is, and its days in date order.
// A page past the end is an entry error, so it gives no percentage.
export function readingJourney(record) {
 const r=cleanReading(record);
 const percent=readingErrors(r).pages?null:progressPercent(r);
 const steps=[['started',r.startedAt],['finished',r.finishedAt]].filter(([,day])=>day).map(([kind,day])=>({kind,day})).sort((a,b)=>a.day.localeCompare(b.day));
 return {percent,page:r.page,totalPages:r.totalPages,steps,hasAny:percent!==null||steps.length>0};
}
// Marking a book as being read or read writes its start or finish day, unless one is already
// written (ADR 002, phase 3). Any other mark leaves the reading record as it is.
export function stampReadingDate(personal,id,key,today) {
 if(!['okunuyor','okundu'].includes(key))return personal;
 const field=key==='okunuyor'?'startedAt':'finishedAt';const record=cleanReading(personal.reading[id]);
 return {...personal,reading:{...personal.reading,[id]:{...record,[field]:record[field]||today}}};
}
export function todayLocal(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function restorePersonal(current,input,bookIds) {
 const clean=cleanPersonal(input,bookIds);
 return {queue:Array.isArray(input?.queue)?clean.queue:current.queue,reading:{...current.reading,...clean.reading}};
}

/** The reader's summary for the catalogue's reading band (docs/UI-REDESIGN.md, phase 3): how many
 * books are read, being read, purchased, favourites and queued, and the read share of the
 * catalogue. Records and queue entries for books the catalogue no longer has are left out. */
export function readingSummary({ books, states, queue }) {
  const known = new Set(books.map(book => book.id));
  const count = mark => books.filter(book => (states[book.id] || []).includes(mark)).length;
  const read = count('okundu');
  return {
    total: books.length,
    read,
    reading: count('okunuyor'),
    owned: count('alindi'),
    favorites: count('onemli'),
    queued: queue.filter(id => known.has(id)).length,
    readShare: books.length ? read / books.length : 0,
  };
}
