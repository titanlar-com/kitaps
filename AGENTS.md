# Kitaplık: ajan talimatları

## Proje sahibinin kesin kuralları

Bu kurallar yalnızca proje sahibinin açık talimatıyla değişir. Hiçbir ajan bunları tasarım, erişilebilirlik ya da "iyileştirme" gerekçesiyle kendi kararıyla değiştiremez. Değişiklik gerektiğini düşünüyorsan önce sor.

1. **Sayfa boyutları:** 24, 48, 96, 192 ve 384 (`src/library.js`, `PAGE_SIZES`). Varsayılan 24'tür. 25, 50, 75 ve 100 gibi 24'ün katı olmayan sayılar kullanılmaz.
2. **Katalog ızgarası (`.books-grid`):** Telefonda 2 (dik de yatay da), tablette 3, masaüstünde ve daha geniş ekranlarda 4 sütun gösterilir; 5 ve üzeri yoktur.
   - Eşikler em cinsindendir ve tarayıcının varsayılan yazı boyutunu izler. 16 px'lik varsayılanla 576 px (36em) altında 2, 576–895 px arasında 3, 896 px (56em) ve üstünde 4 sütun görünür. Varsayılan yazı büyütülürse eşikler de büyür; 20 px'de 4 sütun 1120 px'de başlar.
   - Yatay tutulan telefon da 2 sütun gösterir (proje sahibinin 5 Ekim 2026 kararı). Telefon, kısa kenarıyla tanınır: yatay görünümde yükseklik 31em (496 px) ve altında, genişlik 1040 px'in altında (uzun katlanır telefonlar yatayda yaklaşık 1005 px). Tabletler ve dizüstüler bundan uzundur; kısa bir masaüstü penceresi 1040 px'ten geniş olduğunda dışarıda kalır.
   - Sütun sayısını `src/styles.css` içindeki `--books-columns` belirler. İzin verilen değerler `src/library.js` içindeki `GRID_COLUMNS` listesindedir.
   - Sütun sayısını tarayıcıya bırakan düzenler kullanılmaz: `auto-fill`, `auto-fit`, `grid` ve `grid-template` kısaltmaları, çok sütunlu metin düzeni (`columns`).
3. **Dolu son satır:** Her sayfa boyutu her sütun sayısına tam bölünür; dolu bir sayfanın son satırında boşluk kalmaz. Sonuçların son sayfası daha az kitap içerebilir.
4. **Esas adresler (proje sahibinin 21 Ekim 2026 kararı):** Esas depo `titanlar-com/kitaps`, eşitleme deposu `titanlar-com/kitaps-state`, canlı site https://titanlar-com.github.io/kitaps/ adresidir. Depolar kişisel hesaptan bu kuruluşa taşındı; eski adreslere geri dönüş ya da yedek seçenek bırakılmaz.
   - Site ve kaynak adresleri `src/site.js` (`SITE_URL`, `SOURCE_URL`), eşitleme deposu `src/state/types.ts` (`GITHUB_STATE_OWNER`, `GITHUB_STATE_REPOSITORY`) içindedir.
   - Adresi elle tekrarlayan yerler: `index.html`, `public/robots.txt`, `scripts/merge-data.py` (kaynak bağlantıları), `data/*.json` dosyalarının `source` alanları, `scripts/upgrade-covers.py` ve `scripts/fetch-international-covers.py` (User-Agent). `src/catalog.json` ve `public/sitemap.xml` üretilir (`npm run data`, `npm run seo`).
   - Yazma anahtarının sahibi (Resource owner) `titanlar-com` olmalıdır; kişisel hesaba bağlı anahtarlar kuruluş deposuna yazamaz.

Bu kuralları koruyan testler:

