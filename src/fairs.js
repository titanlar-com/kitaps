// Book fair calendar helpers (data/book-fairs.json, BookFairsPage.jsx). Dates are calendar days
// in ISO form; "today" is the Istanbul calendar day, whatever zone the device is in.
import { SITE_URL } from './site.js';

// Calendar events carry the site's host, so the address is written in one place (src/site.js).
const UID_HOST = new URL(SITE_URL).host;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const parts = iso => { const [year, month, day] = iso.split('-').map(Number); return { year, month, day }; };

export function todayInIstanbul(now = new Date()) {
 return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** "12–20 Aralık 2026", "28 Kasım – 6 Aralık 2026" or "30 Aralık 2026 – 3 Ocak 2027". */
export function formatRange(start, end) {
 if (!start) return 'Tarih açıklanmadı';
 const a = parts(start), b = parts(end || start);
 const day = value => `${value.day} ${MONTHS[value.month - 1]}`;
 if (start === (end || start)) return `${day(a)} ${a.year}`;
 if (a.year !== b.year) return `${day(a)} ${a.year} – ${day(b)} ${b.year}`;
 if (a.month !== b.month) return `${day(a)} – ${day(b)} ${b.year}`;
 return `${a.day}–${b.day} ${MONTHS[b.month - 1]} ${b.year}`;
}

/** Splits the fairs into those open on the given day, those still to come, and those with no dates. */
export function fairsFrom(fairs, today) {
 const dated = fairs.filter(fair => fair.start).sort((x, y) => x.start.localeCompare(y.start) || x.name.localeCompare(y.name, 'tr'));
 return {
  open: dated.filter(fair => fair.start <= today && (fair.end || fair.start) >= today),
  coming: dated.filter(fair => fair.start > today),
  undated: fairs.filter(fair => !fair.start).sort((x, y) => x.name.localeCompare(y.name, 'tr')),
 };
}

export function groupByMonth(fairs) {
 const groups = [];
 for (const fair of fairs) {
  const { year, month } = parts(fair.start);
  const label = `${MONTHS[month - 1]} ${year}`;
  if (groups.at(-1)?.label !== label) groups.push({ key: fair.start.slice(0, 7), label, fairs: [] });
  groups.at(-1).fairs.push(fair);
 }
 return groups;
}

const icsText = value => String(value).replace(/\\/g, '\\\\').replace(/[,;]/g, match => `\\${match}`).replace(/\n/g, '\\n');
const dayAfter = iso => { const date = new Date(`${iso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); };
const compact = iso => iso.replaceAll('-', '');

/** An iCalendar file with the fair as one all-day event, or null while its dates are unknown. */
export function fairCalendar(fair, now = new Date()) {
 if (!fair.start) return null;
 const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
 const lines = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kitaplik//Kitap fuarlari//TR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
  `UID:${fair.id}-${fair.start}@${UID_HOST}`, `DTSTAMP:${stamp}`,
  `DTSTART;VALUE=DATE:${compact(fair.start)}`, `DTEND;VALUE=DATE:${compact(dayAfter(fair.end || fair.start))}`,
  `SUMMARY:${icsText(fair.name)}`,
  `LOCATION:${icsText([fair.venue, fair.city].filter(Boolean).join(', '))}`,
  ...(fair.note ? [`DESCRIPTION:${icsText(fair.note)}`] : []),
  ...(fair.sources?.[0]?.url ? [`URL:${fair.sources[0].url}`] : []),
  'END:VEVENT', 'END:VCALENDAR',
 ];
 return `${lines.join('\r\n')}\r\n`;
}
