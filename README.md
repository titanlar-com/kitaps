# Kitaplık

[Canlı site](https://titanlar-com.github.io/kitaps/) · [JavaScript gerektirmeyen katalog](https://titanlar-com.github.io/kitaps/catalog/)

Kitap kimliklerini, Türkçe baskıları, kitaplar arasındaki hazırlık ve eşlik ilişkilerini ve açıklanabilir bir okuma önceliğini bir araya getiren okuma kataloğu. Ekim 2026 itibarıyla 956 eser (makale ve denemeler dahil), 30 küme, 152 alt küme ve 21 kategori içerir. Güncel sayılar sitede ve `src/catalog.json` içinde katalogdan hesaplanır.

## Özellikler

- Kapakların öne çıktığı raf düzeni: telefonda 2 (yatayda da), tablette 3, masaüstünde 4 sütun; daha geniş ekranda da 4. Açık ve koyu tema; başlıklarda Literata, arayüzde cihazın kendi yazı tipi. Telefonda ilk ekranda kitap kartları görünür.
- Üst menüde yalnız simgeler: Kızım için (çocuk kitapları), Favoriler (kalp) ve Kitaplığım (raf).
- Kızım için: 13 yaşına kadar temel kütüphane. Yaş bantlarına (3–5, 5–7, 7–8, 8–10, 10–11, 11–12, 12–13) ve iki çekirdek seçkiye (Çekirdek 14 · 10 yaş öncesi, İlk altı · 10–13) göre gruplanır; her kitapta önerilen yaş, gerekiyorsa ebeveyn notu ve iki sitede doğrulanmış Türkçe baskı bulunur. Okuma rotaları: resimli kitaplardan ilk romanlara yaş rotası, 10 yaşında başlayan çocuk için ilk beş kitap ve 10–13 yaş için dört başlangıç yolu (okumaya isteksiz, macera, insan ilişkileri, felsefi sorular).
- Çocuk kitapları okuma önceliğinde kendi aralarında sıralanır (çocuk kitapları arasında #1, #2 …) ve genel kataloğun ardından gelir.
- Her kitabın kitaplığa eklendiği gün vardır: kitap sayfasında görünür, filtrelerde "Eklenme tarihi" bölümünden seçilir (`?added=2026-10-04`), "Eklenme · yeni" sıralaması son eklenenleri öne alır ve JSON dışa aktarmada `kitapligaEklenme` alanındadır.
- Okundu ve satın alındı işaretleri kapakta şerit olarak görünür; okunmuş kitapların kapakları yarı yarıya gri tondadır. İşaretler hem kartta hem kitap sayfasında yer alır, puanı değiştirmez.
- Varsayılan sıralama okuma önceliğidir. Her kitabın puanı beş katalog ölçütünden gelir. Detay sayfasının sonunda her ölçütün katkısı ve kanıtı görünür.
- Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez. Kural [ADR 001](docs/ADR-001-reading-priority-and-state.md) içinde açıklanır.
- Kitap detayında okuma amacı, gerekçeli önce/sonra/birlikte okuma önerileri, Türkçe baskı, yayınevi, çevirmen ve ISBN.
- Önerilen makale ve denemeler de kitaplarla birlikte listelenir. Kapak yerinde ve kartta "Makale" ya da "Deneme" yazar. Kitap sayfası baskı ve satın alma bağlantıları yerine yayımlandığı yeri, DOI'yi ve varsa ücretsiz metnin bağlantısını gösterir.
- Sayfa başına 24, 48, 96, 192 veya 384 kitap gösterilir (varsayılan 24). Her sayfa boyutu 2, 3 ve 4 sütuna tam bölünür; dolu bir sayfanın son satırında boşluk kalmaz. Sütun sayıları ve sayfa boyutları proje sahibinin kesin kuralıdır (bkz. `AGENTS.md`). Sayfa, filtre, sıralama ve açık kitap okunabilir URL parametrelerinde tutulur; geri tuşu, yenileme ve paylaşılan bağlantı aynı görünümü açar.
- Altbilgide bütün kitapları JSON olarak indirme: kimlik, Türkçe ad, özgün ad, özgün yayınevi, yazarlar, önerilen çevirmenler, Türkiye yayınevi, Türkçe ISBN ve ilk yayın yılı.

## Cihazlar arası eşitleme

Kişisel kayıtlar önce tarayıcıda tutulur, ardından herkese açık [`titanlar-com/kitaps-state`](https://github.com/titanlar-com/kitaps-state) deposundaki `state.json` dosyasıyla eşitlenir. Bu kayıtlar ve GitHub geçmişi herkes tarafından görülebilir.

- **Bağlantı:** Bir cihazdaki işaret ancak o cihaz bağlıysa diğer cihazlara ulaşır. Bağlı olmayan cihazda bekleyen değişiklik varsa sayfanın başında uyarı ve "Bu cihazı bağla" düğmesi çıkar. Aynı pencere altbilgideki "Cihaz eşitleme" ile de açılır.
- **Anahtar:** Bağlamak için ince ayarlı (fine-grained) bir GitHub anahtarı girilir.
  - Anahtarın sahibi (Resource owner) `titanlar-com` olmalıdır. Kişisel hesaba bağlı anahtarlar, depolar kuruluşa taşınmadan önce oluşturulanlar da, bu depoya yazamaz.
  - Anahtar yalnız `kitaps-state` deposunda (Only select repositories) Contents: Read and write izni taşımalı ve süreli olmalıdır.
  - Kuruluş yeni anahtarları onaya bağlıyorsa (GitHub'ın varsayılanı), anahtar bir kuruluş sahibi onaylayana kadar yalnız okuyabilir. Kuruluş sahiplerinin kendi anahtarları kendiliğinden onaylanır.
  - Kaydetmeden önce yazma izni GitHub'da denenir; yazamayan anahtar kaydedilmez.
  - Klasik ve OAuth anahtarları kabul edilmez.
- **Okuma:** Anahtarsız cihazlar ortak durumu salt okunur görür. Sayfa açılırken ve sayfaya dönülünce taze kopya istenir; arada CDN kopyası en fazla beş dakika gecikebilir.
- **Gönderim:** Bağlı cihaz değişiklikleri tek güncellemeyle gönderir: sayfadan ayrılırken ya da ilk değişiklikten 120 saniye sonra. Bağlanınca, o cihazda bekleyen değişiklikler hemen gönderilir.
- Bir cihaz bağlandığında, bağlı değilken yaptığı değişiklikler ortak kayıtla karşılaştırılır. Aynı kitabı bu arada başka bir cihaz farklı kaydettiyse önce yedek alınır ve hangisinin kalacağı sorulur.

Anahtar tarayıcıda saklanır. Kuruluşun özel alan adı kullanmayan bütün Pages siteleri, ileride açılacaklar da, `titanlar-com.github.io` altında aynı tarayıcı alanını paylaştığı için anahtarın yetkisi tek depo ve tek izinle sınırlı tutulmalıdır. Kuruluşta Pages yayımlayabilen her üye ve Pages'a yayın yapan her iş akışı bu alanda betik çalıştırıp anahtarı okuyabilir. Kuruluşa yeni üye eklenecekse kuruluş ayarlarında (Member privileges → Pages creation) Pages oluşturma iznini kısıtla ya da siteyi özel bir alan adına taşı.

**Adres değişikliği (21 Ekim 2026):** Site ve depolar `titanlar-com` kuruluşuna taşındı. Tarayıcı kayıtları adrese bağlı olduğundan eski adreste kalan anahtar, işaretler ve gönderilmemiş değişiklikler yeni adrese geçmez. Eski site artık açılmadığı için bu kayıtlar yeni siteden kurtarılamaz. Ortak kayıtlar `state.json` ile birlikte taşındı. Her cihaz yeni adreste `titanlar-com` sahipli bir anahtarla bir kez yeniden bağlanır. Eski anahtarlar GitHub'da (Settings → Developer settings → Fine-grained tokens) iptal edilmelidir.

## Veri doğruluğu

- Türkçe baskı durumu kanıta dayanır: doğrulanmış baskı kaydı, Türkçe baskı kapağı, kaynak listesinin doğrulanmış çeviri notu veya iki aşamalı araştırma. Bir çevirinin bulunamaması, hiç yayımlanmadığı anlamında sunulmaz.
- İki aşamalı araştırma kayıtları `data/translation-availability.json` (Türkçe baskı) ve `data/bibliographic-facts.json` (özgün ad, dil, ilk yayın yılı ve yayınevi) dosyalarındadır. İkinci inceleme, birinci aşamanın kullanmadığı sitelerden kanıt gösterir; doğrulayıcılar `scripts/translation_availability.py` ve `scripts/bibliographic_facts.py` içindedir.
- Baskı künyeleri `data/edition-verification.json` ve `data/translator-research.json` içinde kaynaklarıyla tutulur. Künye doğrulaması çeviri kalitesi karşılaştırması değildir.
- Çocuk kütüphanesi `data/children-library.json` içindedir: ebeveynin seçtiği kitaplar, BookTrust, TIME, School Library Journal, Scholastic ve MEB 100 Temel Eser listeleriyle karşılaştırıldı. Her Türkçe baskı ISBN, yayınevi ve çevirmen üzerinden iki ayrı sitede doğrulandı; doğrulanamayanlarda kitap sayfası gerekçeyi gösterir. Dış listeler (IBBY Türkiye onur listesi dahil) tek bir araştırma adımında birlikte incelendiği için okuma önceliğinde tek seçki sayılır.
- Eklenme günleri `data/added-dates.json` içindedir ve git geçmişinden çıkarılır: ilk Kitaps sitesinin commit'leri (2 Eylül 2026), Kitap Atlası çalışma kopyasının commit'leri (26 Eylül 2026) ve bu depo. Bir kitabın günü, kitabı kimliği, ilk Kitaps anahtarı veya atlas anahtarıyla içeren ilk commit'in tarihidir; başlık benzerliği kullanılmaz. Henüz commit edilmemiş kitaplar çalışma günü tarihini alır.
- Temel okumalar ve küme anahtarları `data/foundational-reading.json` içindedir. Her kitap, katalogdaki belirli kitapları açan bir anahtardır; ilişkiler zorunlu önkoşul değil, önerilen okuma sırasıdır. Katalogdaki bir kitap da anahtar olabilir (`existingId`). "Baştan okunacaklar" alt kümesi kataloğun her yerini açan kitapları sırasıyla verir. Kümeye gelince okunacaklar ve yöntem notları kümenin açıklamasındadır.
- Popüler kavramların özgün kaynakları `data/original-sources.json` içindedir. Gelişim zihniyeti, psikolojik güvenlik, çevik yöntemler, OKR, hizmetkâr liderlik, farkındalık, tasarım odaklı düşünme, strateji, akış/azim/irade ve teknolojik tekillik başlıklarında her eserin rolü yazılıdır: özgün kaynak, popüler sürüm ya da eleştiri. Yeni Türkçe baskılar iki ayrı sitede ve bağımsız ikinci aşamada doğrulandı. Roller not ve alt küme olarak kalır, puana eklenmez.
- Personal MBA listesi ortak yazarları "et al" diye kısaltır ve iki adı yanlış yazar (Joel Dominguez, Richard Stuteley). Katalog bu kitapların yazarlarını kitapların kendi künyesindeki gibi gösterir (`scripts/merge-data.py`, `AUTHOR_FIXES`).
- Raf taraması değerlendirmesi `data/shelf-review.json` içindedir: fotoğraflanan kitap raflarından yapılan okuma önerileri, öncelik ve koşul notlarıyla. Yeni Türkçe baskılar iki ayrı sitede doğrulandı. Benzer adlı ya da karışabilecek kitaplar kümenin notunda ve ilgili kitabın sayfasında belirtilir. Öncelikler not olarak kalır, puana eklenmez.
- Eseri veya baskısı belirsiz kayıtlarda kapak yerine açıklama gösterilir. Yanlış eserle eşleşen kapaklar `data/rejected-cover-matches.json` içinde gerekçesiyle korunur.
- Her kapağın iki kopyası vardır: `public/covers/` (en çok 720 px, 2x masaüstü ekranları) ve `public/covers/sm/` (en çok 400 px, telefonlar ve küçük kapaklar). Tarayıcı `srcset` ile gösterilen boyuta ve ekran yoğunluğuna uyanı indirir.
- `scripts/upgrade-covers.py`, her kapağın gerçek çözünürlüğünü ölçer; mağazanın büyüttüğü pikselleri saymaz.
  - Bir kapak yalnız aynı kaynaktaki aynı görselin daha büyük ya da özgün kopyasıyla değişir; kopya, oran ve görsel benzerlik denetiminden geçmelidir.
  - Başka bir siteden aynı ISBN'in görseli alınmaz. Bu görseller çoğu zaman başka bir basımı gösterir (baskı rozeti, seri başlığı, alıntı farkı), kapak ise katalogdaki baskının kanıtıdır.
  - Gözle karşılaştırılıp düzeltilen kapaklar betikte gerekçesiyle yazılıdır; veri kayıtları da gösterilen görselin kaynağını adlandırır.
  - Her kapağın kararı ve büyük kopyasının adresi `data/cover-upgrades.json` dosyasındadır.
  - Yeniden çalıştırmak için: `python3 scripts/upgrade-covers.py --cache <depo dışında bir klasör> --write`. Kayıtlı kapaklar `--force` verilmedikçe yeniden işlenmez.
- [Kontrol kapsamı ve bilinen sınırlar](docs/UX-VALIDATION.md) · [Bağımsız denetim raporu](docs/BAGIMSIZ-DENETIM-RAPORU.md)

## Arama motorları

Uygulama sayfaları `noindex` olarak işaretlidir. Arama motorları için her kitabın, kategorinin ve kümenin statik sayfası `/kitaps/catalog/` altında üretilir; `sitemap.xml` bu sayfaları listeler. GitHub Pages proje siteleri alan adının kökündeki `robots.txt` dosyasını değiştiremediği için sitemap Google Search Console ve Bing Webmaster Tools'a elle gönderilmelidir: `https://titanlar-com.github.io/kitaps/sitemap.xml`. Adres değiştiği için bu araçlarda `https://titanlar-com.github.io/kitaps/` için yeni bir site (URL öneki) kaydı gerekir.

## Geliştirme

```sh
npm ci
npm run data        # kaynaklardan src/catalog.json üretir
npm test            # veri, alan ve bileşen testleri
npm run typecheck   # TypeScript alanı sıkı, JS/JSX görünümleri gevşek kurallarla
npm run build       # parçalı site + statik SEO sayfaları (dist/)
npm run test:e2e    # dist üzerinde Playwright; önce npm run build
npm run export      # kapakları gömülü tek dosya: ../kitaps.html ve ../kitaplik-tum-veri.json
```

Kataloğa kitap eklendiğinde önce kataloğu üret, sonra eklenme günlerini güncelle ve kataloğu yeniden üret. Betik daha önce kaydedilmiş bir günü yalnız daha erken bir günle değiştirir; `--rebuild` bütün günleri git geçmişinden yeniden çıkarır:

```sh
npm run data
python3 scripts/infer-added-dates.py --atlas ../kitapsxsil --write
npm run data
```

GitHub Actions her gönderimde testleri, tip kontrolünü, derlemeyi ve tarayıcı testlerini çalıştırır; hepsi geçerse GitHub Pages'a yayınlar.

Türkçe baskı ve özgün baskı araştırmasının adımları `scripts/prompts/bibliographic-research-stage1.md`, `stage2.md` ve `scripts/merge-bibliographic-research.py` içinde tanımlıdır. Araştırma çıktıları depo dışında tutulur; yalnız ikinci aşamada kabul edilen kayıtlar veri dosyalarına eklenir.

Geliştirme ortamında Control+Alt+A ile erişilebilirlik denetimi açılabilir. Bu araç yayın derlemesine dahil edilmez.

## Korunan eski sürüm

Önceki uygulamanın bütün izlenen dosyaları `legacy/b1d060c/` altında korunur. Git geçmişi değiştirilmemiştir. Özgün Markdown ve kapak listesi `data/kitaplar.md` ve `data/covers.json` yollarında da durur. Birleştirilen girdiler `data/sources/` altındadır. Eski Kitaps işaretleri aynı tarayıcıda ve aynı site adresinde otomatik taşınır; adres değişikliğinden önceki tarayıcı kayıtları yeni adrese geçmez.

## Lisanslar

React Bits SpotlightCard: MIT + Commons Clause (`REACT-BITS-LICENSE.md`). Literata yazı tipi: SIL Open Font License (`FONT-LICENSES.txt`). Kullanılan diğer arayüz kitaplıkları kendi lisanslarına tabidir.
