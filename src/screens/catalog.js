import { filterCount } from '../core/catalog/query.js';
import { displayTitle, translationStatus, turkishEdition } from '../core/catalog/translation.js';
import { workFormat } from '../core/catalog/workFormat.js';
import { ORIGIN_LABELS, QUALITY_LABELS, STATE_LABELS, formatDay } from '../core/text.js';
import { viewById } from '../views.js';

// The catalogue screen and its parts: their words and what each one shows (ADR 003, K6). Plain
// functions of the core's facts, so a new design can keep them or write its own.
const SORT_OPTIONS = [
  { value: 'reading', label: 'Okuma önceliği' },
  { value: 'shared', label: 'En çok kesişen' },
  { value: 'title', label: 'Kitap adı · A–Z' },
  { value: 'author', label: 'Yazar · A–Z' },
  { value: 'newest', label: 'Yayın yılı · yeni' },
  { value: 'added', label: 'Eklenme · yeni' },
  { value: 'saved', label: 'Favoriler önce' },
];
const SEARCH_LABELS = { owned: 'Kitaplığımda ara', favorites: 'Favorilerimde ara' };
const SHELF_TITLES = { owned: 'Kitaplığımdakiler', favorites: 'Favorilerim' };
const isShelf = view => view === 'owned' || view === 'favorites';

// Filters other than the ones named are empty (the search text included).
export const onlyFilters = (filters, keys) => !filters.query.trim() && Object.entries(filters).every(([key, value]) => keys.includes(key) || ['query', 'categoryMode', 'collectionMode'].includes(key) || (Array.isArray(value) ? !value.length : typeof value === 'boolean' ? !value : value === ''));
export const childrenShelf = filters => filters.categories.length === 1 && filters.categories[0] === 'children';

// A single collection or subset is named instead of the generic heading.
function resultsTitle({ filters, view, collections, groups }) {
  if (childrenShelf(filters)) return 'Kızım için';
  if (filters.collections.length === 1 && filters.groups.length <= 1 && onlyFilters(filters, ['collections', 'groups'])) {
    const collection = collections[filters.collections[0]], group = groups[filters.groups[0]];
    if (collection) return group ? `${collection.short || collection.title} · ${group.title}` : collection.title;
  }
  if (filterCount(filters)) return 'Seçtiğin kitaplar';
  return SHELF_TITLES[view] ?? 'Tüm kitaplar';
}

const countSentence = ({ total, page, pageSize }) => `${total} eser${total ? `, ${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)} arası gösteriliyor` : ''}`;
const neverFilled = ({ view, ownedCount, favoriteCount }) => (view === 'owned' && !ownedCount) || (view === 'favorites' && !favoriteCount);

export function catalogScreen({ view, filters, sort, total, page, pageSize, showsHiddenPurchases, copied, ownedCount, favoriteCount, coreCount, collections, groups }) {
  const anyFilter = filterCount(filters) > 0;
  const activeCount = filterCount({ ...filters, query: '' });
  const wholeCatalogue = view === 'books' && !anyFilter;
  return {
    shelfHeading: isShelf(view) ? viewById[view].heading : null,
    search: { label: SEARCH_LABELS[view] ?? 'Katalogda ara', placeholder: 'Kitap, yazar, çevirmen…', clear: filters.query ? 'Aramayı temizle' : null },
    filtersButton: `Filtreler${activeCount ? ` · ${activeCount}` : ''}`,
    sort: { label: 'Kitapları sırala', options: SORT_OPTIONS },
    showsReadingSummary: wholeCatalogue,
    route: wholeCatalogue ? { label: 'Nereden başlamalı?', title: 'Nereden başlamalı?', body: `${coreCount ?? ''} kitaplık çekirdek, düşünceden uygulamaya.`, action: 'Seçkiye git' } : null,
    showsAgeLibrary: view === 'books' && childrenShelf(filters) && onlyFilters(filters, ['categories']),
    showsPrioritySummary: view === 'books' && sort === 'reading',
    results: {
      title: resultsTitle({ filters, view, collections, groups }),
      order: /** @type {1 | 2} */ (isShelf(view) ? 2 : 1),
      count: countSentence({ total, page, pageSize }),
      purchasesNote: showsHiddenPurchases ? 'Satın aldığın kitaplar da listede, çünkü okuma işaretine göre süzdün.' : null,
      clear: anyFilter ? 'Temizle' : null,
      copy: copied ? 'Bağlantı kopyalandı' : 'Bağlantıyı kopyala',
    },
    empty: total ? null : neverFilled({ view, ownedCount, favoriteCount }) ? { shelf: view } : { title: 'Bu seçimde kitap yok.', body: 'Bir filtreyi kaldırabilir veya aramanı değiştirebilirsin.', clear: 'Filtreleri temizle' },
  };
}

