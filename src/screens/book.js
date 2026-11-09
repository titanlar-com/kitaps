import { displayTitle, isOriginalTurkish, recommendedTranslation, translationStatus, turkishEdition, turkishMeaning } from '../core/catalog/translation.js';
import { publicationLine, publicationLinkLabel, workFormat } from '../core/catalog/workFormat.js';
import { QUEUE_LIMIT, emptyReading, progressPercent, readingErrors, readingJourney } from '../core/personal/reading.js';
import { STATE_LABELS, WORK_TEXT, formatDay } from '../core/text.js';

// The book page: its words and what each part shows (ADR 003, K6). Plain functions of the core's
// facts, so a new design can keep them or write its own without touching the core. What still
// lives outside the core (a reading guide, a page count) comes in as a fact.

/** How many more suggestions one press of the button shows. */
export const RELATED_STEP = 4;

const PAGE_MARKS = ['onemli', 'alinacak', 'alindi'];
const READING_MARKS = ['okunuyor', 'araverildi', 'birakildi', 'okundu'];
// The two personal marks a reader wants to see on the cover itself.
const RIBBON_MARKS = ['okundu', 'alindi'];
const markButtons = (keys, marks) => keys.map(key => ({ key, label: STATE_LABELS[key], pressed: marks.includes(key) }));
const NOT_VERIFIED = 'Henüz doğrulanmadı';
const COVER_ELSEWHERE = ' Gösterilen kapak uluslararası baskıya aittir.';

export const bookSheetScreen = () => ({ title: 'Kitap ayrıntısı', grip: 'Kitap ayrıntısını kapat. Aşağı da sürükleyebilirsin.' });

function membershipModel(id, book, collections, groups) {
  const memberships = book.memberships.filter(m => m.collectionId === id);
  const source = memberships.find(m => m.source);
  return {
    id,
    title: collections[id].title,
    groups: [...new Set(memberships.map(m => groups[m.groupId].title))].join(' · '),
    awards: memberships.filter(m => m.award).map(m => ({ key: m.groupId, text: `${m.awardYear} · ${m.award}` })),
    roles: [...new Set(memberships.map(m => m.role).filter(Boolean))],
    source: source ? { href: source.source, text: 'Özgün kaynağı aç' } : null,
  };
}

export function bookDetailScreen({ book, marks, catalog, collections, groups }) {
  const title = displayTitle(book);
  return {
    back: 'Önceki kitaba dön',
    title,
    // Only a known original title is shown under a Turkish title.
    originalTitle: translationStatus(book).status === 'available' && book.originalTitle && book.originalTitle !== title ? book.originalTitle : '',
    author: book.author || 'Yazar bilgisi belirtilmemiş',
    facts: [['İlk yayın', book.years.join(', ')], ['Önerilen yaş', book.childAge], ['Kitaplığa eklendi', formatDay(book.addedAt)]].filter(([, value]) => value).map(([label, value]) => ({ label, value })),
    coverCaption: book.cover ? { text: book.cover.scope || (book.cover.language === 'tr' ? 'Türkçe baskı kapağı' : 'Uluslararası baskı kapağı'), link: { href: book.cover.sourceUrl, text: 'Kapaktaki baskıyı incele' } } : null,
    marks: markButtons(PAGE_MARKS, marks),
    childCaution: book.childCaution ? { title: 'Ebeveyn notu', text: book.childCaution } : null,
    sections: { personal: 'Okuma kaydım ve kişisel notlarım', sources: `Kaynaklar ve küme üyelikleri · ${book.collectionIds.length}` },
    note: { show: 'Devamını göster', hide: 'Kısalt' },
    memberships: book.collectionIds.map(id => membershipModel(id, book, collections, groups)),
    tags: book.tags.length > 0 ? `Kaynak dosyanın etiketleri: ${book.tags.map(tag => catalog.sourceTags[tag]).join(' · ')}.` : null,
  };
}

/** The ribbons drawn on a cover, and the same thing said after the title for a screen reader. */
export function stateMarksScreen(marks = []) {
  const shown = RIBBON_MARKS.filter(state => marks.includes(state));
  return {
    ribbons: shown.map(state => ({ state, label: STATE_LABELS[state] })),
    summary: shown.length ? `Durum: ${shown.map(state => STATE_LABELS[state]).join(', ')}.` : null,
  };
}

export const relatedCardScreen = ({ book, marks }) => ({
  title: displayTitle(book),
  read: marks.includes('okundu'),
  badges: [...(marks.includes('alindi') ? ['Kitaplığında'] : []), ...(marks.includes('okundu') ? ['Okundu'] : [])],
});

