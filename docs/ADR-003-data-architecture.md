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
- **Arayüz.** Bugün `src/App.jsx`, `src/app/` ve `src/components/` içinde durur. Arayüz çekirdeği kullanır, çekirdek arayüzü bilmez.
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
- **Diğer özellik görünüm modelleri zamanında yazılır.** Kümeler, kitapçılar, fuarlar ve notlar için görünüm modelleri, yeniden tasarlanan ekran onları kullanacağı zaman yazılır. Kullanılmayacak bir modeli önceden yazmak, aşırı tasarımdır.
- **Gerekçe.** Tasarım değişecek. Bugünkü ekranların bileşimini çekirdeğe gömmek, yeni tasarımda çekirdeği de değiştirmeyi gerektirirdi. Olgular ise tasarımdan bağımsızdır.

### K7. Komutlar türlü yöntemlerdir

- Görünüm modelleri komutlarını türlü yöntemler olarak sunar: örneğin `toggleMark`, `editReading`, `addToQueue`, `openBook`, `setHideOwned`. Codex'in önerdiği tek bir `execute(command)` birleşimi seçilmedi. Bir komut dağıtıcısına ve komut günlüğüne ihtiyaç yok. Yöntemler okurken ve kullanırken daha açıktır.
- Bir komutun sonucu, değerin bellekte uygulandığını ve yerel kaydın başarılı olup olmadığını ayrı gösterir. GitHub'a gönderim yalnız eşitleme görünüm modelinde görünür. Hiçbir komut, gerçekten gönderilmeden "eşitlendi" demez.
- Bileşenler ham `setState` fonksiyonu almaz. Notlar sayfasının yedek yüklemesi de bir komuttur.
- Eşitleme, uzak okumayı tek ve bölünmez bir adımla uygular (`applyRemote`). Böylece uzaktan gelen bir değişiklik yeni bir yerel düzenleme sanılmaz.

### K8. Metinler

- Çekirdek yalnız alanın kendi metinlerini taşır: işaret adları (`STATE_LABELS`), sayfa adları (`views.js`), okuma kaydı uyarıları ve eşitleme iletileri.
- Ekranın geri kalan metinleri (başlıklar, boş durum cümleleri, düğme adları) ekran modellerine aittir. Ayrı bir çekirdek metin modülü bugün açılmaz. Yeni tasarım ihtiyaç gösterirse açılır.
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
  - Tam doğrulama Node'da yapılır: testlerde ve statik SEO üreticisinde. Bu üretici, her yayından önce kataloğu tam sözleşmeyle açar.
  - Tarayıcı yalnız sürümü ve kaba yapıyı denetler. Kapı başarısız olursa uygulama açılmaz ve konsola nedeni yazılır. CI aynı kapıyı her yayından önce tam olarak çalıştırdığı için bu yalnız bozuk bir yayında olur.
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
| Python çıktısı `catalog.json` | Python'un kendi değişmezleri, Node'da tam sözleşme testi ve statik SEO üreticisinde tam kapı |
| `bookstores.json`, `book-fairs.json` | Node sözleşme testleri (kısmen var) |
| Tarayıcı kataloğu açarken | Sürüm kapısı ve kaba yapı |
| `state.json`, `routes.json` | Çalışma anında tam doğrulama (zaten var, değişmez) |
| Yerel depolama, yedek yükleme, adres | Çalışma anında temizleme (zaten var), çekirdeğe taşınır |
| Çekirdekten arayüze | Yalnız türler |

### K11. Eşdeğerlik kapıları

Arayüz şu anda başka bir oturumda yeniden tasarlanıyor. Bu yüzden eski tasarımın ekran kayıtları uzun vadeli bir kapı olamaz.

