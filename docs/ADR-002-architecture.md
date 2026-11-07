# ADR 002: Sürdürülebilir mimari ve test önce değişiklik

Tarih: 7 Kasım 2026. Durum: kabul edildi, uygulama aşamalı sürüyor.

## Sorun

Proje sahibi, sonradan eklenecek özelliklerin mevcut içeriği, yapıyı ve görünümü bozmadan eklenebilmesini istedi. Bağımsız bir mimari inceleme şu boşlukları kanıtıyla buldu:

1. **Testler dosya yerine bağlıydı.** `tests/ui-structure.test.js` ve `tests/ui-gates.test.js`, `App.jsx` dosyasının metninde arama yapıyordu. Davranışı değiştirmeyen bir taşıma bu testleri bozuyordu. Görünüm ise yalnız ölçülen özelliklerle korunuyordu.
2. **`App.jsx` her şeyi bir arada tutuyordu.** 384 satırda dokuz bileşen, katalog verisinin hazırlanması, tema, 14 durum değişkeni ve test edilmemiş iş kuralları vardı. Örneğin "okunuyor" işaretlenince başlangıç tarihi bu dosyadaki bir işleyicide dolduruluyor.
3. **Sayfa listesi yedi yerde tekrar ediyor.** Yeni bir sayfa için `library.js`, `seo.js`, sekmeler, alt menü ve testler ayrı ayrı değişiyor.
4. **Kişisel verinin tek bir sahibi yok.** Okuma işaretleri ve sıra, `App.jsx` ile `reading.js` arasında paylaşılıyor ve Notlar sayfası ham durum ayarlayıcılarını alıyor.
5. **GitHub bağlantısı iki kopya.** `GitHubStateRepository.ts` ile `routeRegistry.ts` aynı istek, kodlama ve hata eşlemesini ayrı ayrı yapıyor, iki kopya şimdiden farklılaşmış.

## Karar

Uygulama bir **modüler monolit** olarak kalır: tek bir Vite uygulaması, tek bir yayın, ama özellikler birbirinden net sınırlarla ayrılır. Yeni bir yönlendirme kütüphanesi, genel bir durum deposu ya da çeviri katmanı eklenmez. Ürün yalnız Türkçe ve mevcut adres sözleşmesi testlerle korunuyor.

Desenler yalnız somut bir sorunu çözdüğünde kullanılır:

- **Saf işlevler** iş kurallarını taşır ve `node:test` ile sınanır. Okuma önceliğindeki ViewModel (ADR 001) türetilmiş liste durumu için örnektir.
- **Kancalar (hooks)** React görünümünü veriye bağlar: `useGitHubStateSync`, `useRouteRegistry` ve ileride `usePersonalState`.
- **Repository** yalnız uzak veri için kullanılır: `state.json` ve `routes.json`. Statik JSON verisi (kitapçılar, fuarlar, notlar) sayfasıyla birlikte gecikmeli yüklenir ve bir Repository arkasına konmaz.
- Her özellik için ayrı ViewModel sınıfı açılmaz. Gerekçe çıkarsa, karar bu kayda eklenir.

**Değişmeyecek yollar:** `src/ranking`, `src/state` ve `src/catalog.json`. ADR 001, AGENTS.md, testler ve veri betikleri bu yolları kullanıyor. `library.js`, `seo.js` ve içe aktardıkları modüller Node'da da çalışmalı, çünkü site haritası ve statik SEO betikleri onları kullanıyor. Bu yüzden bu modüller JSX ve CSS içe aktarmaz.

## Test önce kuralı

Her aşama bütün testler geçerek kendi başına yayına çıkar. Taşımadan önce davranış testle sabitlenir. Bir denetim, koruduğu kodla birlikte taşınır ve hiçbir zaman gevşetilmez. Uygulayıcı, kendi değişikliğinin tek onaylayıcısı olmaz: anlamlı aşamalar bağımsız incelemeden geçer.

## Aşamalar

0. **Davranışı sabitleme (tamamlandı).**
   - `tests/views.test.js`: her sayfanın adresi, eski bağlantıları ve başlığı.
   - `tests/e2e/structure.spec.js`:
     - üst menü, alt çubuk ve menünün erişilebilirlik ağacı;
     - her sayfanın hem adresinden hem menüden açılması.
