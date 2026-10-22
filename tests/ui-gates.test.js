import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Source gates for the owner's standing interface rules (AGENT.md): no curved accent edge, no
// focus ring around a control, and one motion contract. They read every stylesheet and every
// component in src/, so a new component cannot bring the old patterns back.
const srcRoot=new URL('../src/',import.meta.url);
const files=fs.readdirSync(srcRoot,{recursive:true}).map(String).sort();
const read=file=>({path:`src/${file}`,text:fs.readFileSync(new URL(file,srcRoot),'utf8')});
const css=files.filter(file=>file.endsWith('.css')).map(read);
const jsx=files.filter(file=>/\.(jsx|js|ts|tsx)$/.test(file)).map(read);
const app=fs.readFileSync(new URL('App.jsx',srcRoot),'utf8');
const motionSource=fs.readFileSync(new URL('motion.js',srcRoot),'utf8');

/** Flat list of {media, selector, body} for every rule, with comments removed. */
function rules(text){
 const found=[];const source=text.replace(/\/\*[\s\S]*?\*\//g,'');
 const walk=(chunk,media)=>{
  let depth=0,start=0,head='';
  for(let i=0;i<chunk.length;i++){
   if(chunk[i]==='{'){if(depth===0){head=chunk.slice(start,i).trim();start=i+1}depth++}
   else if(chunk[i]==='}'){depth--;if(depth===0){const body=chunk.slice(start,i);if(/^@(media|supports|container|layer|starting-style)/.test(head))walk(body,`${media} ${head}`.trim());else if(!head.startsWith('@'))found.push({media,selector:head,body});start=i+1}}
  }
 };
 walk(source,'');
 return found;
}
const all=css.flatMap(file=>rules(file.text).map(rule=>({...rule,path:file.path})));
const decls=(body,name)=>[...body.matchAll(new RegExp(`(?:^|;|\\s|\\{)(${name})\\s*:\\s*([^;]+)`,'g'))].map(match=>({name:match[1],value:match[2].trim()}));
const reduced=rule=>/prefers-reduced-motion\s*:\s*reduce/.test(rule.media);
const forced=rule=>/forced-colors\s*:\s*active/.test(rule.media);
const edgeSystem=rule=>/\[data-edge/.test(rule.selector);
const focusBar=rule=>/data-focus-mode="keyboard"/.test(rule.selector);
// The ribbon's fold is a small triangle drawn with two borders under the ribbon, not a line on
// the edge of a box; it is the one drawing of this kind.
const ribbonFold=rule=>/^\.state-ribbon::after$/.test(rule.selector);

// Custom properties from every rule (both themes, and the ones a component sets for itself). A token
// stands for all of its values, so the widest one is measured; an unknown token keeps its fallback.
const tokenValues=list=>{const found={};for(const rule of list)for(const decl of decls(rule.body,'--[\\w-]+'))(found[decl.name]??=new Set()).add(decl.value);return found};
const tokens=tokenValues(all);
// The tokens in scope: the stylesheets', and a sample's own while a sample is checked.
let known=tokens;
const resolve=(value,depth=0)=>depth>6?value:value.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g,(_,name,fallback)=>known[name]?[...known[name]].map(item=>resolve(item,depth+1)).join(' '):fallback??'');
/** The largest length in a value, in CSS px (16px to the rem and em; thin, medium and thick). */
const width=value=>{
 const text=resolve(value);
 const lengths=[...text.matchAll(/(-?\d*\.?\d+)(px|rem|em|pt)\b/g)].map(([,number,unit])=>Math.abs(Number(number))*({px:1,rem:16,em:16,pt:4/3}[unit]));
 const keywords=[...text.matchAll(/\b(thin|medium|thick)\b/g)].map(([,word])=>({thin:1,medium:3,thick:5}[word]));
 return Math.max(0,...lengths,...keywords);
};
// Only what is written decides invisibility: a token that is transparent in one rule may be a colour in another.
const invisible=value=>/\b(transparent|none|hidden)\b/.test(value);
/** Splits a list at its top-level commas (not the ones inside a function). */
const layers=value=>{const out=[];let depth=0,start=0;for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;else if(value[i]===')')depth--;else if(value[i]===','&&depth===0){out.push(value.slice(start,i).trim());start=i+1}}out.push(value.slice(start).trim());return out.filter(Boolean)};

