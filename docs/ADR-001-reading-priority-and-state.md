# ADR 001: Okuma önceliği ve cihazlar arası durum

## Karar

Uygulama mevcut React görünüm katmanını korur. İş kuralları TypeScript sınıflarında ve React dışındaki saf modüllerde tutulur.

- **Model:** `ReadingGraph`, `CatalogReadingProfile` ve `ReadingPriorityEngine` yalnızca katalog verisini değerlendirir. Motorun kişisel bir girdisi yoktur: `rank()` parametre almaz.
- **ViewModel:** `ReadingRankingViewModel`, görünümün kullanacağı sıralı listeyi ve kitap kimliğine göre sonuç haritasını üretir. Katalog değişmediği sürece sonuç her cihazda aynıdır ve uygulama açılırken bir kez hesaplanır.
- **View:** React bileşenleri puanı, sıra numarasını, olgunluk düzeyini ve her ölçütün kanıtını gösterir. Kitap sayfasındaki hazırlık önerileri motorun kullandığı `ReadingGraph` üzerinden okunur.
- **Repository:** `GitHubStateRepository`, `kitaps-state/state.json` dosyasını okur ve yazar.
- **Batcher:** `GitHubStateBatcher`, her değişikliği önce kalıcı yerel kuyruğa alır; uzak yazımı ilk değişiklikten en az 30 saniye sonra yapar.

## Okuma önceliği politikası (reading-priority-v2.1.0)

Varsayılan sıralama okuma önceliğidir. Motor beş katalog ölçütü kullanır:

| Ölçüt | Ağırlık | Kaynak |
|---|---:|---|
| Editoryal kesişim | %17 | Kitabın yer aldığı bağımsız seçki sayısı |
| Öğrenme kaldıracı | %29 | Kitabın açtığı devam kitapları ve eşlikçileri |
| Hazırlık uygunluğu | %20 | Kitaptan önce önerilen hazırlık okumalarının yükü |
| Okuma eşiği | %16 | Kategoriden türetilen zorluk; çocuk kitapları genç okura göre |
| Kalıcılık | %18 | Yayın yılı ile taktik ve kalıcı konu dengesi |

**Kişisel eylemler puanı değiştirmez.** Satın alma, alınacaklar, favori, okuma durumları (`okunuyor`, `okundu`, `ara verildi`, `bırakıldı`), okuma tarihleri, sayfa ilerlemesi, notlar ve kişisel sıra; puanı, olgunluk düzeyini, kriter değerlerini veya sıralamayı değiştirmez. v1'deki "erişim hazırlığı" ve "kitaplık kapsamı" ölçütleri satın alma bilgisine dayandığı için v2'de kaldırıldı. Kalan ölçütler v1 oranlarıyla yeniden ölçeklendi.

Olgunluk eşikleri politikanın parçasıdır (`src/ranking/policy.ts`): 76 ve üstü "Çok yüksek", 57,5 "Yüksek", 38 "Orta", 18 "Bağlama bağlı", altı "Düşük". Bu değerler v1 eşiklerinin (72/58/43/28) yeni ölçekteki karşılığıdır.

Katalog değişince bütün ölçütler yeniden normalize edilir ve bütün kitaplar yeniden sıralanır. Eşit puanlı kitaplar aynı sıra numarasını paylaşır; liste bunları okurun gördüğü başlığa göre alfabetik gösterir.

### Okur kitlesi (v2.1)

Çocuk kategorisindeki kitaplar farklı bir okur için seçilir. v2.1'de bu kitaplar kendi aralarında normalize edilir ve sıralanır (çocuk kitapları arasında #1, #2 …); genel katalog da kendi içinde sıralanır. Okuma önceliğine göre sıralı listelerde önce genel kitaplar, ardından çocuk kitapları gelir. Ağırlıklar ve olgunluk eşikleri değişmedi.

Gerekçe: 10 yaşına kadar temel kütüphane eklenince çocuk kitapları ebeveyn listeleri ve çocuk kitabı listeleri üzerinden birden çok seçkiye girdi. Tek bir sıralamada genel kataloğun ilk 50 kitabının 23'ü çocuk kitabı oluyordu; bir çocuk kitabını *Rekabet Stratejisi* ile aynı ölçekte karşılaştırmak okura anlamlı bir sıra vermiyordu. Aynı katalog yine her cihazda aynı puanı üretir ve kişisel eylemler puana girmez.

Çocuk kitabı listeleri (BookTrust, TIME, School Library Journal, Scholastic, MEB 100 Temel Eser) bu kütüphane için tek bir araştırma adımında birlikte incelendi. Bu yüzden tek bir küme olarak modellenir ve editoryal kesişimde bir seçki sayılır; hangi listelerde geçtiği alt kümelerde görünür.

