/** The central keyboard focus mode (AGENT.md). The page starts in pointer mode, with no focus
 * indicator. Only Tab or Shift+Tab turns keyboard mode on; arrows, Escape, typing and the caret
 * never do. A pointer press or a touch turns it off again, without moving focus or blocking the
 * keyboard. styles.css shows the focus bar only in keyboard mode, and only on :focus-visible. */
export function trackFocusMode(root=document.documentElement,target=window){
 const keyboard=event=>{if(event.key==='Tab')root.dataset.focusMode='keyboard'};
 const pointer=()=>{delete root.dataset.focusMode};
 // Browsers scroll a focused control into view, not the bar under it: Firefox only when none of
 // the control shows, WebKit a field just to the panel's edge. Once the browser's own scroll has
 // stopped, keyboard mode brings the control into view with its bar if the bar is still cut off.
 const reveal=event=>{
  const element=event.target;
  if(root.dataset.focusMode!=='keyboard'||typeof element?.getBoundingClientRect!=='function')return;
  // A field draws its bar under its wrapper or option, so that box is the one measured.
  const holder=element.matches?.('input,textarea,select')?element.closest('.filter-choice,.mantine-Input-wrapper,label')??element:element;
  let last=Number.NaN,still=0,frames=0;
  const check=()=>{
   if(element.ownerDocument.activeElement!==element)return;
   const top=holder.getBoundingClientRect().top;
   still=top===last?still+1:0;last=top;
   if(still<2&&++frames<90){requestAnimationFrame(check);return}
   if(hidesBar(holder))holder.scrollIntoView({block:'nearest'});
  };
  requestAnimationFrame(check);
 };
 // Capture phase, so a widget that stops the event still lets the mode change.
 const capture={capture:true};
 target.addEventListener('keydown',keyboard,capture);
 target.addEventListener('focusin',reveal,capture);
 target.addEventListener('pointerdown',pointer,capture);
 target.addEventListener('touchstart',pointer,{capture:true,passive:true});
 return ()=>{
  target.removeEventListener('keydown',keyboard,capture);
  target.removeEventListener('focusin',reveal,capture);
  target.removeEventListener('pointerdown',pointer,capture);
  target.removeEventListener('touchstart',pointer,capture);
 };
}

// Room below a control for its focus bar: --focus-gap and --focus-bar in styles.css, and a margin.
const BAR_ROOM=12;
/** Whether the window or a scrolling panel cuts off the control or the bar under it. */
export function hidesBar(element){
 const box=element.getBoundingClientRect();const view=element.ownerDocument.defaultView;
 const cut=(top,bottom)=>box.height+BAR_ROOM<=bottom-top&&(box.top<top||box.bottom+BAR_ROOM>bottom);
 if(cut(0,view.innerHeight))return true;
 for(let node=element.parentElement;node&&node!==element.ownerDocument.body;node=node.parentElement){
  if(!/auto|scroll/.test(view.getComputedStyle(node).overflowY))continue;
  const panel=node.getBoundingClientRect();
  if(cut(panel.top,panel.bottom))return true;
 }
 return false;
}