function edgeOffenders(list){
 const offenders=[];
 known={...tokens,...tokenValues(list)};
 for(const rule of list){
  if(edgeSystem(rule)||ribbonFold(rule))continue;
  const where=`${rule.path} ${rule.selector}`;
  // One side, or the two sides of one axis, wider than a hairline.
  for(const decl of decls(rule.body,'border-(?:left|right|top|bottom|inline|block|inline-start|inline-end|block-start|block-end)(?:-width)?')){
   if(width(decl.value)>=2&&!invisible(decl.value))offenders.push(`${where}: ${decl.name}:${decl.value}`);
  }
  // border-width with sides of different widths draws a line on the wider side.
  for(const decl of decls(rule.body,'border-width')){
   const sides=resolve(decl.value).split(/\s+/).map(width);
   if(sides.length>1&&Math.max(...sides)>=2&&new Set(sides).size>1)offenders.push(`${where}: border-width:${decl.value}`);
  }
  // One side coloured differently from the others on a border two pixels or wider.
  const wide=decls(rule.body,'border(?:-width)?').some(decl=>width(decl.value)>=2&&!/\bnone\b/.test(decl.value));
  if(wide)for(const decl of decls(rule.body,'border-(?:left|right|top|bottom|inline-start|inline-end|block-start|block-end|inline|block)-color'))if(!invisible(decl.value))offenders.push(`${where}: ${decl.name} on a ${'wide'} border`);
  // A hard-edged gradient strip or a border image paints a line along an edge as well.
  for(const decl of decls(rule.body,'background(?:-image)?|border-image(?:-source)?')){
   if(/^border-image/.test(decl.name)&&!/^none/.test(decl.value))offenders.push(`${where}: ${decl.name}`);
   for(const gradient of decl.value.matchAll(/linear-gradient\(([^;]*)\)/g)){
    const stops=[...gradient[1].matchAll(/(-?\d*\.?\d+)(px|rem|em)/g)].map(match=>Number(match[1])*(match[2]==='px'?1:16));
    if(stops.some(stop=>stop>0&&stop<=8))offenders.push(`${where}: a gradient strip`);
   }
  }
  for(const decl of decls(rule.body,'box-shadow')){
   for(const layer of layers(resolve(decl.value))){
    if(/\binset\b/.test(layer))offenders.push(`${where}: inset shadow`);
    // A shadow with no blur and an offset is a line along one edge.
    const numbers=[...layer.replace(/(rgba?|hsla?|color-mix|oklch|lab|lch)\([^)]*\)|#[\da-f]{3,8}\b/gi,'').matchAll(/(-?\d*\.?\d+)(px|rem|em)?/g)].map(match=>Number(match[1])*(match[2]==='rem'||match[2]==='em'?16:1));
    if(numbers.length>=2&&(numbers[2]??0)===0&&Math.max(Math.abs(numbers[0]),Math.abs(numbers[1]))>=2&&!/\binset\b/.test(layer))offenders.push(`${where}: an unblurred offset shadow draws an edge line`);
   }
  }
  // A thin pseudo-element along one side is an edge line too. The keyboard focus bar is the one
  // allowed thin line: horizontal, under the control or along a panel's top; a vertical one is a stripe.
  if(/::?(before|after)/.test(rule.selector)&&/position\s*:\s*(absolute|fixed|sticky)/.test(rule.body)){
   const size=name=>decls(rule.body,name).map(decl=>width(decl.value))[0];
   const filled=decls(rule.body,'background(?:-color)?').some(decl=>!invisible(decl.value));
   const thin=value=>value!==undefined&&value>0&&value<=8;
   const vertical=thin(size('width'))||thin(size('inline-size'));
   const horizontal=thin(size('height'))||thin(size('block-size'));
   if(filled&&(vertical||(horizontal&&!focusBar(rule))))offenders.push(`${where}: an edge line drawn outside the edge system`);
  }
 }
 known=tokens;
 return offenders;
}
test('an accent line on an edge is drawn only by the one edge system',()=>{
 assert.deepEqual(edgeOffenders(all),[]);
 // The edge system draws a straight line and squares only the two corners it touches.
 const system=all.filter(edgeSystem).map(rule=>`${rule.selector}{${rule.body}}`).join('\n');
 for(const side of ['start','end','top','bottom'])assert.match(system,new RegExp(`\\[data-edge="${side}"\\]`),side);
 assert.match(system,/border-start-start-radius:0/);
 assert.doesNotMatch(system,/border-radius:0[;}]/,'the edge system never squares every corner');
});