- **Veri düzeyi (aşama 0 ile 6 ve 8).** Taşınan her sorgunun eşdeğerliği veri düzeyinde kanıtlanır. Altın kayıtlar bugünkü çıktıları dondurulmuş bir katalog kesiti üzerinde sabitler (`tests/fixtures/characterization/`). Sahibin eklediği yeni kitaplar bu testleri etkilemez. Altın kayıt yalnız bilinçli ve incelenmiş bir davranış değişikliğinde yeniden yazılır, başarısız bir testi geçirmek için asla yazılmaz.
- **Ekran düzeyi (aşama 7b).** Her yeniden tasarlanmış ekran bağlanmadan önce, sabit veri ve sabit saatle erişilebilirlik ağacı kaydı alınır (`toMatchAriaSnapshot`, `tests/e2e/structure.spec.js` içinde zaten kullanılıyor). Bağlamadan sonra kayıt aynı kalır. Bir kayıt güncellemesini uygulayıcıdan başka biri inceler.
- **Gerekçe.** Codex ekran görüntüsü tabanları, Claude analizcisi 12 adres için erişilebilirlik ağacı kayıtları önermişti. Bu karar ikisini de eski tasarım için değil, yeni tasarımın ekranları için uygular.

### K12. Sahibe bırakılan kararlar

Aşağıdaki farklar bugünkü hâlleriyle sabitlendi ve sahibin kararı olmadan değişmez.

1. **Eşit adlı kitapların sırası.** Kitap adına göre sıralamada eşit adlar çalışma anında katalog sırasıyla, statik sayfalarda yazar adıyla sıralanıyor. Codex buldu. `static-seo` altın kaydıyla sabitlendi.
2. **Yapılandırılmış veri (JSON-LD).** Çalışma anında ve statik sayfalarda farklı alanlarla üretiliyor. Codex buldu. `seo` ve `static-seo` altın kayıtlarıyla sabitlendi.
3. **Arama motoru verisi ve gizlenen kitaplar.** Çalışma anındaki yapılandırılmış veri, satın alınanlar gizlenmiş listeden hesaplanıyor. Claude analizcisi buldu. `seo` altın kaydında "satın alınanlar gizli" adresleriyle sabitlendi.
4. **Kümeler sayfasındaki sayı.** "Kaynak kaydı" diye yazılan sayı aslında birleştirilmiş kitap sayısı. Bu görünür bir hata. Claude analizcisi buldu. Tasarım işinden sonra sahibe sorulur.

### K13. ADR 002'den değişenler

