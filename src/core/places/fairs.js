import { FAIR_TEXT, MONTHS } from '../text.js';
// The book fair calendar (data/book-fairs.json), worked out for its screen (ADR 003, K14). Dates
// are calendar days in ISO form; "today" is the Istanbul calendar day, whatever zone the device is in.
const parts = iso => { const [year, month, day] = iso.split('-').map(Number); return { year, month, day }; };

export function todayInIstanbul(now = new Date()) {
 return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** "12–20 Aralık 2026", "28 Kasım – 6 Aralık 2026" or "30 Aralık 2026 – 3 Ocak 2027". */
export function formatRange(start, end) {
 if (!start) return FAIR_TEXT.noDate;
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

const FAIR_BADGES = Object.freeze({
 confirmed: Object.freeze({ label: FAIR_TEXT.confirmed, tone: 'ok' }),
 listed: Object.freeze({ label: FAIR_TEXT.listed, tone: 'neutral' }),
 expected: Object.freeze({ label: FAIR_TEXT.expected, tone: 'accent' }),
});

/** Where a fair's date comes from, in words, or null for a status the page does not know. */
export const fairBadge = status => (Object.hasOwn(FAIR_BADGES, status) ? FAIR_BADGES[status] : null);

const DAY_MS = 86_400_000;
const NEAR_DAYS = 30;
// Read at noon UTC, so a calendar day is always a whole number of days from another.
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);

/** How near a fair is, in words: while it is open, and in the last month before it starts. */
export function fairCountdown(fair, today) {
 if (!fair.start) return null;
 const end = fair.end || fair.start;
 if (end < today) return null;
 if (fair.start <= today) {
  const left = daysBetween(today, end);
  return { kind: 'open', text: left === 0 ? FAIR_TEXT.lastDay : left === 1 ? FAIR_TEXT.closesTomorrow : FAIR_TEXT.closesIn(left) };
 }
 const until = daysBetween(today, fair.start);
 if (until > NEAR_DAYS) return null;
 return { kind: 'soon', text: until === 1 ? FAIR_TEXT.startsTomorrow : FAIR_TEXT.startsIn(until) };
}

const IN_SCOPE = {
 all: () => true,
 tr: fair => fair.country === 'Türkiye',
 world: fair => fair.country !== 'Türkiye',
};

/** The calendar for one scope (all, tr, world): open fairs, coming fairs by month, undated fairs. */
export function fairTimeline(fairs, scope, today) {
 const shown = fair => ({
  ...fair,
  when: formatRange(fair.start, fair.end),
  place: [fair.venue, fair.city, fair.country !== 'Türkiye' && fair.country].filter(Boolean).join(', '),
  badge: fairBadge(fair.status),
  countdown: fairCountdown(fair, today),
 });
 const { open, coming, undated } = fairsFrom(fairs.filter(IN_SCOPE[scope]), today);
 const months = groupByMonth(coming).map(month => ({
  ...month,
  count: month.fairs.length,
  countLabel: `${month.fairs.length} fuar`,
  current: month.key === today.slice(0, 7),
  fairs: month.fairs.map(shown),
 }));
 return { open: open.map(shown), months, undated: undated.map(shown), isEmpty: !open.length && !months.length && !undated.length };
}
