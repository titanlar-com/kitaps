// Every word the core shows a reader, in one place (ADR 003, K8, done on the owner's word on
// 9 November 2026). The rest of a screen's words belong to its screen model. The product is in
// Turkish only, so there is no translation layer here: this is one module, not a catalogue of languages.

export const STATE_LABELS = { onemli: 'Favori', alinacak: 'Alınacak', alindi: 'Satın alındı', okunuyor: 'Okunuyor', okundu: 'Okundu', araverildi: 'Ara verdim', birakildi: 'Bıraktım' };

export const VIEW_TEXT = {
 books: { label: 'Kitaplar', heading: 'Tüm kitaplar' },
 queue: { label: 'Sıram', heading: 'Okuma sıram' },
 collections: { label: 'Kümeler', heading: 'Kitap kümeleri' },
 bookstores: { label: 'Kitapçılar', heading: 'Kitapçılar', description: 'İstanbul\'da strateji, işletme ve düşünce kitapları için gezilecek kitapçılar, adresleri ve önerilen rotalar.' },
 fairs: { label: 'Kitap fuarları', heading: 'Kitap fuarları', description: 'Türkiye\'de ve dünyada yaklaşan kitap fuarları, tarihleri, yerleri ve kaynaklarıyla.' },
 notes: { label: 'Notlar ve kaynaklar', heading: 'Kaynaklar ve notlar' },
 favorites: { label: 'Favoriler', heading: 'Favorilerim' },
 owned: { label: 'Kitaplığım', heading: 'Kitaplığım' },
};

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const READING_WARNINGS = {
 pageBeyondTotal: 'Kaldığın sayfa, toplam sayfadan büyük.',
 totalTooSmall: 'Toplam sayfa en az 1 olmalı.',
 finishedBeforeStarted: 'Bitiş tarihi, başlama tarihinden önce olamaz.',
};

export const WORK_TEXT = { read: 'Metni oku', doi: 'DOI kaydını aç', publisher: 'Yayın sayfasını aç', article: 'Makale', essay: 'Deneme' };

export const TRANSLATION_TEXT = {
 original: 'Türkçe eser',
 originalNote: 'Türkçe yazılmış özgün eser. Bu baskı için çevirmen gerekmez.',
 available: 'Türkçe var',
 availableResearched: 'Türkçe baskı iki bağımsız araştırma aşamasında doğrulandı. Künye bilgilerini kitap ayrıntısında karşılaştır.',
 unavailable: 'Türkçe yok',
 uncertain: 'Türkçe belirsiz',
 formatNotResearched: format => `${format}: Türkçe çevirisi araştırılmadı. Özgün metin yayın bilgisindeki bağlantıda.`,
 availableFromNote: 'Türkçe baskı, kaynak listesinin doğrulanmış çeviri notunda kayıtlı. Künye bilgilerini kitap ayrıntısında karşılaştır.',
 availableFromRecord: 'Türkçe baskı kaydı bulundu. Çevirmen ve ISBN bilgilerini kitap ayrıntısında karşılaştır.',
 notYetVerified: 'Türkçe baskı henüz doğrulanamadı. Bu, çevirisi olmadığı anlamına gelmez. Varsa gösterilen kapak uluslararası baskıya aittir.',
};

export const STORE_TEXT = {
 open: 'Açık',
 closed: 'Kapandı',
 unverified: 'Doğrulanmadı',
 suggested: 'Öneri',
 trip: number => `${number}. gezi`,
 draftSteps: ['Seç', 'Sırala', 'Kaydet'],
};

export const FAIR_TEXT = {
 noDate: 'Tarih açıklanmadı',
 confirmed: 'Resmî kaynakta var',
 listed: 'Fuar listesinde var',
 expected: 'Tarih bekleniyor',
 lastDay: 'Bugün son gün',
 closesTomorrow: 'Yarın kapanıyor',
 closesIn: days => `Kapanışa ${days} gün var`,
 startsTomorrow: 'Yarın başlıyor',
 startsIn: days => `${days} gün sonra başlıyor`,
};