### Hazırlık ilişkileri

`ReadingGraph` tek kaynaktır:

- Editoryal `before/after` bağları çift yönlüdür: A, B'nin "önce" listesindeyse B de A'nın "sonra" listesinde görünür.
- Kategori rotaları yalnızca ardışık adımlarını ekler; rotanın ilk kitabı üçüncü kitabın önkoşulu sayılmaz.
- `companions` birlikte okumayı temsil eder; öğrenme kaldıracına katkı verir, hazırlık yükü oluşturmaz.
- Kitap sayfasında gösterilen hazırlık sayısı ile puan kartındaki hazırlık ölçütü aynı grafikten gelir ve testle eşitlenir.

Kaynak veride hiçbir kitaba doğrudan puan yazılmaz.

## Durum deposu (şema 2)

`titanlar-com/kitaps-state` ikinci ve zorunlu uzak durum deposudur (21 Ekim 2026'da kişisel hesaptan `titanlar-com` kuruluşuna taşındı; adres `src/state/types.ts` içindedir). Proje ve kullanıcı durumu bilinçli olarak herkese açıktır. Favoriler, sahiplik ve okuma durumları, okuma sırası, tarihler, sayfa ilerlemesi ve okuma notları `state.json` içinde tutulur ve GitHub geçmişinde görünür.

- **Okuma:** Anahtarlı cihazlar API'yi `If-None-Match` ile koşullu okur.
- **Anahtarsız okuma:** Anahtarsız cihazlar periyodik okumada dosyayı `raw.githubusercontent.com` üzerinden, özel başlık göndermeden okur. Bu basit bir CORS isteğidir ve API sınırına takılmaz. Ancak CDN kopyası en fazla beş dakika gecikebilir; sorgu parametresi bu önbelleği aşmaz (5 Ekim 2026'da denendi).
- **Taze okuma:** Sayfa açılırken ve sayfaya en az 30 saniye sonra dönülünce anahtarsız cihaz önce API'yi dener. Bu deneme her sayfada en çok dakikada bir yapılır, çünkü GitHub ağ adresi başına saatte 60 anonim istek tanır; aynı ağdaki sekmeler ve cihazlar bu payı paylaşır. API yanıt vermezse ya da sınır doluysa CDN kopyası kullanılır.
- **Düzenli okuma:** Görünür sayfa ortak dosyayı son okumadan 30 saniye sonra yeniden okur (proje sahibinin 22 Ekim 2026 kararı; önceden 120 saniyeydi). Denetim 5 saniyede bir yapılır, böylece okuma bir dönem gecikmez. Anahtarlı cihaz API'yi koşullu okur: saatte 120 istek, 5000'lik sınırın çok altında. Anahtarsız cihazın düzenli okuması CDN kopyasıdır; taze API okuması yukarıdaki gibi en çok dakikada birdir. Gizli sayfa okumaz.
- **Eski kopya:** Her yazım dosyanın `updatedAt` zamanını önceki dosyanınkinden kesin olarak ileri taşır. Böylece cihazın gördüğü ya da yazdığı dosyadan eski bir kopya her zaman tanınır ve onun yerine geçmez; geride kalan bir CDN kopyası yeni bir işareti geri almaz.
  - Cihazın gördüğü en yeni dosya, ziyaretler arasında da `kitapatlasi:github-state:remote:v1` altında saklanır; yeniden açılan sayfa daha eski bir CDN kopyasına dönmez. Bu kopya yalnız ortak dosyadır: gönderilmemiş değişiklikler ve alan temelleri (`base:v1`) kendi anahtarlarındadır. Kopya, depo adresiyle (sahip, depo, dal, dosya) birlikte saklanır; başka bir adresin kopyası kullanılmaz.
  - API dosyanın o anki hâlini verir. Bu yüzden API'den gelen okuma, önceki bir ziyaretten saklanan daha yeni görünen kopyanın yerine geçer (dosya bu arada elle sıfırlanmış olabilir). Aynı ziyaret içinde görülenden eski hiçbir kopya, API'den de gelse, onun yerine geçmez.
  - Kopya, saklandığı saatle birlikte tutulur. CDN kopyası en çok beş dakika gecikir; bu yüzden saklanmasından 10 dakika sonra okunan daha eski bir CDN kopyası, ortak dosyanın geri alındığı anlamına gelir ve yeni bir ziyarette kabul edilir.
  - Aynı tarayıcının başka bir sekmesi daha yeni bir dosya sakladıysa okuma onu esas alır; daha az görmüş bir sekme saklanan kopyayı geri götürmez.
- **İstek başlıkları:** Yalnızca `Accept`, `X-GitHub-Api-Version`, `Authorization` ve `If-None-Match`. GitHub'ın CORS ön kontrolü başka özel başlıkları (ör. `Cache-Control`) reddeder; test bu listeyi GitHub'ın canlı yanıtıyla karşılaştırır.
- **Birleştirme:** Her kitap kaydı alan bazında (`states`, `reading`) düzenlenme zamanı taşır. Gönderilmemiş bir yerel değişiklik dokunmadığı alanları hiç değiştirmez.
  - Her gönderilmemiş düzenleme, göreli olduğu değeri (tabanını) da saklar: alanın, bu cihazın o alana ilk gönderilmemiş düzenlemesinden önce bildiği hâli (son okumasından ve kendi bekleyen düzenlemelerinden oluşan görünüm). Ortak dosya o alanı tabandan beri değiştirmediyse düzenleme olduğu gibi yazılır; sıra değişiklikleri, kaldırılan işaretler ve silinen notlar da böyle gider.
  - Ortak dosya alanı bu arada değiştirdiyse üç yönlü birleştirilir. İşaretlerde bu cihazın kaldırdıkları gider, eklediği gelir, gerisi ortak dosyanındır. Birbirini dışlayan iki işaretten (alınacak ve satın alındı; okunuyor, okundu, ara verdim ve bıraktım) yalnız biri kalır: alanı (`states`) sonra değiştiren tarafınki. Okuma kaydında (tarihler, sayfalar, notlar) her parça ayrı ele alınır: bu cihazın değiştirdiği parça onun değerini alır; iki taraf aynı parçayı farklı değiştirdiyse alanı sonra değiştiren kalır. Parçalar ayrı birleştiği için bir cihazın sayfası ile ötekinin toplam sayfası, ya da başlama ve bitiş tarihleri, birbirine uymayabilir; okur kaydı düzeltebilir. Okuma sırasında iki tarafın çıkardığı kitaplar çıkar, eklediği kitaplar gelir. Sırayı sonra değiştiren tarafın düzeni geçerlidir; öteki tarafın kendi kitapları izledikleri kitabın ardında yer alır. Sıra en çok beş kitaptır; fazlası olursa önce öteki tarafın kendi kitapları çıkar.
  - Böylece birbirini görmeden aynı kitabın farklı işaretlerini, okuma kaydının farklı parçalarını ya da sıraya farklı kitapları ekleyen iki cihazın ikisinin de düzenlemesi kalır. 22 Ekim 2026'da `tests/e2e/devices-sync.spec.js` ile gösterilen kayıp (sonra yazanın bütün işaret listesini, bütün okuma kaydını ya da bütün sırayı değiştirmesi) böyle giderildi. Aynı parçayı iki cihazın farklı değiştirmesinde, birbirini dışlayan işaretlerde, beş kitap sınırında ve commit geçmişi sorulamadığında yanıtı gelmemiş bir yazımdan sonra başka cihazın değiştirdiği alanda bir taraf yine kaybeder. Bağlanma sorusu (aşağıda) da alan düzeyinde sorar.
  - Gönderilen düzenleme tabanı ilerletir. Bir yazım sürerken aynı kitaba yapılan yeni düzenleme, yazım başarılı olunca gönderilen değere dayanır; böylece yazım sırasında yapılan geri alma kaybolmaz.
  - Sayfa, bekleyen bir düzenlemeyi başka cihazın değişikliğiyle birleştirip gösterdiyse, okurun bu görünüm üzerine yaptığı yeni düzenleme, görünümün geldiği ortak dosyaya dayanır. Böylece öteki cihaz o değişikliği sonra geri alırsa, geri alma bu cihazın eklemesi sanılmaz. Okurun öteki cihazın işaretini ya da kitabını kaldırması da gider. Taban, sayfanın en son gösterdiği dosyadan alınır, en son okunan dosyadan değil. Görünüm o alanın yanıtı gelmemiş gönderimlerini de hesaba kattığı için bu gönderimler o alan için bırakılır.
  - Bu taşıma yalnız okurun düzenlediği görünüm, sayfanın o dosyadan gösterdiği değerle aynıysa yapılır. Okur ilk okuma sürerken düzenlediyse ekran önceki görünümü korur. Sıra da bu cihazın kataloğunda olmayan kitapları göstermez. Bu iki durumda düzenleme ilk tabanında kalır, böylece öteki cihazın hiç görülmemiş değişikliği silinmez. Bir yazım sürerken de taşıma yapılmaz.
  - Okur, sayfa ortak dosyayı okurken bir alanı değiştirirse, ekran o alanda okurun değerini korur. Düzenleme okurun gördüğü değere dayanır, hiç görmediği paylaşılan değere değil. Böylece ilk okuma sürerken yapılan bir işaret, başka cihazın bu arada eklediği işareti ya da sıradaki kitabı silmez.
  - Bir yazım GitHub'a ulaşıp yanıtı gelmeyebilir (telefonda sayfa kapanırken, ağ koparken). Bu yüzden her yazma isteğinin hemen öncesinde, isteğin dosyaya yazacağı değer ve alan zamanları düzenlemenin yanına kaydedilir (en çok 10 sürüm). Okuma başarısız olduğu için hiç gönderilmeyen bir yazım kaydedilmez. Tarayıcı çevrimdışıyken yazma isteği hiç gönderilmez. Aynı değer yeniden gönderilirse tek bir sürüm olarak kalır ve iki yazımı da listeler. GitHub yazımı kesin olarak reddederse (sunucu hatası dışında bir yanıt) o yazım kayıttan silinir, çünkü dosyaya ulaşmadı. Bir yazımın 409 sonrası kendi denemeleri de bu kaydı kullanmaz.
  - Her yazım, commit mesajında rastgele bir kimlik taşır: `Update Kitaplık state (write <kimlik>)`. Yanıtı gelmemiş bir yazım varsa, cihaz bir sonraki okumada `state.json` dosyasının commit geçmişini bir kez sorar. Kimlik geçmişte varsa yazım ulaşmıştır ve gönderilen değer taban olur. Kimlik tam bir geçmişte yoksa yazım ulaşmamıştır ve kayıt bırakılır, düzenleme ilk tabanına göre birleşir. Telefon sayfadan ayrılırken eski bir sha ile yazdığında GitHub 409 döner, ama yanıt sayfaya ulaşmaz. Bu durum en sık bu yolla çözülür. Anahtar yoksa ya da GitHub yanıt vermezse aşağıdaki zaman kuralları kullanılır.
  - Ortak dosyadaki alan hâlâ gönderilen zamanı taşıyorsa düzenleme o değere dayanır: yeniden gönderim bir şey değiştirmez, sonraki geri alma da kaybolmaz.
  - Ulaşan bir yazımdan sonra alanın zamanı hiçbir zaman geri gitmez. Bu yüzden ortak alandan daha yeni zamanlı bir gönderim ulaşmamıştır ve hesaba katılmaz.
  - Geçmiş sorulamadıysa ve alan gönderilen zamanların hiçbirini taşımıyorsa iki durum ayırt edilemez: yazım ulaştı ve sonra başka bir cihaz alanı değiştirdi, ya da yazım hiç ulaşmadı. İlk tabana göre birleştirmek öteki cihazın kaldırdığını geri getirebilirdi (7 Kasım 2026 incelemesi). Bu yüzden bu durumda alanı sonra düzenleyen kazanır. Ortak alan daha yeniyse son gönderilen değerle üç yönlü birleştirilir. Yazım ulaştıysa sonuç doğrudur. Ulaşmadıysa bu cihazın o düzenlemesi, tabansız bir düzenlemede olduğu gibi kaybeder.
  - Taban ve alan zamanları, bekleyen kuyruğun yanında ayrı bir kayıtta (`kitapatlasi:github-state:pending-basis:v1`, düzenleme kimliğiyle) tutulur. Kuyruğun kendi biçimi değişmez; eski kodla açık kalmış bir sayfa onu okumayı sürdürür. Tabanı olmayan bir düzenleme (eski kodun kuyruğa aldığı ya da tabanı bozulmuş olan) önceki gibi birleşir: o alanı ondan sonra düzenleyen başka cihazın değeri kalır. Kitabı temizleyen düzenleme kayıt düzeyinde kalır.
- **Damga:** Yeni bir yerel düzenleme, taşıdığı alanlar için cihazın ortak dosyada gördüğü en yeni damgadan önceye damgalanmaz; o damgadan bir milisaniye sonrası alınır. Kitabı temizleyen bir düzenleme kaydın tamamından, sıra düzenlemesi sıranın damgasından sonra gelir. Saati geri kalan bir cihazın yeni düzenlemesi böylece, üzerine yapıldığı değere yenilmez.
  - Bekleyen eski kayıtlar okumayla yeniden damgalanmaz. Yeni damga yalnız yeni bir kullanıcı düzenlemesinde ve "Bu cihazdakini kullan" kararında üretilir. Aynı kitabın düzenlemeleri tek kayıtta birleşir, ama her alan kendi son düzenleme zamanını ve ilk gönderilmemiş düzenlemesinin tabanını korur: bir alana yapılan yeni düzenleme öteki alanı yeniden damgalamaz, kaybetmiş eski bir düzenleme de böylece kaybetmiş kalır.
  - Cihazın kendi damgaları geri gitmez: saat geri alınsa da yeni damga, cihazın önceki damgalarından sonra gelir. Saati ileri olan bir cihazın damgasını aşan düzenleme bu yüzden aynı ziyaretteki sonraki düzenlemeleri de o kadar ileri taşır; fark, cihaz saatleri arasındaki farkla sınırlıdır.
  - Toplu gönderimin 30 saniyelik penceresi damgadan değil, değişikliğin bu cihazın saatindeki zamanından sayılır; ileri taşınan damga pencereyi uzatmaz. Bir yazım sürerken yapılan ve damgası ileri taşınan değişikliğin penceresi en geç o yazımın bittiği andan sayılır; pencere en çok yazımın süresi kadar uzar, hiçbir zaman kısalmaz.
- **Okuma sırası:** Tek bir kayıt olarak (`queue`) tutulur. Tabanı olmayan bir sıra düzenlemesinde bütün olarak son yazan kazanır. Tabanı olanlar, yukarıdaki "Birleştirme" maddesinde anlatıldığı gibi birleştirilir.
- **Toplu gönderim:** Yerel kuyruk ilk değişikliğin zamanını saklar. Gönderim bu zamandan en az 30 saniye sonra yapılır. Bu süre proje sahibinin 22 Ekim 2026 kararıdır ("eşitleme süresi 2dk değil, 30 sn olsun"); önceden 120 saniyeydi. Bu kuralın bilinçli istisnaları:
  - "Şimdi gönder" düğmesi.
  - Hata sonrası yeniden denemeler: 15 ve 30 saniye, 1, 2 ve 5 dakika; değişiklikler bekledikçe sonra 5 dakikada bir. Reddedilen anahtar, dolu yerel alan, bozuk ya da bulunamayan dosya yeniden denenmez: bunları yalnız okur düzeltebilir.
  - Bir cihaz bağlandığında, o cihazda bekleyen değişikliklerin hemen gönderilmesi.
  - Sayfadan ayrılırken (`visibilitychange` ile gizlenme, `pagehide`) gönderim. Telefon, okur başka uygulamaya geçtiği anda sayfayı askıya aldığından, aksi halde değişiklik bir sonraki ziyarete kalırdı. 4 Ekim 2026'da bildirilen "telefonda işaretledim, bilgisayarda göremiyorum" sorununun bir nedeni buydu.
- **Tek yazım:** Gizlenme, zamanlayıcı ve düğme aynı anda gönderim isterse tek bir yazım hepsine hizmet eder. O yazım sürerken yapılan bir değişiklik, hemen ardından kendi yazımını alır.
- **Tek istek:** Yazım, son okunan ya da yazılan dosyanın sha'sı üzerine tek istekle yapılır; sayfa gizlenirken gönderilen yazım `keepalive` taşır (gövde 60 KB'den küçükse). Dosyayı bu arada başka bir cihaz değiştirdiyse GitHub 409/422 döner ve yazım taze okumadan yeniden başlar. Her istek 20 saniyede zaman aşımına uğrar.
- **İstek sınırı:** GitHub sınırı aşıldığında istemci, yanıttaki `Retry-After` süresi kadar (ikincil sınır) ya da saatlik pay bittiyse sıfırlanma zamanına kadar bekler. Zamanlayıcı, "Şimdi gönder" ve sayfadan ayrılma bu süreden önce göndermez.
- **Reddedilen anahtar:** GitHub anahtarla yapılan okumayı 401 ile reddederse cihaz herkese açık dosyayı anahtarsız okumayı sürdürür. 403 ret sayılmaz, çünkü GitHub bazı ikincil sınırları da başlıksız 403 ile bildirir. Ret sürerken hiçbir yol yazmaz: zamanlayıcı durur, sayfadan ayrılma göndermez, "Şimdi gönder" önce anahtarı taze bir okumayla yeniden dener ve GitHub kabul ederse yazma kendiliğinden sürer. Bekleyen değişiklikler cihazda kalır ve yeniden bağlanma istenir.
  - Bağlanma karşılaştırması anahtarsız okumaya hiç düşmez: anahtar reddedilirse işaret kalır, hiçbir şey gönderilmez ve yeniden bağlanma istenir.
  - Kuyruk boşken "Şimdi gönder" yazmaz; dosyayı yeniden okur. Son gönderim saati yalnız gerçek bir yazımdan sonra değişir.
- **Commit kimliği:** Her durum commit'i yazar ve commit'leyen olarak proje sahibinin kimliğini (`karacaismail`, GitHub noreply e-postası) açıkça adlandırır. API yazımları yerel Git yazar korumasından geçmediği için kimlik isteğin kendisinde verilir.
- **Yeni cihaz:** Bir cihaz ilk kez eşitlendiğinde yalnız kendisinde olan kayıtları ortak dosyaya ekler. Aynı kitap için iki taraf farklıysa önce yerel yedek alır ve okura hangisinin kalacağını sorar.
- **Bağlanma:** Bir cihaz anahtarla bağlandığında, bağlı değilken yaptığı ve gönderemediği değişiklikler ortak dosyayla karşılaştırılır.
  - Karşılaştırma bitene kadar hiçbir şey gönderilmez. Bunu kalıcı bir işaret sağlar: zamanlayıcı, sayfadan ayrılma ya da yeniden yükleme karşılaştırmayı atlayamaz. Okuma başarısız olursa işaret kalır, uyarı görünür ve karşılaştırma sayfaya dönünce yeniden denenir.
  - Cihaz, ortak dosyadan aldığı her alanın zamanını (`kitapatlasi:github-state:base:v1`) saklar. Bir alan yalnızca başka bir cihaz onu bu cihazın son gördüğünden sonra kaydettiyse (ya da bu cihaz hiç görmediyse) ve değerler farklıysa sorulur. Cihazın kendi okuyup değiştirdiği değer soru değildir.
  - Gönderilmemiş bir değişiklik yalnız taşıdığı alanın zamanını eski haliyle tutar; kitabın öteki alanı ilerler. İlk eşitlemede ya da bir seçimde karara bağlanan kitaplar, karar anındaki dosyayı temel alır; aynı soru bağlanınca yeniden sorulmaz. Okuma sürerken düzenlenen kitabın temeli o okumayla ilerlemez.
  - Karşılaştırma yalnız anahtarla yapılmış (taze) bir okumaya dayanır. Anahtar kaydedilmeden başlamış bir okuma CDN kopyası olabileceğinden karşılaştırma kendi okumasını yapar. Aynı anda tek karşılaştırma çalışır; anahtar bu sırada kaldırılırsa karşılaştırma bir şey göndermez.
  - Yalnız bu cihazda olan kayıtlar ve yeni kitaplar yalnız gerçekten taşıdıkları alanlarla kuyruğa girer; boş bir alan başka cihazın notunu ya da işaretlerini silmez.
  - Alan zamanı (`stamps`) taşıyan bir kayıtta zamanı olmayan alan, birleştirme kuralındaki gibi zamansız sayılır.
  - Soru sorulmadan önce yerel kayıtların ve gönderilmemiş değişikliklerin yedeği alınır.
  - "Bu cihazdakini kullan", yalnızca bu cihazın değiştirdiği alanları yeniden zaman damgalar ve onları karar anındaki ortak dosyaya dayandırır (karardan sonra başka cihazın kaydettiği birleştirilir); bu cihazın dokunmadığı alanlar (ör. başka cihazın notu) korunur. "GitHub'dakini kullan" bu kitapların gönderilmemiş değişikliklerini bırakır.
  - Alan bazında son yazan kazanır kuralı aksi halde bir tarafı sessizce silerdi. Karardan sonra sonuç hemen gönderilir.
- **Şema 1:** Kitap başına sıra konumu taşıyan eski dosyalar okunurken şema 2'ye çevrilir.
- **Bozuk kuyruk:** Bekleyen değişikliklerin kaydı tam okunamazsa silinmez. Kayıt, bulunduğu hâliyle `kitapatlasi:github-state:pending-recovery:v1` altına kopyalanır; okunabilen değişiklikler kuyrukta kalır ve gönderilir. Aynı kayıt bir kez kopyalanır. Eski (v1) kuyruk da aynı biçimde kurtarılır: okunabilen kayıtları kuyruğa geçer, tamamının kopyası alınmadan eski anahtar silinmez. Yalnız sıra konumu taşıyan v1 kayıtları bilerek bırakılır.
  - Kopya saklanamazsa (yerel alan dolu) bozuk kayda dokunulmaz. Okunabilen değişiklikleri bellekten kullanılır: ortak dosya okunur ve gösterilir, bu değişiklikler bir kez gönderilir ve kayıt yerinde durdukça yeniden gönderilmez. Kopya saklanana ya da okur kaydı silene kadar yeni değişiklikler kuyruğa yazılamaz ve yerel alan hatası görünür; yer açılınca önce kopya saklanır.
  - Sayfanın başındaki uyarı ve eşitleme penceresi ne olduğunu söyler: okunabilen değişikliklerin sayısı (hiçbiri okunamadıysa o), kopyanın saklandığı ya da alan dolu olduğu için kaydın yerinde durduğu. Pencerede kopya JSON dosyası olarak indirilir ("Kopyayı indir"). Silme ("Kopyayı sil") geri alınamaz, bu yüzden önce sorulur. Gönderememe uyarıları (yalnız bu cihazda, gönderilemedi) önce gelir; kurtarma uyarısı pencerede yine görünür. Gizlenen kurtarma uyarısı yeni işaretlerle değil, yalnız yeni bir kopya saklanınca yeniden görünür.

### Rota kaydı (`routes.json`, şema 1)

Kitapçılar sayfasındaki rota oluşturucu, kaydedilen rotaları aynı depoda ayrı bir dosyaya yazar: `kitaps-state/routes.json`. Rotalar `state.json` dosyasına konmaz. Böylece durum şeması, birleştirme kuralları ve eski sürümle açık kalmış sekmeler rotalardan etkilenmez. Karar 7 Kasım 2026 tarihlidir.

- **Kayıt:** Her rota ayrı bir kayıttır: kimlik, ad, isteğe bağlı tarih, sıralı kitapçı kimlikleri, not ve gezildi işareti. Silinen rota, silindiği zamanı taşıyan boş bir kayıt olarak kalır. Böylece silme de eşitlenir.
- **Birleştirme:** İki cihazın kaydı rota rota birleşir. Aynı rotada daha yeni kayıt kazanır. Farklı rotalar ikisi de korunur.
- **Yazma:** Değişiklik önce bu cihazda saklanır (`kitapatlasi:routes:pending:v1`). Cihaz eşitlemesinin anahtarı varsa dosya hemen yazılır. GitHub sürüm çakışması bildirirse dosya yeniden okunur, birleştirilir ve en çok üç kez yeniden denenir. Anahtar yoksa ya da yazım başarısız olursa değişiklik cihazda bekler ve sonraki kayıtta gönderilir.
- **Kod:** `src/state/routeRegistry.ts` (kayıt, birleştirme, GitHub istemcisi), `src/routes/planner.js` (yakınlığa göre sıralama ve sıradaki rota önerisi), `src/routes/useRouteRegistry.js` (React görünümüne bağlantı). Testler `tests/route-registry.test.js`, `tests/route-planner.test.js` ve `tests/e2e/route-planner.spec.js` içindedir.

### Yazma anahtarı

- Yalnızca ince ayarlı (fine-grained) kişisel erişim anahtarı (`github_pat_`) kabul edilir. Klasik ve OAuth anahtarları istek gönderilmeden reddedilir. GitHub'ın yanıtında klasik kapsam (`X-OAuth-Scopes`) görünen anahtar da kaydedilmez.
- Anahtar oluşturma bağlantısı sahibi (`target_name=titanlar-com`), Contents yazma iznini ve 90 günlük süreyi önceden doldurur; depo seçimi (yalnız `kitaps-state`) arayüzde adım adım belirtilir.
- İnce ayarlı anahtar yalnız seçtiği sahibin depolarına erişir: kişisel hesaba bağlı anahtar kuruluş deposuna yazamaz. Kuruluş anahtarları onaya bağlıysa (GitHub'ın varsayılanı) onay bekleyen anahtar yalnız herkese açık içeriği okuyabilir; yazma denetiminden geçemez. Kuruluş sahiplerinin anahtarları kendiliğinden onaylanır.
- **Yazma denetimi:** Depo herkese açık olduğundan her geçerli anahtar dosyayı okuyabilir; okuma, yazma izni olduğunu kanıtlamaz.
  - Kaydetmeden önce anahtarla `POST /repos/titanlar-com/kitaps-state/git/blobs` ile küçük, hep aynı içerikte bir blob oluşturulur. Bu istek kaydetmeyle aynı Contents yazma iznini ister, ama hiçbir dalı değiştirmez ve commit oluşturmaz.
  - Bu denetim Git nesnelerine yazma iznini kanıtlar; `main` dalına doğrudan commit'i engelleyen bir kural (yalnız PR ile birleştirme) olsaydı denetim geçer ama kayıtlar reddedilirdi. `kitaps-state` deposunda böyle bir kural yoktur (taşımadan sonra, 21 Ekim 2026'da yeniden denetlendi: depoya ya da kuruluştan gelen kural seti ve dal koruması yok).
  - İkincil istek sınırı (`Retry-After` ile 403) yazamayan anahtar sayılmaz, istek sınırı olarak bildirilir.
  - Yazamayan anahtar ("Bu anahtar kitaps-state deposuna yazamıyor") kaydedilmez. Önceki sürüm yalnız okumayı denetlediği için yazamayan bir anahtarı "doğrulandı" diye kabul edebiliyordu.
- Anahtar tarayıcının `localStorage` alanında tutulur ve istek gövdesine yazılmaz. `titanlar-com` kuruluşunun özel alan adı kullanmayan bütün Pages siteleri `https://titanlar-com.github.io` kaynağını paylaştığından, bu alan o sitelerdeki betiklerce okunabilir. Kişisel hesapta bu alana yalnız hesap sahibi yayın yapabiliyordu; kuruluşta Pages yayımlayabilen her üye ve Pages'a yayın yapan her iş akışı yapabilir (21 Ekim 2026'da kuruluşun tek üyesi sahibiydi ve üyelerin Pages oluşturma izni açıktı). Bu yüzden anahtarın yetkisi tek depo ve tek izinle sınırlandırılır. Yeni üye eklenirse üyelerin Pages oluşturma izni kısıtlanmalıdır. Tam yalıtım için uygulama ayrı bir kaynağa (özel alan adı) taşınmalıdır.
- `localStorage` kaynağa bağlıdır. Site yeni kaynağa taşındığında anahtar, kuyruk ve diğer yerel kayıtlar yeni adrese geçmez; her cihaz yeniden bağlanır. Anahtar adları (`kitapatlasi:github-state:*`) bu yüzden değiştirilmedi.

