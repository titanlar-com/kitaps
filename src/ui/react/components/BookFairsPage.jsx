import React, { useMemo, useState } from 'react';
import { Button, Indicator, SegmentedControl, Text, Timeline, Title } from '@mantine/core';
import { IconCalendarPlus } from '@tabler/icons-react';
import data from '../../../../data/book-fairs.json';
import { fairTimeline, todayInIstanbul } from '../../../core/places/fairs.js';
import { fairCalendar } from '../../../fairs';
import { download } from '../../../download';
import { fairsScreen } from '../../../screens/fairs.js';
import { FactList, LongNote, PlaceBadge, PlaceCard } from './PlaceParts';
import './BookFairsPage.css';
import { longDay } from '../../../dates.js';

// The book fair calendar (data/book-fairs.json). Finished fairs leave the list by themselves;
// a date only counts as announced when the organiser or the fair's own site gives it.
const opens = { target: '_blank', rel: 'noopener noreferrer' };
const SECTION = { component: 'section' };

/** How near a fair is, beside a small square that catches the eye. */
function Countdown({ countdown }) {
 return <Indicator className="fair-countdown" data-kind={countdown.kind} inline position="middle-start" radius="xs" size={10} zIndex={0}>
  <span className="fair-countdown-text">{countdown.text}</span>
 </Indicator>;
}

function Fair({ card, newTab }) {
 const calendar = () => download(`${card.id}.ics`, fairCalendar(card.fair), 'text/calendar');
 return <PlaceCard component="article" id={`fair-${card.id}`} className="book-fair">
  <div className="book-fair-when">
   <Text className="book-fair-date">{card.when}</Text>
   {card.countdown && <Countdown countdown={card.countdown} />}
  </div>
  <Title order={3}>{card.name}</Title>
  <div className="book-fair-badges"><PlaceBadge badge={card.badge} /></div>
  <FactList facts={card.facts} />
  {card.note && <LongNote title={card.name}><Text>{card.note}</Text></LongNote>}
  {card.calendar && <div className="book-fair-actions">
   <Button variant="default" leftSection={<IconCalendarPlus size={18} aria-hidden="true" />} onClick={calendar}>{card.calendar}</Button>
  </div>}
  {card.sources && <Text className="book-fair-sources">{card.sources.label}{card.sources.links.map(source => <React.Fragment key={source.url}>
   {source.before}<a href={source.url} {...opens}>{source.label}<span className="visually-hidden">{newTab}</span></a>
  </React.Fragment>)}</Text>}
 </PlaceCard>;
}

const FairList = ({ cards, newTab }) => <div className="book-fair-list">{cards.map(card => <Fair key={card.id} card={card} newTab={newTab} />)}</div>;

export default function BookFairsPage() {
 const [scope, setScope] = useState('all');
 const today = todayInIstanbul();
 const timeline = useMemo(() => fairTimeline(data.fairs, scope, today), [scope, today]);
 const model = fairsScreen({ data, timeline, longDay });
 return <div className="book-fairs-page">
  <header className="book-fairs-intro">
   <Title order={1}>{model.title}</Title>
   <Text>{model.intro}</Text>
   <Text className="book-fairs-updated">{model.checked}</Text>
  </header>
  <SegmentedControl className="book-fairs-scope" value={scope} onChange={value => setScope(String(value))} data={model.scope.options} aria-label={model.scope.label} />

  <Text className="book-fairs-count visually-hidden" role="status" aria-live="polite">{model.status}</Text>
  {model.timeline ? <Timeline className="fair-timeline" active={model.timeline.active} bulletSize={18}>
   {model.timeline.open && <Timeline.Item key="open" {...SECTION} aria-labelledby="fairs-open">
    <Title order={2} id="fairs-open">{model.timeline.open.title}</Title>
    <FairList cards={model.timeline.open.cards} newTab={model.newTab} />
   </Timeline.Item>}
   {model.timeline.months.map(month => <Timeline.Item key={month.key} {...SECTION} aria-labelledby={`fairs-${month.key}`}>
    <div className="fair-month-head">
     <Title order={2} id={`fairs-${month.key}`}>{month.label}</Title>
     <Text className="fair-month-count">{month.count}</Text>
     {month.badge && <PlaceBadge badge={month.badge} />}
    </div>
    <FairList cards={month.cards} newTab={model.newTab} />
   </Timeline.Item>)}
  </Timeline> : <Text>{model.empty}</Text>}

  {model.undated && <section aria-labelledby="fairs-undated" className="book-fairs-section">
   <Title order={2} id="fairs-undated">{model.undated.title}</Title>
   <Text>{model.undated.body}</Text>
   <FairList cards={model.undated.cards} newTab={model.newTab} />
  </section>}

  {model.notes && <section aria-labelledby="fairs-notes" className="book-fairs-section">
   <Title order={2} id="fairs-notes">{model.notes.title}</Title>
   <ul>{model.notes.items.map(note => <li key={note}>{note}</li>)}</ul>
  </section>}
 </div>;
}