function focusOffenders(list){
 const offenders=[];
 for(const rule of list){
  for(const decl of decls(rule.body,'outline(?:-style|-width|-color)?')){
   const none=/^(none|0|0px|transparent)(\s*!important)?$/.test(decl.value);
   const allowed=forced(rule)&&focusBar(rule)&&/:focus-visible/.test(rule.selector)&&/^2px solid CanvasText$/.test(decl.value);
   if(!none&&!allowed)offenders.push(`${rule.path} ${rule.selector}: ${decl.name}:${decl.value}`);
  }
  if(/:focus/.test(rule.selector)&&decls(rule.body,'box-shadow').some(decl=>!/^none/.test(decl.value)))offenders.push(`${rule.path} ${rule.selector}: box-shadow on focus`);
  if(/:focus/.test(rule.selector)&&decls(rule.body,'border(?!-radius|-[a-z-]*-radius)[a-z-]*').some(decl=>!invisible(decl.value)))offenders.push(`${rule.path} ${rule.selector}: border on focus`);
  if(/:focus-within/.test(rule.selector)&&decls(rule.body,'(?:border|outline|box-shadow)[a-z-]*').length)offenders.push(`${rule.path} ${rule.selector}: frame on :focus-within`);
  // A focus indicator outside keyboard mode would show on a mouse click as well.
  if(/:focus-visible/.test(rule.selector)&&/::?(before|after)/.test(rule.selector)&&!focusBar(rule)&&decls(rule.body,'content').some(decl=>decl.value!=='none'))offenders.push(`${rule.path} ${rule.selector}: focus indicator outside keyboard mode`);
 }
 return offenders;
}
test('focus never draws a ring around a control, except the forced-colours keyboard outline',()=>{
 assert.deepEqual(focusOffenders(all),[]);
 // Mantine's own ring is off; the indicator is opened by the central keyboard mode only.
 assert.match(app,/focusRing:'never'/);
 const indicator=all.filter(rule=>focusBar(rule)&&/:focus-visible/.test(rule.selector)&&!forced(rule));
 assert.ok(indicator.length>0,'a keyboard focus indicator exists');
});