export const SYNC_TEXT = {
 storageUnreadable: 'Tarayıcının yerel eşitleme alanı okunamadı ya da dolu; GitHub’dan okunan durum gösterilemedi.',
 repositoryNotReady: 'Durum deposu henüz hazırlanmadı.',
 unsafeFileWaiting: 'GitHub durum dosyası güvenli biçimde okunamadı. Değişiklikler cihazda bekliyor.',
 unsafeFile: 'GitHub durum dosyası güvenli biçimde okunamadı.',
 readFailed: 'GitHub durumu okunamadı.',
 reviewFailed: 'Bu cihazın kayıtları GitHub’dakiyle karşılaştırılamadı. Sayfaya dönünce yeniden denenecek. O zamana kadar hiçbir şey gönderilmez.',
 tokenRejected: 'GitHub anahtarı reddetti: süresi dolmuş ya da kitaps-state için yazma izni kaldırılmış olabilir. Anahtarı kaldırıp yeni bir anahtarla bu cihazı yeniden bağla.',
 storageUnwritable: 'Tarayıcının yerel eşitleme alanına yazılamadı.',
 missingFileWaiting: 'Durum deposu ya da dosyası bulunamadı. Değişiklikler cihazda bekliyor.',
 syncFailedQueued: 'Eşitleme tamamlanamadı. Değişiklikler cihazda kuyrukta ve otomatik olarak yeniden denenecek.',
 readFromCache: 'GitHub durumu okundu. Bağlı olmayan cihaz GitHub’ın önbellek kopyasını okur. Bu kopya en çok beş dakika gecikebilir.',
 readOnlyCurrent: 'GitHub durumu salt okunur olarak güncel.',
 pendingSoon: 'Değişiklikler cihazda. İlk değişiklikten 30 saniye sonra toplu gönderilecek.',
 pendingConnect: 'Değişiklikler cihazda kuyrukta; GitHub’a göndermek için bu cihazı bağla.',
 current: 'GitHub durumu güncel.',
 mergeNeeded: 'Bu cihazdaki bazı kayıtları başka bir cihaz farklı kaydetmiş. Seçimini yapınca gönderilecek.',
 connected: 'Bu cihaz bağlandı. Değişiklikleri artık GitHub’a gönderilecek.',
 choiceSending: 'Seçimin kaydedildi. Değişiklikler şimdi gönderiliyor.',
 choiceWaiting: 'Seçimin kaydedildi. Değişiklikler bu cihaz bağlanınca gönderilecek.',
 choiceSaved: 'Seçimin kaydedildi.',
 writing: 'Değişiklikler GitHub’a yazılıyor.',
 synced: 'GitHub ile eşitlendi.',
 reading: 'GitHub durumu okunuyor.',
 checkingToken: 'GitHub anahtarı doğrulanıyor.',
 keyNotStored: 'Anahtar bu tarayıcıya kaydedilemedi.',
 keyCheckFailed: 'GitHub anahtarı doğrulanamadı. Anahtar kaydedilmedi.',
 keyChecked: 'Anahtar doğrulandı. Bu cihazın kayıtları GitHub’dakiyle karşılaştırılıyor.',
 keyRemoved: 'Yazma anahtarı bu cihazdan kaldırıldı; GitHub durumu salt okunur.',
 keyNotRemoved: 'Anahtar tarayıcıdan kaldırılamadı.',
 pendingAfterReview: 'Değişiklikler cihazda. Bu cihazın kayıtları GitHub’dakiyle karşılaştırıldıktan sonra gönderilecek.',
 rateLimitedRead: retry => `GitHub istek sınırına ulaşıldı; ${retry} sonrasında yeniden denenecek.`,
 rateLimitedWrite: retry => `GitHub istek sınırına ulaşıldı. Değişiklikler kuyrukta, ${retry} sonrasında gönderilecek.`,
 sendingPending: pending => `Bu cihazda bekleyen ${pending} değişiklik şimdi gönderiliyor.`,
 keyCannotWrite: (repository, owner) => `Bu anahtar ${repository} deposuna yazamıyor. Anahtarın sahibi (Resource owner) ${owner} olmalı, Repository access bölümünde ${repository} seçili ve Contents izni Read and write olmalı. Kuruluş onayı bekleyen anahtar da yazamaz. Anahtar kaydedilmedi.`,
 keyTooBroad: (owner, repository) => `Yalnız ince ayarlı (fine-grained) ve yalnız ${owner}/${repository} deposuna yetkili bir anahtar kabul edilir. Anahtar kaydedilmedi.`,
};