### Görünürlük

- **Uyarı:** Bağlı olmayan bir cihazda bekleyen değişiklik varsa, sayfanın başında "Bu cihazdaki işaretler yalnız burada" uyarısı ve "Bu cihazı bağla" düğmesi görünür. Bağlı bir cihazın son yazımı reddedildiyse "Değişiklikler GitHub'a gönderilemedi" görünür; okuma hatası bu uyarıyı açmaz. Uyarı her zaman sayfada bulunan bir canlı bölgeden duyurulur; uyarının kendisi canlı bölge değildir.
  - Önceki sürümde bu durum yalnız Notlar sayfasındaki panelde yazıyordu. Telefondan işaretlenen kitaplar bu yüzden hiçbir zaman GitHub'a ulaşmadı: `kitaps-state` deposunda 4 Ekim 2026'ya kadar yalnız ilk kurulum commit'i vardı.
- **Kitap sayfası:** İşaretler kitap sayfasında yapılır. Bu yüzden işaret düğmelerinin altındaki satır, cihazın değişikliklerinin nerede olduğunu söyler: yalnız bu cihazda ("Bu cihazı bağla" düğmesiyle), gönderilecek, gönderiliyor, gönderildi (saatiyle) ya da gönderilemedi. Satır kapatılamaz ve canlı bölgedir; tek bir yazım bütün bekleyen değişiklikleri taşıdığı için kitap değil cihaz düzeyinde konuşur. Bağlantı ve birleştirme pencereleri kitap sayfasının üstünde açılır.
  - 21 Ekim 2026'da bildirilen "bilgisayarda işaretledim, telefonda göremiyorum" sorununda depoda hâlâ yalnız ilk kurulum commit'i vardı. Sayfanın başındaki uyarı, işaretlerin yapıldığı kitap sayfası açıkken görünmüyordu.
