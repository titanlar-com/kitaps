import React, { useMemo, useState } from 'react';
import { Badge, Button, SegmentedControl, Text, Title } from '@mantine/core';
import { IconCalendarPlus } from '@tabler/icons-react';
import data from '../../data/book-fairs.json';
import { fairCalendar, fairsFrom, formatRange, groupByMonth, todayInIstanbul } from '../fairs';
import { download } from '../download';
import './BookFairsPage.css';

// The book fair calendar (data/book-fairs.json). Finished fairs leave the list by themselves;
// a date only counts as announced when the organiser or the fair's own site gives it.
const STATUS = {
 confirmed: { label: 'Resmî kaynakta var', color: 'teal' },
 listed: { label: 'Fuar listesinde var', color: 'gray' },
 expected: { label: 'Tarih bekleniyor', color: 'brand' },
};
const SCOPES = [{ value: 'all', label: 'Tümü' }, { value: 'tr', label: 'Türkiye' }, { value: 'world', label: 'Yurt dışı' }];
const inScope = scope => fair => scope === 'all' || (scope === 'tr') === (fair.country === 'Türkiye');
const opens = { target: '_blank', rel: 'noopener noreferrer' };
const longDay = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

function Fair({ fair, open = false }) {
 const status = STATUS[fair.status];
 const place = [fair.venue, fair.city, fair.country !== 'Türkiye' && fair.country].filter(Boolean).join(', ');
 const calendar = () => download(`${fair.id}.ics`, fairCalendar(fair), 'text/calendar');
 return <article id={`fair-${fair.id}`} className="book-fair" data-open={open || undefined}>
  <Text className="book-fair-date">{formatRange(fair.start, fair.end)}</Text>
  <div className="book-fair-head">
   <Title order={3}>{fair.name}</Title>
   {open && <Badge color="teal">Şu an açık</Badge>}
   {status && <Badge color={status.color}>{status.label}</Badge>}
  </div>
  {place && <Text className="book-fair-place">{place}</Text>}
  {fair.organizer && <Text className="book-fair-place">Düzenleyen: {fair.organizer}</Text>}
  {fair.note && <Text>{fair.note}</Text>}
  <div className="book-fair-actions">
   {fair.start && <Button variant="default" leftSection={<IconCalendarPlus size={18} />} onClick={calendar}>Takvime ekle</Button>}
  </div>
  {fair.sources?.length > 0 && <Text className="book-fair-sources">Kaynak: {fair.sources.map((source, index) => <React.Fragment key={source.url}>
   {index > 0 && ', '}<a href={source.url} {...opens}>{source.label}<span className="visually-hidden"> (yeni sekmede açılır)</span></a>
  </React.Fragment>)}</Text>}
 </article>;
}

export default function BookFairsPage() {
 const [scope, setScope] = useState('all');
 const today = todayInIstanbul();
 const { open, coming, undated } = useMemo(() => fairsFrom(data.fairs.filter(inScope(scope)), today), [scope, today]);
 const months = groupByMonth(coming);
 return <div className="book-fairs-page">
  <header className="book-fairs-intro">
   <Title order={1}>Kitap fuarları</Title>
   <Text>{data.intro}</Text>
   <Text className="book-fairs-updated">Bilgiler {longDay(data.checkedAt)} tarihinde kontrol edildi.</Text>
  </header>
  <SegmentedControl className="book-fairs-scope" value={scope} onChange={value => setScope(String(value))} data={SCOPES} aria-label="Hangi fuarlar gösterilsin?" />

  {open.length > 0 && <section aria-labelledby="fairs-open" className="book-fairs-section">
   <Title order={2} id="fairs-open">Şu an açık</Title>
   <div className="book-fair-list">{open.map(fair => <Fair key={fair.id} fair={fair} open />)}</div>
  </section>}

  {months.map(month => <section key={month.key} aria-labelledby={`fairs-${month.key}`} className="book-fairs-section">
   <Title order={2} id={`fairs-${month.key}`}>{month.label}</Title>
   <div className="book-fair-list">{month.fairs.map(fair => <Fair key={fair.id} fair={fair} />)}</div>
  </section>)}

  {!open.length && !months.length && <Text>Bu seçimde yaklaşan fuar yok.</Text>}

  {undated.length > 0 && <section aria-labelledby="fairs-undated" className="book-fairs-section">
   <Title order={2} id="fairs-undated">Tarihi henüz açıklanmayanlar</Title>
   <Text>Bu fuarlar her yıl düzenleniyor, ama bu yılın tarihleri henüz duyurulmadı.</Text>
   <div className="book-fair-list">{undated.map(fair => <Fair key={fair.id} fair={fair} />)}</div>
  </section>}

  {data.notes?.length > 0 && <section aria-labelledby="fairs-notes" className="book-fairs-section">
   <Title order={2} id="fairs-notes">Bilmen gerekenler</Title>
   <ul>{data.notes.map(note => <li key={note}>{note}</li>)}</ul>
  </section>}
 </div>;
}
