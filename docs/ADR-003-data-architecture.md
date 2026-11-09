# ADR 003: Arayüze giden verinin mimarisi

Tarih: 8 Kasım 2026. Durum: kabul edildi.

Bağımsız bir standart incelemesi kaydı "değişikliklerle hazır" buldu ve istenen değişiklikler işlendi. Doğrulama turu tek bir açık madde buldu: sınır kapısı yerel adların kapsamını görmüyordu. Bu da kapatıldı. İnceleme bir onay değil, kanıttır. Kayıt, proje sahibinin "soru sorma, karar ver" talimatı (22 Ekim 2026) uyarınca kabul edildi. Kayıt, ADR 002'nin bazı kararlarının yerine geçer (aşağıda "ADR 002'den değişenler").

## Sorun

Proje sahibi arayüzü yeniden tasarlamak istiyor. Tasarım dili henüz belli değil. Yenilikçi bir arayüz de olabilir, klasik bir mağaza düzeni de. Arayüz teknolojisi de değişebilir: React ve Mantine yerine başka bir teknoloji gelebilir. Bu bir karar değil, bir olasılıktır.

Sahip, bu nedenle tasarımdan önce arayüze giden verinin mimarisinin baştan ve sürdürülebilirlik odaklı kurulmasını istedi. Mimari, hangi tasarım ya da teknoloji gelirse gelsin geçerli kalmalı. Tasarım desenleri, nesne yönelimli programlama (OOP), MVVM ve MVC sahip için önemlidir. Bunlar gerçek bir sorunu çözdüğü yerde kullanılır. İş kesinlikle test önce (TDD) ilerler.

## Nasıl karar verildi

Aynı talimat iki bağımsız analizciye verildi: Codex (gpt-6-astra) ve bir Claude analizcisi. Talimat ve iki rapor `docs/analysis/` altındadır. Bu kayıt iki raporun sentezidir. Raporların ayrıldığı her noktada karar ve gerekçesi yazılıdır. Alınmayan öneriler "Önerilip alınmayanlar" bölümündedir.

### İki raporun birleştiği bulgular

- Asıl sorun Mantine görünümü değil, verinin sahibinin React olmasıdır. Kişisel işaretler ve okuma kayıtları `App.jsx` içinde `useState` olarak durur. Dokuz ayrı yer bunlara yazar. Eşitleme, 414 satırlık bir kancanın (`useGitHubStateSync.js`) React durumunu karşılaştırmasıyla çalışır. React kaldırılırsa bu sıralama baştan yazılmak zorunda kalır.
- Türetilmiş veri bileşenlerin içinde hesaplanıyor: süzgeç seçenekleri, küme sayıları, okuma sırasının birleştirilmesi, kitapçı grupları, fuarların aylara bölünmesi, ilgili kitaplar. Yeni bir tasarım bu kuralları ya kopyalar ya da eski bileşenleri içe aktarır.
- Kataloğun şeması ve sürümü yoktur. Üç ayrı kısmi biçimi vardır: Python sözlüğü, `src/ranking/types.ts` içindeki daraltılmış tür ve türsüz JavaScript.
- `src/app/catalogData.js` düz Node'da çalışmıyor. JSON'u içe aktarma özniteliği olmadan alıyor ve uzantısız yollar kullanıyor. Ayrıca `localStorage` okuyan ve indirme başlatan fonksiyonlar dışa aktarıyor.
- Saf modüller (`library.js`, `seo.js`, sıralama, birleştirme, fuarlar) iyi test edilmiş. Bunlar korunur.

## Terimler

- **Port:** çekirdeğin dış dünyadan ne istediğini anlatan dar bir arayüz. Örneğin adres çubuğu, depolama ya da saat. Çekirdek yalnız portu bilir.
- **Bağdaştırıcı:** bir portu gerçek dünyaya bağlayan kod. Örneğin tarayıcının `history` nesnesi.
- **Cephe:** bir modülün eski yolunda kalan ve yalnız yeni yerdeki kodu yeniden dışa aktaran ince dosya. İçe aktaranlar ve eski testler bu sayede bozulmaz.
- **Bileşim kökü:** bütün parçaları birleştiren tek yer (`createKitaplik`).

## Kararlar

### K1. Modüler monolit kalır

Tek uygulama, tek yayın ve tek depo vardır. Ayrı bir arka uç, veri tabanı, çalışan iş parçacığı (worker) ya da sorgu kitaplığı eklenmez. Katalogda yaklaşık 1000 kitap var ve bu boyut başka bir altyapıyı gerektirmiyor.

### K2. Katmanlar ve bağımlılık yönü

