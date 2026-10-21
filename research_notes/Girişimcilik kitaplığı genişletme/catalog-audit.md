# Girişimcilik kitaplığı katalog denetimi

## Mevcut eşleşmeler ve eksik yüksek değerli kitaplar

### Takeaway

İki kullanıcı metninde kitap olarak açıkça önerilen 36 benzersiz eser var. Katalog bunların 17'sini zaten içeriyor; 19 eser eksik. Birinci metnin sonuç tablosu “25 kitap” dese de gövde metninde ayrıca *Financial Intelligence for Entrepreneurs* ve *Simple Numbers, Straight Talk, Big Profits* önerildiği için denetim bu iki eseri de kapsamına aldı.

### Cited Findings

- Birinci önerideki gövde ve sonuç listesi birlikte okunduğunda 27 eser; ikinci önerinin çekirdek tablosunda 19 eser bulunuyor. Tekrarlananlar birleştirildiğinde toplam 36 benzersiz kimlik kalıyor. — Birinci kullanıcı metni (yerel ek; depoda yok); ikinci kullanıcı metni (yerel ek; depoda yok)
- **Katalogda bulunan 17 eser:** *SPIN Selling*; *Never Split the Difference*; *Good Strategy, Bad Strategy*; *Playing to Win*; *The Innovator's Dilemma*; *Crossing the Chasm*; *How Brands Grow*; *High Output Management*; *The Goal*; *The Hard Thing About Hard Things*; *Radical Candor*; *Venture Deals*; *The Personal MBA: Master the Art of Business*; *Financial Intelligence for Entrepreneurs*; *Simple Numbers, Straight Talk, Big Profits*; *The E-Myth Revisited*; *The Founder’s Dilemmas*. Eşleşmeler normalize edilmiş başlık+yazar, katalog takma adları ve tam eser kimliğiyle yapıldı. — [Birleşik katalog](https://github.com/titanlar-com/kitaps/blob/main/src/catalog.json)
- *The Personal MBA* tam katalog başlığının kısa biçimidir: katalogdaki kayıt *The Personal MBA: Master the Art of Business* ve yazar Josh Kaufman'dır. *Good Strategy/Bad Strategy* ile düz/kıvrık apostrof kullanan *The Founder's Dilemmas* da katalog takma adları üzerinden aynı esere çözülüyor. — [Birleşik katalog](https://github.com/titanlar-com/kitaps/blob/main/src/catalog.json)
- **Eksik 19 eser:** *The Mom Test* — Rob Fitzpatrick; *Competing Against Luck* — Clayton Christensen; *Disciplined Entrepreneurship* — Bill Aulet; *Business Model Generation* — Alexander Osterwalder & Yves Pigneur; *Value Proposition Design* — Alexander Osterwalder vd.; *Testing Business Ideas* — David Bland & Alexander Osterwalder; *Founding Sales* — Pete Kazanjy; *Obviously Awesome* — April Dunford; *7 Powers* — Hamilton Helmer; *Traction* — Gabriel Weinberg & Justin Mares; *The Great CEO Within* — Matt Mochary; *Who: The A Method for Hiring* — Geoff Smart & Randy Street; *Secrets of Sand Hill Road* — Scott Kupor; *Monetizing Innovation* — Madhavan Ramanujam & Georg Tacke; *Profit First* — Mike Michalowicz; *The Cold Start Problem* — Andrew Chen; *Negotiation Genius* — Deepak Malhotra & Max H. Bazerman; *The Outsiders* — William N. Thorndike; *Thinking in Bets* — Annie Duke. Bu kimliklerin hiçbirinin başlığı, yazarı veya takma adı katalogda aynı esere çözülmüyor. — [Birleşik katalog](https://github.com/titanlar-com/kitaps/blob/main/src/catalog.json)
- “Traction” kimliği Gino Wickman'ın aynı adlı kitabı değil, Gabriel Weinberg ve Justin Mares'ın müşteri edinme kanalları kitabıdır; resmi ürün sayfası yazarları, Portfolio baskısını ve ISBN 9781591848363'ü doğruluyor. — [Penguin Random House](https://www.penguinrandomhouse.com/books/319121/traction-by-gabriel-weinberg-and-justin-mares/)
- *7 Powers* resmi kitap sitesi eseri Hamilton Helmer'a atfediyor; bu, aynı başlıkta yanlış bir kayda bağlanmasını önleyecek kesin kimliktir. — [7 Powers resmi sitesi](https://7powers.com/buy-the-book/)
- ghSMART, *Who: The A Method for Hiring* eserini Geoff Smart ve Randy Street'in kitabı olarak tanımlıyor. — [ghSMART](https://ghsmart.com/research-ip/who-method/)
- HBR'nin resmi mağazası *The Outsiders* eserini Will Thorndike'a atfediyor ve tam alt başlığını *Eight Unconventional CEOs and Their Radically Rational Blueprint for Success* olarak veriyor. — [Harvard Business Review Store](https://store.hbr.org/product/the-outsiders-eight-unconventional-ceos-and-their-radically-rational-blueprint-for-success/10344)

### Inferences

- İlk genişletme dalgası doğrudan 19 eksik eseri eklemeli. Bunlar kullanıcı listelerinin kesişen mekanizmalarını tamamlıyor: müşteri keşfi, iş modeli, fiyatlandırma, dağıtım, işe alım, ağ etkileri, sermaye dağıtımı ve belirsizlikte karar.
- Eşleşme sırasında yalnız başlık kullanılmamalı. Özellikle *Traction*, *Who* ve *The Outsiders* için başlık+yazar+alt başlık/ISBN birlikte saklanmalı.
- Mevcut 17 eserin yeniden oluşturulması yerine yeni koleksiyona üyelik verilmesi gerekir; aksi halde katalogda kopya eser ve ayrık kişisel durum anahtarları oluşur.

### Gaps

- 19 eksik kitabın Türkçe baskı, çevirmen ve ISBN doğrulaması bu denetimin kapsamı değildi; ekleme sırasında ayrı baskı araştırması gerekir.
- Kullanıcı metinlerindeki güncel kuruluş ve web kaynağı iddiaları kitap kimliği denetiminin kanıtı olarak kullanılmadı.

## Mevcut enterprise kategorisinin sayısı ve konu kalitesi

### Takeaway

`enterprise` kategorisinde 31 eser var. Kategori bir müfredat değil: doğrudan uygulama kitapları, yatırım ekosistemi eserleri, şirket tarihleri, biyografiler ve geniş düşünce tarihi aynı etikette toplanmış. Bu nedenle kategori korunabilir, fakat kullanıcıya sunulacak girişimcilik listesi ayrı ve sıralı bir koleksiyon olmalı.

### Cited Findings

- Katalogda `enterprise` etiketi taşıyan 31 benzersiz eser bulunuyor. Kimlikler ve çoklu kategori değerleri birleşik katalogda saklanıyor. — [Birleşik katalog](https://github.com/titanlar-com/kitaps/blob/main/src/catalog.json)
- Etiketin önemli bölümü kaynak grup adından otomatik türetiliyor: `İş kurma`, `Değer yaratma ve test etme` ve `Girişimcilik` grup adları `enterprise` kategorisini ekliyor. Bu, konu etiketi için makul olsa da tek başına pedagojik öncelik veya okuma sırası üretmiyor. — [Birleştirme betiği](https://github.com/titanlar-com/kitaps/blob/main/scripts/merge-data.py)
- Mevcut kategoride doğrudan işletme kurma ve işletme mekanizması öğreten güçlü kayıtlar var: *The Lean Startup*, *The E-Myth Revisited*, *Rework*, *The New Business Road Test*, *Bankable Business Plans*, *The Partnership Charter*, *Small Giants*, *The Founder’s Dilemmas*, *The Art of the Start 2.0* ve *Growing a Business*. — [Birleşik katalog](https://github.com/titanlar-com/kitaps/blob/main/src/catalog.json); [Atlas kaynak verisi](https://github.com/titanlar-com/kitaps/blob/main/data/sources/atlas-v1.json)
- Kategoride ayrıca anlatı veya vaka niteliği ağır basan *Bad Blood*, *The Cult of We*, *No Filter*, *The Everything Store*, *Steve Jobs*, *The Facebook Effect*, *Wild Ride*, *Alibaba* ve *Dirtbag Billionaire* bulunuyor. Bunlar girişimcilik vakası sağlayabilir, fakat müşteri keşfi, fiyatlandırma veya satış gibi bir mekanizma için çekirdek el kitabı değiller. — [Birleşik katalog](https://github.com/titanlar-com/kitaps/blob/main/src/catalog.json); [FT kategori eşlemeleri](https://github.com/titanlar-com/kitaps/blob/main/data/ft-categories.json)
- *The Discoverers* kaydı `enterprise`, `history` ve `science` kategorilerini birlikte taşıyor. Girişimcilik üyeliği Five Books uzman seçkisinden geliyor; katalog birleştirmesi ayrıca eseri tarih ve bilim olarak işaretliyor. Bu kayıt geniş düşünce tarihi açısından anlamlı, ancak girişimcilik mekanizmaları listesinde en zayıf eşleşme. — [Birleşik katalog](https://github.com/titanlar-com/kitaps/blob/main/src/catalog.json); [Five Books kaynak grubu](https://github.com/titanlar-com/kitaps/blob/main/data/sources/atlas-v1.json)
- Mevcut testler her kaynağın birleşimde korunmasını, her kitabın en az bir üyelik ve kategori taşımasını, eşleşen çeviri başlıklarının tek eserde birleşmesini ve kimliklerin benzersiz kalmasını zorunlu tutuyor. — [Katalog bütünlük testleri](https://github.com/titanlar-com/kitaps/blob/main/tests/library.test.js)

### Inferences

- **Çekirdek/doğrudan:** *The Lean Startup*, *The E-Myth Revisited*, *Rework*, *The New Business Road Test*, *Bankable Business Plans*, *The Partnership Charter*, *Small Giants*, *The Founder’s Dilemmas*, *The Art of the Start 2.0*, *Growing a Business*, *Go It Alone*, *Street Smarts*, *Ready, Fire, Aim*, *The Hard Thing About Hard Things* ve *The Monk and the Riddle* yeni koleksiyon için güçlü mevcut adaylardır.
- **Destekleyici:** *Guerrilla Marketing*, *The Power Law*, *Boulevard of Broken Dreams* ve seçilmiş şirket anlatıları çekirdeği tamamlar; ayrı “Sermaye ve ekosistem” veya “Vaka çalışmaları” grubunda tutulmalıdır.
- **Zayıf/çekirdek dışı:** *The Discoverers* açıkça geniş tarih/bilim eseridir. *Escape from Cubicle Nation* kariyer geçişine, *How to Make Millions with Your Ideas* fikir ticarileştirmesine daha dar biçimde odaklanır. *Dirtbag Billionaire*, *Wild Ride* ve *The Facebook Effect* ise yeni listede benzer vaka kitapları arasında daha düşük marjinal katkı sağlar. Bunların `enterprise` etiketi silinmek zorunda değil; 100 kitap altındaki kürasyon listesine alınmamaları daha temizdir.
- Kategori filtresi “bu konuyla ilişkili” anlamını, yeni koleksiyon ise “hangi sırayla ve hangi mekanizma için okunmalı” anlamını taşımalıdır.

### Gaps

- Mevcut kategorideki kitapların basım yılı ve içerik güncelliği her kayıt için ayrı doğrulanmadı; “zayıf” değerlendirmesi güncellikten çok müfredat uyumu ve diğer kitaplarla marjinal katkıya dayanıyor.
- Şirket anlatılarının hangisinin kullanıcı için en değerli olduğu sektör ve iş modeli tercihine bağlıdır; önerilen vaka alt kümesi genel bir işletme kurucusu varsayar.

## Kaynak veri yapısı ve 100 kitap altındaki genişletme planı

### Takeaway

En güvenli yapı, `enterprise` kategorisini değiştirmek yerine ayrı bir kaynak dosyadan üretilen `entrepreneurship-curriculum` koleksiyonudur. Önerilen nihai liste 58 kitaptır: kullanıcı metinlerindeki 36 benzersiz eser, katalogdaki 15 ek uygulama/ekosistem eseri ve 7 seçilmiş vaka kitabı. Üst sınıra ulaşmak için dolgu yapılmamalıdır.

### Cited Findings

- Mevcut birleştirici `getbook(title, author, origin, extraTitles, canonical)` ile normalize edilmiş kimlik üretip başlık/yazar üzerinden mevcut kayda bağlanıyor; `member` ise aynı koleksiyon+grup üyeliğini çoğaltmadan ekliyor. Yeni kaynak bu iki işlevi kullanırsa mevcut kimlik ve üyelik davranışı korunur. — [Birleştirme betiği](https://github.com/titanlar-com/kitaps/blob/main/scripts/merge-data.py)
- Var olan kaynak modeli koleksiyonları, grupları ve kitapları ayrı tutuyor; koleksiyon üyeliği kategori etiketinden bağımsız olarak saklanıyor. Bu, pedagojik sırayı kategoriye yüklemeden yeni bir müfredat koleksiyonu eklemeye uygundur. — [Atlas kaynak şeması](https://github.com/titanlar-com/kitaps/blob/main/data/sources/atlas-v1.json); [yerel okuma kümeleri](https://github.com/titanlar-com/kitaps/blob/main/data/sources/okuma-kumeleri.json)
- Katalog testleri bütün kaynak kayıtlarının birleşimde bulunmasını, kitap kimliklerinin benzersiz kalmasını ve her kitabın üyelik taşımasını denetliyor. Yeni koleksiyon için aynı türde kapsam testi eklenebilir. — [Katalog bütünlük testleri](https://github.com/titanlar-com/kitaps/blob/main/tests/library.test.js)

### Inferences

- **Önerilen dosya:** `data/sources/entrepreneurship-curriculum.json`.
- **Önerilen üst yapı:** `{ "id": "entrepreneurship-curriculum", "title": "Girişimcilik: Kurucudan Sermaye Dağıtıcısına", "version": 1, "sourceRef": [...], "groups": [...] }`.
- **Her kitap kaydı:** `{ "key", "title", "author", "aliases": [], "reason", "stage", "sourceUrl", "existingId?" }`. `existingId` yalnız denetim ve test kolaylığı içindir; birleştirmede asıl eşleşme canonical `key` + normalize başlık/yazar üzerinden yapılmalıdır. Eksik kitapların `sourceUrl` değeri resmi yayınevi/yazar sayfası olmalıdır.
- **Birleştirme davranışı:** Koleksiyon metadata'sını `collections` içine, her aşamayı `groups` içine ekle; her kitap için `getbook` çağır; `member` ile koleksiyon/grup üyeliği ver; `addcat(b,'enterprise')` uygula. Kaynağın `key` değeri mapping altında `entrepreneurship:<key>` olarak saklanmalıdır.
- **Yeni testler:** kaynakta tam 58 benzersiz kitap; 100 veya daha az kitap; her kaydın başlık+yazar+reason+HTTPS kaynak taşıması; her kaynak kaydının tek katalog kimliğine çözülmesi; aynı eserin birden çok aşamada tekrarlanmaması; 19 eksik kimliğin eklendikten sonra katalogda bulunması; her yeni kitabın `enterprise` kategorisi ve `entrepreneurship-curriculum` üyeliği taşıması.
- **Önerilen 58 kitaplık kesin yapı:**
  1. **Müşteri ve doğrulama — 6:** *The Mom Test*; *Competing Against Luck*; *Disciplined Entrepreneurship*; *Business Model Generation*; *Value Proposition Design*; *Testing Business Ideas*.
  2. **Satış, konumlandırma, fiyat ve dağıtım — 9:** *Founding Sales*; *SPIN Selling*; *Obviously Awesome*; *Never Split the Difference*; *Negotiation Genius*; *Monetizing Innovation*; *Traction*; *Crossing the Chasm*; *How Brands Grow*.
  3. **Finans, yatırım ve sermaye dağıtımı — 8:** *Financial Intelligence for Entrepreneurs*; *Simple Numbers, Straight Talk, Big Profits*; *Profit First*; *Venture Deals*; *Secrets of Sand Hill Road*; *The Outsiders*; *The Power Law*; *Boulevard of Broken Dreams*.
  4. **Strateji, avantaj ve muhakeme — 7:** *Good Strategy, Bad Strategy*; *Playing to Win*; *7 Powers*; *The Innovator's Dilemma*; *The Cold Start Problem*; *Thinking in Bets*; *The New Business Road Test*.
  5. **Operasyon, kurucu ve liderlik — 11:** *The Personal MBA*; *The E-Myth Revisited*; *High Output Management*; *The Goal*; *The Great CEO Within*; *The Hard Thing About Hard Things*; *Who: The A Method for Hiring*; *Radical Candor*; *The Founder’s Dilemmas*; *Small Giants*; *The Partnership Charter*.
  6. **Kurma ve büyütme pratiği — 10:** *The Lean Startup*; *Rework*; *The Art of the Start 2.0*; *Growing a Business*; *Go It Alone*; *Street Smarts*; *Ready, Fire, Aim*; *Bankable Business Plans*; *Guerrilla Marketing*; *The Monk and the Riddle*.
  7. **Seçilmiş vaka çalışmaları — 7:** *Steve Jobs*; *The Everything Store*; *Alibaba*; *Bad Blood*; *The Cult of We*; *No Filter*; *The Republic of Tea*.
- Bu plan 58'de durur. Sonradan yeni eser eklemek için “eksik mekanizma”, mevcut bir kitaptan belirgin üstünlük veya Türkiye bağlamına açık katkı ölçütlerinden en az biri aranmalıdır.

### Gaps

- Yeni 19 kitap için resmi kaynak URL'lerinin tamamı, ISBN'ler, Türkçe başlıklar ve çeviri durumları ekleme çalışmasında tamamlanmalıdır.
- Türkiye'de vergi, tahsilat, vade, kur ve KOBİ satış gerçekliğini doğrudan ele alan güvenilir kitaplar iki kullanıcı listesinde yok. 58 kitaplık sürüm bu boşluğu görünür bırakıyor; sırf 100'e yaklaşmak için doğrulanmamış eser eklemiyor.
