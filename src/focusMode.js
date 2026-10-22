/** The central keyboard focus mode (AGENT.md). The page starts in pointer mode, with no focus
 * indicator. Only Tab or Shift+Tab turns keyboard mode on; arrows, Escape, typing and the caret
 * never do. A pointer press or a touch turns it off again, without moving focus or blocking the
 * keyboard. styles.css shows the focus bar only in keyboard mode, and only on :focus-visible. */
export function trackFocusMode(root=document.documentElement,target=window){
 const keyboard=event=>{if(event.key==='Tab')root.dataset.focusMode='keyboard'};
 const pointer=()=>{delete root.dataset.focusMode};
 // Capture phase, so a widget that stops the event still lets the mode change.
 const capture={capture:true};
 target.addEventListener('keydown',keyboard,capture);
 target.addEventListener('pointerdown',pointer,capture);
 target.addEventListener('touchstart',pointer,{capture:true,passive:true});
 return ()=>{
  target.removeEventListener('keydown',keyboard,capture);
  target.removeEventListener('pointerdown',pointer,capture);
  target.removeEventListener('touchstart',pointer,capture);
 };
}