export function readingPurposeScreen({ book, guide }) {
  const meaning = turkishMeaning(book);
  return {
    eyebrow: 'OKUMA AMACI',
    title: 'Ne için okumalıyım?',
    meaning: meaning ? { label: 'Türkçe anlamı:', text: meaning } : null,
    purpose: guide.purpose,
    kind: `${guide.kind}${guide.kind === 'Konuya göre okuma amacı' ? ' · Kitabın konu etiketlerinden önerilmiştir; ayrıntılı içerik incelemesi değildir.' : ' · Editoryal öneri'}`,
    sources: guide.sources,
  };
}

export function bookDiscoveryScreen({ book, catalog, guide, matches, scope, visible }) {
  const [type, id] = scope.split('|');
  const route = catalog.readingGuides.routes.find(r => r.category === id);
  return {
    route: { title: 'Okuma rotan', intro: 'Bu sıralama hazırlık ve derinleşme önerisidir. Kitapları anlamak için zorunlu bir önkoşul değildir.' },
    phases: [
      { value: 'before', title: `Önce ne okumalıyım? · ${guide.before.length}`, links: guide.before, empty: 'Doğrudan bu kitapla başlayabilirsin. Bu rota için bir ön okuma önermiyoruz.' },
      { value: 'after', title: `Sonra nasıl derinleşirim? · ${guide.after.length}`, links: guide.after, empty: 'Bu rota için belirli bir devam kitabı seçilmedi. Aşağıdaki konu kitaplarından farklı bir bakış açısı seçebilirsin.' },
      ...(guide.companions.length > 0 ? [{ value: 'companions', title: `Birlikte veya karşılaştırmalı oku · ${guide.companions.length}`, links: guide.companions, empty: null }] : []),
    ],
    heading: type === 'category' ? `${route.heading} bunları da oku` : 'Bu kümedeki diğer kitaplar',
    headingNote: 'Ortak konu ve küme üyeliklerine göre seçildi. Kitaplığındaki eserler de burada görünür.',
    scope: {
      label: 'Önerilerin konusu veya kümesi',
      options: [
        { group: 'Konular', items: book.categories.map(item => ({ value: `category|${item}`, label: catalog.categories.find(c => c.id === item).label })) },
        { group: 'Kaynak kümeleri', items: book.collectionIds.map(item => ({ value: `collection|${item}`, label: catalog.collections.find(c => c.id === item).title })) },
      ],
    },
    status: `${matches.length} başka kitap${matches.length ? ` · İlk ${Math.min(visible, matches.length)} kitap` : ''}`,
    shown: matches.slice(0, visible),
    empty: matches.length ? null : 'Bu seçimde keşfedilecek başka kitap kalmadı.',
    more: matches.length > visible ? `${RELATED_STEP} kitap daha göster` : null,
    openAll: 'Bu listeyi katalogda aç',
  };
}

const EVIDENCE = {
  research: 'Türkçe baskı iki bağımsız araştırma aşamasında doğrulandı.',
  'two-sites': 'ISBN, yayınevi ve çevirmen iki ayrı sitenin künyesiyle kontrol edildi.',
  publisher: 'Yayınevi künyesinden kontrol edildi.',
  'publisher-preview': 'Yayınevi önizlemesinden kontrol edildi.',
  bibliographic: 'Kütüphane künyesinden kontrol edildi.',
  retailer: 'Kitapçı künyesinden kontrol edildi; yayıneviyle ikinci kontrol bekliyor.',
  cover: 'Türkçe baskının kapak künyesinden alındı.',
  'source-note': 'Kaynak listesindeki doğrulanmış çeviri notundan alındı.',
};

/** An article or essay has no edition to buy: its page says where it appeared
 * and links to the text, or to its DOI record when the text is not free. */
function publicationSummary(book, format) {
  const p = book.publication;
  return {
    kind: 'publication',
    label: 'Yayın bilgisi ve metin',
    title: 'Yayın bilgisi',
    facts: [{ label: 'Tür', value: format.label }, { label: 'Yayımlandığı yer', value: publicationLine(p) }, ...(p.doi ? [{ label: 'DOI', value: p.doi }] : [])],
    note: `${format.label} olduğu için baskı ve çevirmen bilgisi yok. Türkçe çevirisi araştırılmadı.`,
    links: [
      ...(p.readUrl ? [{ href: p.readUrl, text: WORK_TEXT.read }] : []),
      ...(p.doi ? [{ href: `https://doi.org/${p.doi}`, text: WORK_TEXT.doi }] : []),
      ...(!p.readUrl && !p.doi && p.pageUrl ? [{ href: p.pageUrl, text: WORK_TEXT.publisher }] : []),
    ],
    scholar: book.format === 'article' ? { text: 'Google Akademik', query: `"${book.originalTitle || book.title}" ${book.author}` } : null,
  };
}

