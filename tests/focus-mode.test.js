import test from 'node:test';
import assert from 'node:assert/strict';
import {trackFocusMode,hidesBar} from '../src/focusMode.js';

// The central keyboard focus mode (AGENT.md): only Tab or Shift+Tab turns it on; a pointer or a
// touch turns it off; arrows, Escape and typing never turn it on.
test('only Tab turns keyboard mode on, and a pointer or touch turns it off',()=>{
 const root={dataset:{}};const target=new EventTarget();
 const stop=trackFocusMode(root,target);
 const key=k=>{const event=new Event('keydown');event.key=k;target.dispatchEvent(event)};
 for(const k of ['ArrowDown','ArrowRight','Escape','Enter',' ','a','Shift'])key(k);
 assert.equal(root.dataset.focusMode,undefined);
 key('Tab');
 assert.equal(root.dataset.focusMode,'keyboard');
 target.dispatchEvent(new Event('pointerdown'));
 assert.equal(root.dataset.focusMode,undefined);
 key('Tab');target.dispatchEvent(new Event('touchstart'));
 assert.equal(root.dataset.focusMode,undefined);
 stop();key('Tab');
 assert.equal(root.dataset.focusMode,undefined,'no listener is left after stopping');
});

// Firefox leaves a half-visible control where it is when Tab reaches it, so its bar can stay off
// the screen; keyboard mode then brings it into view (src/focusMode.js).
test('a control whose bar the window or a scrolling panel cuts off counts as hidden',()=>{
 const view={innerHeight:800,getComputedStyle:node=>({overflowY:node.overflowY||'visible'})};
 const doc={defaultView:view,body:{}};
 const control=(top,bottom,parentElement=null)=>({getBoundingClientRect:()=>({top,bottom,height:bottom-top}),ownerDocument:doc,parentElement});
 assert.equal(hidesBar(control(100,780)),false);
 assert.equal(hidesBar(control(400,795)),true,'the bar falls below the window');
 assert.equal(hidesBar(control(416,821)),true,'a half-visible cover');
 assert.equal(hidesBar(control(-10,40)),true,'cut off at the top');
 assert.equal(hidesBar(control(0,900)),false,'a control taller than the window is left alone');
 const panel={overflowY:'auto',getBoundingClientRect:()=>({top:100,bottom:500}),parentElement:doc.body};
 assert.equal(hidesBar(control(450,495,panel)),true,'the bar falls below a scrolling panel');
 assert.equal(hidesBar(control(200,300,panel)),false);
});