- `tests/routes.test.js`: sayfa boyutları, varsayılan ve eski bağlantılar
- `tests/catalog-grid.test.js`: stil dosyasının sütun sayısını yalnız `--books-columns` ile verdiği
- `tests/e2e/catalog-grid.spec.js`: 320–2560 px arasında 15 genişlikte gerçek sütun sayısı, dolu son satır ve yatay telefonda 2 sütun (Chromium, WebKit, Firefox ve iPhone görünümü)
- `tests/e2e/site.spec.js`: ilk sayfadaki 24 kitap ve beş sayfa boyutu seçeneği
- `tests/seo.test.js`: canonical, sitemap, `robots.txt`, katalogdaki kaynak bağlantıları ve baskı kaynak notu bağlantısının `titanlar-com` altında olduğu
- `tests/github-state-repository.test.js`, `tests/components/sync.test.jsx` ve `tests/e2e/sync.spec.js`: eşitleme isteklerinin yalnız `titanlar-com/kitaps-state` deposuna gittiği ve anahtar formunun sahip alanını `titanlar-com` olarak doldurduğu

Bu testleri kuralı gevşetmek için değiştirme.

## Kontroller

- `npm test`: node:test ve Vitest
- `npm run typecheck`
- `npm run build`: üretim çıktısını `dist/` klasörüne yazar. Önce `npm run seo` çalışır ve Git'te izlenen `public/sitemap.xml` dosyasını yeniden üretir; sayfa sayısı değişirse bu dosya da commit'e girer.
- `npm run test:e2e`: önce build gerekir. Paralel worktree'lerde başka bir port kullan, örneğin `E2E_PORT=4517 npm run test:e2e`.
- Veri değiştiğinde `npm run data` çalıştır (bkz. README).

## Aynı depoda birden çok oturum

- Force push yapılmaz.
- Push'tan hemen önce sırasıyla:
  1. `git fetch` ile güncel durumu al.
  2. Değişiklikleri `origin/main` üzerine rebase et.
  3. Kontrolleri yeniden çalıştır.
  4. Yalnız fast-forward olarak push et.
- Push'tan sonra diğer oturumlara yeni `origin/main` SHA'sını bildir.
- Başka bir oturumun alanındaki çakışmayı o oturuma danışarak çöz.

## Kişisel durum deposu

Okuma durumları, sahiplik, favoriler ve okuma sırası herkese açık `titanlar-com/kitaps-state` deposundaki `state.json` dosyasında tutulur. Tasarım ve yazma anahtarı kuralları `docs/ADR-001-reading-priority-and-state.md` içindedir. Anahtar, token veya başka bir sır depoya yazılmaz.

## Arayüz

