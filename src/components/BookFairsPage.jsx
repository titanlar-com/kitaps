import React, { useMemo, useState } from 'react';
import { Button, Indicator, SegmentedControl, Text, Timeline, Title } from '@mantine/core';
import { IconCalendarPlus } from '@tabler/icons-react';
import data from '../../data/book-fairs.json';
import { fairTimeline, todayInIstanbul } from '../core/places/fairs.js';
import { fairCalendar } from '../fairs';
import { download } from '../download';
import { FactList, LongNote, PlaceBadge, PlaceCard } from './PlaceParts';
import './BookFairsPage.css';
import { longDay } from '../dates.js';

// The book fair calendar (data/book-fairs.json). Finished fairs leave the list by themselves;
// a date only counts as announced when the organiser or the fair's own site gives it.
const SCOPES = [{ value: 'all', label: 'Tümü' }, { value: 'tr', label: 'Türkiye' }, { value: 'world', label: 'Yurt dışı' }];
const opens = { target: '_blank', rel: 'noopener noreferrer' };
const SECTION = { component: 'section' };
const CURRENT_MONTH = { label: 'Bu ay', tone: 'accent' };

/** How near a fair is, beside a small square that catches the eye. */
function Countdown({ countdown }) {
 return <Indicator className="fair-countdown" data-kind={countdown.kind} inline position="middle-start" radius="xs" size={10} zIndex={0}>
  <span className="fair-countdown-text">{countdown.text}</span>
 </Indicator>;
}

function Fair({ fair }) {
 const calendar = () => download(`${fair.id}.ics`, fairCalendar(fair), 'text/calendar');
 return <PlaceCard component="article" id={`fair-${fair.id}`} className="book-fair">
  <div className="book-fair-when">
   <Text className="book-fair-date">{fair.when}</Text>
   {fair.countdown && <Countdown countdown={fair.countdown} />}
  </div>
  <Title order={3}>{fair.name}</Title>
  <div className="book-fair-badges"><PlaceBadge badge={fair.badge} /></div>
  <FactList facts={[{ label: 'Yer', value: fair.place }, { label: 'Düzenleyen', value: fair.organizer }]} />
  {fair.note && <LongNote title={fair.name}><Text>{fair.note}</Text></LongNote>}
  {fair.start && <div className="book-fair-actions">
   <Button variant="default" leftSection={<IconCalendarPlus size={18} aria-hidden="true" />} onClick={calendar}>Takvime ekle</Button>
  </div>}
  {fair.sources?.length > 0 && <Text className="book-fair-sources">Kaynak: {fair.sources.map((source, index) => <React.Fragment key={source.url}>
   {index > 0 && ', '}<a href={source.url} {...opens}>{source.label}<span className="visually-hidden"> (yeni sekmede açılır)</span></a>
  </React.Fragment>)}</Text>}
 </PlaceCard>;
}

const FairList = ({ fairs }) => <div className="book-fair-list">{fairs.map(fair => <Fair key={fair.id} fair={fair} />)}</div>;

export default function BookFairsPage() {
 const [scope, setScope] = useState('all');
 const today = todayInIstanbul();
 const { open, months, undated } = useMemo(() => fairTimeline(data.fairs, scope, today), [scope, today]);
 const hasTimeline = open.length > 0 || months.length > 0;
 return <div className="book-fairs-page">
  <header className="book-fairs-intro">
   <Title order={1}>Kitap fuarları</Title>
   <Text>{data.intro}</Text>
   <Text className="book-fairs-updated">Bilgiler {longDay(data.checkedAt)} tarihinde kontrol edildi.</Text>
  </header>
  <SegmentedControl className="book-fairs-scope" value={scope} onChange={value => setScope(String(value))} data={SCOPES} aria-label="Hangi fuarlar gösterilsin?" />

  {hasTimeline ? <Timeline className="fair-timeline" active={open.length ? 0 : -1} bulletSize={18}>
   {open.length > 0 && <Timeline.Item key="open" {...SECTION} aria-labelledby="fairs-open">
    <Title order={2} id="fairs-open">Şu an açık</Title>
    <FairList fairs={open} />
   </Timeline.Item>}
   {months.map(month => <Timeline.Item key={month.key} {...SECTION} aria-labelledby={`fairs-${month.key}`}>
    <div className="fair-month-head">
     <Title order={2} id={`fairs-${month.key}`}>{month.label}</Title>
     <Text className="fair-month-count">{month.countLabel}</Text>
     {month.current && <PlaceBadge badge={CURRENT_MONTH} />}
    </div>
    <FairList fairs={month.fairs} />
   </Timeline.Item>)}
  </Timeline> : <Text>Bu seçimde yaklaşan fuar yok.</Text>}

  {undated.length > 0 && <section aria-labelledby="fairs-undated" className="book-fairs-section">
   <Title order={2} id="fairs-undated">Tarihi henüz açıklanmayanlar</Title>
   <Text>Bu fuarlar her yıl düzenleniyor, ama bu yılın tarihleri henüz duyurulmadı.</Text>
   <FairList fairs={undated} />
  </section>}

  {data.notes?.length > 0 && <section aria-labelledby="fairs-notes" className="book-fairs-section">
   <Title order={2} id="fairs-notes">Bilmen gerekenler</Title>
   <ul>{data.notes.map(note => <li key={note}>{note}</li>)}</ul>
  </section>}
 </div>;
}
