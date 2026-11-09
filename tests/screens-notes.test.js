import test from 'node:test';
import assert from 'node:assert/strict';
import { backupRefusedText, backupRestoredText, noteTable, notesScreen } from '../src/screens/notes.js';

// A screen model is a plain function: facts in, the screen's words and composition out (ADR 003, K6).
const originLabels = { atlas: 'Atlas', local: 'Yerel', kitaps: 'Kitaps', entrepreneurship: 'Girişim', foundations: 'Temel', preparation: 'Hazırlık', children: 'Çocuk', shelf: 'Raf', originals: 'Özgün', founders: 'Kurucu', managerprep: 'Aday', managerareas: 'Alan', shelfphotos: 'Foto', peker: 'Peker', stoic: 'Stoa' };
const counts = { atlasEntries: 10, localBooks: 11, kitapsRecords: 12, entrepreneurshipBooks: 13, foundationalBooks: 14, preparationRecommendations: 15, childrenLibraryBooks: 16, shelfReviewBooks: 17, originalSourceWorks: 18, managementFounderWorks: 19, managerProgramBooks: 20, managerAreaBooks: 21, shelfPhotoBooks: 22, pekerVideoBooks: 23, stoicBooks: 24 };
const screen = (extra = {}) => notesScreen({ counts, total: 500, originLabels, notes: 'Giriş\n\n## Bir *vurgu*\nBirinci gövde\n\n## İki\nİkinci', ...extra });

test('the coverage panel lists every source, then the merged catalogue', () => {
 const { coverage } = screen();
 assert.equal(coverage.title, 'Birleşimin kapsamı');
 assert.deepEqual(coverage.rows.map(row => [row.label, row.value]), [
  ['Atlas', '10 liste kaydı'], ['Yerel', '11 kitap'], ['Kitaps', '12 künye kaydı'], ['Girişim', '13 kitap'], ['Temel', '14 kitap'], ['Hazırlık', '15 kitap'],
  ['Çocuk', '16 kitap'], ['Raf', '17 kitap'], ['Özgün', '18 kitap ve makale'], ['Kurucu', '19 kitap'], ['Aday', '20 kitap'], ['Alan', '21 kitap'], ['Foto', '22 kitap'], ['Peker', '23 kitap'], ['Stoa', '24 kitap'],
  ['Birleşik katalog', '500 benzersiz eser'],
 ]);
 assert.deepEqual(coverage.badges, Object.keys(originLabels));
});

test('a later source with no books leaves its line out, and an early one keeps it', () => {
 const later = Object.fromEntries(['childrenLibraryBooks', 'shelfReviewBooks', 'originalSourceWorks', 'managementFounderWorks', 'managerProgramBooks', 'managerAreaBooks', 'shelfPhotoBooks', 'pekerVideoBooks', 'stoicBooks'].map(key => [key, 0]));
 const labels = screen({ counts: { ...counts, ...later, atlasEntries: 0 } }).coverage.rows.map(row => row.label);
 assert.deepEqual(labels, ['Atlas', 'Yerel', 'Kitaps', 'Girişim', 'Temel', 'Hazırlık', 'Birleşik katalog']);
 assert.equal(screen({ counts: { ...counts, atlasEntries: 0 } }).coverage.rows[0].value, '0 liste kaydı');
 assert.equal(screen({ counts: { ...counts, stoicBooks: undefined } }).coverage.rows.some(row => row.label === 'Stoa'), false);
});

test('the backup panel names its two ways and the file it saves', () => {
 assert.deepEqual(screen().backup, { title: 'Kişisel kitaplığını yedekle', download: { text: 'Kişisel yedeğimi indir', file: 'kitaplik-kisisel-yedek.json' }, restore: 'Yedekten aktar' });
});

