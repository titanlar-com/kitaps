# ADR 004: Hareket tasarımının mimarisi

Tarih: 8 Kasım 2026. Durum: kabul edildi.

## Sorun

Proje sahibi hareket tasarımına dayanan bir arayüz estetiği ve bunu yıllarca taşıyacak tutarlı bir altyapı istedi. Başlangıç noktası somut bir şikâyetti: yükleniyor çubukları sitedeki öteki hareketlerden farklı bir ritimde oynuyordu.

Sitede eğri kuralı zaten vardı. Eksik olan şunlardı:

- Süreler hızı anlatıyordu (`fast`, `base`), amacı anlatmıyordu.
- Aynı değerler üç yerde elle yazılıydı: `styles.css`, `motion.js` ve `index.html`.
- Denetim yalnız kaynak kodu okuyordu. Mantine'in kendi animasyonlarını göremiyordu.
- Bazı kapanışlar animasyonu atlıyordu. Kitap kapanırken çekmecenin içi hemen boşalıyordu.

## Nasıl karar verildi

Claude ve Codex aynı soruları birbirinden bağımsız araştırdı. Raporlar `docs/analysis/2026-11-08-motion-claude.md` ve `docs/analysis/2026-11-08-motion-codex.md` dosyalarındadır.

İki rapor şu konularda aynı sonuca vardı: yeni kütüphane eklenmez, süreler rollere bağlanır, Mantine'in iç animasyonları yalnız CSS ile uyarlanır, katalog kartları sırayla gelmez, GSAP ile react-spring ve AutoAnimate alınmaz.

Ayrıldıkları konular ve karar:

| Konu | Claude | Codex | Karar |
| --- | --- | --- | --- |
| Tek kaynak | Elle yazılan kopyalar, eşitlik testi | Vite değerleri `motion.js` dosyasından ilk yanıta yazar | Codex. Kopya hiç kalmaz. |
| Bölüm değişiminde `ViewTransition` | Kullan | Kullanma | Kullanılmaz. Proje sahibinin kalıcı hareket sözleşmesi (`AGENT.md`) metne zorla solma uygulanmasını yasaklar ve durumun anında güncellenmesini ister. Bu yalnız proje sahibinin açık politika değişikliğiyle değişir. |
| Kitap açılırken ortak kapak | Kullan | Ertele | Önce ertelendi, proje sahibinin 9 Kasım 2026 isteğiyle yapıldı. Kapağın bir kopyası kartından çekmeceye `sheet` süresinde uçar, kapanınca geri döner, yarıda kapatılırsa bulunduğu yerden döner (`src/ui/react/app/coverFlight.js`). |
| Çekmece süresi | 300 ms | 200 ms | 300 ms. Çekmece ekranın büyük bölümünü geçer, küçük bir açılır pencereyle aynı sürede gelince sert görünür. |
| Kapak yüklenince solarak gelme | Ekle | Değinmedi | Eklenir. Kapak metin değildir ve çerçevesi önceden ayrıldığı için yerleşim değişmez. |
| Yaşam döngüsü hataları | Görmedi | Buldu | Düzeltilir. |
| Tarayıcının yumuşak kaydırması | Görmedi | Kaldır | Kaldırılır. Eğrisi ve süresi tarayıcıya aittir. |
| Çalışma anı denetimi | `getAnimations` ile gezinti | Hedefli bileşen testleri | İkisi birlikte. |

## Kararlar

**K1. Yeni animasyon kütüphanesi yok.** Temel CSS geçişleridir. Açılış ve kapanış yaşam döngüsünü Mantine yönetir. Web Animations API yalnız bu ikisinin çözemediği kanıtlanmış bir durumda kullanılır. İkinci bir motor, tutarsızlığın kaynağı olan ikinci bir zamanlama sistemi demektir.

**K2. Tek kaynak `src/motion.js` dosyasıdır.** Vite aynı dosyadan üretilen CSS değişkenlerini ilk HTML yanıtına yazar. Böylece React çalışmadan önceki ilk açılış ekranı, `styles.css`, Mantine uyarlayıcısı ve açılan katmanlar aynı değerleri okur. `styles.css` içinde `--motion-` değeri tanımlanmaz.

**K3. Bileşenler süre seçmez, rol seçer.**