- **Tokenlar:** Renk, köşe yarıçapı, gölge, odak ve kapak işaretleri `src/styles.css` başındaki tokenlarla yönetilir. Boşlukların bir kısmı henüz sabit piksel değeridir; yeni değerleri token olarak ekle.
- **Kapaklar:** Her kapak 2:3 bir çerçevede durur ve çerçeve kapak yüklenince büyümez. 2:3'ten uzun bir kapak bütün gösterilir; iki yanında çerçevenin yüzeyi görünür. Kapak kırpılmaz ve daraltılmaz; bu, proje sahibinin 21 Ekim 2026 kararıdır. `tests/e2e/catalog-grid.spec.js` bunu dört tarayıcı profilinde doğrular.
- **Açılır listeler:** Mantine Select kullanılır; değeri uzun olabilen seçiciler (sıralama, önerilerin konusu) aynı Combobox üzerine kurulu `WrappingSelect` ile değeri alt satıra alır. Yerel `<select>` kullanılmaz.
- **Odak (proje sahibinin kalıcı kuralı):** Odaklanan öğenin çevresine halka, çerçeve veya gölge çizilmez. Klavye modunu yalnız Tab ve Shift+Tab açar; işaretçi ya da dokunma kapatır (`src/focusMode.js`). Klavye modunda `:focus-visible` öğenin altında, kenarına değmeyen düz bir çizgi görünür; metin içindeki bağlantı her satırının altında kalın bir alt çizgiyle işaretlenir. Tek istisna yüksek karşıtlık modudur: klavye modunda `2px solid CanvasText`.
- **Vurgu kenarı:** Köşesi yuvarlatılmış bir kutunun kenarına renkli çizgi konmaz. Düz bir kenar çizgisi gerekirse yalnız merkezi kenar sistemiyle (`[data-edge]`) çizilir; o kenarın iki köşesi radiussuz olur. Vurgu önce yüzey tonu, gölge ve tipografiyle kurulur.
- **Paneller:** Bölümler çerçeveyle değil, yüzey tonu (`--panel`) ve boşlukla ayrılır. Kenarlık yalnız form alanı, tablo ve seçili durum gibi işlevsel yerlerde kalır.
- **Düğmeler:** Dolgulu, tonlu ve varsayılan düğmelerin sınırı her yüzeye karşı en az 3:1 kontrasttadır (WCAG 1.4.11); `--control-border` ve `--accent-border` tokenları bunu taşır. Sınır yalnız Button ve ActionIcon'a verilir (`controlBorder`, App.jsx); rozet, uyarı ve simgeler çerçevesiz kalır.
- **Hareket:** Bütün geçişler `--motion-ease: cubic-bezier(.65, 0, .35, 1)` ile `--motion-fast` ve `--motion-base` sürelerini kullanır. Mantine'nin ve bileşenlerin JavaScript geçişleri aynı değerleri `src/motion.js`'ten alır; ikisinin eşitliği test edilir. Geçişsiz iki durum vardır, ikisi de koşullu ve gerekçelidir: kitap ayrıntısı parmakla sürüklenirken panel parmağı izler (doğrudan kullanım, durum geçişi değil; bırakılınca yine geçişle döner; bu davranış önceden de vardı ve proje sahibinin onayına sunuldu), satın alma bildirimi ise odaklanan öğeyi ya da onun çizgisini örteceği anda beklemeden kalkar (AGENT.md'nin erişilebilirlik istisnası, WCAG 2.4.11). Basılan düğme yerinden oynamaz. Hareketi yalnız `prefers-reduced-motion: reduce` kapatabilir.
- **Yazı tipi:** Başlıklar dahil bütün arayüz Outfit'tir. Okunabilir metin en az 14 CSS px'tir.
- **Kapılar:** `tests/ui-gates.test.js` `src/` altındaki bütün stil dosyalarında kavisli kenarı, çevreleyen odağı ve token dışı hareketi, bileşenlerde token dışı hareketi reddeder; her yasak örneği gerçekten yakaladığını da sınar. `tests/e2e/ui-quality.spec.js` iki temada ve dört tarayıcı profilinde düğme sınırını, kenar sistemini, odak modunu, her Tab durağında ve sayfanın taşıdığı odakta göstergenin çerçevesiz, bütün, örtülmeden, ekranda ve 3:1 görünmesini, hareketi ve 14 px alt sınırını ölçer; axe WCAG 2.2 AA taraması ve yüksek karşıtlık denetimleri yalnız Chromium'da çalışır (Playwright yüksek karşıtlığı yalnız Chromium'da taklit eder). Bu kapıları gevşetme.
- **Kabul:** 320 px'den başlar. Ayrıntılar `docs/UX-VALIDATION.md` içindedir.
- **Büyük yazı:** 320 px'te %200 yazı da kabul ölçütüdür. Yazıyla büyümemesi gereken iç boşluklar `--inset-compact` ve `--edge-compact`, başlık ile denetimlerinin satırı `--reflow-title-min` tokenını kullanır. em cinsinden kapsayıcı sorgularını test ederken büyük yazıyı sayfa açılmadan uygula: Chromium (153) açık bir sayfada kök yazı boyutu değişince bu sorguları her zaman yeniden hesaplamaz. Kullanıcı yazı boyutunu sayfa açıkken değiştirirse kitap ayrıntısı ve bildirim, sayfa yenilenene ya da pencere boyutu değişene kadar eski düzende kalabilir.
