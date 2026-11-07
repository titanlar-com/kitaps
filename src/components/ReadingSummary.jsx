import React, { useId } from 'react';
import { Progress, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconBook, IconCheck, IconHeart, IconListNumbers } from '@tabler/icons-react';
import { BookshelfIcon } from '../app/icons';

// The catalogue's reading band (docs/UI-REDESIGN.md, phase 3). The numbers come from
// readingSummary in the data core; this component only shows them. Every count is a way to its
// shelf: onSelect gets 'read', 'reading', 'queued', 'owned' or 'favorites'. The share is a bar with
// square ends (owner's rule: no corner over 5 px), and the band's name is a label, not a heading,
// because the band comes before the page's h1.
const number = new Intl.NumberFormat('tr-TR');
// A share under one percent keeps one decimal, so a read book never shows as %0.
const percent = share => new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: share > 0 && share < 0.01 ? 1 : 0 }).format(share);
const ITEMS = [
  { key: 'read', label: 'Okunan', field: 'read', Icon: IconCheck },
  { key: 'reading', label: 'Okuyorum', field: 'reading', Icon: IconBook },
  { key: 'queued', label: 'Sıramda', field: 'queued', Icon: IconListNumbers },
  { key: 'owned', label: 'Kitaplığım', field: 'owned', Icon: BookshelfIcon },
  { key: 'favorites', label: 'Favoriler', field: 'favorites', Icon: IconHeart },
];

export default function ReadingSummary({ summary, onSelect }) {
  const titleId = useId();
  return <section className="reading-summary" aria-labelledby={titleId}>
    <div className="reading-summary-head">
      <div className="reading-summary-text">
        <Text id={titleId} className="reading-summary-title">Okuma özetim</Text>
        <Text c="dimmed">{summary.read ? `${number.format(summary.total)} kitaptan ${number.format(summary.read)} tanesi okundu.` : 'Henüz okundu işaretli kitap yok.'}</Text>
      </div>
      <div className="reading-summary-share">
        <span className="reading-summary-share-value tabular-nums">{percent(summary.readShare)}</span>
        <Progress className="reading-summary-bar" value={Number((summary.readShare * 100).toFixed(1))} size="md" aria-label="Okunan oranı" />
      </div>
    </div>
    <ul className="reading-summary-stats">
      {ITEMS.map(({ key, label, field, Icon }) => <li key={key}>
        <UnstyledButton className="reading-summary-stat" aria-label={`${label}: ${number.format(summary[field])} kitap`} onClick={() => onSelect(key)}>
          <ThemeIcon className="reading-summary-icon" variant="light" size={36} aria-hidden="true"><Icon size={20} /></ThemeIcon>
          <span className="reading-summary-value tabular-nums" aria-hidden="true">{number.format(summary[field])}</span>
          <span className="reading-summary-label" aria-hidden="true">{label}</span>
        </UnstyledButton>
      </li>)}
    </ul>
  </section>;
}
