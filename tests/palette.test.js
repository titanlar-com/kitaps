import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The colour schemes and corner sizes. The owner, 8 November 2026: the brick accent read as
// neither orange, burgundy nor brown. The site takes wood schemes instead, dark first, with the
// floor darkest and each layer above it a lighter black. Every text colour keeps 4.5:1 and every
// control boundary 3:1 on every surface, in every scheme (WCAG 1.4.3 and 1.4.11).
const root=(...parts)=>fs.readFileSync(new URL(`../${parts.join('/')}`,import.meta.url),'utf8');
const css=root('src','styles.css');
const woodsCss=root('src','woods.css');
const block=(text,start)=>{const from=text.indexOf(start);assert.ok(from>=0,start);return text.slice(from,text.indexOf('\n}',from))};
const read=text=>Object.fromEntries([...text.matchAll(/\n (--[\w-]+):([^;]+);/g)].map(match=>[match[1],match[2].trim()]));
const light=read(block(css,':root{'));

const WOODS=['ceviz','mese','akasya'];
const MODES=['dark','light'];
const scheme=(wood,mode)=>read(block(woodsCss,`[data-wood='${wood}'][data-mantine-color-scheme='${mode}']`));
const COLOURS=['--paper','--surface','--surface-2','--surface-3','--ink','--ink-2','--muted','--line','--line-strong','--control-line','--control-border','--accent-border','--accent','--accent-hover','--accent-ink','--accent-soft','--accent-soft-hover','--accent-strong','--ok','--bad','--hero','--hero-ink','--hero-muted','--tone-read','--tone-reading','--tone-queue','--tone-owned','--tone-favorite'];

const rgb=hex=>{const value=hex.replace('#','');return [0,2,4].map(index=>parseInt(value.slice(index,index+2),16))};
const luminance=hex=>{const [r,g,b]=rgb(hex).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
const ratio=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
const over=(top,base,alpha)=>'#'+rgb(top).map((value,index)=>Math.round(value*alpha+rgb(base)[index]*(1-alpha)).toString(16).padStart(2,'0')).join('');
const hsl=hex=>{const [r,g,b]=rgb(hex).map(v=>v/255);const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;if(!d)return {h:0,s:0,l};const s=d/(1-Math.abs(2*l-1));const h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;return {h:h*60,s,l}};
const hueGap=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d)};