test('the data panel names its downloads and the source link', () => {
 assert.deepEqual(screen().fullData, { title: 'Tam veri ve kaynaklar', catalog: { text: 'Tüm kataloğu indir', file: 'kitaplik-tum-veri.json' }, notes: { text: 'Kaynak notlarını indir', file: 'kitaps-kaynak-notlari.md' }, sourceLink: 'Kaynak kod ve veri arşivi' });
});

test('a restored backup says what came back, and the queue only when it held one', () => {
 const backup = { marks: { a: 1, b: 2 }, personal: { reading: { a: {} }, queue: ['a', 'b', 'c'] }, hasQueue: true };
 assert.equal(backupRestoredText(backup), '2 kitabın işaretleri ve 1 okuma kaydı içe aktarıldı. Okuma sırası 3 kitapla geri yüklendi.');
 assert.equal(backupRestoredText({ ...backup, hasQueue: false }), '2 kitabın işaretleri ve 1 okuma kaydı içe aktarıldı.');
});

test('a refused backup says why, and anything unknown reads as unreadable', () => {
 assert.equal(backupRefusedText('unreadable'), 'Dosya okunamadı. Bu siteden dışa aktarılmış bir JSON dosyası seç.');
 assert.equal(backupRefusedText('newer'), 'Bu yedek sitenin daha yeni bir sürümünde alınmış. Sayfayı yenileyip yeniden dene. Kayıtların değişmedi.');
 assert.equal(backupRefusedText('other-file'), 'Bu dosya kişisel yedek değil. "Kişisel yedeğimi indir" düğmesiyle aldığın dosyayı seç.');
 assert.equal(backupRefusedText(undefined), backupRefusedText('unreadable'));
 assert.equal(backupRefusedText('something-else'), backupRefusedText('unreadable'));
});

test('the source file is cut at its headings, and the part before the first is the introduction', () => {
 const { sources } = screen();
 assert.equal(sources.title, 'Kaynak dosyanın tamamı');
 assert.deepEqual(sources.sections, [
  { title: 'Dosyaya giriş', body: 'Giriş\n\n' },
  { title: 'Bir vurgu', body: 'Birinci gövde\n\n' },
  { title: 'İki', body: 'İkinci' },
 ]);
});

test('a notes table finds its number column, whatever it is called', () => {
 for (const label of ['#', 'No', 'no.', 'Sıra', ' kod ']) assert.equal(noteTable([label, 'Eser']).idIndex, 0, label);
 assert.equal(noteTable(['Yazar', 'Eser']).idIndex, -1);
});

test('the title column is the Turkish name when there is one, then the first after the number', () => {
 assert.equal(noteTable(['#', 'Yazar', 'Türkçe Ad']).first, 2);
 assert.equal(noteTable(['Kitap Adı', 'Yazar']).first, 0);
 assert.equal(noteTable(['Başlık', 'Yazar']).first, 0);
 assert.equal(noteTable(['#', 'Yazar']).first, 1);
 assert.equal(noteTable(['Yazar', 'Tür']).first, 0);
});

test('an edition with no Turkish name falls back to its original name', () => {
 const table = noteTable(['Türkçe Ad', 'Orijinal Ad']);
 assert.equal(table.titleColumn('Yönetmek'), 0);
 for (const missing of ['Baskı yok', 'Doğrulanamadı', 'doğrulanmadı', '—']) assert.equal(table.titleColumn(missing), 1, missing);
 assert.equal(noteTable(['Türkçe Ad', 'Yazar']).titleColumn('Baskı yok'), 0);
 assert.equal(noteTable(['Eser', 'Özgün Ad']).titleColumn('—'), 1);
});

test('long fields take the whole width of a card, and a field with no heading has a name', () => {
 const table = noteTable(['Eser', 'Açıklama', 'Yazar', 'Gerekçe', 'Uyarı', 'Değerlendirme', 'Not', 'Neden']);
 assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(table.isWide), [true, false, true, true, true, true, true]);
 assert.equal(table.isWide(99), false);
 assert.equal(table.fallbackLabel, 'Bilgi');
});
