import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The colour palette and corner sizes (owner's request of 7 November 2026: a slightly cooler
// palette built for legibility, and smaller corners). Every text colour keeps 4.5:1 and every
// control boundary 3:1 on every surface, in both themes (WCAG 1.4.3 and 1.4.11).
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const block=start=>{const from=css.indexOf(start);assert.ok(from>=0,start);return css.slice(from,css.indexOf('\n}',from))};
const read=text=>Object.fromEntries([...text.matchAll(/\n (--[\w-]+):([^;]+);/g)].map(match=>[match[1],match[2].trim()]));
const light=read(block(':root{'));
const dark={...light,...read(block(":root[data-mantine-color-scheme='dark']{"))};

const rgb=hex=>{const value=hex.replace('#','');return [0,2,4].map(index=>parseInt(value.slice(index,index+2),16))};
const luminance=hex=>{const [r,g,b]=rgb(hex).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
const ratio=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
// --panel is the ink laid over the page at 4.5%.
const over=(top,base,alpha)=>'#'+rgb(top).map((value,index)=>Math.round(value*alpha+rgb(base)[index]*(1-alpha)).toString(16).padStart(2,'0')).join('');

for(const [name,tokens] of [['light',light],['dark',dark]]){
 test(`the ${name} theme keeps every text and control readable on every surface`,()=>{
  const value=token=>{const raw=tokens[token];assert.match(raw,/^#[0-9a-f]{6}$/i,`${token} is a plain colour`);return raw};
  const surfaces={paper:value('--paper'),surface:value('--surface'),'surface-2':value('--surface-2'),panel:over(value('--ink'),value('--paper'),.045)};
  const failures=[];
  for(const text of ['--ink','--ink-2','--muted','--accent','--accent-strong','--ok','--bad'])for(const [where,colour] of Object.entries(surfaces))if(ratio(value(text),colour)<4.5)failures.push(`${text} on ${where}: ${ratio(value(text),colour).toFixed(2)}`);
  for(const boundary of ['--control-border','--accent-border'])for(const [where,colour] of Object.entries(surfaces))if(ratio(value(boundary),colour)<3)failures.push(`${boundary} on ${where}: ${ratio(value(boundary),colour).toFixed(2)}`);
  for(const [fg,bg,min] of [['--accent-ink','--accent',4.5],['--accent-strong','--accent-soft',4.5],['--ink','--accent-soft',4.5],['--hero-ink','--hero',4.5],['--hero-muted','--hero',4.5]])if(ratio(value(fg),value(bg))<min)failures.push(`${fg} on ${bg}: ${ratio(value(fg),value(bg)).toFixed(2)}`);
  assert.deepEqual(failures,[]);
 });
}

test('the neutrals lean cool: blue at least as strong as red in every grey',()=>{
 for(const [name,tokens] of [['light',light],['dark',dark]])for(const token of ['--paper','--surface-2','--surface-3','--ink','--ink-2','--muted','--line','--line-strong','--control-border']){
  const [r,,b]=rgb(tokens[token]);
  assert.ok(b>=r,`${name} ${token} ${tokens[token]}`);
 }
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