1. **Saf taşımalar (tamamlandı).**
   - Tema, katalog verisi, simgeler, kapak, kart, kitap ayrıntısı, kümeler, etkin filtreler ve sonuç başlığı `src/app/` altına kelimesi kelimesine taşındı.
   - `App.jsx` 384 satırdan 199 satıra indi.
   - Dosya metnini okuyan denetimler artık `App.jsx` ile `src/app/` dosyalarının hepsini birlikte okuyor. Bu yüzden aynı sıkılıkta kaldılar.
2. **Tek sayfa kaydı (tamamlandı).**
   - Sayfaların kimliği, adresi, etiketi, başlığı, SEO metni ve yeri `src/views.js` tablosunda.
   - Adres çözümü (`library.js`), sayfa başlıkları (`seo.js`), üst menü sekmeleri, alt menü bölümleri ve alt çubuktaki bölüm adı bu tablodan okunuyor.
   - Yeni bir sayfa artık tabloya bir satır, uygulamaya bir simge ve bir panel olarak ekleniyor.
   - Üst menü en çok dört sekme taşır, kural `tests/views.test.js` ile korunuyor.
3. **İş kurallarını test önce çıkarma (başladı).**
   - Tamamlananlar:
     - `catalogListing` (`src/app/listing.js`): raf, süzme, sıralama ve sayfa kesimi.
     - `stampReadingDate` (`src/reading.js`): "okunuyor" ve "okundu" işaretinde tarihin bir kez yazılması.
     - `longDay` (`src/dates.js`): üç kopya tek yere indi.
     - Fuar takviminin site adresi artık `SITE_URL` sabitinden türetiliyor.
     - Testler `tests/app-logic.test.js` ve `tests/dates.test.js` içinde.
   - Kalanlar aşağıda.
   - Çıkarılacak parçalar:
     - `catalogListing` (rafa göre liste, sayfa sınırı, boş durum);
     - `applyMark` (işaret ve otomatik okuma tarihleri);
     - `usePersonalState`.
   - Ortak tarih ve dış bağlantı yardımcıları tek yerde toplanacak, ölü kod temizlenecek.
4. **Özellik klasörleri.**
   - `src/features/{catalog,reading,bookstores,fairs,notes}` oluşacak.
   - Sınırları koruyan bir içe aktarma denetimi eklenecek.
   - Tokenlar ve katalog ızgarası `styles.css` içinde kalır.
5. **Ortak GitHub bağlantısı.**
   - `state.json` ve `routes.json` tek bir iç istemciyi paylaşacak.
   - Veri kaybı riski en yüksek adım bu olduğu için ayrı incelemeden geçecek ve eşitleme testleri bütün profillerde çalışacak.

6. **Eşitleme deposunun sağlığı (başladı).**
   - `titanlar-com/kitaps-state` uygulamanın veritabanı gibi çalışıyor. Depo silinir, özel yapılır, arşivlenir ya da dosyası bozulursa cihazlar sessizce kendi kopyalarıyla kalıyordu.
   - `src/state/health.ts` depoyu anahtarsız bir okuyucu gibi okur. `state.json` ve `routes.json` dosyalarını uygulamanın kendi okuma kurallarıyla denetler. Katalogda olmayan kitapların kayıtlarını ve listede olmayan kitapçılara giden rotaları uyarı olarak bildirir.
   - `npm run check:state` raporu Türkçe yazar. CI her gönderimde `--warn-only` ile çalıştırır: sorun, çalışmada bir hata notu olarak görünür ama yayını durdurmaz, çünkü site her cihazın kendi kopyasıyla çalışmaya devam eder.
   - Denetim yalnız okur ve zamanlanmış bir iş olarak kurulmaz.
   - Testler `tests/state-health.test.js` içinde ve gerçek ağ yerine sahte bir GitHub kullanıyor.

## Açık kararlar

- **"Bugün"ün tanımı:** kişisel okuma tarihleri cihazın gününü, fuar takvimi İstanbul'un gününü kullanır. Gerekçe: okuma kişinin yaşadığı gündür, fuarlar Türkiye saatine göre açılıp kapanır.
- **Önbellek parametresi:** `routes.json` okunurken eklenen `?t=` parametresinin raw.githubusercontent önbelleğini aşmadığı ADR 001'de yazıyor. 5. aşamada iki istemci aynı okuma kuralına bağlanacak.
- **Görsel karşılaştırma:** ekran görüntüsü tabanları işletim sistemine göre farklı çıktığı için Mac'te üretilmeyecek. Tabanlar CI ile aynı Linux ortamında, ayrı ve incelenmiş bir değişiklikle eklenecek. O zamana kadar görünüm, ölçülen özellik testleri ve erişilebilirlik ağacı testleriyle korunuyor.