| Rol | Süre | Kullanım |
| --- | --- | --- |
| `control` | 150 ms | Üzerine gelme, basma, renk, yüzey ve küçük görünürlük değişimleri |
| `move` | 200 ms | Bölüm işaretçisi, kapak kalkışı, ilerleme çubuğu, başlık gölgesi |
| `disclosure` | 200 ms | Akordeon, açılır bölüm ve oku |
| `overlay` | 200 ms | Açılır pencere, ipucu, menü, iletişim kutusu, bildirim |
| `sheet` | 300 ms | Ekran kenarından gelen çekmeceler |
| `busy` | 1200 ms | Yükleniyor çubuklarının bir turu |

Üzerine gelince gösterilen ipuçları 250 ms bekler. Bu bekleme yalnız fare için geçerlidir ve odağı, girişi ya da durumu geciktirmez. Eğri her rolde `cubic-bezier(.65, 0, .35, 1)` değeridir.

**K4. Beklerken tek ritim vardır.** İlk açılış ekranı, sonradan yüklenen sayfalar ve düğmelerin yükleniyor durumu aynı çubukları, aynı turu ve aynı sırayı kullanır. Mantine'in `Loader` bileşeni kalır, yalnız zamanlaması CSS ile uyarlanır. Özel JavaScript yazılmaz.

**K5. Hareket, bir şeyin nereden gelip nereye gittiğini anlatmak içindir.**

- Hareket eder: seçili bölümün işaretçisi, çekmeceler, açılır bölümler, ilerleme çubuğu, üzerine gelince kalkan kapak, yüklenen kapak, kartından kitaba uçan kapak.
- Hareket etmez: okunan metin, sayfa yerleşimi, kaydırma sırasındaki içerik. Sıçrama, parallaks ve kendi kendine dönen döngü yoktur. Tek döngü gerçek bir beklemedir.
- Bölüm, sayfa, arama ve süzme sonuçları anında gelir. Yazı solarak gelmez ve kartlar sırayla dizilmez.
- Açılır pencere ve iletişim kutusu yalnız solar. Çekmece geldiği kenara geri döner.
- Yer değiştirme küçüktür: kapak 3 px, bildirim 8 px.

**K6. Durum anında değişir, görünüm kapanışı tamamlar.** Kitap kapanınca adres ve durum hemen güncellenir. Çekmecenin içi kapanış bitene kadar görünür kalır ama etkileşime kapanır. Odak kapanışın bitmesini beklemez. Aynı kural eşitleme penceresi ve birleştirme sorusu için de geçerlidir.

**K7. Hareket azaltma tercihi korunur.** Tercih açıksa hareket durur. Çubuklar sabit kalır, yükleniyor yazısı görünür.

**K8. Denetim iki katmanlıdır.** Kaynak kapısı (`tests/ui-gates.test.js`) token dışı değerleri, `index.html` içindeki stilleri ve anahtar kare içindeki eğri değişimlerini reddeder. Çalışma anı denetimi (`tests/e2e/motion-audit.spec.js`) gerçek sayfalarda gezer ve `document.getAnimations()` ile çalışan her animasyonun eğrisini ve süresini okur. Yeni bir bileşen kendi animasyonunu getirirse bu test kırılır.

## Reddedilenler

| Seçenek | Neden |
| --- | --- |
| Motion | Lisansı uygun ve kaliteli, ama ikinci bir zamanlama sistemi ekler. Mantine'in yerine geçemez. Sitenin büyük ölçüde ortak öğe ya da yerleşim animasyonuna ihtiyacı olursa ilk aday budur. |
| GSAP | Lisansı açık kaynak değil ve özel kısıtlar içeriyor. İhtiyacın çok ötesinde. |
| react-spring | Temeli yay fiziğidir, tek eğri kuralıyla çelişir. |
| AutoAnimate | Giriş ve çıkış eğrileri sabit ve sözleşmeye aykırı. |
| View Transitions | Yukarıdaki nedenle. Sözleşmedeki yarıda kesilme kuralı değişirse yeniden değerlendirilir. |
| `interpolate-size` | İncelenen verilere göre yalnız Chromium destekliyor. Yükseklik animasyonunu Mantine `Collapse` zaten yapıyor. |
| Skeleton uyarlayıcısı | Kapak yüklenirken kullanılır. Uyarlayıcı `src/styles.css` içindedir ve çalışma anı denetimi bunu kapsar. |

## Sürdürme kuralları

- Yeni hareket önce bir role bağlanır. Hiçbir rol uymuyorsa önce bu belge güncellenir.
- Mantine sürümü yükseltilince çalışma anı denetimi çalıştırılır. Uyarlayıcı `src/styles.css` içinde tek bölümdedir.
- Hareket kodu `src/core` içine girmez. Sunum katmanında kalır.
