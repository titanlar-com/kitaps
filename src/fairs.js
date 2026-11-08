// Writes a fair as a calendar file (BookFairsPage.jsx). What the calendar shows is worked out in
// the data core (ADR 003, K14); the other names stay here for the tests that read them from here.
import { SITE_URL } from './site.js';

export { fairsFrom, formatRange, groupByMonth, todayInIstanbul } from './core/places/fairs.js';

// Calendar events carry the site's host, so the address is written in one place (src/site.js).
const UID_HOST = new URL(SITE_URL).host;
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
