import { displayTitle } from '../core/catalog/translation.js';
import { STATE_LABELS } from '../core/text.js';

// The Sıram screen: its words and what each row shows (ADR 003, K6). A plain function of what
// queueView knows, so a new design can keep it or write its own without touching the core.
function rowModel(row, index) {
  const title = displayTitle(row.book);
  return {
    id: row.id,
    book: row.book,
    read: row.read,
    title,
    author: row.book.author,
    position: row.position,
    positionLabel: `${row.position}. sırada`,
    next: index === 0,
    eyebrow: index === 0 ? 'Sıradaki kitabın' : null,
    marks: row.marks.map(id => ({ id, label: STATE_LABELS[id] })),
    progress: row.progress && {
      sentence: `${row.progress.totalPages} sayfadan ${row.progress.page} tanesi okundu.`,
      share: `%${row.progress.percent}`,
      percent: row.progress.percent,
      label: `${title}: okuma ilerlemesi`,
    },
    moveUp: { label: `${title}: sırada yukarı taşı`, disabled: !row.canMoveUp },
    moveDown: { label: `${title}: sırada aşağı taşı`, disabled: !row.canMoveDown },
    remove: `${title}: sıradan çıkar`,
    record: { text: 'Okuma kaydım', label: `Okuma kaydım: ${title}` },
    // What a screen reader hears after a move (by direction) or a removal.
    moved: { [-1]: `${title} ${row.position - 1}. sıraya taşındı.`, 1: `${title} ${row.position + 1}. sıraya taşındı.` },
    removed: `${title} sıradan çıkarıldı.`,
  };
}

export const queueScreen = ({ rows, free, full }) => ({
  empty: rows.length ? null : { title: 'Bir sonraki kitabına yer aç.', body: 'Katalogdan en fazla beş kitap seç. Her kartta “Sırama ekle” düğmesi var.', browse: 'Kitap seç' },
  count: full ? `Sıran dolu. En çok ${rows.length} kitap sıraya girebilir.` : `Sırada ${rows.length} kitap var. ${free} kitaplık yerin kaldı.`,
  browse: full ? 'Kataloğa dön' : 'Sırama kitap seç',
  rows: rows.map(rowModel),
});
