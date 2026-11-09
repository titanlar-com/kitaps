import { normalize } from '../core/catalog/query.js';
import { ORIGIN_LABELS, QUALITY_LABELS, STATE_LABELS, formatDay } from '../core/text.js';

// The filter sheet: its words and what it shows (ADR 003, K6). A new design can keep this model
// or write its own without touching the core.

/** How many options a searchable list adds at a time. */
export const CHOICE_STEP = 12;

const SECTIONS = [
  { id: 'categories', title: 'Kategoriler', hint: 'Konusuna göre keşfet' },
  { id: 'authors', title: 'Yazarlar', hint: 'Bir yazarın kitaplarını bul' },
  { id: 'collections', title: 'Kümeler', hint: 'Seçkiler ve okuma rotaları' },
  { id: 'states', title: 'Okuma durumum', hint: 'Favoriler ve okuma kayıtları' },
  { id: 'editions', title: 'Baskı ve kaynak', hint: 'Künye bilgisi ve kaynaklar' },
  { id: 'years', title: 'Yıl ve ödül', hint: 'Yayın aralığı ve FT ödülleri' },
  { id: 'added', title: 'Eklenme tarihi', hint: 'Kitaplığa hangi gün eklendi' },
];
// What the headings are about: the subject of a book, the reader's own records, and the book's details.
const SECTION_GROUPS = [
  { id: 'topic', title: 'Konu', ids: ['categories', 'authors', 'collections'] },
  { id: 'reader', title: 'Okuma kayıtlarım', ids: ['states'] },
  { id: 'record', title: 'Künye ve tarih', ids: ['editions', 'years', 'added'] },
];
const AWARDS = ['Kazanan', 'Kısa liste', 'Uzun liste'];
const AWARD_YEARS = Array.from({ length: 22 }, (_, i) => String(2026 - i));

const entries = object => Object.entries(object).map(([value, label]) => ({ value, label }));
const same = value => ({ value, label: value });
const labelFor = (options, values) => values.map(v => options.find(o => o.value === v)?.label || v);
// A year range said in words: both limits, or the one that was given.
const yearRange = (from, to) => from !== '' && to !== '' ? `${from} ile ${to} arası` : from !== '' ? `${from} ve sonrası` : `${to} ve öncesi`;

/** One list of choices, from what the reader typed and how far the list is open. */
export function choicesScreen({ title, options, value, query, limit, searchable = false }) {
  const wanted = normalize(query);
  const matches = options.filter(option => normalize(option.label).includes(wanted));
  const visible = searchable ? matches.slice(0, limit) : matches;
  // Keep selected items removable even when the search or result limit hides them.
  const retained = options.filter(option => value.includes(option.value) && !visible.some(v => v.value === option.value));
  return {
    title,
    count: value.length ? `${value.length} seçili` : `${options.length} seçenek`,
    search: searchable ? { label: `${title} ara`, placeholder: `${title} ara` } : null,
    retained: retained.length > 0 ? { hint: 'Diğer seçimlerin', options: retained } : null,
    visible,
    noMatch: matches.length === 0 ? 'Eşleşme yok. Aramayı kısaltmayı dene.' : null,
    more: searchable && matches.length > CHOICE_STEP ? {
      text: matches.length > limit ? `${matches.length - limit} seçenek daha göster` : 'Daha az göster',
      limit: limit >= matches.length ? CHOICE_STEP : limit + CHOICE_STEP,
    } : null,
  };
}

