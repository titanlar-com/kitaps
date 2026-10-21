import React, { useEffect, useRef, useState } from 'react';
import { Drawer } from '@mantine/core';
import { useMediaQuery, useReducedMotion } from '@mantine/hooks';

/** `covered`: a dialog opened from the sheet sits above it, so Escape closes that dialog, not the sheet too. */
export default function BookSheet({ opened, onClose, children, covered = false }) {
 const mobile = useMediaQuery('(max-width: 47.99em)');
 const reducedMotion = useReducedMotion();
 const gesture = useRef(null);
 const dragged = useRef(false);
 const [offset, setOffset] = useState(0);
 useEffect(() => { setOffset(0); gesture.current = null; }, [opened, mobile]);
 const finish = e => {
  const start = gesture.current;
  if (!start) return;
  gesture.current = null;
  const distance = Math.max(0, e.clientY - start.y);
  const velocity = distance / Math.max(1, performance.now() - start.time);
  setOffset(0);
  if (distance > 100 || (distance > 35 && velocity > .55)) onClose();
 };
 return <Drawer opened={opened} onClose={onClose} closeOnEscape={!covered} position={mobile?'bottom':'right'} size={mobile?'90dvh':'min(100%, 760px)'} className={`detail-drawer ${mobile?'book-sheet':''}`} transitionProps={{duration:reducedMotion?0:220}} styles={{content:offset?{transform:`translateY(${offset}px)`,transitionDuration:'0ms'}:undefined}} title={<div className="sheet-title">
  {mobile&&<button type="button" className="sheet-grip" aria-label="Kitap ayrıntısını kapat; aşağı sürükleyebilirsin" onClick={()=>{if(!dragged.current)onClose();dragged.current=false}} onPointerDown={e=>{if(e.button!==0)return;dragged.current=false;gesture.current={y:e.clientY,time:performance.now()};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(gesture.current)setOffset(Math.max(0,e.clientY-gesture.current.y))}} onPointerUp={e=>{const moved=gesture.current&&Math.abs(e.clientY-gesture.current.y)>5;finish(e);dragged.current=!!moved;if(moved)e.preventDefault()}} onPointerCancel={()=>{gesture.current=null;setOffset(0)}}><span/></button>}
  <span>Kitap ayrıntısı</span>
 </div>}>{children}</Drawer>;
}
