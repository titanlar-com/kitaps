import test from 'node:test';
import assert from 'node:assert/strict';
import {trackFocusMode} from '../src/focusMode.js';

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
