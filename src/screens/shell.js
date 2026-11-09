import { displayTitle } from '../core/catalog/translation.js';
import { HEADER_VIEWS, VIEWS, viewById } from '../views.js';
import { childrenShelf } from './catalog.js';

// The page frame around every screen: its words and what it shows (ADR 003, K6). Plain functions
// of the core's facts, so a new design can keep them or write its own without touching the core.

// Counts read as Turkish numbers ("1.019"), as in the reading band.
const countText = new Intl.NumberFormat('tr-TR').format;
const CHILDREN_NAME = 'Kızım için';

/** The close button's name wherever the page does not give its own. */
export const CLOSE_LABEL = 'Kapat';

export function shellScreen({ view, filters, favoriteCount, ownedCount, updated, personalSaved }) {
  const onChildrenShelf = view === 'books' && childrenShelf(filters);
  const counts = { favorites: favoriteCount, owned: ownedCount };
  const shelfLabel = id => `${viewById[id].label}: ${countText(counts[id])} kitap`;
  const shortcut = id => ({ label: shelfLabel(id), current: view === id, count: counts[id] > 0 ? countText(counts[id]) : null });
  return {
    skipLink: 'İçeriğe geç',
    brand: 'Kitaplık · filtresiz ana sayfa',
    tabs: { label: 'Kitaplık bölümleri', items: HEADER_VIEWS.map(id => ({ id, label: viewById[id].label })) },
    hideOwned: 'Satın aldıklarımı gösterme',
    backToTop: 'Başa dön',
    shortcuts: {
      label: 'Hızlı erişim',
      children: { label: CHILDREN_NAME, current: onChildrenShelf },
      favorites: shortcut('favorites'),
      owned: shortcut('owned'),
    },
    storageWarning: personalSaved ? null : 'Bu tarayıcı kişisel kayıtlarını kalıcı olarak saklayamıyor. Notlar bölümünden yedeğini indirebilirsin.',
    headings: { queue: viewById.queue.heading, collections: viewById.collections.heading, notes: viewById.notes.heading },
    loading: { fairs: 'Kitap fuarları yükleniyor…', bookstores: 'Kitapçılar yükleniyor…', notes: 'Notlar yükleniyor…' },
    modals: { sync: 'Cihazlar arası eşitleme', guide: 'Çeviri seçme rehberi', close: CLOSE_LABEL },
    footer: {
      current: viewById[view]?.label,
      groups: [
        { id: 'sections', title: 'Bölümler', items: VIEWS.filter(v => v.footer === 'sections').map(v => ({ id: v.id, label: v.label, current: view === v.id })) },
        { id: 'shortcuts', title: 'Kısayollar', items: [
          { id: 'children', label: CHILDREN_NAME, current: onChildrenShelf },
          ...VIEWS.filter(v => v.footer === 'shortcuts').map(v => ({ id: v.id, label: v.id in counts ? shelfLabel(v.id) : v.label, current: view === v.id })),
        ] },
        { id: 'tools', title: 'Araçlar', items: [
          { id: 'palette', label: 'Hızlı ara' },
          { id: 'guide', label: 'Çeviri rehberi' },
          { id: 'sync', label: 'Cihaz eşitleme' },
          { id: 'export', label: 'Kitapları JSON indir' },
        ] },
      ],
      meta: { name: 'Kitaplık', created: 'Yaratılış: 27 Eylül 2026', updated: `Güncelleme: ${updated}` },
    },
  };
}

export const footerMenuScreen = () => ({ title: 'Menü', links: 'Bütün bölümler ve araçlar' });

export const libraryToastScreen = ({ book, owned }) => ({
  title: owned ? 'Kitaplığa eklendi' : 'Kitaplıktan çıkarıldı',
  book: displayTitle(book),
  undo: 'Geri al',
  close: 'Bildirimi kapat',
});

export const themePanelScreen = () => ({
  title: 'Renk düzeni',
  appearance: 'Görünüm',
  modes: [{ value: 'dark', label: 'Koyu' }, { value: 'light', label: 'Açık' }],
  wood: 'Ağaç',
});

const WOOD_WORDS = {
  ceviz: { label: 'Ceviz', note: 'Koyu kahve zemin, pirinç sarısı vurgu' },
  mese: { label: 'Meşe', note: 'İsli zeytin zemin, yaprak yeşili vurgu' },
  akasya: { label: 'Akasya', note: 'Kızıl siyah zemin, turkuaz vurgu' },
};
export const woodWords = id => WOOD_WORDS[id];