export function activeFiltersScreen({ filters: f, categories, collections, groups }) {
  const names = { categories: id => categories[id]?.label, collections: id => collections[id]?.short, groups: id => groups[id]?.title, states: id => STATE_LABELS[id], authors: id => id, origins: id => ORIGIN_LABELS[id], awards: id => id, awardYears: id => `FT ${id}`, qualities: id => QUALITY_LABELS[id], addedDates: day => `Eklenme · ${formatDay(day)}` };
  const chips = [];
  for (const [key, name] of Object.entries(names)) for (const value of f[key]) chips.push({ id: `${key}-${value}`, label: name(value) || value, next: { ...f, [key]: f[key].filter(other => other !== value) } });
  if (f.hasEdition) chips.push({ id: 'edition', label: 'Künye bilgisi var', next: { ...f, hasEdition: false } });
  if (f.shared) chips.push({ id: 'shared', label: 'Birden fazla kümede', next: { ...f, shared: false } });
  if (f.yearMin !== '' || f.yearMax !== '') chips.push({ id: 'years', label: `Yayın: ${f.yearMin || '…'}–${f.yearMax || '…'}`, next: { ...f, yearMin: '', yearMax: '' } });
  return chips.length ? { label: 'Etkin filtreler', chips: chips.map(chip => ({ ...chip, removeLabel: `${chip.label} filtresini kaldır` })) } : null;
}

// A card names the Turkish publisher once a Turkish edition is known, and an
// article or essay names what it is and where it appeared.
function cardPublisher(book) {
  const format = workFormat(book);
  if (format) return [format.label, book.publication?.venue].filter(Boolean).join(' · ');
  return (['available', 'original'].includes(translationStatus(book).status) && turkishEdition(book)?.publisher) || book.cover?.publisher || '';
}

// Favourites, purchases and finished books have their own signs on a card.
const OWN_SIGN = ['onemli', 'alindi', 'okundu'];

export function bookCardScreen({ book, marks }) {
  const title = displayTitle(book), saved = marks.includes('onemli'), owned = marks.includes('alindi');
  return {
    title,
    read: marks.includes('okundu'),
    author: book.author || 'Yazar bilgisi kaynakta belirtilmemiş',
    age: book.childAge ? `${book.childAge} yaş` : null,
    publisher: cardPublisher(book),
    readingBadges: marks.filter(mark => !OWN_SIGN.includes(mark)).map(id => ({ id, label: STATE_LABELS[id] })),
    favorite: { pressed: saved, tooltip: saved ? 'Favorilerden çıkar' : 'Favorilerime ekle', label: `${title}: favori ${saved ? 'işaretini kaldır' : 'olarak işaretle'}` },
    owned: { pressed: owned, tooltip: owned ? 'Kitaplığımdan çıkar' : 'Satın aldım', label: `${title}: ${owned ? 'kitaplığımdan çıkar' : 'satın aldım'}` },
  };
}

export const bookPreviewScreen = ({ purpose, year, pages }) => ({
  purpose,
  facts: [...(year ? [{ label: 'İlk yayın', value: year }] : []), ...(pages ? [{ label: 'Sayfa', value: pages.pages }] : [])],
});

export function bookCoverScreen(book) {
  const { cover, author } = book, title = displayTitle(book);
  return {
    alt: cover ? `${cover.title}, ${cover.publisher}, ${cover.language === 'tr' ? 'Türkçe' : 'Uluslararası'} baskı kapağı` : null,
    openLabel: `${title} ayrıntılarını aç`,
    kind: workFormat(book)?.label ?? null,
    title,
    author,
  };
}

export const ageLibraryScreen = ({ library, groups }) => ({
  eyebrow: 'Kızım için',
  title: library.title,
  description: library.description,
  bands: library.groupIds.map(id => ({ id, label: `${groups[id].title.split(' · ')[0]} · ${groups[id].count}` })),
  all: `Tümü · ${library.count}`,
});

const number = new Intl.NumberFormat('tr-TR');
// A share under one percent keeps one decimal, so a read book never shows as %0.
const percent = share => new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: share > 0 && share < 0.01 ? 1 : 0 }).format(share);
const SUMMARY_STATS = [['read', 'Okunan'], ['reading', 'Okuyorum'], ['queued', 'Sıramda'], ['owned', 'Kitaplığım'], ['favorites', 'Favoriler']];

/** Until the first read of the saved marks answers, a device with none of its own has no numbers to show. */
export const marksAwaited = (sync, summary) => sync.status === 'loading' && !sync.lastReadAt && SUMMARY_STATS.every(([key]) => !summary[key]);

export const readingSummaryScreen = (summary, waiting = false) => ({
  title: 'Okuma özetim',
  waiting,
  sentence: waiting ? 'Okuma kayıtların getiriliyor…' : summary.read ? `${number.format(summary.total)} kitaptan ${number.format(summary.read)} tanesi okundu.` : 'Henüz okundu işaretli kitap yok.',
  share: percent(summary.readShare),
  progress: Number((summary.readShare * 100).toFixed(1)),
  progressLabel: 'Okunan oranı',
  stats: SUMMARY_STATS.map(([key, label]) => {
    const value = number.format(summary[key]);
    return { key, label, value, spoken: waiting ? `${label}: yükleniyor` : `${label}: ${value} kitap` };
  }),
});

