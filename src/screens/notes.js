import { ORIGIN_LABELS } from '../core/text.js';
import { normalize } from '../core/catalog/query.js';

// The notes and sources screen: its words and what its panels show (ADR 003, K6). The source file
// itself (data/sources/kitaplar.md) stays data. Each line below is [origin, count, what is counted].
const ALWAYS_LISTED = [['atlas', 'atlasEntries', 'liste kaydı'], ['local', 'localBooks', 'kitap'], ['kitaps', 'kitapsRecords', 'künye kaydı'], ['entrepreneurship', 'entrepreneurshipBooks', 'kitap'], ['foundations', 'foundationalBooks', 'kitap'], ['preparation', 'preparationRecommendations', 'kitap']];
const LISTED_WHEN_ANY = [['children', 'childrenLibraryBooks', 'kitap'], ['shelf', 'shelfReviewBooks', 'kitap'], ['originals', 'originalSourceWorks', 'kitap ve makale'], ['founders', 'managementFounderWorks', 'kitap'], ['managerprep', 'managerProgramBooks', 'kitap'], ['managerareas', 'managerAreaBooks', 'kitap'], ['shelfphotos', 'shelfPhotoBooks', 'kitap'], ['peker', 'pekerVideoBooks', 'kitap'], ['stoic', 'stoicBooks', 'kitap']];

const BACKUP_REFUSED = {
 unreadable: 'Dosya okunamadı. Bu siteden dışa aktarılmış bir JSON dosyası seç.',
 newer: 'Bu yedek sitenin daha yeni bir sürümünde alınmış. Sayfayı yenileyip yeniden dene. Kayıtların değişmedi.',
 'other-file': 'Bu dosya kişisel yedek değil. "Kişisel yedeğimi indir" düğmesiyle aldığın dosyayı seç.',
};

/** Why a backup was not taken in. Anything the backup reader did not name is an unreadable file. */
export const backupRefusedText = kind => BACKUP_REFUSED[kind] ?? BACKUP_REFUSED.unreadable;

/** What a backup brought back. */
export const backupRestoredText = backup => `${Object.keys(backup.marks).length} kitabın işaretleri ve ${Object.keys(backup.personal.reading).length} okuma kaydı içe aktarıldı.${backup.hasQueue ? ` Okuma sırası ${backup.personal.queue.length} kitapla geri yüklendi.` : ''}`;

const coverageRow = ({ counts }) => ([origin, count, unit]) => ({ id: origin, label: ORIGIN_LABELS[origin], value: `${counts[count]} ${unit}` });

const sectionOf = (text, index) => (index === 0
 ? { title: 'Dosyaya giriş', body: text }
 : { title: text.split('\n')[0].replace(/^## /, '').replace(/\*/g, ''), body: text.slice(text.indexOf('\n') + 1) });

export function notesScreen({ counts, total, notes }) {
 const row = coverageRow({ counts });
 const parts = { coverage: 'Birleşimin kapsamı', backup: 'Kişisel kitaplığını yedekle', sync: 'Cihaz eşitleme', fullData: 'Tam veri ve kaynaklar', sources: 'Kaynak dosyanın tamamı' };
 return {
  contents: { label: 'Bu sayfada', sync: parts.sync, items: [parts.coverage, parts.backup, parts.sync, parts.fullData, parts.sources] },
  coverage: {
   title: parts.coverage,
   rows: [...ALWAYS_LISTED.map(row), ...LISTED_WHEN_ANY.filter(([, count]) => counts[count] > 0).map(row), { id: 'merged', label: 'Birleşik katalog', value: `${total} benzersiz eser` }],
   badges: Object.keys(ORIGIN_LABELS),
  },
  backup: { title: parts.backup, download: { text: 'Kişisel yedeğimi indir', file: 'kitaplik-kisisel-yedek.json' }, restore: 'Yedekten aktar' },
  fullData: { title: parts.fullData, catalog: { text: 'Tüm kataloğu indir', file: 'kitaplik-tum-veri.json' }, notes: { text: 'Kaynak notlarını indir', file: 'kitaps-kaynak-notlari.md' }, sourceLink: 'Kaynak kod ve veri arşivi' },
  sources: { title: parts.sources, sections: notes.split(/(?=^## )/m).map(sectionOf) },
 };
}

/** How a Markdown table of the source file becomes cards, read from its column headings. */
export function noteTable(labels) {
 const idIndex = labels.findIndex(label => /^(#|no\.?|sıra|kod)$/i.test(label.trim()));
 const preferred = labels.findIndex(label => /turkce ad|^kitap$|^eser$|^baslik$|kitap adi/.test(normalize(label)));
 const original = labels.findIndex(label => /orijinal ad|ozgun ad/.test(normalize(label)));
 const first = preferred >= 0 ? preferred : idIndex === 0 ? 1 : 0;
 return {
  idIndex,
  first,
  /** The column that titles a card, given the text of that row's `first` column. */
  titleColumn: firstText => (original >= 0 && /baski yok|dogrulanamadi|dogrulanmadi|^—$/.test(normalize(firstText)) ? original : first),
  isWide: index => /not|aciklama|gerekce|neden|uyari|degerlendirme/.test(normalize(labels[index] || '')),
  fallbackLabel: 'Bilgi',
 };
}