/** `pages`: the page count of the shown printing with where it was read, or null. */
export function editionSummaryScreen({ book, pages }) {
  const format = workFormat(book);
  if (format && book.publication) return publicationSummary(book, format);
  const status = translationStatus(book).status, original = status === 'original', known = original || status === 'available';
  const edition = known ? turkishEdition(book) : null, recommended = recommendedTranslation(book), c = book.cover;
  const evidence = edition ? (edition.basis === 'verified' ? EVIDENCE[edition.sourceType] || EVIDENCE.retailer : EVIDENCE[edition.basis]) : '';
  const otherEdition = recommended && !edition?.translators.length && recommended.publisher && recommended.publisher !== edition?.publisher;
  const coverElsewhere = c ? COVER_ELSEWHERE : '';
  const isbn = edition?.isbn || c?.isbn;
  const translator = edition?.translators.length ? edition.translators.join(' · ') : recommended ? `${recommended.translators.join(' · ')}${otherEdition ? ` (${recommended.publisher})` : ''}` : NOT_VERIFIED;
  return {
    kind: 'edition',
    label: 'Yayınevi, çevirmen ve kitabı bul',
    title: original ? 'Baskı bilgisi' : 'Baskı ve çevirmen',
    issue: book.sourceIssue ? { title: 'Baskı seçerken dikkat', text: book.sourceIssue.note } : null,
    facts: [
      { label: 'Yayınevi', value: edition?.publisher || c?.publisher || NOT_VERIFIED },
      ...(!original ? [{ label: 'Çevirmen', value: translator }] : []),
      ...(isbn ? [{ label: 'ISBN', value: isbn }] : []),
      { label: 'Sayfa sayısı', value: pages ? pages.pages : NOT_VERIFIED },
    ],
    evidence: evidence ? `${evidence}${c && edition?.isbn && c.isbn && edition.isbn !== c.isbn ? ' Kapak farklı bir baskıya ait.' : ''}` : null,
    pageSource: pages ? { before: 'Sayfa sayısı bu ISBN’in', link: { href: pages.sourceUrl, text: pages.sourceName }, after: 'kaydından.' } : null,
    translatorNote: !edition?.translators.length && recommended?.basis === 'source-note' ? 'Çevirmen, kaynak listesinin güven puanıyla önerdiği çeviriden alındı.' : null,
    statusNote: status === 'unavailable' ? `Kaynaklara göre Türkçe baskısı yok.${coverElsewhere}` : status === 'unverified' ? `Türkçe baskı doğrulanamadı.${coverElsewhere}` : null,
    sourceLink: edition?.sourceUrl ? { href: edition.sourceUrl, text: 'Künye kaynağını aç' } : null,
    shopping: { query: [edition?.title || book.title, book.author, edition?.publisher, edition?.isbn].filter(Boolean).join(' '), google: 'Google Alışveriş', images: 'Google Görseller' },
    amazon: !known ? { text: 'Özgün baskı · Amazon', query: [book.originalTitle || book.title, book.author].filter(Boolean).join(' ') } : null,
  };
}

const UNCHECKED_TRANSLATOR = 'Çevirmen henüz doğrulanmadı';

