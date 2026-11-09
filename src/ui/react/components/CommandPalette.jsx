import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spotlight, createSpotlight } from '@mantine/spotlight';
import { useReducedMotion } from '@mantine/hooks';
import { IconArrowRight, IconBook2, IconSearch } from '@tabler/icons-react';
import '@mantine/spotlight/styles.css';
import { transition } from '../../../motion';
import { paletteScreen } from '../../../screens/palette.js';

// The quick search (Ctrl K or Cmd K, and "Hızlı ara" in the footer menu). The page loads it the
// first time it is asked for; `request` goes up each time the reader asks.
export default function CommandPalette({ request, books, views, icons = {}, onBook, onPage, onDismiss = () => {}, covered = false }) {
  const [[store, actions]] = useState(() => createSpotlight());
  const [query, setQuery] = useState('');
  const reducedMotion = useReducedMotion();
  const model = useMemo(() => paletteScreen({ query, books, views }), [query, books, views]);
  useEffect(() => { actions.open(); }, [request, actions]);
  // Focus goes back only when the reader left without choosing; a choice moves it on its own.
  const chose = useRef(false);
  const choose = action => () => { chose.current = true; action(); };
  const closed = () => { if (!chose.current) onDismiss(); chose.current = false; };
  return <Spotlight.Root store={store} query={query} onQueryChange={setQuery} shortcut={null} scrollable maxHeight="min(60dvh, 28rem)" zIndex={250} radius="md" title={model.search} classNames={{ header: 'visually-hidden' }} closeOnEscape={!covered} returnFocus={false} onSpotlightClose={closed} transitionProps={{ ...transition('overlay', reducedMotion), transition: 'fade' }}>
    <Spotlight.Search aria-label={model.search} placeholder={model.search} leftSection={<IconSearch size={20} aria-hidden="true" />} />
    <Spotlight.ActionsList>
      {model.pages.length > 0 && <Spotlight.ActionsGroup label={model.pagesTitle}>
        {model.pages.map(page => { const Icon = icons[page.id] ?? IconArrowRight; return <Spotlight.Action key={page.id} label={page.label} leftSection={<Icon size={20} aria-hidden="true" />} onClick={choose(() => onPage(page.id))} />; })}
      </Spotlight.ActionsGroup>}
      {model.books.length > 0 && <Spotlight.ActionsGroup label={model.booksTitle}>
        {model.books.map(book => <Spotlight.Action key={book.id} label={book.title} description={book.author} leftSection={<IconBook2 size={20} aria-hidden="true" />} onClick={choose(() => onBook(book.id))} />)}
      </Spotlight.ActionsGroup>}
      {model.pages.length + model.books.length === 0 && <Spotlight.Empty>{model.empty}</Spotlight.Empty>}
    </Spotlight.ActionsList>
  </Spotlight.Root>;
}
