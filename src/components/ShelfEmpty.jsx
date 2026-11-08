import { Button } from '@mantine/core';
import { IconArrowRight, IconHeart } from '@tabler/icons-react';
import { BookshelfIcon } from '../app/icons';
import EmptyState from './EmptyState';

// What Favoriler and Kitaplığım say before the first book is on them. A search or a filter that
// finds nothing on a shelf with books is another matter, and the catalogue's own notice answers it.
const SHELVES = {
  favorites: { icon: IconHeart, title: 'Henüz favori kitap yok.', text: 'Bir kitabın kartındaki kalp düğmesine bastığında kitap burada görünür.' },
  owned: { icon: BookshelfIcon, title: 'Kitaplığın ilk kitabını bekliyor.', text: 'Bir kitabın kartında “Satın aldım” düğmesine bastığında kitap burada görünür. Okumaya başladığın kitaplar da buraya gelir.' },
};

export default function ShelfEmpty({ shelf, onBrowse }) {
  const { icon, title, text } = SHELVES[shelf];
  return <EmptyState icon={icon} title={title} action={<Button variant="light" rightSection={<IconArrowRight size={18} />} onClick={onBrowse}>Kataloğa git</Button>}>{text}</EmptyState>;
}
