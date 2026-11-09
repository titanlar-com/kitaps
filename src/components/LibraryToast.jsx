import React, { useEffect, useRef, useState } from 'react';
import { Button, Notification } from '@mantine/core';
import { IconBooks, IconShoppingBagCheck } from '@tabler/icons-react';
import { libraryToastScreen } from '../screens/shell.js';
import './LibraryToast.css';

// Room under a control for its keyboard focus bar (--focus-gap and --focus-bar in styles.css).
const FOCUS_BAR_ROOM = 12;
// The region around the toast is the live one, so the toast itself is not a second alert.
const CLASSES = { icon: 'library-toast-icon', body: 'library-toast-message', closeButton: 'library-toast-close' };
const CLOSE = { size: 44, iconSize: 22 };

export default function LibraryToast({ book, owned, onClose, onUndo, style, leaving }) {
 const model = libraryToastScreen({ book, owned });
 const root = useRef(null);
 const [hovered, setHovered] = useState(false);
 const [focused, setFocused] = useState(false);
 useEffect(() => {
  if (hovered || focused) return;
  const timer = window.setTimeout(onClose, 8000);
  return () => window.clearTimeout(timer);
 }, [book.id, owned, hovered, focused, onClose]);
 useEffect(() => {
  // A notification must not cover the next control reached with the keyboard, nor its focus bar.
  const revealFocus = event => {
   if (!root.current || root.current.contains(event.target)) return;
   const target = event.target.getBoundingClientRect?.();
   const toast = root.current.getBoundingClientRect();
   if (target?.width && target.height && target.bottom + FOCUS_BAR_ROOM > toast.top && target.top < toast.bottom && target.right > toast.left && target.left < toast.right) onClose('at-once');
  };
  document.addEventListener('focusin', revealFocus);
  return () => document.removeEventListener('focusin', revealFocus);
 }, [onClose]);

 return <Notification ref={root} className="library-toast" classNames={CLASSES} role="group" style={style} inert={leaving || undefined} data-owned={owned || undefined}
  icon={owned ? <IconShoppingBagCheck size={26} aria-hidden="true" /> : <IconBooks size={26} aria-hidden="true" />}
  title={<strong>{model.title}</strong>}
  closeButtonProps={{ ...CLOSE, 'aria-label': model.close }} onClose={onClose}
  onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}
  onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
  <p>{model.book}</p>
  <Button className="library-toast-undo" variant="default" onClick={onUndo}>{model.undo}</Button>
 </Notification>;
}