- **Kancalar orkestrasyonun yeri değildir, yalnız bağlayıcıdır.** ADR 002'de planlanan `usePersonalState` yerine çerçeveden bağımsız bir kişisel kütüphane mağazası gelir. Bir kanca, React'i verinin sahibi yapmaya devam ederdi.
- **Özellik başına görünüm modeli artık açılır.** ADR 002 bunu "gerekçe çıkarsa" diye bekletmişti. Gerekçe, sahibin arayüzü değiştirilebilir kılma isteğidir.
- **Statik veri için salt okunur bir yükleme portu vardır.** Node (SEO) ve React dışı bir arayüz, veriyi `React.lazy` olmadan yükleyebilmelidir. Bu bir Repository değildir.
- **Özellik klasörleri çekirdeğin içindedir.** ADR 002'nin 4. aşaması JSX ile mantığı aynı klasörde topluyordu. Değiştirilebilir arayüz sınırı bir adlandırma alışkanlığı değil, bir klasör sınırı olmalıdır.
- **Ortak GitHub bağlantısı (ADR 002'nin 5. aşaması) ertelenir.** İki farklı kalıcılık protokolünü birleştirir ve arayüzü değiştirilebilir kılmak için gerekmez. Yapılacaksa ayrı ve bağımsız incelenen bir değişiklik olur.
- **Korunanlar:** modüler monolit, yönlendirme ve durum kitaplığı olmaması, i18n olmaması, değişmeyen yollar, test önce kuralı ve ADR 002'nin "uygulayıcı kendi değişikliğinin tek onaylayıcısı olmaz" kuralı.

### K14. Yeniden tasarım için kural

Arayüzü yeniden tasarlayan iş, yeni türetilmiş veriyi bileşenlerin içine değil, `src/core` içine testli bir sorgu olarak koyar. Bileşenler veriyi görünüm modelinden alır ve yalnız gösterir.

## Önerilip alınmayanlar

- **Codex:**
  - Tek bir `execute(command)` birleşimi (K7).
  - Tarayıcıda tam katalog doğrulaması (K10).
  - Eski tasarım için ekran görüntüsü tabanları (K11).
  - Yedek yüklemenin sürüme göre ayrılması: kişisel kütüphane aşamasında (7a) yedek testleriyle ele alınır.
  - CI'da kataloğun yeniden üretilip karşılaştırılması: CI'da Python ortamı gerektirdiği için açık bir karar olarak kalır.
- **Claude analizcisi:**
  - Ekran başına yaklaşık 11 görünüm modelinin şimdi yazılması (K6).
  - Ayrı bir çekirdek metin modülü (K8).
  - Bileşenlerin şimdi `src/ui/react` altına taşınması: yeniden tasarım işine bırakıldı.

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
2. **Katalog sürümü (Python).**
   - Python `schemaVersion: 1` ve `updatedOn` ekler. Sözleşme testi önce başarısız olur.
   - Kitap ekleyen oturumlarla sıra konuşularak yapılır.
3. **Mağaza ilkeli ve React bağlayıcısı (tamamlandı).** `createStore`, `derived` ve `useViewModel` yazıldı.
4. **Katalog çekirdeği (tamamlandı).**
   - Süzme, sıralama ve raf kuralları ile `translation.js` ve `workFormat.js` çekirdeğe taşındı. Eski yollar cephe oldu.
   - Gerçek kataloğun statik SEO çıktısı, `main` dalındaki çıktıyla bayt bayt aynıydı. Bu tek seferlik bir karşılaştırmaydı. Kayıtlı test, dondurulmuş kesitin `static-seo` altın kaydıdır.
   - Katalog dizini ve katalog listesi görünüm modeli yazıldı. Liste, altın kayıtlara birebir eşit.
5. **SEO çekirdeği kullanır (başladı).**
   - Statik sayfa üreticisi kataloğu tam sözleşmeyle açıyor.
   - Kalanlar:
     - `seoState` taban adresi parametre olarak alır, tarayıcının adresini okumaz.
     - Çalışma anı ve statik sayfalar aynı sorguları paylaşır.
   - `seo` ve `static-seo` altın kayıtları değişmez. Bir fark çıkarsa bu sahibin kararıdır (K12).
   - Bu aşama bağımsız incelemeden geçer.
6. **Gezinme (tamamlandı).** `Navigator` ve `LocationPort` yazıldı. Bileşim kökü (`createKitaplik`), ayarlar deposu ve tarayıcı bağdaştırıcıları eklendi. Kitap penceresinin yığılma kuralı tasarıma bırakıldı (K6).
7. **Arayüzü bağlama.** Yeniden tasarım indikten sonra başlar.
   - **7a. Kişisel verinin tek sahibi.**
     - Kişisel kütüphane mağazası bütün ekranlar için tek bir commit'te tek sahip olur.
     - Eşitleme kancası tek bir `applyRemote` köprüsünü kullanır.
     - `App.jsx` içindeki yerel yazmalar aynı commit'te kaldırılır.
     - Önce şu test yazılır: uzak bir okuma hiç giden değişiklik üretmez.
     - Kapılar değişmeden yeşil kalır: `sync-hook.test.jsx`, `github-state-repository.test.js`, `sync.spec.js`, `devices-sync.spec.js`, `reading-marks.spec.js` ve `hide-owned.spec.js`.
     - Bu aşama bağımsız incelemeden geçer.
   - **7b. Ekran ekran bağlama.**
     - Her ekran bağlanmadan önce erişilebilirlik ağacı kaydı alınır (K11).
     - Bugünkü geri tuşu davranışı da bağlamadan önce sabitlenir: geri tuşu kitap izini temizler ve katalogdan açılan kitap geri gidilerek kapanır. Bu kural tasarımda `Navigator`'ın temel adımlarından kurulur. Zor olursa çekirdek, değişikliğin tarayıcıdan geldiğini bildiren bir işaret ekler.
     - Ekranın ihtiyaç duyduğu özellik görünüm modeli bu sırada yazılır (K6).
     - `catalogData.js` cepheye çevrilir ve kullanılmayan modüller listesi küçülür.
     - Gecikmeli yüklenen verinin ilk pakete girmediği bir derleme listesi ya da ağ testiyle kanıtlanır.
8. **Eşitleme denetleyicisi.** En yüksek riskli aşama budur.
   - İşlemlerin sırası değişmeden taşınır. Her tarayıcı çağrısı bir portla değiştirilir: yaşam döngüsü, zamanlayıcı, oturum deposu ve dışarıdan verilen depo.
   - Bugünkü kanca testleri önce çerçeveden bağımsız denetleyiciye karşı çalıştırılır.
   - Bağımsız inceleme yapılır ve bütün eşitleme profilleri yeşil olmalıdır.

## Sınır kapıları

`tests/architecture.test.js`, `npm test` içinde çalışır.
- `src/core/` yalnız kendisini ve K2'de adı geçen modülleri içe aktarabilir.
- K2'de sayılan arayüz teknolojileri ve tarayıcı nesneleri çekirdekte yasaktır. Kapı, çekirdeği TypeScript derleyicisiyle yalnız ES2023 kütüphanesine karşı derler ve her adı kendi kapsamında çözer. Çözülemeyen her ad bir ihlaldir: `window`, `document`, `matchMedia`, `process` gibi tarayıcı ve Node nesneleri. `globalThis` de adıyla yasaktır. Bu yüzden bir metindeki kelime, bir nesne alanı ya da yerel bir değişken yasak sayılmaz. Bir fonksiyondaki yerel bir ad, başka bir yerdeki gerçek kullanımı da gizlemez.
- `src/core/` altındaki her dosya düz Node'da içe aktarılabilir olmalıdır.
- Kapı, her kural ihlalini yakaladığını ve temiz kodu geçirdiğini bir öz testle kanıtlar.
- Her çekirdek ve bağdaştırıcı modülü `src/main.jsx` ya da bir Node betiği tarafından kullanılır, ya da adıyla "arayüzü bekleyenler" listesindedir. Liste yalnız küçülebilir: testteki üst sınır her bağlamada düşürülür, yükseltmek bağımsız inceleme ister.
- Ekran modellerinin klasörü (`src/screens/`) açıldığında aynı kapı onu da denetler.
- Arayüz bağlandıktan sonra eklenecek kural: arayüz `catalog.json`'u, `data/` dosyalarını ve GitHub depolarını doğrudan içe aktaramaz.

## Riskler

- **Eski istemciler.** Açık kalmış eski sayfalar eşitleme dosyalarını ve yerel anahtarları okur ve yazar. Bu yüzden dosya biçimleri, değer biçimleri ve birleştirme kuralları donar.
- **İki sahip.** Geçiş sırasında aynı veriyi iki yer yazarsa değişiklik çift gider ya da kaybolur. Bu yüzden kişisel verinin sahipliği tek seferde devredilir (7a).
- **Doğrulamanın veri silmesi.** Doğrulama, belirsiz kanıtı ya da bilinmeyen değeri silmemelidir. Mimari doğrulama, onaysız bir editoryal temizlik olamaz.
- **Eşitleme zamanlaması.** Eşitleme denetleyicisi taşınırken bir düzenlemenin algılanma anı değişebilir. Bu yüzden o aşama en sona bırakıldı ve testlerle önce sabitlenir.
- **Başarım.** Katalog boyutu tek başına yeni bir altyapıyı gerektirmez. Kataloğun özet ve ayrıntı olarak bölünmesi, yeni tasarımın yükleme ihtiyacı ölçüldükten sonra kararlaştırılır. Sözleşme bu bölünmeye şimdiden izin verir.