function checkedEdition(e, book) {
  const publisherVerified = ['publisher', 'publisher-preview'].includes(e.sourceType);
  const bibliographic = e.sourceType === 'bibliographic';
  const twoSites = Boolean(e.secondSourceUrl);
  return {
    badge: { text: publisherVerified ? 'Yayınevi künyesi kontrol edildi' : bibliographic ? 'Kütüphane künyesi kontrol edildi' : twoSites ? 'İki sitenin künyesiyle kontrol edildi' : 'Kitapçı künyesi · ikinci kontrol bekliyor', confirmed: publisherVerified || twoSites },
    translators: e.translators.length ? e.translators.join(' · ') : UNCHECKED_TRANSLATOR,
    work: `${e.title} · ${e.publisher}`,
    isbn: e.isbn ? `ISBN ${e.isbn}` : null,
    lines: [
      ...(e.translationEditors ? [`Çeviri editörleri: ${e.translationEditors.join(' · ')}`] : []),
      ...(e.editors ? [`Editör: ${e.editors.join(' · ')}`] : []),
      ...(e.sourceLanguage ? [`Çeviri dili: ${e.sourceLanguage}`] : []),
    ],
    cover: book.cover?.isbn === e.isbn ? 'Gösterilen kapak bu ISBN’ye ait.' : book.cover ? 'Gösterilen kapak farklı bir baskıya ait; bu künye o kapağın çevirmenini doğrulamaz.' : 'Bu baskının kapağı henüz eklenmedi.',
    correction: e.correction ? { title: 'Künye düzeltildi', text: e.correction } : null,
    note: e.note || null,
    links: [
      { href: e.sourceUrl, text: publisherVerified ? 'Yayınevi kaynağını incele' : bibliographic ? 'Kütüphane kaynağını incele' : 'Kitapçı kaynağını incele' },
      ...(twoSites ? [{ href: e.secondSourceUrl, text: 'İkinci kaynağı incele' }] : []),
      ...(e.previewUrl ? [{ href: e.previewUrl, text: 'Örnek metni aç' }] : []),
    ],
    checked: `Kontrol: ${formatDay(e.checkedAt) || '28 Eylül 2026'}. Künye kontrolü çevirinin edebî veya teknik kalitesini tek başına kanıtlamaz; karşılaştırmalı metin incelemesi yapılmadı.`,
  };
}

const archiveItem = old => ({
  translator: old.translator || 'Çevirmen belirtilmemiş',
  publisher: old.publisher || 'Yayınevi belirtilmemiş',
  note: old.note || null,
  alt: old.alt ? `Arşivdeki diğer seçenek: ${old.alt.name}${old.alt.publisher ? ` · ${old.alt.publisher}` : ''}` : null,
});

export function editionGuideScreen({ book }) {
  // Translations are chosen among book editions; an article or essay has none here.
  if (isOriginalTurkish(book) || workFormat(book)) return null;
  const e = book.verifiedEdition;
  return {
    label: 'Çeviri ve baskı seçimi',
    title: 'Hangi çeviriyi okumalıyım?',
    sourcesTitle: 'Baskının kaynakları ve kontrol notları',
    edition: e ? checkedEdition(e, book) : null,
    missing: e ? null : {
      badge: UNCHECKED_TRANSLATOR,
      body: 'Bu eser için Türkçe baskı, ISBN ve çevirmen eşleştirmesi tamamlanmadı. Çeviri bir baskı seçeceksen yayınevinin künyesini ve örnek sayfalarını kontrol et.',
      coverLink: book.cover ? { href: book.cover.sourceUrl, text: 'Kapaktaki baskının sayfasını aç' } : null,
    },
    archive: book.editions.length > 0 ? {
      title: `Arşivdeki çeviri ve baskı notları · ${book.editions.length}`,
      intro: 'Aşağıdakiler önceki Kitaps kaynağının notlarıdır. İsimler ve değerlendirmeler bu alanda bağımsız olarak doğrulanmış sayılmaz. Yukarıdaki ISBN’ye bağlı düzeltmeler önceliklidir.',
      items: book.editions.map(archiveItem),
    } : null,
  };
}

export function queueButtonScreen({ id, queue, title = '' }) {
  const present = queue.includes(id), full = queue.length >= QUEUE_LIMIT, position = queue.indexOf(id) + 1;
  const label = present ? `Sıramda · ${position}. kitap. Sıramı aç` : full ? `Sıram dolu · ${QUEUE_LIMIT} kitap. Sıramı düzenle` : 'Sırama ekle';
  return { present, full, label, ariaLabel: `${title}: ${label}`, text: present ? `Sıramda · ${position}. kitap` : full ? `Sıramı düzenle · ${QUEUE_LIMIT}/${QUEUE_LIMIT}` : 'Sırama ekle' };
}

