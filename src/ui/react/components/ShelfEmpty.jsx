import { Button } from '@mantine/core';
import { IconArrowRight, IconHeart } from '@tabler/icons-react';
import { BookshelfIcon } from '../app/icons';
import { shelfEmptyScreen } from '../../../screens/catalog.js';
import EmptyState from './EmptyState';

// What Favoriler and Kitaplığım say before the first book is on them. A search or a filter that
// finds nothing on a shelf with books is another matter, and the catalogue's own notice answers it.
const ICONS = { favorites: IconHeart, owned: BookshelfIcon };

export default function ShelfEmpty({ shelf, onBrowse }) {
  const { title, body, browse } = shelfEmptyScreen(shelf);
  return <EmptyState icon={ICONS[shelf]} title={title} action={<Button variant="light" rightSection={<IconArrowRight size={18} />} onClick={onBrowse}>{browse}</Button>}>{body}</EmptyState>;
}