for(const wood of WOODS)for(const mode of MODES){
 test(`${wood} ${mode}: every colour is defined and readable on every surface`,()=>{
  const tokens=scheme(wood,mode);
  const value=token=>{const raw=tokens[token];assert.match(raw||'',/^#[0-9a-f]{6}$/i,`${token} is a plain colour`);return raw};
  COLOURS.forEach(value);
  const surfaces={paper:value('--paper'),surface:value('--surface'),'surface-2':value('--surface-2')};
  const failures=[];
  for(const text of ['--ink','--ink-2','--muted','--accent','--accent-strong','--ok','--bad','--tone-read','--tone-reading','--tone-queue','--tone-owned','--tone-favorite'])for(const [where,colour] of Object.entries(surfaces))if(ratio(value(text),colour)<4.5)failures.push(`${text} on ${where}: ${ratio(value(text),colour).toFixed(2)}`);
  for(const boundary of ['--control-border','--accent-border'])for(const [where,colour] of Object.entries(surfaces))if(ratio(value(boundary),colour)<3)failures.push(`${boundary} on ${where}: ${ratio(value(boundary),colour).toFixed(2)}`);
  for(const [fg,bg,min] of [['--accent-ink','--accent',4.5],['--accent-ink','--accent-hover',4.5],['--accent-strong','--accent-soft',4.5],['--ink','--accent-soft',4.5],['--hero-ink','--hero',4.5],['--hero-muted','--hero',4.5]])if(ratio(value(fg),value(bg))<min)failures.push(`${fg} on ${bg}: ${ratio(value(fg),value(bg)).toFixed(2)}`);
  assert.deepEqual(failures,[]);
 });
 test(`${wood} ${mode}: the accent is a colour with a name, not a muddy brick or brown`,()=>{
  const {h,s,l}=hsl(scheme(wood,mode)['--accent']);
  assert.ok(!(h<=35&&l>=.25&&l<=.6),`hue ${h.toFixed(0)}, lightness ${l.toFixed(2)}`);
  if(mode==='dark')assert.ok(s>=.45,`saturation ${s.toFixed(2)}`);
 });
 test(`${wood} ${mode}: the scheme holds several clearly different colours`,()=>{
  const tokens=scheme(wood,mode);
  const hues=['--tone-read','--tone-reading','--tone-queue','--tone-favorite'].map(token=>hsl(tokens[token]).h);
  for(let i=0;i<hues.length;i++)for(let j=i+1;j<hues.length;j++)assert.ok(hueGap(hues[i],hues[j])>=25,`tones ${i} and ${j}: ${hues[i].toFixed(0)} and ${hues[j].toFixed(0)}`);
 });
}

for(const wood of WOODS){
 test(`${wood} dark: the floor is darkest and every layer above it is a lighter black`,()=>{
  const tokens=scheme(wood,'dark');
  const layers=['--paper','--surface','--surface-2','--surface-3'].map(token=>luminance(tokens[token]));
  for(let i=1;i<layers.length;i++)assert.ok(layers[i]>layers[i-1],`layer ${i}`);
  assert.ok(hsl(tokens['--paper']).l<=.06,'the floor is near black');
  assert.ok(hsl(tokens['--surface-3']).l<=.22,'the top layer is still a dark grey');
 });
 test(`${wood} dark: the wood grain is faint enough to keep text readable on the floor`,()=>{
  const tokens=scheme(wood,'dark');
  const grain=decodeURIComponent(tokens['--grain']);
  const matrix=grain.match(/feColorMatrix[^>]*values='([^']+)'/)?.[1].trim().split(/\s+/).map(Number);
  assert.equal(matrix?.length,20,'a colour matrix');
  const strongest=matrix[18]+matrix[19];
  assert.ok(strongest<=.13,`alpha reaches ${strongest}`);
  const lit=over('#ffffff',tokens['--paper'],strongest);
  for(const text of ['--ink','--ink-2','--muted','--accent'])assert.ok(ratio(tokens[text],lit)>=4.5,text);
 });
}

test('the dark accents of the schemes are far apart, so each scheme is recognisable',()=>{
 const hues=WOODS.map(wood=>hsl(scheme(wood,'dark')['--accent']).h);
 for(let i=0;i<hues.length;i++)for(let j=i+1;j<hues.length;j++)assert.ok(hueGap(hues[i],hues[j])>=40,`${WOODS[i]} and ${WOODS[j]}`);
});

test('the walnut scheme stands in when no scheme has been set',()=>{
 assert.match(woodsCss,/:root:not\(\[data-wood\]\),\s*\[data-wood='ceviz'\]\[data-mantine-color-scheme='dark'\]/);
});

test('the brick colours are gone from every place that wrote them',()=>{
 for(const parts of [['src','styles.css'],['src','woods.css'],['src','app','theme.js'],['index.html'],['public','404.html']])for(const old of ['a3392b','f0907d','7c2a1f','8a2f23'])assert.ok(!root(...parts).toLowerCase().includes(old),`${parts.join('/')} still has #${old}`);
});

// Owner's rule of 8 November 2026: no corner is rounder than 5 px.
test('corners are at most 5 px and come from the radius tokens',()=>{
 assert.deepEqual(['--radius-xs','--radius-sm','--radius','--radius-lg'].map(token=>light[token]),['2px','3px','4px','5px']);
 for(const token of ['--radius-xs','--radius-sm','--radius','--radius-lg','--ribbon-radius'])assert.ok(parseFloat(light[token])<=5,`${token} ${light[token]}`);
 const sheets=fs.readdirSync(new URL('../src/',import.meta.url),{recursive:true}).map(String).filter(file=>file.endsWith('.css'));
 const loose=[];
 for(const file of sheets){
  const text=fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  for(const match of text.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/g)){
   const value=match[1].trim().replace(/\s*!important$/,'');
   // A token, no corner, or the parent's corner: never a circle, a pill or a raw size.
   if(/^((var\(--(radius[\w-]*|ribbon-radius)\)|0)\s*)+$|^inherit$/.test(value))continue;
   loose.push(`${file}: ${value}`);
  }
 }
 assert.deepEqual(loose,[]);
});
