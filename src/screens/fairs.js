import { NEW_TAB, sourcesLine } from './bookstores.js';

// The book fair calendar: its words and what each card shows (ADR 003, K6). The core has already
// worked out which fairs are open, coming or undated. Text from data/book-fairs.json stays data.
export const fairScopes = [{ value: 'all', label: 'Tümü' }, { value: 'tr', label: 'Türkiye' }, { value: 'world', label: 'Yurt dışı' }];
const CURRENT_MONTH = { label: 'Bu ay', tone: 'accent' };

const fairCard = fair => ({
 fair,
 id: fair.id,
 when: fair.when,
 name: fair.name,
 countdown: fair.countdown,
 badge: fair.badge,
 facts: [{ label: 'Yer', value: fair.place }, { label: 'Düzenleyen', value: fair.organizer }].filter(fact => fact.value),
 note: fair.note || null,
 calendar: fair.start ? 'Takvime ekle' : null,
 sources: sourcesLine(fair.sources),
});

export function fairsScreen({ data, timeline: { open, months, undated }, longDay }) {
 const hasTimeline = open.length > 0 || months.length > 0;
 const shownFairs = open.length + undated.length + months.reduce((sum, month) => sum + month.fairs.length, 0);
 return {
  newTab: NEW_TAB,
  title: 'Kitap fuarları',
  intro: data.intro,
  checked: `Bilgiler ${longDay(data.checkedAt)} tarihinde kontrol edildi.`,
  scope: { label: 'Hangi fuarlar gösterilsin?', options: fairScopes },
  status: `${shownFairs} fuar gösteriliyor.`,
  timeline: hasTimeline ? {
   active: open.length ? 0 : -1,
   open: open.length > 0 ? { title: 'Şu an açık', cards: open.map(fairCard) } : null,
   months: months.map(month => ({ key: month.key, label: month.label, count: month.countLabel, badge: month.current ? CURRENT_MONTH : null, cards: month.fairs.map(fairCard) })),
  } : null,
  empty: hasTimeline ? null : 'Bu seçimde yaklaşan fuar yok.',
  undated: undated.length > 0 ? { title: 'Tarihi henüz açıklanmayanlar', body: 'Bu fuarlar her yıl düzenleniyor, ama bu yılın tarihleri henüz duyurulmadı.', cards: undated.map(fairCard) } : null,
  notes: data.notes?.length > 0 ? { title: 'Bilmen gerekenler', items: data.notes } : null,
 };
}
