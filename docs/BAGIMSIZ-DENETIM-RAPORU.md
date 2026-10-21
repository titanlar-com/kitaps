# Kitaplık: Codex çalışmasının bağımsız denetim raporu

**Tarih:** 28 Eylül 2026
**Denetlenen sürüm:** `karacaismail/kitaps`, `main` dalı, commit `1176650` (canlıdaki sürümle aynı)
**Ek kapsam:** canlı site (https://karacaismail.github.io/kitaps/), `karacaismail/kitaps-state` deposu, Codex'in [müşteri ihtiyaçları ve süreç raporu](MUSTERI-IHTIYACLARI-VE-SUREC-RAPORU.md)
**Denetleyen:** Claude (Codex'ten bağımsız)

> **Adres notu (21 Ekim 2026):** Bu rapor denetim günündeki adresleri olduğu gibi korur. Depolar sonradan `titanlar-com` kuruluşuna taşındı: uygulama https://github.com/titanlar-com/kitaps, durum deposu https://github.com/titanlar-com/kitaps-state, canlı site https://titanlar-com.github.io/kitaps/. Aşağıdaki eski site bağlantıları artık açılmaz; yeniden denemek için aynı yolu yeni sitede kullan.

## Yöntem

- **Kod incelemesi:** sıralama motoru, durum eşitleme katmanı, arayüz bileşenleri, SEO ve veri betikleri.
- **Komutlar:** `npm test` (98/98 geçti), `npm run typecheck` (hatasız), `npm run build` (geçici bir kopyada başarılı), `npm run data` (katalog bayt düzeyinde aynı üretildi).
- **Veri ölçümü:** `src/catalog.json` üzerinde uygulamanın kendi fonksiyonlarıyla (`translationStatus`, `displayTitle`, `exportBookRecord`, `readingGuide`, `ReadingPriorityEngine`) yapılan sayımlar.
- **Canlı site:** yerleşik tarayıcıda 375 px ve 320 px mobil, masaüstü, açık ve koyu tema; konsol kayıtları; axe-core 4.10 taraması.
- **GitHub:** `kitaps-state` commit geçmişi, GitHub API'nin CORS ön kontrol yanıtı, Pages yapılandırması, CI geçmişi.

Uygulama kodunda değişiklik yapılmadı. Canlı sitede yapılan tek deneme kaydı tarayıcıdan geri silindi.

**Kapsam dışı:** fiziksel cihaz ve ekran okuyucu testi, 765 kapağın tek tek görsel kontrolü, çevirmen kalitesi değerlendirmesi, gerçek bir GitHub anahtarıyla yazma denemesi.

## 1. Yönetici özeti

Codex'in kurduğu teknik iskelet sağlam. Testler, tip kontrolü ve derleme geçiyor. Veri üretim hattı tekrar üretilebilir. Sıralama motoru deterministik ve okuma durumundan bağımsız. Raporundaki sayısal tablo da doğru.

Buna karşın ürünün müşteriye vaat ettiği üç temel yetenek canlıda karşılanmıyor. Codex'in raporu bunların hiçbirini "yapılamayan işler" arasında saymıyor:

1. **Cihazlar arası eşitleme hiç çalışmıyor.** Tarayıcı her GitHub isteğini CORS denetiminde engelliyor. Telefon ile bilgisayar hiçbir veriyi paylaşamıyor; yazma anahtarı bile kaydedilemiyor. `kitaps-state` deposunda yalnızca ilk kurulum commit'i var.
2. **Kataloğun %68'inde (542/794) Türkçe baskı kimliği belirsiz.** Bu kitapların hepsinde çarpı simgesi görünüyor, ama "çeviri yok" olarak doğrulanmış tek bir kayıt yok. Hazırlanan iki aşamalı çeviri araştırma hattı hiç çalıştırılmamış.
3. **Okuma önceliği kataloğun büyük bölümünü ayırt edemiyor ve gerekçeleri çoğunlukla şablon.** 794 kitap yalnızca 88 farklı sıraya düşüyor. 314 kitap aynı puanı alıyor ve bu grubun sırası fiilen iç kimliklerin alfabetik sırası. Kitapların %70'inin gerçek bir hazırlık ilişkisi yok. Detay sayfası 585 kitapta puan kartıyla çelişen bir hazırlık önerisi gösteriyor.

Bunlara ek olarak puan kartı, müşterinin "en kritik ürün kuralı"nın tersini yazıyor. JSON dışa aktarmada orijinal ad, orijinal yayınevi ve çevirmen alanları büyük ölçüde boş ya da hatalı. Yazma anahtarı, aynı alan adını paylaşan 63 başka GitHub Pages sitesinin okuyabileceği yerde tutuluyor.

| Önem | Sayı | Başlıklar |
|---|---:|---|
| Kritik | 3 | Eşitleme, Türkçe baskı kimliği, sıralamanın ayırt ediciliği |
| Yüksek | 7 | Çelişen puan metni, dışa aktarma, sahiplik etkisi, anahtar güvenliği, eşitleme tasarımı, özgün Türkçe eserler, yayın yılı |
| Orta | 5 | Eksik kalan arayüz istekleri, erişilebilirlik, performans, SEO, veri temizliği |
| Düşük | 5 | Dokümanlar, test stratejisi, bakım, yerel yol sızıntısı, 120 saniye istisnaları |

## 2. Kritik bulgular

### K1. Cihazlar arası eşitleme canlıda tamamen bozuk

**Kanıt**

- Canlı sitenin her açılışında tarayıcı konsolunda şu hata çıkıyor: `Request header field cache-control is not allowed by Access-Control-Allow-Headers in preflight response.`
- Notlar sayfasındaki eşitleme panelinde "GitHub durumu okunamadı." yazıyor.
- GitHub API'nin ön kontrol yanıtındaki izinli başlık listesinde `Cache-Control` yok (curl ile doğrulandı).
- `kitaps-state` deposunda tek commit var ("Initialize shared library state"). `state.json` içinde hiç kitap kaydı yok. Uygulamadan bugüne tek bir yazım yapılmamış.

**Neden:** `src/state/GitHubStateRepository.ts:226` her isteğe `'Cache-Control': 'no-cache'` başlığı ekliyor. Bu başlık CORS'ta güvenli sayılmıyor ve GitHub izin vermiyor; tarayıcı isteği hiç göndermiyor. Okuma, yazma ve anahtar doğrulaması (`validateToken`, satır 109) aynı yolu kullandığı için üçü de başarısız oluyor.

**Canlıda gözlenen sonuçlar** (denendi, ardından temizlendi)

- Bir kitap "Satın alındı" yapıldığında, aynı kitabın puan kartında "Kitap sahip olunanlar arasında değil" yazmaya devam ediyor ve puan değişmiyor. Sıralama yalnızca uzak durumu okuyor (`src/App.jsx:217`), uzak durum ise hiç yüklenemiyor.
- Liste başındaki özette kalıcı olarak "1 eşitleme değişikliği bekliyor" uyarısı çıkıyor. Bu kayıt hiçbir zaman gönderilemiyor.
- Anahtar girilse bile "GitHub anahtarı doğrulanamadı; anahtar kaydedilmedi" hatası alınıyor, çünkü kod yolu aynı.

**Testler neden yakalamadı:** `tests/github-state-repository.test.js` `fetch` çağrısını taklit ediyor, bu yüzden tarayıcının CORS kuralları hiç devreye girmiyor. Codex'in süreç haritasındaki "Canlı site doğrulaması" adımı eşitleme için uygulanmamış görünüyor.

**Düzeltme:** Satır 226'daki başlığı kaldırmak yeterli; `cache: 'no-store'` seçeneği kalabilir. Ardından iki gerçek cihazla uçtan uca deneme yapılmalı ve yalnızca izinli başlıkların kullanıldığını denetleyen bir test eklenmeli.

### K2. Kataloğun %68'inde Türkçe baskı durumu bilinmiyor

| Çeviri durumu | Kitap |
|---|---:|
| Türkçe baskı var (doğrulanmış) | 245 |
| Özgün Türkçe eser | 7 |
| Doğrulanmamış | 542 |
| Türkçe baskı yok (doğrulanmış) | 0 |

- En büyük kaynak olan Kitap Atlası listesindeki 567 kitabın 506'sı doğrulanmamış. Kategoriye göre: Etik 62/63, Teknoloji 67/69, İklim 22/22, Finans 80/89, Ekonomi 136/152.
- `data/translation-availability.json` dosyasının `records` alanı boş; bir test de boş olduğunu doğruluyor (`tests/translation-availability.test.js:24`). [Çeviri araştırma belgesinde](TRANSLATION-RESEARCH.md) tarif edilen iki aşamalı hat hiç çalıştırılmamış. Hiçbir kitapta `translationResearch` alanı yok.
- Sonuç olarak 542 kartın hepsinde gri bir çarpı var. Simge "çeviri yok" gibi okunuyor, oysa anlamı "doğrulanmadı". Müşterinin istediği "yok" durumu hiçbir kitapta oluşmuyor.
- Kataloğun kendi verisindeki kanıt da kullanılmıyor. *On Competition* (Rekabet Üstüne, Optimist, çev. Kıvanç Tanrıyar) ve *Playing to Win* (Kazanmak İçin Oynamak, Modus, çev. Meriç Aydonat) kayıtlarında baskı durumu "ok". Buna rağmen arayüz bu kitapları doğrulanmamış sayıp İngilizce adla gösteriyor. JSON dışa aktarma ise aynı kitapları Türkçe baskılı veriyor. Nedeni, `src/translation.js:4-12` satırlarının `editions` alanına hiç bakmaması.
- Türkçesi yaygın olarak bilinen eserler de bu grupta; örneğin *The Black Swan* (Siyah Kuğu) ve *The One Minute Manager* (Bir Dakika Yöneticisi).
- Codex'in raporu bu durumu sınırlamalar arasında hiç anmıyor. Yalnızca iki kitabın Türkçe baskısının bulunamadığını yazıyor.

### K3. Okuma önceliği kataloğu ayırt edemiyor, gerekçeler çoğunlukla şablon

Motor, müşterinin istediği gibi okuma durumundan bağımsız ve deterministik çalışıyor. Sorun, beslendiği verinin büyük bölümünün boş ya da genel olması.

**Eşit puan yığılması**

- 794 kitap yalnızca 88 farklı sıraya düşüyor.
- 314 kitap aynı puanı (40,2) alıyor. 178 kitap başka bir puanda, 70 kitap bir başkasında eşit.
- Eşitlik önce güven puanıyla, sonra iç kimliğin (`bookId`) alfabetik sırasıyla çözülüyor (`src/ranking/ReadingPriorityEngine.ts:307-311`). Bu nedenle kataloğun yaklaşık %40'ında "okuma önceliği" sırası fiilen `10daystofasterreading`, `1873`, `1windfall`, `8020principle` gibi kimliklerin alfabetik sırası.
- Olgunluk dağılımı: 450 kitap (%57) "Bağlama bağlı", 287 "Orta", 50 "Yüksek", 3 "Şimdi oku", 4 "Düşük".

**Nedenleri**

- 552 kitabın (%70) hiçbir rota ya da elle yazılmış ilişkisi yok. En ağır ölçüt olan öğrenme kaldıracı (%22) bu kitapların hepsinde sıfır.
- 674 kitapta (%85) yayın yılı yok. Kalıcılık ölçütü bu kitapların hepsinde aynı değeri alıyor.
- Zorluk yalnızca kategoriden türetiliyor (`ReadingPriorityEngine.ts:197-209`) ve birkaç olası değeri var.
- Son turda eklenen, Codex'in ilişki yazdığı kitaplar listeye hâkim. Temel okuma setindeki 50 kitabın 47'si ilk 100'de. Sıralama kitabın değerinden çok, hangi kitaplar için ilişki yazıldığını yansıtıyor.
- Zorluk uyumu yetişkin okur profiline göre hesaplanıyor. Çocuk kitaplarının bu ölçütten aldığı ortalama puan 6,70, katalog ortalaması 8,18. Hiçbir çocuk kitabı ilk 100'de değil; "Kızım için" görünümü yetişkin ölçütleriyle sıralanıyor.

**Şablon gerekçeler ve çelişkiler**

- Rotalar kategori başına yalnızca 3 kitaptan oluşuyor (21 rota). Rotada olmayan bir kitabın detay sayfasındaki "Önce ne okumalıyım?" alanı rotanın ilk kitabını öneriyor (`src/recommendations.js:13-21`). 582 kitabın hazırlık önerisi bu genel varsayılandan geliyor. *Etkin Yöneticilik* 79 farklı kitap için, *Benjamin Franklin* biyografisi 61 kitap için, *Naked Economics* de 61 kitap için "önce oku" olarak öneriliyor.
- Motor ise hazırlık yükünü rotalardaki bütün önceki kitaplardan ve elle yazılmış ilişkilerden hesaplıyor. İki hesap 585 kitapta farklı sayı veriyor. Canlı örnek *İyi'den Mükemmel Şirkete*: sayfa "Önce ne okumalıyım? · 1 — Etkin Yöneticilik" diyor, aynı sayfanın puan kartı ise "Bu kitap için ayrıca bir hazırlık okuması önerilmiyor" diyor.
- "Ne için okumalıyım?" alanı 794 kitabın 629'unda konu şablonundan üretiliyor. Yalnızca 112 kitapta kitaba özel metin var.
- "Nereden başlamalı? 12 kitaplık çekirdek" kartındaki kitaplardan ikisi öncelik sırasında 325. ve 341. sırada ("Bağlama bağlı"). Aynı ekranda iki farklı başlangıç önerisi var.

## 3. Yüksek öncelikli bulgular

### Y1. Puan kartı müşterinin en kritik kuralının tersini söylüyor

`src/components/ReadingPriorityCard.jsx:11` şunu yazıyor: "Puan; katalog, kitaplık ve okuma durumları değiştiğinde bütün kitaplar için yeniden hesaplanır." Motor okuma durumunu doğru biçimde yok sayıyor, ama her kitap detayı kullanıcıya bunun tersini söylüyor. Düzeltmesi tek satır.

Özet kartı da yanıltıcı. Bekleyen değişiklik bir sahiplik değişikliği olsa bile "Okuma kaydı ve sıra değişiklikleri puana katılmaz" diyor (`src/components/ReadingPrioritySummary.jsx:10`).

### Y2. JSON dışa aktarma istenen alanları büyük ölçüde doldurmuyor

| Alan | Boş kayıt |
|---|---:|
| `turkceAdi` | 540 / 794 |
| `orijinalYayinevi` | 597 / 794 |
| `onerilenCevirmenler` | 663 / 794 |
| `turkiyeYayinevi` | 545 / 794 |

- Türkçe adı olan 247 çeviri kaydının 118'inde çevirmen boş.
- Orijinal ad alanı bazı çeviri eserlerde Türkçe başlık döndürüyor. En az 23 örnek var: *Küçük Prens*, *Charlie'nin Çikolata Fabrikası*, *Oz Büyücüsü*, *Şeker Portakalı*, *Alice Harikalar Diyarında*, *Büyük Petro*, *Napoleon: Hayatı*, *Fatih Sultan Mehmed ve Zamanı*. 245 çeviri kaydının 193'ünde `originalTitle` alanı yok. Codex'in raporu dışa aktarma kuralının düzeltildiğini söylüyor (bölüm 8); Türkçe başlık dönen bu kayıtlar o düzeltmenin dışında kalmış.
- Kapak Türkçe olduğunda orijinal yayınevi hiç doldurulmuyor (`src/catalogExport.js:19`).
- Yazar ayrıştırma hatalı: "Chip and Dan Heath" `["Chip", "Dan Heath"]` olarak bölünüyor; ", Jr." 3 kayıtta ayrı bir yazar olarak çıkıyor (`catalogExport.js:4`).
- Dışa aktarma arayüzle tutarsız. 15 kitapta dışa aktarma bir çevirmen önerirken detay sayfası "Çevirmen: Henüz doğrulanmadı" diyor (ör. *Il Principe*, *Hagakure*, *Arthashastra*). K2'deki 2 kitapta dışa aktarma Türkçe baskı verirken arayüz "doğrulanmamış" diyor.
- Kayıtlarda kitap kimliği, ISBN ya da yıl yok, bu yüzden dışa aktarılan dosya kataloğa geri bağlanamıyor.

### Y3. Sahiplik puanı değiştiriyor; müşteri kararı gerekiyor

- Müşteri kuralına göre kişisel eylemler yalnızca kişisel kayıt olarak saklanır ve aynı katalog her yerde aynı puanı üretir. Codex "Satın aldım" işaretini bu kuralın dışında tutmuş (`ReadingPriorityEngine.ts:170-195`).
- Ölçüm: üç felsefe kitabını "satın alındı" yapmak 315 kitabın puanını, 778 kitabın sırasını değiştiriyor. Satın alınan kitap 6,5 ile 7,6 arasında puan kazanıyor. Aynı kategorideki diğer felsefe kitapları 3,9 ile 5,6 arasında puan kaybediyor.
- "Kitaplık kapsamı" ölçütü satın alma mantığından kalma: bir konuda kitap sahibi olmak, o konudaki diğer kitapların okuma önceliğini düşürüyor. Müşteri ise varsayılan sıralamanın satın alma değil okuma önceliği olmasını istemişti.
- Puan, uzak durumun okunabilmesine bağlı. Okuma başarısız olan cihaz farklı bir sıra görür. Okuma başarılı olduğunda da liste yüklendikten sonra yeniden diziliyor.
- **Öneri:** Konu müşteriye sorulmalı. Sahiplik ortak puandan çıkarılıp kişisel bir filtre ya da ikincil sıralama olabilir. Kapsam ölçütü satın alma önerisine taşınabilir.

### Y4. Yazma anahtarı 63 başka siteyle aynı alanda

- Anahtar `localStorage` içinde düz metin olarak tutuluyor (`GitHubStateRepository.ts:87-91`).
- karacaismail hesabının 64 GitHub Pages sitesi var ve hiçbiri özel alan adı kullanmıyor. Hepsi `https://karacaismail.github.io` kaynağını, dolayısıyla aynı `localStorage` alanını paylaşıyor. Bu sitelerden herhangi birindeki bir üçüncü taraf betik ya da XSS açığı anahtarı okuyabilir.
- Anahtar doğrulaması yalnızca okumayı deniyor (`validateToken`). Depo herkese açık olduğu için geçerli her anahtar kabul edilir; bütün depolara yazabilen klasik bir anahtar da uyarısız kaydedilir.
- ADR'deki "anahtar tarayıcının yerel alanından çıkmaz" ifadesi bu riski karşılamıyor. Risk, Codex'in risk tablosunda yok.
- **Öneri:** Uygulama ayrı bir kaynağa (özel bir alt alan adına) taşınmalı ya da yazma işlemi GitHub App veya OAuth akışıyla yapılmalı. Anahtar kaydedilirken yalnızca `kitaps-state` üzerinde Contents yazma izni taşıdığı denetlenmeli.

### Y5. Eşitleme tasarımındaki açıklar (K1 düzeltilince ortaya çıkacak)

- **İstek sınırı:** Anahtar olsa bile okumalar her zaman anahtarsız yapılıyor (`GitHubStateRepository.ts:116`). Anahtarsız istek sınırı IP başına saatte 60. Görünür her sekme iki dakikada bir okuduğu için saatte 30 istek harcıyor; aynı ev ağındaki telefon ile bilgisayar bu sınırı birlikte doldurur.
- **120 saniyelik pencere her açılışta yeniden başlıyor** (`src/state/useGitHubStateSync.js:79`). Bekleyen kaydın ilk zamanı saklanmıyor, bu yüzden iki dakikadan kısa telefon oturumlarındaki değişiklikler hiç gönderilmiyor. Sayfa kapanırken de gönderim yapılmıyor.
- **Çakışma kuralı belgelenenden farklı:** ADR "her kitap kaydı kendi updatedAt değeriyle birleştirilir; son yazılan kazanır" diyor. Üretimde kullanılan `applyStateDocumentPatches` zamana bakmıyor; son gönderen kazanıyor. Dün çevrimdışı yapılmış bir değişiklik bugünkü daha yeni bir değişikliği ezebilir. Zamana bakan `mergeStateDocuments` yalnızca testlerde kullanılıyor.
- **Yeni cihazda veri kaybı:** Uzakta kayıt varsa yeni bağlanan cihazın aynı kitaplara ait yerel kayıtları uzaktaki kayıtla eziliyor. Okuma sırası da uzaktaki sırayla değiştiriliyor (`useGitHubStateSync.js:54` ve `69-76`). Kullanıcıya sorulmuyor, yedek de alınmıyor.
- Okuma sırası kitap başına ayrı alanlarda tutuluyor. İki cihazdan eşzamanlı değişiklik aynı sıra numarasına iki kitap yazabilir ve 5 sınırını aşan kitap sessizce düşer.

### Y6. Özgün Türkçe eserler yanlış etiketleniyor

- 7 özgün Türkçe eserin hepsinin detay sayfasında "Türkçe baskı doğrulanamadı. Gösterilen kapak uluslararası baskıya aittir." yazıyor ve bir "Özgün baskı · Amazon" düğmesi çıkıyor. Canlıda *Fadiş* sayfasında doğrulandı. Nedeni, `src/components/EditionSummary.jsx:6` satırının "özgün" durumunu "baskı var" saymaması.
- *Ağır Roman* (Metin Kaçan), *Devlet-i Aliyye* (Halil İnalcık) ve *Türk Mitolojisi Atlası* (Bartu Bölükbaşı) çeviri olarak sınıflanmış. Kartta "Çeviri" onayı, detayda "Çevirmen: Henüz doğrulanmadı" satırı görünüyor.

### Y7. Yayın yılı kataloğun %85'inde yok

- 794 kitabın yalnızca 120'sinde yayın yılı var. "Yayın yılı · yeni" sıralaması ve yıl filtresi 674 kitapta işe yaramıyor: bu kitaplar sıralamada en sona düşüyor, yıl filtresinden tamamen çıkıyor.
- Aynı eksik kalıcılık ölçütünü de düzleştiriyor (K3). FT listesi kayıtlarındaki ödül yılı gibi eldeki veriler bile kullanılmamış.

## 4. Orta öncelikli bulgular

### O1. Eksik kalan arayüz istekleri

- **Kızım için simgesi:** Müşteri kız çocuğu simgesi istemişti. Kullanılan `IconWoman` bir yetişkin kadın figürü (`src/App.jsx:3` ve `248`). Tabler setinde kız çocuğu simgesi yok; Codex, kitaplık simgesinde yaptığı gibi özel bir SVG çizebilirdi. UX-VALIDATION belgesi de "kadın" simgesi diyor.
- **Yıldız metni kalmış:** Boş Favoriler ekranında hâlâ "Kartlardaki yıldızla favorilerini buraya ekleyebilirsin." yazıyor (`App.jsx:265`; canlıda görüldü).
- **Açıklama paragrafları tam kaldırılmamış:** Kitaplığım ve Favoriler sayfalarında öncelik özeti paragrafı görünüyor ve "Şu an ilk" satırı o rafta olmayan bir kitabı gösteriyor (`App.jsx:263`). Sıram sayfasının altında bir açıklama metni, Notlar sayfasında birden fazla açıklama paragrafı var. Notlar'daki yedekleme metni hâlâ kayıtların "bu tarayıcıda saklandığını" söylüyor.
- **Çarpı simgesi:** K2'de anlatılan anlam karışıklığı.
- **Mobil ilk ekran:** 375 × 812 görünümde kartların yalnızca üst 134 piksel'i ilk ekrana giriyor; hiçbir kitap adı görünmüyor. Arama alanı, "Nereden başlamalı?" kartı ve öncelik özeti listeyi aşağı itiyor. Bu, müşterinin "hızlı tarama" hedefiyle çelişiyor.
- **"Şimdi oku" etiketi** kişisel durumdan bağımsız olduğu için okunmuş bir kitapta da görünebiliyor. Puanın nötr kalması doğru, ama yönlendirici etiket yerine "Çok yüksek öncelik" gibi nötr bir ad kullanılmalı.
- **Adlandırma:** Üst başlıkta ve sayfa başlığında "Kitaplık", altbilgide, Notlar'da ve `noscript` metninde "Kitap Atlası" yazıyor.

### O2. Erişilebilirlik gerilemeleri

Canlı sitede axe-core 4.10 taraması şunları buldu:

- **Koyu tema, ana sayfa:** Logo yazısının kontrastı 1,64:1 (serious). Sorun, logo kapsayıcısı değişikliğiyle gelmiş.
- **Açık tema, kitap detayı:** Olgunluk rozetinin kontrastı 3,8:1. 16 px normal metin için 4,5:1 gerekiyor.

UX-VALIDATION belgesi sıfır ihlal olduğunu söylüyor. Bu iki bileşen son turlarda eklenmiş ve yeniden taranmamış.

### O3. Performans

- Uygulama tek bir 2,8 MB HTML dosyası olarak yayınlanıyor (sıkıştırılmış hâli 724 KB). Kod bölme yok ve her veri değişikliği dosyanın tamamının önbelleğini geçersiz kılıyor.
- Yaklaşık 0,6 MB ham kaynak dosyası yalnızca Notlar'daki "Tüm kataloğu indir" düğmesi için ilk yüklemeye gömülüyor (`App.jsx:10-18`). `data/sources/kitaps.json` ile `data/sources/kitaps-built-books.json` bayt düzeyinde aynı olduğu hâlde ikisi de gömülüyor.
- Bu denetim ortamının ağında DOMContentLoaded yaklaşık 12 saniye sürdü. Bu değer ağ hızına bağlı bir gözlem, kıyas ölçütü değil. Bu süre boyunca ekran boş kalıyor.

### O4. SEO

- `robots.txt` dosyası `/kitaps/` altında duruyor. Arama motorları yalnızca alan adının kökündeki `robots.txt` dosyasını okur; kökte böyle bir dosya yok (404). Dosyadaki `Sitemap:` satırı bu yüzden etkisiz; sitemap'in Search Console'a ayrıca gönderilmesi gerekir.
- Statik kitap sayfaları çok ince: yalnızca başlık, yazar, yıl, yayınevi, ISBN ve konu içeriyorlar. Sayfa açıklaması "çeviri, kaynak kümeleri ve okuma rotası bilgileri" vaat ediyor ama sayfada bunlar yok. Paylaşım görseli (`og:image`) de yok.
- 9 grup sayfasının başlığı aynı: "Kitap listesi | Kitaplık".
- Kitap yollarının dili karışık: `good-to-great-by-jim-collins` ile `kucuk-prens-by-antoine-de-saint-exupery` yan yana duruyor.
- "794 kitap" sayısı `index.html` ve `src/seo.js:5` içine sabit yazılmış; katalog değişince eskiyecek.

### O5. Veri temizliği

- Kapak meta verisinden gelen özgün adlar tutarsız: "Guerilla Marketing.", "The one minute manager", "Marketing : A Love Story".
- Yayınevi adı bozuk bir kayıt var: *The Four Steps to the Epiphany* için "Wiley & Sons, Incorporated, John".
- 2 kaydın `titleTr` alanında İngilizce özgün ad var. 2 kayıtta yazar boş; biri son turda eklenen *Adım Adım Matematik*.
- Önce/sonra bağlarından 17 "sonra" bağının ve 7 "önce" bağının karşılığı yok. Codex raporundaki 183 ile 193 arasındaki fark bu asimetriden geliyor.

## 5. Düşük öncelikli ve süreçle ilgili bulgular

- **D1. Dokümanlar güncel değil.** README hâlâ "718 eser, 23 küme, 100 alt küme, 707 kapak" diyor ve kişisel işaretlerin yalnızca tarayıcıda saklandığını, başka cihazlara otomatik aktarım olmadığını yazıyor. UX-VALIDATION'daki "Yıldız Favoriler listesine ekler", "doğrulanamayan durum yatay çizgiyle gösterilir", "sıfır ihlal" ve "kişisel kayıtlar tarayıcıda tutulur" ifadeleri eskimiş.
- **D2. Test stratejisi zayıf.** 98 testin önemli bir kısmı veri ve saf fonksiyon testi. Arayüz testleri (`tests/ui-structure.test.js`, `tests/pagination-ui.test.js`) bileşen çalıştırmıyor, yalnızca kaynak kodda düzenli ifade arıyor. Tarayıcıda uçtan uca test yok. Tip kontrolü yalnızca 9 `.ts` dosyasını kapsıyor (`tsconfig.json`); `App.jsx` dahil arayüz kodu denetlenmiyor.
- **D3. Bakımı zor kod.** `App.jsx` 281 satır; 27 satırı 300 karakterden uzun, en uzun satırı 1.978 karakter. `styles.css` aynı seçiciyi defalarca ezen kurallar içeriyor (`.translation-status` 6 kez tanımlı). `.stats`, `.intro-text`, `.header-link` gibi kullanılmayan kurallar da var. Codex raporundaki "OOP, MVVM ve katmanlı sorumluluklar korunur" ifadesi yalnızca sıralama ve durum katmanı için geçerli.
- **D4. Açık depoda yerel yollar.** `research_notes/` altındaki notlarda 88 satırda `/Users/w6x/...` ile başlayan yerel dosya bağlantısı var. Bu bağlantılar başkaları için kırık ve yerel klasör yapısını açığa çıkarıyor.
- **D5. 120 saniye istisnaları.** "Şimdi gönder" düğmesi ve hata sonrası 15, 30 ve 60 saniyelik yeniden denemeler "en az 120 saniye" kuralının dışında kalıyor. Bu makul olabilir, ama müşteri onayı alınmalı.

## 6. Müşteri isteklerinin karşılanma durumu

İstekler Codex raporunun 4. bölümündeki dökümden alındı.

| İstek | Durum | Not |
|---|---|---|
| Yanlış kapakların düzeltilmesi, kapak kimliği denetimi | Büyük ölçüde | Yinelenen kapak dosyası ya da ISBN yok; 29 kitap kapaksız; her kapak görsel olarak denetlenmedi |
| Girişimcilik, temel okuma ve ön hazırlık kitaplarının eklenmesi | Karşılandı | 58 yeni eser; 1 yeni kayıtta yazar boş |
| Kaynaktaki hazır puanların kopyalanmaması | Karşılandı | |
| Çevirisi olmayan kitabın Türkçeleştirilmiş adla gösterilmemesi | Karşılandı | Yan etki: Türkçesi olan ama doğrulanmamış 542 kitap da İngilizce görünüyor |
| Türkçe anlamın açıklamada verilmesi | Karşılandı | |
| Tanımlı alanlarla JSON dışa aktarma | Kısmen | Alanlar var, içerik büyük ölçüde boş ya da hatalı (Y2) |
| Etiketlerin kartlardan kaldırılması | Karşılandı | |
| Varsayılan sıralamanın okuma önceliği olması | Karşılandı | |
| Birden fazla koşula dayalı puan | Kısmen | 7 ölçüt var, ama 794 kitap 88 sıraya düşüyor (K3) |
| Puanların detayın sonunda gösterilmesi | Karşılandı | Açıklama metni çelişkili (Y1, K3) |
| Ekleme/çıkarmada tüm sıranın yeniden hesaplanması | Karşılandı | |
| Olgunluk düzeyinin sıralamaya katılması | Kısmen | Eşikler politika dosyasında değil motorda; %57'si "Bağlama bağlı" |
| Okuma durumu ve kişisel sıranın puanı etkilememesi | Kısmen | Motor doğru; arayüz metni tersini söylüyor (Y1); sahiplik puanı değiştiriyor (Y3) |
| Algoritmanın ayrı dosyada, TypeScript ve nesne yönelimli olması | Karşılandı | |
| İkinci GitHub deposu | Karşılandı | Depo var ama hiç yazılmamış |
| Değişikliğin telefonda ve başka kullanıcıda görünmesi | Karşılanmadı | CORS hatası (K1) |
| İstemci tarafında biriktirme | Kodda var, canlıda işlevsiz | K1, Y5 |
| İlk değişiklikten sonra en az 120 saniye bekleme | Kodda var | Pencere her oturumda yeniden başlıyor; "Şimdi gönder" kuralı atlıyor |
| Açıklığın açıkça kabul edilmesi | Karşılandı | Anahtar riski eksik (Y4) |
| Üst kategori şeridinin kaldırılması | Karşılandı | |
| Kızım için üst gruba taşınması ve kız çocuğu simgesi | Kısmen | Taşındı; simge yetişkin kadın figürü |
| Simgelerin masaüstünde de yalnızca simge olması | Karşılandı | |
| Favori için kalp, kitaplık için belirgin simge | Kısmen | Simgeler doğru; boş ekran metni hâlâ "yıldız" diyor |
| Logo kapsayıcısının tek yüzey olması | Karşılandı | Koyu temada kontrast 1,64:1 (O2) |
| Kapak alanının 3:4 olması | Karşılandı | Canlıda ölçüldü: 0,750 |
| Çeviri durumu için kısa araç ipuçları | Karşılandı | |
| Çeviri yok durumunda çarpı simgesi | Kısmen | Çarpı "doğrulanmadı" anlamında 542 kitapta; doğrulanmış "yok" hiç yok |
| Üst eylemlerin tek satıra sığması, büyük simgeler | Karşılandı | 320 px'de de sığıyor |
| Tutamacın ortalanması | Karşılandı | |
| Olgun sayfalama bileşeni | Karşılandı | Sayfa boyutu ve sayfaya git dahil |
| Yerel seçim kutusu yerine özel açılır menü | Karşılandı | Kodda yerel `select` kalmadı |
| Notlar bağlantısının altbilgiye taşınması | Karşılandı | |
| Kitaplığım, sıra, kümeler ve notlar sayfalarındaki açıklamaların kaldırılması | Kısmen | Kitaplığım, Favoriler, Sıram ve Notlar'da açıklama kaldı (O1) |
| Altbilgide yaratılış ve güncelleme tarihleri | Karşılandı | Yaratılış tarihi sabit yazılmış; iki tarihin biçimi farklı |
| Genel UX ve mobil kullanımın iyileştirilmesi | Kısmen | Mobil ilk ekranda kitap adı yok; kontrast sorunları |
| Sayfa gibi durumların URL'de görünmesi | Karşılandı | |
| Geri tuşu, yenileme ve paylaşılabilir bağlantı | Karşılandı | |
| İnsan odaklı URL, canonical ve sitemap | Kısmen | `robots.txt` etkisiz, statik sayfalar ince, yinelenen başlıklar (O4) |
| Bağımsız ikinci göz denetimi ve eksiklerin giderilmesi | Karşılanmadı | Kritik sorunlar denetimden geçmiş; Codex son turda bağımsız denetim yapılmadığını kendisi yazıyor |
| Ayrıntılı müşteri ve süreç raporu | Kısmen | Rapor var, ama kritik sorunları içermiyor ve yanlış ifadeler barındırıyor (bölüm 7) |

## 7. Codex raporundaki doğru olmayan ya da eksik ifadeler

| Codex raporundaki ifade | Gerçek durum |
|---|---|
| "İstemci değişiklikleri yerelde bekletir ve ... toplu gönderir" (5.4) | Canlıda ne okuma ne yazma yapılabiliyor; `kitaps-state` deposunda yalnızca ilk commit var |
| "Bekleyen işlemler, çakışma çözümü ve yeniden deneme davranışları test kapsamındadır" (5.4) | Testler `fetch` çağrısını taklit ediyor. Testteki zaman damgası temelli birleştirme üretimde kullanılmıyor |
| "Politika: ağırlıklar ve olgunluk eşikleri ayrı dosyada" (5.3) | Eşikler `ReadingPriorityEngine.ts:388-397` içine sabit yazılmış; `policy.ts` yalnızca ağırlıkları içeriyor |
| "Eşitlik çözümü ... aynı katalog farklı cihazlarda aynı sonucu verir" (5.2) | Teknik olarak doğru, ama 314 kitap aynı puanda ve sıraları iç kimliğe göre alfabetik; bu belirtilmemiş |
| Süreç haritasında "Canlı site doğrulaması" | Eşitleme hatası her sayfa açılışında konsolda görünüyor |
| "Kitap ayrıntısında hazırlık kitapları ve birlikte okunabilecek eserler ayrı gösteriliyor" (5.5) | Gösteriliyor, ama 582 kitapta genel bir rota varsayılanı; 585 kitapta puan kartıyla çelişiyor |
| "originalTitle alanı eklendi ve dışa aktarma kuralı düzeltildi" (8) | En az 23 çeviri eserde orijinal ad olarak Türkçe başlık dönüyor |
| "ADR ve doğrulama belgesi son üretim sayılarıyla güncellendi" (8) | README güncellenmemiş; UX-VALIDATION'daki birçok ifade eskimiş |
| Bölüm 9, "Yapılamayan veya halen sınırlı kalan işler" | Bozuk eşitleme, 542 doğrulanmamış çeviri, 674 yılsız kayıt, ilişkisi olmayan %70, puan eşitlikleri ve dışa aktarma boşlukları listede yok |
| Bölüm 10, risk tablosu | Aynı kaynağı paylaşan 63 sitenin anahtarı okuyabilmesi riski yok |
| ADR: "Son yazılan kitap kaydı kazanır" | Üretimde son gönderen kazanıyor (Y5) |

Codex'in raporundaki sayısal tablo ise doğru: 794 kitap, 26 koleksiyon, 120 grup, 21 kategori, 765 kapak, 183/193/16 ilişki, 58 yeni eser, 1.069 herkese açık URL ve 98 test ölçümle tutuyor.

## 8. Doğru yapılanlar

- 98 test geçiyor; tip kontrolü ve üretim derlemesi hatasız. CI her gönderimde test edip yayınlıyor ve son commit canlıda.
- `npm run data` kataloğu bayt düzeyinde aynı üretiyor, yani veri hattı tekrar üretilebilir.
- Sıralama motoru deterministik ve okuma durumu, okuma kaydı ve kişisel sıradan bağımsız. Bu, gerçek katalog üzerinde testle doğrulanıyor. Ağırlıklar toplamı denetleniyor, politika sürümlü, her ölçütün kanıt metni var.
- Yinelenen kapak dosyası ya da ISBN yok; kapak ISBN'lerinin kontrol basamakları doğru; kapaksız her kitabın gerekçe notu var. İlişkilerde kopuk bağlantı ya da döngü yok.
- Arayüz: 3:4 kapak, 320 px'de tek satıra sığan simge tabanlı üst menü, kalp simgesi, özel kitaplık simgesi, ortalanmış tutamaç, her yerde özel açılır menü, sayfa boyutu ve sayfaya git içeren sayfalama, URL'de tutulan sayfa, filtre ve kitap durumu, altbilgide JSON dışa aktarma, tarihler ve Notlar bağlantısı.
- Codex'in 27 commit'inin hepsinde yazar ve işleyen `karacaismail`; ek yazar satırı yok. (İlk 3 commit, 2-3 Eylül tarihli ve Codex öncesine ait; Claude ek yazar satırı taşıyorlar. Bu Codex'ten kaynaklanmıyor.)

## 9. Önerilen düzeltme sırası

**Hemen (saatler içinde)**

1. `src/state/GitHubStateRepository.ts:226` satırındaki `Cache-Control` başlığını kaldır. İki gerçek cihazla uçtan uca dene. Yalnızca izinli başlıkların kullanıldığını denetleyen bir test ekle.
2. `ReadingPriorityCard.jsx:11` metnini düzelt; okuma durumu puanı değiştirmez. `App.jsx:265` "yıldız" metnini ve Notlar'daki "bu tarayıcıda saklanır" metnini güncelle.
3. `EditionSummary.jsx`: özgün Türkçe eserlerde "Türkçe baskı doğrulanamadı" satırını ve Amazon düğmesini gösterme. *Ağır Roman*, *Devlet-i Aliyye* ve *Türk Mitolojisi Atlası*'nı özgün eser olarak işaretle.
4. `translation.js`: `editions` içinde durumu "ok" olan Türkçe baskıyı kanıt say. Arayüz ile dışa aktarma aynı kuralı kullansın.
5. Öncelik özetini Kitaplığım ve Favoriler görünümlerinden kaldır. Mobilde özet katlanabilir olsun ya da listenin altına insin.
6. Koyu temadaki logo ve açık temadaki olgunluk rozeti kontrastını düzelt.

**Kısa vade (günler içinde)**

7. "Önce ne okumalıyım?" alanını motorun hazırlık grafiğiyle tek kaynağa bağla. Genel rota varsayılanlarını "genel öneri" olarak etiketle ya da hiç gösterme.
8. Dışa aktarma: çeviri eserlere `originalTitle` ekle, orijinal yayınevini doldur, yazarları yapısal bir dizi olarak tut, kimlik ve ISBN ekle. Çevirmen kuralını arayüzle eşitle.
9. Eşitlemeyi sağlamlaştır. Anahtar varsa kimlikli okuma yap; `If-None-Match` ile koşullu istek gönder (CORS buna izin veriyor). Bekleyen kaydın ilk zamanını sakla ve 120 saniye dolmuşsa açılışta gönder. Okuma sırasını tek bir kayıt olarak tut. Yeni cihaz birleştirmesinde kullanıcıya sor.
10. Anahtar güvenliği: ayrı bir kaynak (özel alt alan adı) ya da GitHub App veya OAuth akışı kullan. Kaydederken anahtarın izin kapsamını denetle.
11. Müşteri kararı al: sahiplik puana girsin mi? Kapsam ölçütü satın alma önerisine taşınsın mı?
12. Kızım için: özel bir kız çocuğu SVG simgesi çiz. Çocuk kitapları için ayrı bir okur profili tanımla ya da zorluk uyumunu bu görünümde kapat.

**Orta vade (haftalar içinde)**

13. 542 kitap için Türkçe baskı araştırmasını çalıştır. Hazır olan iki aşamalı hatla, önce Kitap Atlası'ndaki iş kitaplarından başla.
14. Eksik 674 yayın yılını FT ödül yılı ve bibliyografik kaynaklardan doldur.
15. Sıralamanın ayırt ediciliğini artır: ilişki kapsamını genişlet, eşitlik gruplarını küçült, eşitlikte iç kimlik yerine anlamlı bir ikincil ölçüt kullan, olgunluk etiketlerini nötrleştir.
16. Performans: tek dosya derlemeyi bırak, ham kaynakları yalnızca indirme anında yükle, yinelenen kaynak dosyalarını kaldır.
17. SEO: sitemap'i Search Console'a gönder, statik sayfaları zenginleştir, grup başlıklarını benzersizleştir, sabit "794" sayılarını katalogdan üret.
18. Test: jsdom ve React Testing Library ile bileşen testleri; Playwright ile derlenmiş site üzerinde, eşitleme dahil uçtan uca testler. Tip kontrolünü JSX dosyalarını kapsayacak biçimde genişlet.
19. README, UX-VALIDATION, ADR ve müşteri raporunu gerçek duruma göre güncelle. `research_notes/` içindeki yerel yolları temizle.

## 10. Bulguları yeniden üretme

- **Eşitleme hatası:** https://karacaismail.github.io/kitaps/?view=notes sayfasını açıp tarayıcı konsoluna bak.
- **CORS ön kontrolü:**
  ```sh
  curl -s -i -X OPTIONS "https://api.github.com/repos/karacaismail/kitaps-state/contents/state.json" \
    -H "Origin: https://karacaismail.github.io" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: cache-control"
  ```
  Yanıttaki `access-control-allow-headers` listesinde `cache-control` yok.
- **Durum deposundaki commit sayısı:** `gh api repos/karacaismail/kitaps-state/commits --jq length` komutu `1` döndürüyor.
- **Çeviri durumu dağılımı:**
  ```sh
  node --input-type=module -e "import c from './src/catalog.json' with {type:'json'}; import {translationStatus} from './src/translation.js'; const n={}; for (const b of c.books) { const s=translationStatus(b).status; n[s]=(n[s]||0)+1 } console.log(n)"
  ```
- **Puan eşitlikleri:**
  ```sh
  node --input-type=module -e "import c from './src/catalog.json' with {type:'json'}; import {ReadingPriorityEngine} from './src/ranking/ReadingPriorityEngine.ts'; const r=new ReadingPriorityEngine(c).rank({states:{},queue:[],reading:{}}); const n={}; for (const x of r) n[x.rank]=(n[x.rank]||0)+1; console.log(new Set(r.map(x=>x.rank)).size, Math.max(...Object.values(n)))"
  ```
  Çıktı `88 314` olmalı.
- **Çelişen detay sayfası:** https://karacaismail.github.io/kitaps/?book=good-to-great-by-jim-collins
- **Özgün Türkçe eser hatası:** https://karacaismail.github.io/kitaps/?book=fadis-by-gulten-dayioglu

## 11. Uygulama durumu (28 Eylül 2026)

Müşteri kararları: satın alma işareti puanı ve puanlama ölçütlerini değiştirmez (Y3). İkinci depo anahtarı için yapılabilen önlemler uygulandı; ayrı alan adı veya GitHub App kurulmadı.

| # | Düzeltme | Durum | Not |
|---|---|---|---|
| 1 | Eşitlemede CORS | Yapıldı | Anahtarsız okuma `raw.githubusercontent.com` üzerinden basit istekle; başlıklar GitHub'ın izin listesiyle testle sınırlı. Tarayıcı testi gerçek GitHub okumasında CORS hatası olmadığını doğrular. |
| 2 | Puan kartı ve kalıp metinler | Yapıldı | "Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez." |
| 3 | Özgün Türkçe eserler | Yapıldı | Çeviri göstergesi ve Amazon düğmesi gösterilmez; özgün eser sayısı 11'den 42'ye çıktı. |
| 4 | Çeviri kanıt kuralı | Yapıldı | Arayüz ve dışa aktarma aynı `turkishEdition` kuralını kullanır. |
| 5 | Öncelik özeti | Yapıldı | Yalnız Kitaplar görünümünde, tek satırlık açılır düğme. |
| 6 | Kontrast | Yapıldı | Yeni tasarımla birlikte baştan kuruldu; axe taraması iki temada sıfır ihlal. |
| 7 | Tek hazırlık grafiği | Yapıldı | `ReadingGraph`; rotalar arası döngüler de engellenir. |
| 8 | Dışa aktarma alanları | Yapıldı | Şema 2: kimlik, Türkçe ve özgün ad, özgün yayınevi, yazar dizisi, çevirmen, Türkiye yayınevi, ISBN, ilk yayın yılı. |
| 9 | Eşitlemenin sağlamlaştırılması | Yapıldı | Alan bazlı son yazan kazanır, koşullu okuma, 120 saniyelik toplu yazma, yeni cihazda soru ve yedek. |
| 10 | Anahtar güvenliği | Kısmen | Yalnız ince ayarlı ve tek depoya yetkili anahtar kabul edilir; klasik anahtarlar reddedilir, anahtar sayfası hazır izinlerle açılır. Ayrı alan adı ya da GitHub App yok. |
| 11 | Müşteri kararı | Karar verildi | Satın alma puana girmez. |
| 12 | Kızım için | Yapıldı | Kız çocuğu simgesi; çocuk kitapları v2.1'den beri kendi aralarında sıralanır. |
| 13 | Türkçe baskı araştırması | Yapıldı | 542 kitap iki bağımsız aşamada araştırıldı. 148 yeni Türkçe baskı ve 2 özgün eser kabul edildi; 690 alan Milli Kütüphane kataloğuna erişilemediği için elle inceleme bekliyor. Doğrulanmamış kitap sayısı 459'a indi. |
| 14 | Yayın yılları | Yapıldı | Yılı bilinmeyen kitap 674'ten 117'ye indi (572 ilk yayın yılı, 616 ilk yayınevi, 694 özgün dil kabul edildi). |
| 15 | Sıralamanın ayırt ediciliği | Kısmen | 21 kategori rotası yeniden yazıldı; farklı puan sayısı 88'den 163'e çıktı, en büyük eşitlik grubu 314'ten 198'e indi. İlişkisi olmayan 582 kitap kaldı. |
| 16 | Performans | Yapıldı | Parçalı derleme; arayüz yazı tipi indirilmiyor, yalnız Literata. |
| 17 | SEO | Yapıldı | Zengin statik sayfalar ve benzersiz grup başlıkları. Sitemap'in Search Console'a gönderilmesi site sahibinde. |
| 18 | Testler | Yapıldı | 105 veri ve alan testi, 19 bileşen testi, 8 tarayıcı testi, iki yapılandırmada tip kontrolü; hepsi yayın öncesi GitHub Actions'ta çalışır. |
| 19 | Belgeler | Yapıldı | README, UX-VALIDATION ve ADR güncel; yerel yollar temizlendi. |

Listenin dışında yapılanlar:

- **Görsel tasarım baştan kuruldu.** Kitap adlarında Literata kullanıldı. Sıcak kâğıt zemin ve tek vurgu renginden oluşan bir renk sistemi kuruldu. Kapakların öne çıktığı raf düzeni ve sekmelerin yer aldığı üst menü eklendi. Mobil kitap panelinin başlığı ve tutamacı kaydırırken sabit kalıyor.
- **13 yaşına kadar temel kütüphane eklendi (125 kitap).** Ebeveynin seçtiği kitaplar BookTrust, TIME, School Library Journal, Scholastic, MEB 100 Temel Eser ve IBBY Türkiye listeleriyle karşılaştırıldı. 114 kitabın Türkçe baskısı ISBN, yayınevi ve çevirmen üzerinden iki ayrı sitede doğrulandı. Sekiz mevcut kitap daha iyi bir baskıya geçti. Kaynak listelerdeki yanlışlıklar düzeltildi: *Halime Kaptan* Muzaffer İzgü'nün değil Rıfat Ilgaz'ın kitabıdır. *Tuhaf Bir Zürafa* ise Behiç Ak'ın yayımlanmış kitapları arasında ve kitabevlerinde bulunamadığı için eklenmedi. Ayrıca *Emil ile Dedektifler* ve *Fantastik Bay Tilki* Türkçede farklı adlarla (*Küçük Hafiyeler*, *Yaman Tilki*) yayımlanmıştır.
- **Okuma önceliği v2.1.** Çocuk kitapları kendi aralarında normalize edilip sıralanır ve genel kataloğun ardından gelir; gerekçe ADR 001'dedir.

