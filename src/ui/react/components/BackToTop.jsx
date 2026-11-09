import React from 'react';
import { ActionIcon, Affix, Transition } from '@mantine/core';
import { useReducedMotion, useWindowScroll } from '@mantine/hooks';
import { IconArrowUp } from '@tabler/icons-react';
import { transition } from '../../../motion';

// Shown once the page has been read past its first screens. It reads the scroll position itself,
// so scrolling never re-renders the page around it.
const SHOW_AFTER_PX = 600;

export default function BackToTop({ label }) {
  const [{ y }] = useWindowScroll();
  const reducedMotion = useReducedMotion();
  const toTop = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };
  return <Affix className="back-to-top" zIndex={140} position={{ bottom: 'calc(var(--dock-height) + env(safe-area-inset-bottom) + var(--stack-gap))', right: 'var(--card-gap)' }}>
    <Transition transition="fade" mounted={y > SHOW_AFTER_PX} {...transition('overlay', reducedMotion)}>
      {style => <ActionIcon variant="default" size={48} aria-label={label} style={style} onClick={toTop}><IconArrowUp size={24} aria-hidden="true" /></ActionIcon>}
    </Transition>
  </Affix>;
}
