import { sharePercent } from '../core/catalog/collections.js';

// The Kümeler screen: its words and what each card shows (ADR 003, K6). A plain function of the
// core's facts, so a new design can keep it or write its own without touching the core.
const readSentence = ({ total, read, done }) => done ? `${total} kitabın tamamı okundu.` : read ? `${total} kitaptan ${read} tanesi okundu.` : 'Bu kümeden henüz okunan kitap yok.';

function cardModel(card) {
  const { collection: c, total, previews, share, percent, done, groups } = card;
  return {
    id: c.id,
    mark: c.mark,
    title: c.title,
    previews,
    percent,
    done,
    meta: `${total} kitap, ${groups.length} alt küme`,
    readSentence: readSentence(card),
    share: sharePercent(share),
    progressLabel: `${c.title}: okunan oranı`,
    booksButton: { text: 'Bu kümedeki kitaplar', label: `Bu kümedeki kitaplar: ${c.title}` },
    badges: c.tag ? [c.tag, ...(done ? ['Tamamlandı'] : [])] : [],
    description: c.description,
    context: [['Okuma amacı:', c.context?.purpose], ['Seçim ölçütü:', c.context?.criterion]].filter(([, text]) => text).map(([label, text]) => ({ label, text })),
    verdict: c.context?.verdict || null,
    note: c.note,
    sourceCount: c.originalCount === undefined ? null : `Kaynak listesinde ${c.originalCount} kayıt var.`,
    groups: groups.map(group => ({ id: group.id, title: group.title, count: group.count, label: `${group.title}: ${group.count} kitap` })),
    sourceLink: c.source ? { href: c.source, text: 'Özgün liste' } : null,
  };
}

export const collectionsScreen = ({ cards }) => ({
  search: { label: 'Kümeler arasında ara', placeholder: 'TIME, çocuk, strateji…' },
  status: `${cards.length} küme bulundu.`,
  empty: cards.length ? null : { title: 'Bu aramayla eşleşen küme yok.', body: 'Başka bir kelime deneyebilir ya da aramayı temizleyip bütün kümelere dönebilirsin.', clear: 'Aramayı temizle' },
  cards: cards.map(cardModel),
});