- **Çekirdek (`src/core/`).** Alan kuralları, sorgular, komutlar, mağazalar ve görünüm modelleri burada durur. Çekirdek düz Node 24'te çalışır.
  - Çekirdek şunları kullanamaz: React, Mantine, Tabler, JSX, CSS, `?raw` gibi Vite içe aktarmaları, `import.meta.env`, `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `location`, `history` ve `globalThis`.
  - Çekirdeğin dışında yalnız şunları içe aktarabilir: `src/state/*.ts`, `src/ranking/*.ts`, `src/site.js` ve `src/views.js`.
- **Taşınan modüller.** Çekirdeğin ihtiyaç duyduğu başka bir saf modül çekirdeğe taşınır ve eski yolunda bir cephe bırakır. `translation.js`, `workFormat.js`, `reading.js` ve `app/listing.js` böyle taşındı. `recommendations.js`, `authors.js`, `fairs.js`, `dates.js` ve `routes/planner.js` çekirdek onlara ihtiyaç duyduğunda aynı yolla taşınır. Böylece `scripts/generate-static-seo.mjs` gibi içe aktaranlar değişmez.
- **Bağdaştırıcılar (`src/adapters/`).** Tarayıcının ve Node'un dış dünyasını çekirdeğin portlarına bağlar: adres ve geçmiş, depolama, belge başlığı, dosya indirme, saat, yaşam döngüsü olayları ve gecikmeli yüklenen veri dosyaları.
- **UI bağlayıcısı.** `src/adapters/react/useViewModel.js` bir port bağdaştırıcısı değil, React'in çekirdeğe bağlanma noktasıdır. Arayüz teknolojisi değişirse yalnız bu dosya ve bileşenler değişir.
- **Arayüz.** React arayüzü `src/ui/react/` içinde durur. Ekran modelleri `src/screens/` içindedir ve React'e bağlı değildir. Stil dosyaları `src/styles.css` ve `src/woods.css` yerinde kaldı. Arayüz çekirdeği kullanır, çekirdek arayüzü bilmez.
- **Bileşim kökü.** Tarayıcıda yalnız `src/main.jsx` bütün parçaları `createKitaplik(...)` ile birleştirir. Node betikleri (SEO) bütün uygulamayı değil, yalnız `openCatalog` ile sorguları kullanır.
- **Değişmeyen yollar.** `src/library.js`, `src/seo.js`, `src/state/`, `src/ranking/` ve `src/catalog.json` yerinde kalır. Sahibin kuralı olan `PAGE_SIZES` ve `GRID_COLUMNS` `library.js` içinde kalır.
- **Eşitleme modülü.** `src/state/` eşitlemenin kendisidir. `merge.ts` kuralları bu çalışmada değişmez. Hiçbir görünüm modeli `state.json` belgesini doğrudan görmez.

### K3. Alan modeli

- **Katalog kayıtları düz ve salt okunur JSON olarak kalır.** Kitap, küme, grup ve kategori için sınıf açılmaz. Kayıtlar SEO ve dışa aktarma için zaten serileştiriliyor ve kendi davranışları yok. Kurallar yanlarındaki saf fonksiyonlarda durur.
- **Değer nesneleri:** işaretler (birbirini dışlayan işaretler kuralı tek yerden, `EXCLUSIVE_STATE_GROUPS`), okuma kaydı, okuma sırası (en çok beş kitap), süzgeç, adres (`Route`), sayfa boyutu (24, 48, 96, 192, 384) ve takvim günü.
- **Kişisel kütüphane** tek bir köktür: bir okurun işaretleri, okuma kayıtları ve okuma sırası birlikte değişir.
- **Ayrı alanlar:** kitapçılar, fuarlar ve kaydedilmiş kitapçı rotaları katalogdan ayrıdır. Kitapçı rotası bir okuma rotası değildir.
- **Yazar varlığı icat edilmez.** Yazar bugün bir metin. Yeni tasarım yazar sayfası isterse bu bir sorgu olarak eklenir.
- **Bilinmeyen değerler ayrı kalır.** Bilinmeyen sayfa sayısı, sıfır ilerleme, çevirisi olmayan kitap, doğrulanmamış kanıt ve boş yazar birbirinden ayrı tutulur. Eksik bir isteğe bağlı alan "bilinmiyor" demektir, kusur değildir.

### K4. Kaynak başına dar portlar

Her veri kaynağının kendi dar portu vardır. Genel bir `Repository<T>` hiyerarşisi kurulmaz.

| Kaynak | Port | Bugünkü karşılığı |
| --- | --- | --- |
| Katalog | `openCatalog(input)` ile açılan salt okunur katalog | `src/catalog.json`, `catalogData.js` |
| Kitapçılar, fuarlar, notlar, ham arşivler | `ReferenceSource<T>`, yalnız `load()` | `React.lazy` ile birlikte gelen JSON ve Markdown |
| Kişisel veri (yerel) | `KeyValueStore` (`read`, `write`, `remove`) üzerinde kişisel kayıt deposu | `kitapatlasi:states:v2`, `kitapatlasi:personal:v1` |
| Eşitleme deposu | mevcut `GitHubStateRepository`, dışarıdan verilir | `state.json` |
| Kitapçı rotaları | mevcut `GitHubRouteRegistry`, dışarıdan verilir | `routes.json` |
| Ayarlar | `KeyValueStore` üzerinde ayar deposu | `kitaplik:hide-owned:v1` |
| Adres ve geçmiş | `LocationPort` | `history`, `location` |
| Ortam | `DocumentHeadPort`, `ClockPort`, `FileSaverPort` | `document.head`, `Date`, indirme |
| Eşitlemenin yaşam döngüsü | `LifecyclePort` (görünürlük, `pagehide`), `TimerPort`, oturum deposu | `visibilitychange`, `setInterval`, `sessionStorage` |

- `KeyValueStore` bir yazma başarısızlığını hata fırlatarak değil, `false` dönerek bildirir. Kayıt başarısı böylece görünüm modelinde gösterilebilir.
- Repository deseni yalnız kalıcı veride kullanılır: `state.json`, `routes.json` ve yerel kişisel kayıt. Salt okunur başvuru verisi için yalnız bir yükleme portu vardır.
- GitHub anahtarı ve başka kimlik bilgileri hiçbir görünüm modelinde ve hiçbir günlükte yer almaz.

### K5. Her arayüzün bağlanacağı tek sözleşme

```ts
export type Unsubscribe = () => void;
export interface ReadableStore<S> {
  getSnapshot(): S;                         // içerik değişmedikçe aynı nesne
  subscribe(onChange: () => void): Unsubscribe;
}
export interface ViewModel<S, C> extends ReadableStore<S> {
  readonly commands: C;
  dispose(): void;
}
```

- Anlık görüntü (snapshot) içerik değişmedikçe aynı nesnedir. Bu, React'in `useSyncExternalStore` sözleşmesinin şartıdır, gereksiz çizimi de önler.
- `getSnapshot` ve `subscribe` bağlı fonksiyonlardır, `this` gerektirmez. Bağlayıcı onları yöntem olarak değil, değer olarak alır.
- React tek bağlayıcıyla bağlanır: `useViewModel(vm)`. Vue, Svelte, Solid, Web Components ya da düz JavaScript aynı sözleşmeye birkaç satırla bağlanır.
- Bileşim kökünün kurduğu görünüm modelleri yalnız uygulama kapanırken atılır (`dispose`), bileşen kaldırılırken atılmaz. React'in StrictMode'u bileşenleri iki kez bağlar.
- Görünüm modelleri hiç React düğümü, simge, bileşen özelliği ya da stil kararı taşımaz.

### K6. Görünüm modelleri iki katmandadır

İki rapor burada ayrıldı. Codex, sorgulara dayanan ve bugünkü sayfa bileşimini dondurmayan sözleşmeler önerdi. Claude analizcisi, ekran başına bir görünüm modeli önerdi. Karar ikisini birleştirir.

- **Özellik görünüm modelleri (çekirdek, tasarımdan bağımsız).** Olguları, durum türlerini (`kind`) ve komutları taşır. Örnekler: katalog listesi (sonuç kimlikleri, toplam, sayfa, aralık, boş durumun türü), gezinme, ayarlar ve kişisel kütüphane. Kalıcı sözleşme bu katmandır.
- **Ekran modelleri (tasarıma ait).** Bir ekranın bileşimini, Türkçe metinlerini ve düzen kararlarını taşır. Özellik görünüm modellerinin üstüne kurulan saf fonksiyonlardır. Tasarımın sahip olduğu, çerçeveden bağımsız ayrı bir klasörde dururlar ve çekirdekle aynı sınır kapısından geçerler. Yeni tasarım kendi ekran modellerini yazar, çekirdeğe dokunmaz.
- **Kitap penceresinin yığılması tasarımındır.** "Katalogdan açılan kitap kapanınca geri gidilir" ve "kitaptan kitaba geçince bir iz tutulur" bugünkü pencerenin kurallarıdır. Çekirdek yalnız temel adımları verir: yeni kayıtla aç (`openBook`), aynı kayıtta göster (`showBook`), yerinde kapat (`closeBook`) ve geri git (`back`). Bugünkü kural bu adımlardan kurulur.
- **Ekran modelleri yazıldı (9 Kasım 2026).** Sahip istedi. `src/screens/` altında on bir model vardır: sayfa çerçevesi, katalog, Sıram, süzgeç, kitap, Kümeler, kitapçılar, rota planlayıcısı, fuarlar, notlar ve eşitleme. Her biri düz bir fonksiyondur ve kendi testi vardır. Çekirdekle aynı kapıdan geçerler. `tests/architecture.test.js`, arayüz dosyalarında JSX metni, ekran okuyucuya giden özellikler ya da Türkçe harfli bir metin kalırsa başarısız olur. Yalnız geliştirme sunucusunda açılan erişilebilirlik paneli bu kuralın dışındadır. Sıralama motorunun gerekçeleri, öneri cümleleri, arama motoru metinleri ve eşitleme deposu raporu ekran metni olmadığı için kendi modüllerinde kalır.
- **Gerekçe.** Tasarım değişecek. Bugünkü ekranların bileşimini çekirdeğe gömmek, yeni tasarımda çekirdeği de değiştirmeyi gerektirirdi. Olgular ise tasarımdan bağımsızdır.

### K7. Komutlar türlü yöntemlerdir

- Görünüm modelleri komutlarını türlü yöntemler olarak sunar: örneğin `toggleMark`, `editReading`, `addToQueue`, `openBook`, `setHideOwned`.
- Ekranlar bu yöntemleri doğrudan çağırmaz. Her istek tek kapıdan geçer: `kitaplik.execute({ type: 'toggleMark', id, key })` (`src/core/commands.ts`). Bu kapıyı Codex önermişti, ilk kararda alınmamıştı, sahip 9 Kasım 2026'da istedi. Kapı yeni bir davranış eklemez, yöntemin sonucunu aynen döndürür. Her yöntemin bir komut türü vardır, bilinmeyen tür reddedilir ve `tests/core-execute.test.js` ekranların `.commands` alanına uzanmadığını denetler. `correctPage` çekirdeğin kendi düzeltmesidir. Eşitleme denetleyicisi cephenin parçası olmadığı için kendi görünüm modeliyle çalışır.
- Bir komutun sonucu, değerin bellekte uygulandığını ve yerel kaydın başarılı olup olmadığını ayrı gösterir. GitHub'a gönderim yalnız eşitleme görünüm modelinde görünür. Hiçbir komut, gerçekten gönderilmeden "eşitlendi" demez.
- Bileşenler ham `setState` fonksiyonu almaz. Notlar sayfasının yedek yüklemesi de bir komuttur.
- Eşitleme, uzak okumayı tek ve bölünmez bir adımla uygular (`applyRemote`). Böylece uzaktan gelen bir değişiklik yeni bir yerel düzenleme sanılmaz.

### K8. Metinler

- Çekirdek yalnız alanın kendi metinlerini taşır: işaret adları (`STATE_LABELS`), sayfa adları, okuma kaydı uyarıları, çeviri durumları, kitapçı ve fuar sözleri, eşitleme iletileri.
- Bu metinlerin hepsi tek dosyadadır: `src/core/text.js`. Sahip 9 Kasım 2026'da istedi. `tests/architecture.test.js`, çekirdeğin başka bir dosyasında Türkçe harfli bir metin ya da `label`, `title`, `message` gibi okura gösterilen bir alanda düz metin bulursa başarısız olur. `'Türkiye'` veriyle karşılaştırılan bir değer olduğu için bu kuralın dışındadır.
- Ekranın geri kalan metinleri (başlıklar, boş durum cümleleri, düğme adları) ekran modellerine aittir.
- Ürün yalnız Türkçedir, i18n katmanı kurulmaz.

### K9. Desenler: nerede kullanılır, nerede kullanılmaz

| Desen | Kullanıldığı yer | Kullanılmadığı yer |
| --- | --- | --- |
| MVVM | Özellik görünüm modelleri ve ekran modelleri | Bir açılır pencerenin açık olup olmadığı gibi geçici arayüz durumu arayüzde kalır |
| MVC | Denetleyici rolü yalnız `Navigator`'dadır: adres ve geçmiş girdilerini adres değer nesnesine çevirir | Görünüm modellerinin üstüne ayrı bir MVC katmanı |
| OOP | Yaşam döngüsü olan hizmetler: kişisel kütüphane, eşitleme denetleyicisi, gezinme, mevcut depolar ve sıralama motoru | Kitap ve küme kayıtları için sınıflar |
| Repository | `state.json`, `routes.json`, yerel kişisel kayıt | Genel `Repository<T>`, salt okunur katalog |
| Strategy | Sıralama ölçütleri, süzgeç yüklemleri, sıralama politikası (zaten var), adres kodlayıcısı | |
| Observer | Mağazalar ve abonelikler | Olay veri yolu, alan olayları |
| Adapter | Tarayıcı portları, GitHub istemcileri | |
| Facade | `createKitaplik`, eski yollardaki cepheler | Bağımlılık enjeksiyonu konteyneri |

Eklenmeyecekler: Redux, MobX, Zustand, RxJS, Zod gibi doğrulama kitaplıkları, ORM, CQRS ve olay kaynağı (event sourcing). El yazımı doğrulayıcılar zaten projenin üslubudur.

### K10. Veri sözleşmeleri ve sürümleri

- **Katalog (`catalog.json`).**
  - Tam şema TypeScript türleriyle yazılır (`src/core/catalog/schema.ts`). `src/ranking/types.ts` içindeki daraltılmış tür bunun bir alt kümesidir.
  - `openCatalog(input)` sürüm kapısıdır (`src/core/catalog/contract.ts`). Bugünkü dosyanın sürüm alanı yok ve bu dosya eski biçim (sürüm 0) olarak kabul edilir.
  - Sürüm 0 kalıcı olarak kabul edilir. Dondurulmuş test kesiti ve eski dışa aktarmalar bu biçimdedir.
  - Python ileride `schemaVersion: 1` ve ISO biçiminde `updatedOn` alanını ekler. `updated` bugünkü anlamını korur: en son kanıtın tarihidir, derleme tarihi değildir.
  - Tam doğrulama her yerde yapılır: testlerde, statik SEO üreticisinde ve tarayıcıda. Tarayıcıda da tam doğrulama yapılmasını sahip 9 Kasım 2026'da istedi. Gerçek katalog Node'da yaklaşık 2 milisaniyede doğrulanıyor.
  - Kapı başarısız olursa uygulama açılmaz ve konsola nedeni yazılır. CI aynı kapıyı her yayından önce çalıştırdığı için bu yalnız bozuk bir yayında olur.
  - Node sözleşmesi Python'dan katı değildir. Örneğin Python tarihsiz bir kitabı yazar ve yalnız uyarır. Sözleşme bu yüzden eksik bir `addedAt` alanını kabul eder, yalnız biçimi bozuk bir tarihi reddeder.
- **Sürüm kuralı.** Alan eklemek sürümü değiştirmez. Alan kaldırmak, yeniden adlandırmak ya da anlamını değiştirmek ana sürümü artırır. Şema sürümü, içerik revizyonu, sıralama politikası sürümü, dışa aktarma sürümü ve yedek sürümü ayrı kavramlardır.
- **Eşitleme dosyaları.** `state.json` şema 2 ve `routes.json` şema 1 bu çalışma boyunca donar. Bu dosyalar ileride değişecekse, eski okuyucu ve eski yazıcıyla karma sürüm testleri önce yazılır. Bir göç fonksiyonu tek başına eski bir yazıcının yeni alanı silmesini önleyemez.
- **Kimlik.** Kitap kimliği hiç değişmez.
  - Ad düzeltmesinde kimlik korunur. `scripts/merge-data.py` içinde Kitap Atlası kaynakları için `getbook(..., canonical=...)`, diğer kaynaklar için mevcut kitaba bağlanan `existingId` kullanılır. Eski adres kısaltması `slugAuthor` ya da `englishBookTitles` gibi bir alanla korunur.
  - Bugün bir yönlendirme yok: `?book=` yalnız güncel kimliği ya da güncel kısaltmayı açar. `mapping`, Python'un kaynak anahtarlarını kitaplara bağlayan tablosudur. `legacyKeys` yalnız eski `kitaps:states:v1` işaretlerini taşır.
  - Gerçek bir yeniden adlandırma ayrı ve incelenmiş bir değişiklik ister. `tests/book-identity.test.js`, kilitli her kitabın kimliğini ve adresini korur.
- **Yerel depolama.** Anahtar adları yeniden adlandırılmaz (`tests/storage-keys.test.js`). Anahtarların içindeki değer biçimleri de donar, çünkü eski ve yeni sekmeler aynı anahtarları paylaşır. Okuma kaydı ancak önce şu test yazıldıktan sonra sınırda normalleştirilir: her uzak biçim için `readingPayload(cleanReading(x))`, `readingPayload(x)` ile aynı olmalıdır.

| Sınır | Doğrulama |
| --- | --- |
| Python çıktısı `catalog.json` | Python'un kendi değişmezleri, üretilen dosyanın depodakiyle bayt bayt aynı olması, Node'da tam sözleşme testi ve statik SEO üreticisinde tam kapı |
| `bookstores.json`, `book-fairs.json` | Node sözleşme testleri (kısmen var) |
| Tarayıcı kataloğu açarken | Tam sözleşme |
| `state.json`, `routes.json` | Çalışma anında tam doğrulama (zaten var, değişmez) |
| Yerel depolama, yedek yükleme, adres | Çalışma anında temizleme (zaten var), çekirdeğe taşınır |
| Çekirdekten arayüze | Yalnız türler |

### K11. Eşdeğerlik kapıları

Arayüz şu anda başka bir oturumda yeniden tasarlanıyor. Bu yüzden eski tasarımın ekran kayıtları uzun vadeli bir kapı olamaz.

- **Veri düzeyi (aşama 0 ile 6 ve 8).** Taşınan her sorgunun eşdeğerliği veri düzeyinde kanıtlanır. Altın kayıtlar bugünkü çıktıları dondurulmuş bir katalog kesiti üzerinde sabitler (`tests/fixtures/characterization/`). Sahibin eklediği yeni kitaplar bu testleri etkilemez. Altın kayıt yalnız bilinçli ve incelenmiş bir davranış değişikliğinde yeniden yazılır, başarısız bir testi geçirmek için asla yazılmaz.
- **Ekran düzeyi (aşama 7b).** Her yeniden tasarlanmış ekran bağlanmadan önce, sabit veri ve sabit saatle erişilebilirlik ağacı kaydı alınır (`toMatchAriaSnapshot`, `tests/e2e/structure.spec.js` içinde zaten kullanılıyor). Bağlamadan sonra kayıt aynı kalır. Bir kayıt güncellemesini uygulayıcıdan başka biri inceler.
- **Gerekçe.** Codex ekran görüntüsü tabanları, Claude analizcisi 12 adres için erişilebilirlik ağacı kayıtları önermişti. Bu karar ikisini de eski tasarım için değil, yeni tasarımın ekranları için uygular.

### K12. Sahibe bırakılan kararlar (9 Kasım 2026'da kapandı)

Bu beş fark 8 Kasım 2026'da olduğu gibi sabitlenmişti. Sahip 9 Kasım 2026'da "eksik kalmasın, takip et, bitir" dedi. Ajan her biri için aşağıdaki kararı verdi ve önce testini yazdı. Sahip başka bir karar verirse bu liste ile testler birlikte değişir.

1. **Eşit adlı kitapların sırası.** Adı aynı olan kitaplar artık her yerde yazar adına göre sıralanır. Kural `sortBooks` içindedir ve statik sayfalar da aynı işlevi kullanır.
2. **Yapılandırılmış veri (JSON-LD).** Çalışan sayfa ile statik sayfalar aynı işlevleri kullanır: `bookStructuredData` ve `listingStructuredData`. Statik sayfaların daha zengin alanları korundu, çalışan sayfa onlara yükseltildi. Herkese açık raf açıklaması da iki tarafta aynıdır (`listingDescription`). Kitap sayfası artık arama motoruna önceki veya sonraki sayfa bildirmez, çünkü statik kitap sayfaları da bildirmez.
3. **Arama motoru verisi ve gizlenen kitaplar.** Arama motoruna verilen bilgi artık herkese açık listeden hesaplanır (`publicListing`). Okurun "Satın aldıklarımı gösterme" düğmesi bu bilgiyi değiştirmez. Tek istisna, adres gizli listenin bittiği yerden ilerideki bir sayfayı gösterdiğinde olur. Okur o zaman gizli listenin son sayfasına gönderilir ve baştaki bilgi de o sayfanın numarasını taşır. Arama motorlarının işareti olmadığı için onlar bundan etkilenmez.
4. **Kümeler sayfasındaki sayı.** "Kaynak listesinde N kayıt var" cümlesi artık kaynak listenin kendi sayısını gösterir (`originalCount`). Bu sayı bilinmeyen kümelerde cümle görünmez.
5. **Grup adresindeki iki nokta.** Statik sayfalar kendi adreslerini site haritasının yazımıyla bildirir (`%3A`). Klasör adları değişmedi, bu yüzden iki noktalı eski bağlantılar açılmaya devam eder.

### K13. ADR 002'den değişenler

- **Kancalar orkestrasyonun yeri değildir, yalnız bağlayıcıdır.** ADR 002'de planlanan `usePersonalState` yerine çerçeveden bağımsız bir kişisel kütüphane mağazası gelir. Bir kanca, React'i verinin sahibi yapmaya devam ederdi.
- **Özellik başına görünüm modeli artık açılır.** ADR 002 bunu "gerekçe çıkarsa" diye bekletmişti. Gerekçe, sahibin arayüzü değiştirilebilir kılma isteğidir.
- **Statik veri için salt okunur bir yükleme portu vardır.** Node (SEO) ve React dışı bir arayüz, veriyi `React.lazy` olmadan yükleyebilmelidir. Bu bir Repository değildir.
- **Özellik klasörleri çekirdeğin içindedir.** ADR 002'nin 4. aşaması JSX ile mantığı aynı klasörde topluyordu. Değiştirilebilir arayüz sınırı bir adlandırma alışkanlığı değil, bir klasör sınırı olmalıdır.
- **Ortak GitHub bağlantısı (ADR 002'nin 5. aşaması) yapıldı.** Önce ertelenmişti, sahip 9 Kasım 2026'da istedi. `src/state/githubFile.ts` adresleri, başlıkları, base64 kodlamasını, zaman sınırını ve GitHub'ın her yanıtının anlamını tek yerde tutar. Birleştirme, yeniden deneme ve bekleyen yazma kuralları iki dosyada ayrı kalır, çünkü verdikleri sözler farklıdır. Değişiklik bağımsız incelendi ve veri kaybı riski bulunmadı.
- **Korunanlar:** modüler monolit, yönlendirme ve durum kitaplığı olmaması, i18n olmaması, değişmeyen yollar, test önce kuralı ve ADR 002'nin "uygulayıcı kendi değişikliğinin tek onaylayıcısı olmaz" kuralı.

### K14. Yeniden tasarım için kural

Arayüzü yeniden tasarlayan iş, yeni türetilmiş veriyi bileşenlerin içine değil, `src/core` içine testli bir sorgu olarak koyar. Bileşenler veriyi görünüm modelinden alır ve yalnız gösterir.

## Önce alınmayan öneriler

Bu öneriler ilk kararda alınmamıştı. Sahip 9 Kasım 2026'da hepsinin yapılmasını istedi. Her maddenin durumu yanında yazılıdır.

- **Codex:**
  - Tek bir `execute(command)` birleşimi (K7). **Yapıldı.**
  - Tarayıcıda tam katalog doğrulaması (K10). **Yapıldı.** `openCatalog` artık her yerde tam sözleşmeyi çalıştırır, yalnız sürüme bakan kip kaldırıldı.
  - Ekran görüntüsü tabanları (K11). **Yapıldı, bugünkü tasarım için.** Eski tasarım artık sitede yoktur, onun görüntüsü hiçbir şeyi korumaz. Dokuz ekran masaüstü ve telefon boyunda, ayrıca açık tema, Chromium ve WebKit'te karşılaştırılır. Görüntüler dondurulmuş veriyle ve CI'daki Linux görüntüsüyle alınır, yeni kitap eklemek onları değiştirmez. Görünür bir değişiklik bilinçliyse `scripts/visual-linux.sh update` ile yeniden kaydedilir ve uygulayıcıdan başkası inceler.
  - Yedek yüklemenin sürüme göre ayrılması. **Yapıldı.** `src/core/personal/backup.js` her biçimi kendi okuyucusuyla okur. Daha yeni sürümden gelen dosyayı, eşitleme yedeğini ve yedek olmayan dosyayı bütünüyle reddeder ve okura nedenini söyler.
  - CI'da kataloğun yeniden üretilip karşılaştırılması. **Yapıldı.** `tests/catalog-fresh.test.js` veri dosyalarından kataloğu geçici bir yere üretir ve `src/catalog.json` ile bayt bayt karşılaştırır. Bu test `npm test` içinde çalışır, Python yalnız standart kitaplığı kullanır. Çıktı Python 3.9 ve 3.12'de aynıdır.
- **Claude analizcisi:**
  - Ekran başına yaklaşık 11 görünüm modelinin yazılması (K6). **Yapıldı.**
  - Ayrı bir çekirdek metin modülü (K8). **Yapıldı.**
  - Bileşenlerin `src/ui/react` altına taşınması. **Yapıldı.** `tests/architecture.test.js` eski klasörlerin geri gelmesini engeller.

## Test önce geçiş planı

Her aşama bütün testler geçerek kendi başına yayına çıkar. Her aşamanın kapısı:
- `TZ=UTC npm test`, `npm run typecheck`, `npm run build`
- Chromium, WebKit ve iPhone görünümünde uçtan uca testler (Firefox yalnız istenirse)
- veri düzeyindeki altın kayıtlar

Testlerin yeri bellidir: Node testleri `tests/*.test.js`, bileşen testleri `tests/components/**/*.test.jsx`, sabit veriler `tests/fixtures/` altındadır.

`tests/ui-structure.test.js` içindeki metin arayan bir denetim yalnız iki şartla emekliye ayrılır. Aynı commit'te en az o kadar güçlü bir davranış testi gelmelidir. Bu yeni testin, davranış bilerek bozulduğunda başarısız olduğu da gösterilmelidir.

Her taşınan saf modülün eski kopyası, çekirdekteki karşılığı geldiği commit'te kaldırılır ve eski yol bir cephe olur. `src/app/listing.js` ve `src/reading.js` da yeniden tasarımın ilk aşamaları indikten sonra böyle taşındı.

0. **Güvenlik ağı (tamamlandı).**
   - Katalog listesinin 60 sorgusu ve okuma önceliği sırası sabitlendi.
   - 29 adresin kodlaması ve arama motoru verisi sabitlendi (satın alınanlar gizli adresler dahil).
   - Dondurulmuş kesitten üretilen 407 statik dosya sabitlendi.
   - 18 yerel depolama anahtarı ve 1019 kitabın kimliği ile adresi kilitlendi.
   - Mimari sınır kapısı eklendi. Kapı TypeScript derleyicisiyle okur. Her kural ihlalini yakaladığını ve temiz kodu geçirdiğini bir öz testle kanıtlar.
   - Kullanılmayan çekirdek modülleri adıyla listelenir, liste yalnız küçülebilir.
1. **Katalog sözleşmesi (tamamlandı).** `schema.ts` ve `openCatalog` yazıldı. Gerçek katalog tam sözleşmeden geçiyor.
2. **Katalog sürümü (tamamlandı).** Python `schemaVersion: 1` ve `updatedOn` alanlarını yazıyor. `updated` aynı günün yazıyla hâlidir, anlamı değişmedi.
3. **Mağaza ilkeli ve React bağlayıcısı (tamamlandı).** `createStore`, `derived` ve `useViewModel` yazıldı.
4. **Katalog çekirdeği (tamamlandı).**
   - Süzme, sıralama ve raf kuralları ile `translation.js` ve `workFormat.js` çekirdeğe taşındı. Eski yollar cephe oldu.
   - Gerçek kataloğun statik SEO çıktısı, `main` dalındaki çıktıyla bayt bayt aynıydı. Bu tek seferlik bir karşılaştırmaydı. Kayıtlı test, dondurulmuş kesitin `static-seo` altın kaydıdır.
   - Katalog dizini ve katalog listesi görünüm modeli yazıldı. Liste, altın kayıtlara birebir eşit.
5. **SEO çekirdeği kullanır (tamamlandı).**
   - Statik sayfa üreticisi kataloğu tam sözleşmeyle açıyor.
   - `seoState` taban adresi parametre olarak alıyor, tarayıcının adresini okumuyor. Sayfa kendi tabanını `addressBase` ile veriyor.
   - Çalışma anı ve statik sayfalar sayfa adlarını, grup başlığını, kitap adreslerini ve raf sorgusunu paylaşıyor.
   - Gerçek kataloğun 1415 statik dosyası değişiklikten önce ve sonra bayt bayt aynıydı. `seo` ve `static-seo` altın kayıtları değişmedi. Bulunan bir fark K12'nin 5. maddesine yazıldı.
   - Bağımsız inceleme yapıldı. Bulduğu test eksikleri kapatıldı.
6. **Gezinme (tamamlandı).** `Navigator` ve `LocationPort` yazıldı. Bileşim kökü (`createKitaplik`), ayarlar deposu ve tarayıcı bağdaştırıcıları eklendi. Kitap penceresinin yığılma kuralı tasarıma bırakıldı (K6).
7. **Arayüzü bağlama.** Yeniden tasarım indikten sonra başlar.
   - **7a. Kişisel verinin tek sahibi (tamamlandı).**
     - `src/core/personal/library.ts` işaretlerin, okuma kayıtlarının ve okuma sırasının tek sahibidir. `App.jsx` bunları artık tutmuyor ve yazmıyor, yalnız komut çağırıyor.
     - İşaret kuralları (`toggleState`, okuma işaretinin satın alma sayılması dahil) değişmeden `marks.js` dosyasına taşındı.
     - Önce yazılan test: uzak bir okuma hiç giden değişiklik üretmez.
     - Kapılar değişmeden yeşil kaldı. Bağımsız inceleme davranış hatası bulmadı, bulduğu test eksikleri kapatıldı.
   - **7b. Ekran ekran bağlama (tamamlandı).**
     - Sayfa artık `src/main.jsx` içinde kurulan `createKitaplik` üzerinden çalışıyor. Adres, ayar, katalog listesi ve kişisel veri görünüm modellerinden geliyor. `catalogData.js` çekirdeğin dizinine açılan bir cephe oldu.
     - Bağlamadan önce sayfanın erişilebilirlik ağacı kaydedildi: 16 adres, masaüstü ve telefon, Chromium ve WebKit, ayrıca süzgeç penceresi ve kitap penceresi. Toplam 68 görünüm, aynı katalog ve sabit saatle. Bağlamadan sonra 68 görünümün hepsi aynıydı. Karşılaştırma bir kez yapıldı, kalıcı kapı değildir, çünkü her yeni kitap bu ağacı değiştirir. Karşılaştırma, bağlama sırasında yapılan bir hatayı (süzgeç penceresinde 0 kitap yazması) yakaladı.
     - Geri tuşu ve adres davranışı bağlamadan önce sabitlendi ve kalıcıdır: `tests/e2e/navigation-history.spec.js` hem bağlamadan önceki hem sonraki sayfada Chromium, WebKit ve iPhone görünümünde geçti. Kitap izini geri tuşunda temizleme kuralı tasarıma ait olduğu için `App.jsx` içinde kaldı.
     - Gecikmeli yüklenen sayfaların ilk yüklemede istenmediğini aynı dosya ağ istekleriyle doğruluyor.
     - Kullanılmayan modüller listesi boşaldı.
     - Bağımsız inceleme bir davranış hatası buldu: geri tuşu son sayfanın ötesine düşünce sayfa düzeltiliyor, adres eski kalıyordu. Önce test yazılıp düzeltildi. Bulduğu test eksikleri de kapatıldı.
     - Kümeler ve kitapçılar ekranlarındaki son türetilmiş veri çekirdeğe taşındı (K14).
8. **Eşitleme denetleyicisi (tamamlandı).** En yüksek riskli aşama budur.
   - İşlemlerin sırası `src/core/sync/controller.js` dosyasına değişmeden taşındı. Her tarayıcı çağrısı artık bir port üzerinden gidiyor: yaşam döngüsü, zamanlayıcı, yerel depo, saat ve dışarıdan verilen depo. ADR'nin ilk hâlinde adı geçen oturum deposu kullanılmıyordu, bu yüzden portu açılmadı.
   - `useGitHubStateSync` artık yalnız React bağlayıcısıdır.
   - Denetleyici düz Node'da test ediliyor (`tests/core-sync-controller.test.js`). `sync-hook.test.jsx` aynı denetleyiciyi React üzerinden çalıştırıyor. Bu dosyada yalnız deney düzeneği değişti, hiçbir beklenti değişmedi.
   - Taşınırken korunan bir ayrıntı: bir okuma uygulanırken "okuma sürerken düzenlenen kitap" kararı, okuma uygulanmadan önce ekranda olana bakarak verilir. Tersi olsaydı okumanın değiştirdiği her kitap düzenlenmiş görünür ve tabanı kaydedilmezdi.

## Sınır kapıları

`tests/architecture.test.js`, `npm test` içinde çalışır.
- `src/core/` yalnız kendisini ve K2'de adı geçen modülleri içe aktarabilir.
- K2'de sayılan arayüz teknolojileri ve tarayıcı nesneleri çekirdekte yasaktır. Kapı, çekirdeği TypeScript derleyicisiyle yalnız ES2023 kütüphanesine karşı derler ve her adı kendi kapsamında çözer. Çözülemeyen her ad bir ihlaldir: `window`, `document`, `matchMedia`, `process` gibi tarayıcı ve Node nesneleri. `globalThis` de adıyla yasaktır. Bu yüzden bir metindeki kelime, bir nesne alanı ya da yerel bir değişken yasak sayılmaz. Bir fonksiyondaki yerel bir ad, başka bir yerdeki gerçek kullanımı da gizlemez.
- `src/core/` altındaki her dosya düz Node'da içe aktarılabilir olmalıdır.
- Kapı, her kural ihlalini yakaladığını ve temiz kodu geçirdiğini bir öz testle kanıtlar.
- Her çekirdek ve bağdaştırıcı modülü `src/main.jsx` ya da bir Node betiği tarafından çalışma anında kullanılır, ya da adıyla "arayüzü bekleyenler" listesindedir. Yalnız tür içe aktaran bir bağ kullanım sayılmaz, yalnız tür içeren dosya bu kuraldan muaftır. Liste yalnız küçülebilir: testteki üst sınır her bağlamada düşürülür, yükseltmek bağımsız inceleme ister.
- Ekran modellerinin klasörü (`src/screens/`) açıldığında aynı kapı onu da denetler.
- Ekranlar `catalog.json`'u, `data/` dosyalarını ve GitHub depolarını doğrudan içe aktaramaz, veriyi cepheden ve çekirdekten alır. Kendi verisini kendi gecikmeli paketinde yükleyen sayfalar adıyla listelidir (kitapçılar, fuarlar, notlar ve rota planlayıcısı). Bu liste yalnız küçülebilir.

## Riskler

- **Eski istemciler.** Açık kalmış eski sayfalar eşitleme dosyalarını ve yerel anahtarları okur ve yazar. Bu yüzden dosya biçimleri, değer biçimleri ve birleştirme kuralları donar.
- **İki sahip.** Geçiş sırasında aynı veriyi iki yer yazarsa değişiklik çift gider ya da kaybolur. Bu yüzden kişisel verinin sahipliği tek seferde devredilir (7a).
- **Doğrulamanın veri silmesi.** Doğrulama, belirsiz kanıtı ya da bilinmeyen değeri silmemelidir. Mimari doğrulama, onaysız bir editoryal temizlik olamaz.
- **Eşitleme zamanlaması.** Eşitleme denetleyicisi taşınırken bir düzenlemenin algılanma anı değişebilir. Bu yüzden o aşama en sona bırakıldı ve testlerle önce sabitlenir.
- **Başarım.** Katalog boyutu tek başına yeni bir altyapıyı gerektirmez. Kataloğun özet ve ayrıntı olarak bölünmesi, yeni tasarımın yükleme ihtiyacı ölçüldükten sonra kararlaştırılır. Sözleşme bu bölünmeye şimdiden izin verir.
