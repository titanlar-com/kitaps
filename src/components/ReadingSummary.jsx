import React from 'react';
import { RingProgress, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { IconBook, IconCircleCheck, IconHeart, IconListNumbers } from '@tabler/icons-react';
import { BookshelfIcon } from '../app/icons';

// The catalogue's reading band (docs/UI-REDESIGN.md, phase 3). The numbers come from
// readingSummary in src/reading.js; this component only shows them. Every count is a way to its
// shelf: onSelect gets 'read', 'reading', 'queued', 'owned' or 'favorites'.
const number = new Intl.NumberFormat('tr-TR');
const ITEMS = [
  { key: 'read', label: 'Okunan', field: 'read', Icon: IconCircleCheck },
  { key: 'reading', label: 'Okuyorum', field: 'reading', Icon: IconBook },
  { key: 'queued', label: 'Sıramda', field: 'queued', Icon: IconListNumbers },
  { key: 'owned', label: 'Kitaplığım', field: 'owned', Icon: BookshelfIcon },
  { key: 'favorites', label: 'Favoriler', field: 'favorites', Icon: IconHeart },
];

export default function ReadingSummary({ summary, onSelect }) {
  const share = Math.round(summary.readShare * 100);
  return <section className="reading-summary" aria-labelledby="reading-summary-title">
    <div className="reading-summary-head">
      <RingProgress className="reading-summary-ring" size={84} thickness={8} roundCaps sections={summary.read ? [{ value: summary.readShare * 100, color: 'brand' }] : []} rootColor="var(--surface-3)" label={<Text className="reading-summary-share tabular-nums" ta="center" fw={650}>%{share}</Text>} />
      <div className="reading-summary-text">
        <Title order={2} id="reading-summary-title">Okuma özetim</Title>
        <Text c="dimmed">{summary.read ? `${number.format(summary.total)} kitaptan ${number.format(summary.read)} tanesi okundu.` : 'Henüz okundu işaretli kitap yok.'}</Text>
      </div>
    </div>
    <ul className="reading-summary-stats">
      {ITEMS.map(({ key, label, field, Icon }) => <li key={key}>
        <UnstyledButton className="reading-summary-stat" aria-label={`${label}: ${number.format(summary[field])} kitap`} onClick={() => onSelect(key)}>
          <ThemeIcon className="reading-summary-icon" variant="light" size={36} radius="md" aria-hidden="true"><Icon size={20} /></ThemeIcon>
          <span className="reading-summary-value tabular-nums" aria-hidden="true">{number.format(summary[field])}</span>
          <span className="reading-summary-label" aria-hidden="true">{label}</span>
        </UnstyledButton>
      </li>)}
    </ul>
  </section>;
}
