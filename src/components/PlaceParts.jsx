import React from 'react';
// @ts-expect-error Mantine's typings put a namespace beside DataList, and a JavaScript file reads the pair as a type only.
import { Badge, Card, DataList, Spoiler, Timeline } from '@mantine/core';
import { IconCheck, IconQuestionMark, IconX } from '@tabler/icons-react';
import './PlaceParts.css';

// The parts the bookstores, routes and fairs screens share. They show what src/core/places
// worked out and calculate nothing themselves.
const BADGE_ICONS = { open: IconCheck, closed: IconX, unverified: IconQuestionMark };
// Five lines of body text at the default size. The fold grows with the reader's text size.
const NOTE_FOLD = 124;
// Mantine draws a timeline with divs. A route's stops are an ordered list, so the elements say so.
const ORDERED_LIST = { component: 'ol' };
const LIST_ITEM = { component: 'li' };

/** A status in words, with its tone. The stylesheet turns the tone into colour tokens. */
export function PlaceBadge({ badge }) {
 if (!badge) return null;
 const Icon = BADGE_ICONS[badge.icon];
 return <Badge className="place-badge" data-tone={badge.tone} leftSection={Icon && <Icon size={14} aria-hidden="true" />}>{badge.label}</Badge>;
}

/** One layer above the floor: it stands apart by its tone, not by a frame. */
export function PlaceCard({ className = '', ...props }) {
 return <Card padding="var(--card-inset)" className={`place-card ${className}`} {...props} />;
}

/** The stops of a route as an ordered timeline; the stylesheet draws each number on its bullet. */
export function StopTimeline({ stops, active = -1, className = '', children }) {
 return <Timeline {...ORDERED_LIST} active={active} className={`stop-timeline ${className}`}>
  {stops.map(stop => <Timeline.Item key={stop.id} {...LIST_ITEM}>{children(stop)}</Timeline.Item>)}
 </Timeline>;
}

/** Label and value pairs as a definition list. A fact with no value is left out. */
export function FactList({ facts }) {
 const present = facts.filter(fact => fact.value);
 if (!present.length) return null;
 return <DataList size="md" className="place-facts">{present.map(fact => <DataList.Item key={fact.label}>
  <DataList.ItemLabel>{fact.label}</DataList.ItemLabel>
  <DataList.ItemValue>{fact.value}</DataList.ItemValue>
 </DataList.Item>)}</DataList>;
}

/** Long text folded to a few lines, with a control that names what it opens. */
export function LongNote({ title, children }) {
 return <Spoiler className="place-note" maxHeight={NOTE_FOLD} showLabel="Devamını oku" hideLabel="Daralt" showAriaLabel={`${title}: devamını oku`} hideAriaLabel={`${title}: daralt`}>{children}</Spoiler>;
}
