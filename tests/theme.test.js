import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { theme } from '../src/app/theme.js';
import { MOTION_EASE, MOTION_MS } from '../src/motion.js';

// The Mantine theme of the redesign (docs/UI-REDESIGN.md, phase 1, 8 November 2026). Every
// component reads its sizes, shadows and motion from here, so these rules hold everywhere.
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const block=start=>{const from=css.indexOf(start);assert.ok(from>=0,start);return css.slice(from,css.indexOf('\n}',from))};
const read=text=>Object.fromEntries([...text.matchAll(/\n (--[\w-]+):([^;]+);/g)].map(match=>[match[1],match[2].trim()]));
const light=read(block(':root{'));
const dark=read(block(":root[data-mantine-color-scheme='dark']{"));
const px=value=>{const match=/^([\d.]+)(rem|px)$/.exec(String(value).trim());assert.ok(match,`a plain size: ${value}`);return Number(match[1])*(match[2]==='rem'?16:1)};

test('every text size the theme can give is at least 14 px', () => {
  const sizes={...Object.fromEntries(Object.entries(theme.fontSizes).map(([key,value])=>[`fontSizes.${key}`,value])),
    ...Object.fromEntries(Object.entries(theme.headings.sizes).map(([key,value])=>[`headings.${key}`,value.fontSize]))};
  const small=Object.entries(sizes).filter(([,value])=>px(value)<14).map(([key,value])=>`${key}: ${value}`);
  assert.deepEqual(small,[]);
  // Headings step down without two levels looking the same.
  const steps=['h1','h2','h3','h4','h5','h6'].map(level=>px(theme.headings.sizes[level].fontSize));
  for(let index=1;index<steps.length;index+=1)assert.ok(steps[index]<steps[index-1],`h${index+1} is smaller than h${index}`);
});

test('elevation comes from the shadow tokens, defined in both schemes', () => {
  const names=['xs','sm','md','lg','xl'];
  assert.deepEqual(Object.keys(theme.shadows).sort(),[...names].sort());
  for(const name of names){
    assert.equal(theme.shadows[name],`var(--shadow-${name})`);
    assert.ok(light[`--shadow-${name}`],`--shadow-${name} in the light scheme`);
    assert.ok(dark[`--shadow-${name}`],`--shadow-${name} in the dark scheme`);
  }
});

test('every component the redesign animates uses the one motion curve and duration', () => {
  // Tabs do not move by themselves; their sliding marker is a FloatingIndicator.
  const animated=['Accordion','Collapse','Combobox','Drawer','FloatingIndicator','HoverCard','Menu','Modal','MultiSelect','Popover','SegmentedControl','Select','Spoiler','Tooltip'];
  const wrong=[];
  for(const name of animated){
    const props=theme.components[name]?.defaultProps;
    if(!props){wrong.push(`${name}: no defaults`);continue;}
    const transition=props.transitionProps??props.comboboxProps?.transitionProps;
    if(transition){
      if(transition.duration!==MOTION_MS)wrong.push(`${name}: duration ${transition.duration}`);
      if(transition.timingFunction!==MOTION_EASE)wrong.push(`${name}: curve ${transition.timingFunction}`);
    }else if('transitionDuration' in props){
      if(props.transitionDuration!==MOTION_MS)wrong.push(`${name}: duration ${props.transitionDuration}`);
      if('transitionTimingFunction' in props&&props.transitionTimingFunction!==MOTION_EASE)wrong.push(`${name}: curve ${props.transitionTimingFunction}`);
    }else wrong.push(`${name}: no motion defaults`);
  }
  assert.deepEqual(wrong,[]);
  // Mantine's own stylesheet gives the marker the generic `ease`; ours puts the contract's curve back.
  for(const selector of ['.mantine-FloatingIndicator-root']){
    const rule=new RegExp(`${selector.replace(/[.]/g,'\\.')}[^{]*\\{[^}]*transition-timing-function:var\\(--motion-ease\\)`);
    assert.match(css.replace(/\s+/g,' ').replace(/: /g,':'),rule,`${selector} uses --motion-ease`);
  }
});

test('the type scale and the tight display tracking are tokens, so components share them', () => {
  for(const token of ['--text-sm','--text-md','--text-lg','--display-tracking']){
    assert.ok(light[token],`${token} is defined`);
  }
  assert.ok(px(light['--text-sm'])>=14,'the smallest text token is at least 14 px');
});

// Owner's rule of 8 November 2026: no corner is rounder than 5 px, Mantine's own included.
test('every corner the theme can give is at most 5 px', () => {
  for(const [name,value] of Object.entries(theme.radius)){
    const token=/^var\((--[\w-]+)\)$/.exec(value);
    const size=token?light[token[1]]:value;
    assert.ok(px(size)<=5,`radius.${name}: ${value} = ${size}`);
  }
  // Components whose own default is a circle or a pill take the largest token instead.
  for(const name of ['Indicator','Avatar','Badge','Chip','Pill','Switch','Radio','Slider','Stepper','Timeline','ThemeIcon','Progress','Skeleton','SegmentedControl','Notification','Kbd']){
    const radius=theme.components[name]?.defaultProps?.radius;
    assert.ok(radius&&radius in theme.radius,`${name} takes a theme radius, not its own round default (${radius})`);
  }
  // The default oval loader is a circle; its bars have square-ish ends (review of 8 November 2026).
  assert.equal(theme.components.Loader?.defaultProps?.type,'bars');
});
