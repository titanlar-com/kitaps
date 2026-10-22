import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Source gates for the owner's standing interface rules (AGENT.md): no curved accent edge, no
// focus ring around a control, and one motion contract. They read every stylesheet the app
// ships, so a new component cannot bring the old patterns back.
const css=['../src/styles.css','../src/components/FilterSheet.css']
 .map(path=>({path,text:fs.readFileSync(new URL(path,import.meta.url),'utf8')}));
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');

/** Flat list of {media, selector, body} for every rule, with comments removed. */
function rules(text){
 const found=[];const source=text.replace(/\/\*[\s\S]*?\*\//g,'');
 const walk=(chunk,media)=>{
  let depth=0,start=0,head='';
  for(let i=0;i<chunk.length;i++){
   if(chunk[i]==='{'){if(depth===0){head=chunk.slice(start,i).trim();start=i+1}depth++}
   else if(chunk[i]==='}'){depth--;if(depth===0){const body=chunk.slice(start,i);if(/^@(media|supports|container)/.test(head))walk(body,`${media} ${head}`.trim());else if(!head.startsWith('@'))found.push({media,selector:head,body});start=i+1}}
  }
 };
 walk(source,'');
 return found;
}
const all=css.flatMap(file=>rules(file.text).map(rule=>({...rule,path:file.path})));
const decls=(body,name)=>[...body.matchAll(new RegExp(`(?:^|;|\\s)(${name})\\s*:\\s*([^;]+)`,'g'))].map(match=>({name:match[1],value:match[2].trim()}));
const px=value=>Math.max(0,...[...value.matchAll(/(\d*\.?\d+)px/g)].map(match=>Number(match[1])));
const reduced=rule=>/prefers-reduced-motion\s*:\s*reduce/.test(rule.media);
const forced=rule=>/forced-colors\s*:\s*active/.test(rule.media);
const edgeSystem=rule=>/\[data-edge/.test(rule.selector);

test('an accent line on an edge is drawn only by the one edge system',()=>{
 const offenders=[];
 for(const rule of all){
  if(edgeSystem(rule))continue;
  for(const decl of decls(rule.body,'border-(?:left|right|top|bottom|inline-start|inline-end|block-start|block-end)(?:-width)?')){
   if(px(decl.value)>=2&&!/transparent|none/.test(decl.value))offenders.push(`${rule.path} ${rule.selector}: ${decl.name}:${decl.value}`);
  }
  for(const decl of decls(rule.body,'box-shadow'))if(/inset/.test(decl.value))offenders.push(`${rule.path} ${rule.selector}: inset shadow`);
 }
 assert.deepEqual(offenders,[]);
 // The edge system draws a straight line and squares only the two corners it touches.
 const system=all.filter(edgeSystem).map(rule=>`${rule.selector}{${rule.body}}`).join('\n');
 for(const side of ['start','end','top','bottom'])assert.match(system,new RegExp(`\\[data-edge="${side}"\\]`),side);
 assert.match(system,/border-start-start-radius:0/);
 assert.doesNotMatch(system,/border-radius:0[;}]/,'the edge system never squares every corner');
});

test('focus never draws a ring around a control, except the forced-colours keyboard outline',()=>{
 const offenders=[];
 for(const rule of all){
  for(const decl of decls(rule.body,'outline(?:-style|-width)?')){
   const none=/^(none|0|0px)(\s*!important)?$/.test(decl.value);
   const allowed=forced(rule)&&/data-focus-mode="keyboard"/.test(rule.selector)&&/:focus-visible/.test(rule.selector)&&/^2px solid CanvasText/.test(decl.value);
   if(!none&&!allowed)offenders.push(`${rule.path} ${rule.selector}: ${decl.name}:${decl.value}`);
  }
  if(/:focus/.test(rule.selector)&&decls(rule.body,'box-shadow').some(decl=>!/^none/.test(decl.value)))offenders.push(`${rule.path} ${rule.selector}: box-shadow on focus`);
  if(/:focus-within/.test(rule.selector)&&decls(rule.body,'(?:border|outline|box-shadow)[a-z-]*').length)offenders.push(`${rule.path} ${rule.selector}: frame on :focus-within`);
 }
 assert.deepEqual(offenders,[]);
 // Mantine's own ring is off; the indicator is opened by the central keyboard mode only.
 assert.match(app,/focusRing:'never'/);
 const indicator=all.filter(rule=>/data-focus-mode="keyboard"/.test(rule.selector)&&/:focus-visible/.test(rule.selector)&&!forced(rule));
 assert.ok(indicator.length>0,'a keyboard focus indicator exists');
});

test('every normal transition uses the motion tokens, entering and leaving alike',()=>{
 const offenders=[];
 for(const rule of all){
  if(reduced(rule))continue;
  for(const decl of decls(rule.body,'transition(?:-timing-function|-duration)?|animation(?:-timing-function|-duration)?')){
   if(/^none(\s*!important)?$/.test(decl.value)&&/transition-duration|animation-duration/.test(decl.name)===false&&decl.name.startsWith('transition'))offenders.push(`${rule.path} ${rule.selector}: ${decl.name}:none outside reduced motion`);
   // Token names (var(--motion-ease)) are not keywords; only what is left outside them is judged.
   else if(/\b(ease|ease-in|ease-out|ease-in-out|linear|steps\()|\ball\b|\b0m?s\b/.test(decl.value.replace(/var\([^)]*\)/g,'')))offenders.push(`${rule.path} ${rule.selector}: ${decl.name}:${decl.value}`);
   else if(!/var\(--motion-/.test(decl.value)&&!/^none/.test(decl.value))offenders.push(`${rule.path} ${rule.selector}: ${decl.name} without a motion token`);
  }
  // A transition written only on the hover or active state would run in one direction.
  if(/:(hover|active)\b/.test(rule.selector)&&decls(rule.body,'transition').length)offenders.push(`${rule.path} ${rule.selector}: transition only on a state`);
 }
 assert.deepEqual(offenders,[]);
 const tokens=all.find(rule=>rule.selector===':root'&&/--motion-ease/.test(rule.body))?.body||'';
 assert.match(tokens,/--motion-ease:\s*cubic-bezier\(\.65,\s*0,\s*\.35,\s*1\)/);
 // Mantine's press jump is off, and its JavaScript transitions use the same curve.
 assert.match(app,/activeClassName:''/);
 assert.match(app,/timingFunction:MOTION_EASE/);
 assert.match(app,/const MOTION_EASE='cubic-bezier\(\.65, 0, \.35, 1\)'/);
});
