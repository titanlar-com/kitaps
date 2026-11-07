# Arayüzün Mantine ile yeniden tasarımı

Tarih: 8 Kasım 2026. Durum: plan kabul edildi, uygulama aşamalı ve test önce ilerliyor.

## İstek

Proje sahibi arayüzün estetiğini yetersiz buldu. Bütün tasarımın Mantine ile, zengin bir bileşen yelpazesiyle ve güçlü bir estetik anlayışla yeniden kurulmasını istedi. Tasarım dili verilmedi, karar bu çalışmaya bırakıldı. Veri mimarisi ayrı bir çalışmada yeniden kuruluyor (ADR 003). Bu çalışma görünümü ve etkileşimi değiştirir, veriyi değiştirmez.

## Değişmeyenler

Yeni tasarım aşağıdakileri olduğu gibi korur. Bunları koruyan testler gevşetilmez.

- Proje sahibinin kesin kuralları (`AGENTS.md`): sayfa boyutları 24, 48, 96, 192 ve 384, katalog ızgarası 2, 3 ve 4 sütun, kesin adresler.
- Kapaklar 2:3 çerçevede durur, kırpılmaz ve daraltılmaz.
- Okunabilir hiçbir metin 14 CSS px'in altına inmez. Gövde metni 16 px'tir.
- Odak göstergesi öğenin çevresine çizilmez. Klavye modunda öğenin altında tek bir çizgi görünür (`src/focusMode.js`).
- Açılır listeler Mantine Combobox ile kurulur, yerel `<select>` kullanılmaz.
- Hareket tek eğri ve süreyle yapılır: `cubic-bezier(.65, 0, .35, 1)`. Azaltılmış hareket tercihi korunur.
- Kabul 320 px'ten başlar. WCAG 2.2 AA ve axe taraması sıfır ihlaldir.
- Adres sözleşmesi, sayfa kaydı (`src/views.js`), üst menünün en çok dört bölümü ve alt menü korunur.
- Radiuslu kutulara kavisli vurgu kenarı çizilmez. Kenarlık yalnız işlevsel yerlerde kullanılır.

## Tasarım yönü: okuma masası

Kitaplık, araştırılmış bir okuma kataloğu ve kişisel bir kütüphanedir. Tasarım bunu bir okuma masası gibi kurar: kapaklar sahnenin asıl öğesidir, yazı düzeni dergi gibi sakin ve hiyerarşiktir, yüzeyler kâğıt ve mürekkep tonlarındadır.

- **Yüzeyler.** Üç katman vardır: zemin (kâğıt), yükseltilmiş yüzey (beyaz sayfa) ve gömük yüzey (masa). Ayrım önce boşlukla ve yüzey tonuyla kurulur. Gölge yalnız yükselen öğelerde (kapak, açılan panel) kullanılır.
- **Renk.** Tek vurgu rengi kiremittir. İşlev renkleri anlam taşır: satın alındı turkuaz, okundu mürekkep, uyarı amber. Renk tek başına anlam taşımaz, her durumun bir sözcüğü ve simgesi vardır.
- **Yazı.** Tek yazı tipi Outfit'tir. Hiyerarşi ağırlık, boyut ve harf aralığıyla kurulur. Sayılar tablo hizalı (tabular) yazılır.
- **Yoğunluk.** Varsayılan rahat yoğunluktur. Dokunma alanı 44 px'in altına inmez.
- **Kimlik öğeleri.** Sade açık kitap işareti, kapak gölgesi ve kitap sırtı çizgisi, okuma ilerlemesi için halka göstergeler.

## Bileşen haritası

Bütün bileşenler `@mantine/core` 9.6.3 içindedir. Yeni paket yalnız somut bir kullanıcı yararı varsa eklenir. Örneğin kitap ve sayfa araması için bir komut paleti (`@mantine/spotlight`) ileride değerlendirilir.

| Ekran | Bileşenler |
|---|---|
| Uygulama kabuğu | AppShell (üst ve alt bölüm), Tabs ile FloatingIndicator, ActionIcon ile Indicator (sayaçlar), Switch, Menu, Tooltip, Affix (yukarı dön), Kbd (arama kısayolu) |
| Katalog | Okuma özeti için RingProgress ve NumberFormatter, Paper başlık bandı, TextInput ve Kbd, Chip, Badge, Card ve AspectRatio ile kitap kartı, HoverCard (fareyle önizleme, tek yol değildir), Skeleton, EmptyState, Pagination |
| Kitap ayrıntısı | Drawer, Breadcrumbs, Badge, DataList (baskı ve çeviri bilgisi), Progress (sayfa ilerlemesi), Timeline (okuma geçmişi), Spoiler (uzun notlar), Accordion |
| Sıram | Timeline ya da Stepper biçiminde sıralı liste, ActionIcon grupları |
| Kümeler | SimpleGrid, Card, Progress (kümede okunanlar), Avatar.Group (kapak önizlemesi), Badge |
| Kitapçılar ve rotalar | Tabs, Card, Badge (açık, kapalı, doğrulanmadı), DataList (adres, saat, ulaşım), Spoiler, Timeline (rota), Stepper (rota oluşturucu), Table ve ScrollArea |
| Kitap fuarları | Timeline (aylara göre), Badge (durum), Indicator (bugün ve yaklaşan) |
| Notlar | Typography, TableOfContents |
| Alt menü ve paneller | Drawer, NavLink, Divider, Notification, Alert, Stepper (cihaz bağlama) |