function motionOffenders(list){
 const offenders=[];
 const keyword=value=>/\b(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)\b|\b(steps|cubic-bezier)\(|\ball\b/.test(value.replace(/var\([^)]*\)/g,''));
 const literalTime=value=>/(^|[\s,(])-?\d*\.?\d+m?s\b/.test(value.replace(/var\([^)]*\)/g,''));
 for(const rule of list){
  if(reduced(rule))continue;
  const where=`${rule.path} ${rule.selector}`;
  for(const decl of decls(rule.body,'transition|animation')){
   const value=decl.value.replace(/\s*!important$/,'');
   if(value==='none'){if(decl.name==='transition')offenders.push(`${where}: transition:none outside reduced motion`);continue}
   for(const layer of layers(value)){
    if(keyword(layer)||literalTime(layer))offenders.push(`${where}: ${decl.name}:${layer}`);
    else if(!/var\(--motion-ease\)/.test(layer))offenders.push(`${where}: ${decl.name} without the motion curve`);
    else if(!/var\(--motion-(fast|base|slow)\)/.test(layer))offenders.push(`${where}: ${decl.name} without a motion duration`);
   }
  }
  for(const decl of decls(rule.body,'(?:transition|animation)-(?:timing-function|duration|delay)')){
   const value=decl.value.replace(/\s*!important$/,'');
   if(keyword(value)||literalTime(value))offenders.push(`${where}: ${decl.name}:${value}`);
   else if(!/var\(--motion-/.test(value))offenders.push(`${where}: ${decl.name} without a motion token`);
  }
  // A transition written only on the hover or active state would run in one direction.
  if(/:(hover|active)\b/.test(rule.selector)&&decls(rule.body,'transition').length)offenders.push(`${where}: transition only on a state`);
 }
 return offenders;
}
test('every normal transition uses the motion tokens, entering and leaving alike',()=>{
 assert.deepEqual(motionOffenders(all),[]);
 // Mantine's press jump is off.
 assert.match(app,/activeClassName:''/);
});

test('the JavaScript motion values are the stylesheet tokens',()=>{
 const root=all.find(rule=>rule.selector===':root'&&/--motion-ease/.test(rule.body))?.body||'';
 const token=name=>decls(root,name)[0]?.value;
 const constant=name=>motionSource.match(new RegExp(`export const ${name}=([^;]+);`))?.[1];
 assert.match(token('--motion-ease'),/^cubic-bezier\(\.65,\s*0,\s*\.35,\s*1\)$/);
 assert.equal(constant('MOTION_EASE').replace(/['\s]/g,''),token('--motion-ease').replace(/\s/g,''));
 assert.equal(`${constant('MOTION_MS')}ms`,token('--motion-base'));
 assert.equal(`${constant('MOTION_FAST_MS')}ms`,token('--motion-fast'));
});

function componentMotionOffenders(list){
 const offenders=[];
 const allowed=/^(MOTION_EASE|MOTION_MS|MOTION_FAST_MS|TOOLTIP_DELAY_MS|transition\(\w*\))$/;
 for(const file of list){
  if(file.path==='src/motion.js')continue;
  // While a finger drags the book sheet it follows the finger without a transition; this is direct
  // manipulation, not an animation, and the sheet animates again once it is let go.
  const text=file.text.replace("styles={{content:offset?{transform:`translateY(${offset}px)`,transitionDuration:'0ms'}:undefined}}",'');
  for(const match of text.matchAll(/\b(transitionProps|duration|exitDuration|enterDelay|exitDelay|openDelay|closeDelay|transitionDuration|transitionTimingFunction|timingFunction)\s*(?:=\s*\{|=(?=\s*["'])|:)\s*(?=([^,}\s]+))/g)){
   const [,name,value]=match;
   // An object of transition props is checked key by key.
   if(name==='transitionProps'&&value.startsWith('{'))continue;
   if(!allowed.test(value))offenders.push(`${file.path}: ${name} ${value}`);
  }
  for(const match of text.matchAll(/\btransition\s*:\s*['`]([^'`]+)['`]/g))offenders.push(`${file.path}: inline transition ${match[1]}`);
  // Web Animations take the same curve and durations.
  for(const match of text.matchAll(/\.animate\([^)]*\)/g))if(!/easing\s*:\s*MOTION_EASE/.test(match[0])||!/duration\s*:\s*MOTION_\w+/.test(match[0]))offenders.push(`${file.path}: animate() without the motion values`);
 }
 return offenders;
}
test('components take every transition, duration and delay from src/motion.js',()=>{
 assert.deepEqual(componentMotionOffenders(jsx),[]);
});

// Each gate fails on the pattern it bans, so a passing run means the pattern is absent.
const sample=text=>rules(text).map(rule=>({...rule,path:'sample.css'}));
test('the gates reject every banned pattern',()=>{
 for(const text of [
  '.a{border-left:3px solid var(--accent);border-radius:8px}',
  '.a{border-inline-start:.25rem solid red}',
  '.a{border-inline:3px solid red}',
  '.a{border-width:0 0 0 4px;border-style:solid}',
  '.a{border-left:var(--edge-width) solid red}',
  '.a{box-shadow:inset 3px 0 0 red}',
  '.a{box-shadow:0 1px 2px #0002,-3px 0 0 red}',
  '.a::before{content:"";position:absolute;inset-block:0;left:0;width:3px;background:red}',
  '@layer parts{.a{border-top:4px solid red}}',
  '.a{--stripe:4px}.b{border-left:var(--stripe) solid red}',
  '.a{border:2px solid var(--line);border-left-color:var(--accent)}',
  '.a{background:linear-gradient(90deg,var(--accent) 4px,transparent 4px)}',
  '.a{border-image:linear-gradient(red,blue) 1}',
  '.a{box-shadow:#a65a38 -3px 0 0}',
  'html[data-focus-mode="keyboard"] .a:focus-visible::after{content:"";position:absolute;inset-block:0;left:0;width:3px;background:red}',
 ])assert.ok(edgeOffenders(sample(text)).length,text);
 for(const text of [
  '.a:focus-visible{outline:2px solid red}',
  '.a:focus{box-shadow:0 0 0 3px red}',
  '.a:focus{border-color:red}',
  '.a:focus-visible{border-left-color:red}',
  '.a:focus-within{border-color:red}',
  '.a:focus-visible::after{content:""}',
  '@media (forced-colors:active){.a:focus-visible{outline:2px solid CanvasText}}',
  '@media (forced-colors:active){html[data-focus-mode="keyboard"] .a:focus-visible{outline:3px solid CanvasText}}',
 ])assert.ok(focusOffenders(sample(text)).length,text);
 for(const text of [
  '.a{transition:color .2s ease}',
  '.a{transition:color var(--motion-fast)}',
  '.a{transition:color var(--motion-fast) var(--motion-ease),background 200ms}',
  '.a{transition-delay:100ms}',
  '.a{transition:none}',
  '.a:hover{transition:color var(--motion-fast) var(--motion-ease)}',
  '.a{animation:spin 1s linear infinite}',
  '@layer parts{.a{transition:all var(--motion-fast) var(--motion-ease)}}',
 ])assert.ok(motionOffenders(sample(text)).length,text);
 for(const text of [
  '<Drawer transitionProps={{duration:300}}/>',
  '<Tooltip openDelay={500}/>',
  '<Collapse transitionTimingFunction="ease"/>',
  '<div style={{transition:\'opacity 1s\'}}/>',
  '<Transition exitDuration={toastExit}/>',
  'node.animate([{opacity:0},{opacity:1}],{duration:200,easing:"ease"})',
 ])assert.ok(componentMotionOffenders([{path:'sample.jsx',text}]).length,text);
 // What the project does on purpose stays allowed.
 assert.deepEqual(edgeOffenders(sample('[data-edge="start"]::before{inset-block:0;width:var(--edge-width)}.a{border-bottom:1px solid var(--line)}.a{box-shadow:0 18px 50px -12px #0005}')),[]);
 assert.deepEqual(focusOffenders(sample('@media (forced-colors:active){html[data-focus-mode="keyboard"] .a:focus-visible{outline:2px solid CanvasText}}html[data-focus-mode="keyboard"] .a:focus-visible::after{content:""}')),[]);
 assert.deepEqual(motionOffenders(sample('.a{transition:color var(--motion-fast) var(--motion-ease)}@media (prefers-reduced-motion:reduce){.a{transition:none}}')),[]);
});