export function filtersScreen({ filters: f, section, count, catalog, authors, shelf }) {
  const categoryOptions = catalog.categories.map(c => ({ value: c.id, label: c.label }));
  const collectionOptions = catalog.collections.map(c => ({ value: c.id, label: c.short }));
  const groupOptions = catalog.groups.filter(g => !f.collections.length || f.collections.includes(g.collectionId)).map(g => ({ value: g.id, label: `${catalog.collections.find(c => c.id === g.collectionId)?.short} · ${g.title}` }));
  // Each day books entered the library, newest first, with how many of the books in this view arrived that day.
  const addedCounts = shelf.reduce((counts, book) => book.addedAt ? { ...counts, [book.addedAt]: (counts[book.addedAt] || 0) + 1 } : counts, {});
  const addedOptions = Object.keys(addedCounts).sort().reverse().map(day => ({ value: day, label: `${formatDay(day)} · ${addedCounts[day]} kitap` }));
  const selected = {
    categories: labelFor(categoryOptions, f.categories),
    states: f.states.map(s => STATE_LABELS[s]),
    authors: f.authors,
    collections: [...labelFor(collectionOptions, f.collections), ...f.groups.map(id => catalog.groups.find(g => g.id === id)?.title || id), ...(f.shared ? ['Birden fazla kümede'] : [])],
    editions: [...f.qualities.map(v => QUALITY_LABELS[v]), ...f.origins.map(v => ORIGIN_LABELS[v]), ...(f.hasEdition ? ['Künye bilgisi var'] : [])],
    years: [...f.awards, ...f.awardYears.map(y => `FT ${y}`), ...(f.yearMin !== '' || f.yearMax !== '' ? [yearRange(f.yearMin, f.yearMax)] : [])],
    added: f.addedDates.map(formatDay),
  };
  const selectionCount = Object.values(selected).reduce((sum, values) => sum + values.length, 0);
  const invalidYears = f.yearMin !== '' && f.yearMax !== '' && Number(f.yearMin) > Number(f.yearMax);
  const current = SECTIONS.find(item => item.id === section);
  const sectionRow = ({ id, title, hint }) => {
    const chosen = selected[id];
    return { id, title, detail: chosen.length ? chosen.join(', ') : hint, label: chosen.length ? `${title}: ${chosen.join(', ')}. ${chosen.length} seçim` : undefined, chosen: chosen.length > 0, count: chosen.length };
  };
  return {
    header: { back: section ? 'Filtre başlıklarına dön' : null, title: current?.title || 'Filtreler', close: 'Filtreleri uygulamadan kapat', intro: section ? 'Birden fazla seçim yapabilirsin.' : 'Aradığın kitapları daralt.' },
    query: f.query ? { label: 'Araman:', value: f.query } : null,
    nav: 'Filtre başlıkları',
    groups: SECTION_GROUPS.map(group => {
      const chosen = group.ids.reduce((sum, id) => sum + selected[id].length, 0);
      return { id: group.id, title: group.title, chosen: chosen > 0 ? `${chosen} seçim` : null, sections: SECTIONS.filter(item => group.ids.includes(item.id)).map(sectionRow) };
    }),
    content: {
      categories: {
        choices: { title: 'Kategoriler', options: categoryOptions },
        allMatch: f.categories.length > 1 ? { text: 'Seçili kategorilerin tümü eşleşsin', checked: f.categoryMode === 'all' } : null,
      },
      states: { choices: { title: 'Okuma durumum', options: entries(STATE_LABELS) } },
      authors: { choices: { title: 'Yazar', options: authors.map(same) } },
      collections: {
        collections: { title: 'Kitap kümesi', options: collectionOptions },
        allMatch: f.collections.length > 1 ? { text: 'Seçili kümelerin tümünde bulunsun', checked: f.collectionMode === 'all' } : null,
        groups: { title: 'Alt küme', options: groupOptions },
        shared: { text: 'Birden fazla kitap kümesinde bulunanlar', checked: f.shared },
      },
      editions: {
        qualities: { title: 'Kaynağın künye değerlendirmesi', options: entries(QUALITY_LABELS) },
        hasEdition: { text: 'Çevirmen veya yayınevi bilgisi bulunanlar', checked: f.hasEdition },
        origins: { title: 'Verinin kaynağı', options: entries(ORIGIN_LABELS) },
        hint: 'Künye değerlendirmeleri özgün kaynaktan aktarılır. Bu değerlendirmeler çevirinin kalitesini tek başına ölçmez.',
      },
      years: {
        range: { legend: 'İlk yayın yılı', from: 'En erken', to: 'En geç', none: 'Sınır yok', invalid: invalidYears ? 'En geç yıl, en erken yıldan küçük olamaz.' : null, hint: 'Aralık seçildiğinde yayın yılı bilinmeyen kitaplar gösterilmez.' },
        awards: { title: 'FT ödülü', options: AWARDS.map(same) },
        awardYears: { title: 'FT ödül yılı', options: AWARD_YEARS.map(same) },
      },
      added: {
        choices: { title: 'Kitaplığa eklendiği gün', options: addedOptions },
        hint: 'Tarihler, kitabın kitaplık verisine ilk girdiği kayıttan çıkarıldı.',
      },
    },
    result: { fix: invalidYears ? 'Yıl aralığını düzelt' : null, count, unit: 'kitap eşleşiyor', selection: selectionCount > 0 ? `${selectionCount} seçim` : null },
    footer: { clear: { text: 'Temizle', disabled: !selectionCount }, apply: { text: 'Kitapları göster', disabled: invalidYears } },
  };
}