## Test önce ilerleme

Her aşama kendi başına yayına çıkar ve bütün testler geçerek kapanır. Bir aşamada sırasıyla şunlar yapılır:

1. **Önceki hâl.** Ekranların 320, 390, 768 ve 1280 px genişlikte, açık ve koyu temada görüntüleri alınır.
2. **Önce test.** Yeni davranış ve yapı için başarısız testler yazılır:
   - tema ve belirteç kuralları için birim testi;
   - veri taşıyan yeni bileşenler için bileşen testi (Vitest ve Testing Library);
   - yerleşim, odak ve erişilebilirlik için tarayıcı testi.
3. **Uygulama.** Testler geçene kadar uygulanır. Var olan testler gevşetilmez.
4. **Yapı testleri.** Erişilebilirlik ağacını sabitleyen yapı testleri (`tests/e2e/structure.spec.js`) yalnız istenen değişiklik için ve önce/sonra farkıyla güncellenir.
5. **Bütün kontroller.** `TZ=UTC npm test`, `npm run typecheck`, `npm run build` ve tarayıcı testleri Chromium, WebKit ve iPhone görünümünde çalışır. Firefox proje sahibinin kuralı gereği çalışmaz.
6. **Bağımsız inceleme.** Uygulayıcıdan bağımsız bir QA incelemesi yapılır. Önce/sonra görüntüleri proje sahibine verilir.

## Aşamalar

1. **Tema ve belirteçler.**
   - Yüzey katmanları, gölge, yazı ölçeği, sayı biçimi ve bileşen varsayılanları tek temada toplanır.
   - Önce yazılacak testler:
     - temanın bütün yazı boyutlarının 14 px ve üstünde olması;
     - hareket değerlerinin sözleşmeye uyması;
     - köşe ve gölgelerin belirteçlerden gelmesi;
     - yeni renk çiftlerinin AA karşıtlığı.
2. **Uygulama kabuğu.**
   - Üst bölüm, bölüm sekmeleri, eylem düğmeleri ve sayaçlar, alt bölüm.
   - Önce yazılacak testler:
     - sayaçların doğru sayıyı göstermesi;
     - dört bölümün 320 px'te tek satırda kalması;
     - yeni denetimlerde odak çizgisi.
3. **Katalog.**
   - Okuma özeti, başlık bandı, araç çubuğu, kitap kartı, boş ve yükleniyor durumları.
   - Önce yazılacak testler:
     - özet sayılarının kişisel kayıtla tutması;
     - kartın erişilebilir adı;
     - boş sonuçta EmptyState;
     - ızgara kurallarının aynen sürmesi.
4. **Kitap ayrıntısı.**
   - Başlık bölümü, bilgi listesi, okuma ilerlemesi ve geçmişi.
   - Önce yazılacak testler:
     - ilerleme yüzdesinin sayfa sayısından doğru hesaplanması;
     - okuma geçmişinin tarih sırası;
     - eşitleme testlerinin kullandığı denetim adlarının korunması.
5. **Sıram, Kümeler, Favoriler, Kitaplığım.**
   - Önce yazılacak testler:
     - kümede okunanların oranı;
     - sıranın düzeni ve sıra değiştirme düğmeleri.
6. **Kitapçılar, rotalar ve fuarlar.**
   - Önce yazılacak testler:
     - durum rozetleri;
     - rota zaman çizelgesinin durak sırası;
     - fuar zaman çizelgesinin ay gruplaması.
7. **Paneller.**
   - Filtreler, eşitleme, alt menü, bildirimler.
   - Önce yazılacak testler:
     - filtre seçimlerinin adreste kalması;
     - cihaz bağlama adımları;
     - klavye ve dokunma.
8. **Son kabul.**
   - 320 px'ten 2560 px'e yerleşim ölçümleri, iki temada axe, metin büyütme, azaltılmış hareket.
   - Bağımsız QA incelemesi ve önce/sonra raporu.

## Veri mimarisiyle ilişki

Yeni bileşenler veriyi bugün var olan saf işlevlerden alır (`src/library.js`, `src/reading.js`, `src/app/listing.js`). ADR 003 görünüm modellerini getirdiğinde bileşenler onlara bağlanır. Görünüm modeli verinin biçimini, bileşen yalnız sunumu belirler. Bu yüzden yeni bileşenler veri hesaplamaz: sayı, oran ve sıralama hesapları test edilmiş saf işlevlerde durur.