export function prioritySummaryScreen(ranking) {
  const criteria = ranking.ordered[0]?.criteria.map(item => item.label.toLocaleLowerCase('tr')) || [];
  return {
    toggle: 'Okuma önceliğine göre sıralı',
    detail: `${criteria.length} ölçüt: ${criteria.join(', ')}. Çocuk kitapları kendi aralarında sıralanır. Satın alma, favori, okuma durumu ve kişisel sıra puanı değiştirmez.`,
  };
}

export const priorityBadgeScreen = ranking => ({
  tooltip: `${ranking.maturityLabel} · ${ranking.score}/100`,
  spoken: `Okuma önceliği: ${ranking.audience === 'children' ? 'çocuk kitapları arasında ' : ''}${ranking.rank}. sıra, 100 üzerinden ${ranking.score} puan. ${ranking.maturityLabel}.`,
  rank: `#${ranking.rank}`,
  score: ranking.score,
});

export const priorityCardScreen = ranking => ({
  eyebrow: 'OKUMA ÖNCELİĞİ',
  score: `${ranking.score} / 100`,
  place: `${ranking.audience === 'children' ? 'Çocuk kitapları arasında sıra' : 'Katalog sırası'} · ${ranking.rank}`,
  maturity: { level: ranking.maturity, label: ranking.maturityLabel },
  total: { value: ranking.score, label: `Toplam okuma önceliği: 100 üzerinden ${ranking.score}` },
  criteria: ranking.criteria.map(item => ({
    id: item.id,
    label: item.label,
    points: `+${item.points.toFixed(1)}`,
    value: item.normalized * 100,
    progressLabel: `${item.label}: yüzde ${Math.round(item.normalized * 100)}, katkı ${item.points.toFixed(1)} puan`,
    evidence: item.evidence,
  })),
  reasons: ranking.reasons?.length > 0 ? { title: 'En güçlü gerekçeler', items: ranking.reasons } : null,
  confidence: { label: 'Puan güveni:', value: `%${ranking.confidence}` },
  policy: `Kural sürümü: ${ranking.policyVersion}. Puan yalnızca katalog, kitap ilişkileri veya kural sürümü değiştiğinde yeniden hesaplanır. Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez.`,
});

// What Favoriler and Kitaplığım say before the first book is on them.
const EMPTY_SHELVES = {
  favorites: { title: 'Henüz favori kitap yok.', body: 'Bir kitabın kartındaki kalp düğmesine bastığında kitap burada görünür.' },
  owned: { title: 'Kitaplığın ilk kitabını bekliyor.', body: 'Bir kitabın kartında “Satın aldım” düğmesine bastığında kitap burada görünür. Okumaya başladığın kitaplar da buraya gelir.' },
};
export const shelfEmptyScreen = shelf => ({ ...EMPTY_SHELVES[shelf], browse: 'Kataloğa git' });

export const pageSizeLabel = size => `${size} / sayfa`;

export function paginationScreen({ page, total, count, pageSize }) {
  const start = count ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, count);
  return {
    label: 'Katalog sayfaları',
    range: `${start}–${end}`,
    rangeOf: ` · ${count} kitap içinde`,
    status: { lead: 'Sayfa ', page, tail: ` / ${total}` },
    sizeSelect: 'Sayfa başına kitap',
    showsNavigation: total > 1,
    previous: 'Önceki sayfa',
    next: 'Sonraki sayfa',
    pageLabel: target => `${target}. sayfaya git`,
    pageOf: (shown, pages) => `Sayfa ${shown} / ${pages}`,
    jump: { open: 'Sayfaya git', field: `Sayfa · 1–${total}`, fieldLabel: 'Gidilecek sayfa', submit: 'Git' },
  };
}

const SHORT_CATEGORY_NAMES = { strategy: 'Strateji', management: 'Yönetim', systems: 'Sistemler', psychology: 'Psikoloji', finance: 'Finans', literature: 'Edebiyat', children: 'Çocuk', history: 'Tarih', philosophy: 'Felsefe', communication: 'İletişim', productivity: 'Üretkenlik', marketing: 'Pazarlama', enterprise: 'Girişim', innovation: 'Yenilik', technology: 'Teknoloji', economy: 'Ekonomi', politics: 'Siyaset', biography: 'Biyografi', science: 'Bilim', climate: 'İklim', ethics: 'Etik' };

export const categoryPillScreen = ({ id, label, compact = false }) => ({
  text: compact ? (SHORT_CATEGORY_NAMES[id] || label) : label,
  label: `${label} kitaplarını göster`,
});

export const sourceBadgeScreen = id => ({ label: ORIGIN_LABELS[id] });