- **Okumanın kaynağı:** Eşitleme penceresi son okumanın ve son gönderimin saatini, okumanın GitHub'dan mı yoksa en çok beş dakika gecikebilen önbellek kopyasından mı geldiğini yazar. Önbellek kopyası "güncel" diye sunulmaz. Anahtarsız cihaz da "GitHub’dan yenile" ile taze kopya isteyebilir.
- **Bağlantı penceresi:** "Bu cihazı bağla" ve altbilgideki "Cihaz eşitleme" aynı bağlantı penceresini açar.
- **Gizleme:** Uyarı o ziyaret için gizlenebilir; odak ana içeriğe geçer. Daha fazla değişiklik birikince, nedeni değişince ya da sorun giderilip yeniden ortaya çıkınca uyarı yeniden görünür.
- **Odak:** Bağlantı penceresi kapanınca odak onu açan düğmeye döner. O düğme bağlanmayla kaybolduysa odak, kitap sayfası açıksa sayfanın eşitleme satırına, değilse ana içeriğe geçer; açık bir sayfanın arkasına düşmez. Başarılı bağlantıdan sonra odak pencerenin durum satırına geçer. Kitap sayfasından açılan pencerede Escape yalnız pencereyi kapatır.

## Sonuçlar

- Sıralama açıklanabilir, test edilebilir ve kişisel durumdan tamamen bağımsızdır.
- Telefon ve bilgisayar aynı GitHub durumunu görür; eşitleme hatası sıralamayı etkilemez.
- Her kullanıcı hareketi için ayrı GitHub commit'i oluşmaz.
- Yeni bir sıralama politikası, görünüm bileşenlerini değiştirmeden eklenebilir.