export function readingPanelScreen({ record, marks, storageError }) {
  const r = { ...emptyReading(), ...record }, percent = progressPercent(r), errors = readingErrors(r);
  return {
    record: r,
    title: 'Benim okuma kaydım',
    notice: storageError ? 'Kayıt yapılamıyor. Notlar bölümünden yedek indir.' : 'Bu kayıtlar tarayıcıya kaydedilir ve GitHub eşitlemesi bağlıysa herkese açık kitaps-state deposuna gönderilir.',
    statusTitle: 'Okuma durumu',
    marks: markButtons(READING_MARKS, marks),
    started: { label: 'Başlama tarihi' },
    finished: { label: 'Bitiş tarihi', error: errors.dates },
    page: { label: 'Kaldığım sayfa', placeholder: 'Henüz başlamadım' },
    total: { label: 'Toplam sayfa', placeholder: 'Baskına göre', error: errors.pages },
    progress: percent !== null && !errors.pages ? { pages: `${r.page} / ${r.totalPages} sayfa`, percent: `%${percent}`, value: percent, label: 'Okuma ilerlemesi' } : null,
    why: { label: 'Neden okuyorum?', description: 'Bu kitaptan ne öğrenmek veya neyi anlamak istiyorum?', placeholder: 'Bu kitabı seçme nedenim…' },
    apply: { label: 'Bundan neyi uygulayacağım?', description: 'Bitirince denemek istediğin somut bir adım.', placeholder: 'İlk uygulayacağım fikir…' },
  };
}

const JOURNEY_STEPS = { started: 'Başladım', finished: 'Bitirdim' };

// How far a reading is and when it happened, at the top of the book page.
export function readingJourneyScreen({ record }) {
  const journey = readingJourney(record);
  if (!journey.hasAny) return null;
  return {
    label: 'Okuma durumum',
    progress: journey.percent !== null ? { pages: `${journey.page} / ${journey.totalPages} sayfa`, percent: `%${journey.percent}`, value: journey.percent, label: 'Okunan sayfa oranı' } : null,
    steps: journey.steps.map(({ kind, day }) => ({ kind, label: JOURNEY_STEPS[kind], day: formatDay(day) })),
  };
}

const TRANSLATION_WORDS = {
  available: { label: 'Türkçe çeviri var', word: 'Türkçe', tooltip: 'Türkçe çevirisi var' },
  unavailable: { label: 'Türkçe çeviri yok', word: 'Türkçesi yok', tooltip: 'Türkçe çevirisi yok' },
  unverified: { label: 'Türkçe çeviri doğrulanamadı', word: 'Doğrulanmadı', tooltip: 'Çeviri durumu doğrulanmadı' },
};

export function translationStatusScreen({ book }) {
  const info = translationStatus(book);
  if (info.status === 'original') return null;
  const { label, word, tooltip } = TRANSLATION_WORDS[info.status];
  return {
    status: info.status,
    label,
    word,
    tooltip,
    ariaLabel: `${displayTitle(book)}: ${label}. Baskı bilgisi`,
    description: info.description,
    sourceLink: info.source ? { href: info.source, text: workFormat(book) && !book.verifiedEdition ? publicationLinkLabel(book.publication) : 'Baskı kaynağını aç' } : null,
  };
}

export const translationCriteriaScreen = () => ({
  intro: 'Bir çeviriyi değerlendirirken baskı künyesini, kaynak dili ve örnek metni birlikte incele.',
  steps: [
    { title: 'Baskıyı eşleştir.', body: 'Yayınevi, ISBN, çevirmen ve baskı yılını aynı künye sayfasından kontrol et. Aynı kitabın farklı kapakları farklı çeviriler olabilir.' },
    { title: 'Kaynak dil ve tam metin.', body: 'Asıl dilden mi, ara dilden mi çevrildiğini; kısaltılmış veya uyarlanmış bir metin olup olmadığını araştır.' },
    { title: 'Alan deneyimi.', body: 'Çevirmenin aynı dil, dönem ve konuda yaptığı çalışmalara bak. Teknik kitapta kavram tutarlılığı; edebiyatta anlatıcı sesi ve üslup önem taşır.' },
    { title: 'Örnek sayfaları karşılaştır.', body: 'Mümkünse aynı bölümü özgün metinle ve iki Türkçe çeviriyle oku. Anlam kaybı, eksiltme, terim kullanımı ve Türkçenin doğallığına bak.' },
    { title: 'Editoryal destek.', body: 'Dipnot, açıklama, sözlük, kaynakça ve gözden geçirilmiş baskı bilgisi aramayı kolaylaştırır. Çevirmenin ünü tek başına kalite garantisi değildir.' },
  ],
  basis: { before: 'Ölçütlerin dayanağı:', link: { href: 'https://www.atanet.org/certification/how-the-exam-is-graded/error-categories/', text: 'ATA anlam, terim ve üslup değerlendirme ölçütleri' }, after: '. Bu liste bir çevirmenin yeterliğini tek başına ölçmez.' },
});
