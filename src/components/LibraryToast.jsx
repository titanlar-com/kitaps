import React, { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button } from '@mantine/core';
import { IconBooks, IconShoppingBagCheck, IconX } from '@tabler/icons-react';
import { displayTitle } from '../translation';

// Room under a control for its keyboard focus bar (--focus-gap and --focus-bar in styles.css).
const FOCUS_BAR_ROOM = 12;

export default function LibraryToast({ book, owned, onClose, onUndo, style, leaving }) {
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

 return <div ref={root} className="library-toast" style={style} inert={leaving || undefined} data-owned={owned || undefined}
  onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}
  onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
  <span className="library-toast-icon" aria-hidden="true">{owned ? <IconShoppingBagCheck size={28} /> : <IconBooks size={28} />}</span>
  <div className="library-toast-message">
   <strong>{owned ? 'Kitaplığa eklendi' : 'Kitaplıktan çıkarıldı'}</strong>
   <p>{displayTitle(book)}</p>
  </div>
  <ActionIcon className="library-toast-close" variant="subtle" aria-label="Bildirimi kapat" onClick={onClose}><IconX size={22} /></ActionIcon>
  <Button className="library-toast-undo" variant="default" onClick={onUndo}>Geri al</Button>
 </div>;
}
