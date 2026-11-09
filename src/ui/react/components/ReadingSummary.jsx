import React, { useId } from 'react';
import { Progress, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconBook, IconCheck, IconHeart, IconListNumbers } from '@tabler/icons-react';
import { BookshelfIcon } from '../app/icons';
import { readingSummaryScreen } from '../../../screens/catalog.js';

// The catalogue's reading band (docs/UI-REDESIGN.md, phase 3). The numbers come from
// readingSummary in the data core and the words from its screen model. Every count is a way to its
// shelf: onSelect gets 'read', 'reading', 'queued', 'owned' or 'favorites'. The share is a bar with
// square ends (owner's rule: no corner over 5 px), and the band's name is a label, not a heading,
// because the band comes before the page's h1.
const ICONS = { read: IconCheck, reading: IconBook, queued: IconListNumbers, owned: BookshelfIcon, favorites: IconHeart };

export default function ReadingSummary({ summary, onSelect }) {
  const titleId = useId();
  const model = readingSummaryScreen(summary);
  return <section className="reading-summary" aria-labelledby={titleId}>
    <div className="reading-summary-head">
      <div className="reading-summary-text">
        <Text id={titleId} className="reading-summary-title">{model.title}</Text>
        <Text c="dimmed">{model.sentence}</Text>
      </div>
      <div className="reading-summary-share">
        <span className="reading-summary-share-value tabular-nums">{model.share}</span>
        <Progress className="reading-summary-bar" value={model.progress} size="md" aria-label={model.progressLabel} />
      </div>
    </div>
    <ul className="reading-summary-stats">
      {model.stats.map(({ key, label, value, spoken }) => {
        const Icon = ICONS[key];
        return <li key={key}>
          <UnstyledButton className="reading-summary-stat" data-tone={key} aria-label={spoken} onClick={() => onSelect(key)}>
            <ThemeIcon className="reading-summary-icon" variant="light" size={30} aria-hidden="true"><Icon size={18} /></ThemeIcon>
            <span className="reading-summary-value tabular-nums" aria-hidden="true">{value}</span>
            <span className="reading-summary-label" aria-hidden="true">{label}</span>
          </UnstyledButton>
        </li>;
      })}
    </ul>
  </section>;
}
