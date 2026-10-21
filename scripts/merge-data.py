"""Merge the three supplied datasets, preserving source records and memberships."""
from pathlib import Path
import json,re,unicodedata,hashlib
from datetime import date
from translation_availability import validate_manifest
from bibliographic_facts import validate_facts
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads((ROOT/p).read_text())
atlas=read('data/sources/atlas-v1.json'); local=read('data/sources/okuma-kumeleri.json'); kitaps=read('data/sources/kitaps.json'); entrepreneurship=read('data/sources/entrepreneurship-curriculum.json'); foundations=read('data/foundational-reading.json'); preparation=read('data/preparatory-reading-tr.json'); preparation_covers=read('data/preparatory-reading-covers.json')
def norm(s):
 s=''.join(c for c in unicodedata.normalize('NFKD',s.lower().replace('ı','i')) if not unicodedata.combining(c)).replace('&','and')
 s=re.sub(r'\s*\([A-Z]\d+\)\s*$','',s,flags=re.I)
 return re.sub(r'[^\w]','',re.sub(r'^(the|a|an)\s+','',s))
aliases={'guerillamarketing':'guerrillamarketing','7habitsofhighlyeffectivepeople':'sevenhabitsofhighlyeffectivepeople','トヨタ生産方式toyotaproductionsystem':'toyotaproductionsystem','ταειςεαυτονmeditations':'meditations', 'miyamotomusashisbookoffiveringsacompletelynewtranslation':'五輪書gorinnosho','bookoffiveringsshambhalakodansha':'五輪書gorinnosho','bookoffiveringsclearycevirisi':'五輪書gorinnosho','bookoffiveringsharriscevirisi':'五輪書gorinnosho'}
def key(s):return aliases.get(norm(s),norm(s))
books={}; index={}; collections=[]; groups=[]; mapping={}; reports=[]
# Original-title candidates per book: a lower rank wins. Titles recorded in the
# work's own language (rank 1) outrank the English titles of list sources.
original_titles={}
def offer_original(b,title,rank):
 if title and (b['id'] not in original_titles or rank<original_titles[b['id']][0]):original_titles[b['id']]=(rank,title)
TURKISH_ONLY=re.compile(r'[ğĞşŞıİ]')
TURKISH_WORDS=re.compile(r'\b(ve|ile|için|bir|nasıl|neden)\b',re.I)
def foreign_title(value,turkish):
 """The source's `original` field sometimes repeats a Turkish title."""
 if not value or value==turkish:return None
 cleaned=re.sub(r'\s*\([^)]*[ğĞşŞıİ][^)]*\)','',value).strip()
 core=re.sub(r'\s*\([^)]*\)','',cleaned).strip()
 if not core or TURKISH_ONLY.search(core) or TURKISH_WORDS.search(core):return None
 return cleaned
# Bibliographic services occasionally invert corporate publisher names.
PUBLISHER_FIXES={'Wiley & Sons, Incorporated, John':'John Wiley & Sons','Oxford University Press, Incorporated, Oxford University Press':'Oxford University Press'}
def clean_cover(cover):
 return {**cover,'publisher':PUBLISHER_FIXES[cover['publisher']]} if cover.get('publisher') in PUBLISHER_FIXES else cover
# The Personal MBA list shortens co-authors to "et al", misspells two names and
# drops a space. The catalog credits the authors as the books print them; the
# fixes apply after merging, so source matching still sees the list's own text.
AUTHOR_FIXES={'smartchoices':'John S. Hammond, Ralph L. Keeney & Howard Raiffa','crucialconversations':'Kerry Patterson, Joseph Grenny, Ron McMillan & Al Switzler','newleaders100dayactionplan':'George B. Bradt, Jayme A. Check & Jorge Pedraza','marketingmetrics':'Paul W. Farris, Neil T. Bendle, Phillip E. Pfeifer & David J. Reibstein','seeingwhatsnext':'Clayton M. Christensen, Scott D. Anthony & Erik A. Roth','universalprinciplesofdesign':'William Lidwell, Kritina Holden & Jill Butler','yourmoneyoryourlife':'Vicki Robin & Joe Dominguez','economistnumbersguide':'Richard Stutely','aguidetothegoodlife':'William B. Irvine','poweroffullengagement':'Jim Loehr & Tony Schwartz'}
WORK_FORMATS={'article','essay'}
def apply_format(b,item):
 """Articles and essays are listed like books but name where they appeared."""
 if not item.get('format'):return
 assert item['format'] in WORK_FORMATS,(b['id'],item['format'])
 # A work listed by where it appeared has no edition or cover to contradict that.
 assert not b.get('verifiedEdition') and not b.get('cover'),b['id']
 publication=item.get('publication') or {}
 assert publication.get('venue') and any(publication.get(field) for field in ('readUrl','doi','pageUrl')),b['id']
 for field in ('readUrl','pageUrl'):assert not publication.get(field) or publication[field].startswith('https://'),(b['id'],field)
 b['format']=item['format'];b['publication']=publication
def source_label(url):
 host=re.sub(r'^www\.','',re.sub(r'^https://([^/]+).*$',r'\1',url))
 return 'Bibliyografik kayıt · Open Library' if host=='openlibrary.org' else 'Kaynak · '+host
categoryNames={'strategy':'Strateji ve rekabet','management':'Yönetim ve liderlik','enterprise':'Girişimcilik','marketing':'Pazarlama ve satış','communication':'İletişim ve müzakere','psychology':'Psikoloji ve davranış','productivity':'Üretkenlik ve alışkanlıklar','systems':'Sistemler ve operasyon','finance':'Finans ve yatırım','economy':'Ekonomi ve toplum','technology':'Teknoloji ve yapay zekâ','innovation':'Yenilik ve tasarım','history':'Tarih','biography':'Biyografi ve anı','politics':'Siyaset ve jeopolitik','ethics':'Etik ve kurumsal sorumluluk','climate':'İklim ve sürdürülebilirlik','literature':'Edebiyat','philosophy':'Felsefe','children':'Çocuk','science':'Bilim ve öğrenme'}
def addcat(b,*cats):
 for c in cats:
  assert c in categoryNames,c
  if c not in b['categories']:b['categories'].append(c)
def getbook(title,author,origin,legacy=None,extraTitles=(),canonical=None):
 k=canonical or key(title)
 if not k:raise ValueError('Missing book title: '+str((title,author,origin)))
 # Two unrelated books can share a title; preserve their authors as a discriminator.
 collision=k in ['abundance','elonmusk','boom','whatworks']
 if collision:k+='-'+key(author).replace('ve','')
 candidates=index.get(k,[])
 b=books[candidates[0]] if candidates else None
 if not b and ':' in title:
  candidates=index.get(key(title.split(':')[0]),[])
  if len(candidates)==1:
   candidate=books[candidates[0]]
   surname=key(re.split(r'[,;&]| ve ',author)[0].split('(')[0].strip().split(' ')[-1])
   if surname and surname in key(candidate['author']):b=candidate
 if not b:
  bid=k or hashlib.sha1((title+author).encode()).hexdigest()[:12]
  b={'id':bid,'title':title,'titleTr':'','author':author,'aliases':[],'years':[],'categories':[],'memberships':[],'notes':[],'editions':[],'origins':[],'legacyKeys':[],'tags':[]}
  books[bid]=b
 if origin not in b['origins']:b['origins'].append(origin)
 if legacy and legacy not in b['legacyKeys']:b['legacyKeys'].append(legacy)
 for t in [title,*extraTitles]:
  if t and t!=b['title'] and t not in b['aliases']:b['aliases'].append(t)
 for t in [title,*extraTitles,canonical or '']:
  if t:
   tk=key(t)
   if collision:tk=k
   index.setdefault(tk,[])
   if b['id'] not in index[tk]:index[tk].append(b['id'])
 return b

def note(b,text,source):
 if text and not any(n['text']==text for n in b['notes']):b['notes'].append({'text':text,'source':source})
def member(b,cid,gid,**kwargs):
 old=next((m for m in b['memberships'] if m['collectionId']==cid and m['groupId']==gid),None)
 if old:
  for k,v in kwargs.items():
   if v and not old.get(k):old[k]=v
 else:b['memberships'].append({'collectionId':cid,'groupId':gid,**kwargs})

groupCats={
'İş kurma':['enterprise'],'Değer yaratma ve test etme':['enterprise','innovation'],'Pazarlama':['marketing'],'Satış':['marketing','communication'],'Değer sunma':['systems'],'Finans ve muhasebe':['finance'],'İnsan zihni':['psychology'],'Üretkenlik ve etkililik':['productivity'],'Problem çözme':['psychology','systems'],'Davranış değişikliği':['psychology','productivity'],'Karar verme':['psychology','strategy'],'İletişim':['communication'],'Etki ve ikna':['communication','psychology'],'Müzakere':['communication'],'Yönetim':['management'],'Liderlik':['management'],'Proje yönetimi':['management','systems'],'Sistemler':['systems'],'Analiz':['systems'],'Kurumsal beceriler':['management'],'Kurumsal strateji':['strategy'],'Yaratıcılık ve yenilik':['innovation'],'Tasarım':['innovation'],'Danışmanlık':['management','communication'],'Kişisel finans':['finance'],'Kişisel gelişim':['productivity'],'Kişisel etkililik':['productivity'],'Strateji':['strategy'],'Satış ve pazarlama':['marketing'],'Ekonomi ve ölçüm':['economy'],'Biyografiler':['biography'],'Girişimcilik':['enterprise'],'İş dünyası anlatıları':['biography','economy'],'Yenilik ve yaratıcılık':['innovation'],'Büyük fikirler':[],'Sistemi anlamak':['systems'],'Doğru yönü seçmek':['strategy'],'O yönde iş çıkarmak':['management']}
for c in atlas['collections']:
 collections.append({k:v for k,v in c.items() if k not in ['groups','guide','count'] }|{'origin':'atlas','originalCount':c['count']})
 for n,g in enumerate(c['groups']):
  gid=f"{c['id']}:{n}";groups.append({k:v for k,v in g.items() if k!='books'}|{'id':gid,'collectionId':c['id']})
  for old in g['books']:
   b=getbook(old['title'],old['author'],'atlas',extraTitles=[old.get('tr','')],canonical=old['key']);mapping['atlas:'+old['key']]=b['id'];offer_original(b,old['title'],2)
   if old.get('tr'):b['titleTr']=old['tr']
   note(b,old.get('note'),c['short'])
   member(b,c['id'],gid,source=old.get('source',c.get('source')),award=old.get('status'),awardYear=int(g['title']) if c['id']=='ft' else None)
   if c['id']=='mit':addcat(b,'strategy')
   if c['id']=='time':addcat(b,'management')
   addcat(b,*groupCats.get(g['title'],[]))
 if c.get('guide'):
  guide=c['guide'];b=getbook(guide['title'],guide['author'],'atlas');addcat(b,'management')
  gid=c['id']+':guide';groups.append({'id':gid,'collectionId':c['id'],'title':'Başlangıç rehberi','guide':True});member(b,c['id'],gid,source=guide['source'],guide=True)
localmap={'time25':'time','personal-mba':'pmba','five-books':'five','ft-archive':'ft','hundred-best':'hundred','mit-sloan':'mit','core12':'core','near-term':'next'}
localbooks={}
for old in local['books']:
 b=getbook(old['title'],', '.join(old['authors']),'local',extraTitles=[old.get('titleTr','')]);localbooks[old['id']]=b;offer_original(b,old['title'],2)
 if not b['titleTr']:b['titleTr']=old.get('titleTr','')
 if old.get('year') and old['year'] not in b['years']:b['years'].append(old['year'])
 note(b,old.get('note'),'Okuma Kümeleri')
for lc in local['collections']:
 cid=localmap[lc['id']];c=next(c for c in collections if c['id']==cid)
 c['context']={k:v for k,v in lc.items() if k not in ['items','subsets']}
 for sub in lc.get('subsets',[{'items':lc['items'],'name':''}]):
  for item in sub['items']:
   b=localbooks[item['bookId']];note(b,item.get('note'),lc['name'])
   for t in item.get('tags',[]):
    if t not in b['tags']:b['tags'].append(t)
   if not any(m['collectionId']==cid for m in b['memberships']):
    gid=cid+':local'
    if not any(g['id']==gid for g in groups):groups.append({'id':gid,'collectionId':cid,'title':'Metinde ayrıca anılanlar'})
    member(b,cid,gid,source=lc.get('sourceUrl'),note=item.get('note'))
 # Source membership annotations are kept separate from personal reading state.
 c['roles']=[r['role'] for r in local['roles'] if r['setId']==lc['id']]
sectionCats={'A':['strategy'],'B':['strategy'],'C':['psychology'],'D':['systems','management'],'E':['children'],'F':[],'G':['literature'],'H':['biography','history'],'K':['strategy','philosophy'],'M':[],'N':[],'P':['children'],'R':['children']}
for sec in kitaps['sections']:
 cid='kitaps-'+sec['key'];collections.append({'id':cid,'title':sec['label'],'short':sec['label'],'description':'Kitaps okuma listesinden; çeviri, yayınevi ve baskı notlarıyla.','origin':'kitaps','source':'https://titanlar-com.github.io/kitaps/','mark':sec['key'],'tag':'Kişisel kitaplık','note':'Künye ve değerlendirme notları verilen Kitaps kaynağından aktarıldı. Güven puanları kaynağın kendi notlarından türetilmiştir.'})
for old in kitaps['books']:
 b=getbook(old['original'] or old['turkish'],old['author'],'kitaps',legacy=old['key'],extraTitles=[old['turkish']])
 mapping['kitaps:'+old['id']]=b['id'];mapping['kitaps:'+old['section']+':'+old['id']]=b['id'];offer_original(b,foreign_title(old['original'],old['turkish']),1)
 if old['turkish'] and not b['titleTr']:b['titleTr']=old['turkish']
 b['editions'].append(old)
 for sec in list(dict.fromkeys([old['section'],*old.get('alsoIn',[])])):
  cid='kitaps-'+sec;gid=cid+':'+(old.get('sub') or 'liste')
  if not any(g['id']==gid for g in groups):groups.append({'id':gid,'collectionId':cid,'title':old.get('sub') or 'Kitap listesi'})
  member(b,cid,gid,source='https://titanlar-com.github.io/kitaps/',note=old['note'])
  addcat(b,*sectionCats.get(sec,[]))
# Preserve every translation from two standalone studies omitted by the old parser.
extras=[('I','Oscar Wilde · Reading Zindanı Baladı','The Ballad of Reading Gaol','Reading Zindanı Baladı',1898,[('Oğuz Baykara','Everest Yayınları (2017)','İngilizce aslından; kaynak notunda şiirsel okuma için öneriliyor.'),('Piyale Perver','Dedalus Kitap (2014)','İngilizce-Türkçe karşılaştırmalı basım.'),('Özdemir Asaf','Yuvarlak Masa / Kırmızı Yayınları (1968)','Fransızca üzerinden çeviri; kaynaktaki baskı uyarısına bakın.'),('Tozan Alkan','Bordo Siyah (2003) / Artshop (2006)','Kaynak dil ve güncel bulunurluk kaynakta kesinleştirilmemiş.')]),('L','Oscar Wilde · Dorian Gray','The Picture of Dorian Gray','Dorian Gray’in Portresi',1891,[('Nihal Yeğinobalı','Can Yayınları (2003)','Kaynakta edebî okuma için öneriliyor.'),('Didar Zeynep Batumlu','Türkiye İş Bankası Kültür Yayınları','Hasan Âli Yücel Klasikler Dizisi.'),('Ferit Burak Aydar','','Yayınevi kaynakta doğrulanmamış.'),('İlknur Özdemir','','Yayınevi kaynakta doğrulanmamış.')])]
for sec,label,title,tr,year,editions in extras:
 b=getbook(title,'Oscar Wilde','kitaps',extraTitles=[tr]);b['titleTr']=tr;b['years'].append(year);addcat(b,'literature');offer_original(b,title,1)
 cid='kitaps-'+sec;collections.append({'id':cid,'title':label,'short':label,'origin':'kitaps','description':'Kaynak dosyadaki ayrıntılı çeviri karşılaştırması.','mark':sec,'tag':'Çeviri karşılaştırması','source':'https://titanlar-com.github.io/kitaps/','note':'Kitaps kaynak dosyasındaki bağımsız kitap incelemesi.'});gid=cid+':liste';groups.append({'id':gid,'collectionId':cid,'title':'Çeviri karşılaştırması'});member(b,cid,gid,source='https://github.com/titanlar-com/kitaps/blob/main/data/kitaplar.md')
 for translator,publisher,nt in editions:b['editions'].append({'id':sec,'translator':translator,'publisher':publisher,'note':nt,'status':['unverified'] if not publisher else [],'trust':None,'alt':None})
# Specific subjects take priority over mixed-purpose section headings.
recordCats={
'F1':['literature','biography'],'F2':['literature','philosophy'],'F3':['biography','history'],'F4':['history'],'F5':['literature'],'F6':['literature'],'F7':['history'],'F8':['history','literature'],'F9':['literature'],'F10':['literature'],
'C3':['philosophy','politics'],'A2':['politics','philosophy'],'A6':['economy','politics'],'B1':['history'],'B2':['history','economy'],'M1':['psychology','finance'],'M2':['strategy','management'],'M3':['strategy','innovation'],'M4':['management'],'M5':['economy','politics'],'M6':['philosophy','productivity'],
'N1':['psychology'],'N2':['psychology','management'],'N3':['philosophy'],'N4':['productivity','psychology'],'N5':['communication','psychology'],'N6':['communication'],'N7':['communication'],'N8':['communication','management'],'N9':['management','communication'],'N10':['communication'],
'R-164':['history','science'],'R-165':['science','literature'],'R-166':['science'],'R-167':['science'],'R-168':['philosophy'],'R-169':['climate'],'K9':['literature'],
}
for record,cats in recordCats.items():addcat(books[mapping['kitaps:'+record]],*cats)
# Cross-references in narrative tables also represent collection memberships.
cross={'M':['A3','A7','A8','A9','B9'],'N':['A8','B5','B3','A9','M3','M2','M1','M6','A4','K8','A5']}
for sec,ids in cross.items():
 gid='kitaps-'+sec+':cross';groups.append({'id':gid,'collectionId':'kitaps-'+sec,'title':'Notlarda ilişkilendirilen kitaplar'})
 for oldid in ids:
  b=books[mapping['kitaps:'+oldid]];member(b,'kitaps-'+sec,gid,source='https://github.com/titanlar-com/kitaps/blob/main/data/kitaplar.md',note='Bu kitap, kaynak notlarında bu okuma hattıyla da ilişkilendirilmiştir.');addcat(b,*sectionCats[sec])
# Editorial topic assignments, independent from source collection membership.
ftcats=read('data/ft-categories.json')
for g in next(c for c in atlas['collections'] if c['id']=='ft')['groups']:
 tags=ftcats[g['title']];assert len(tags)==len(g['books']),(g['title'],len(tags),len(g['books']))
 for old,cats in zip(g['books'],tags):addcat(books[mapping['atlas:'+old['key']]],*cats.split(','))
# Explicit topics for the original route and titles which span fields.
overrides={'Thinking in Systems':['systems'],'The Goal':['systems'],'Out of the Crisis':['systems'],'Information Rules':['technology','economy','strategy'],'The Halo Effect':['psychology','management'],'Superforecasting':['psychology'],'How Brands Grow':['marketing'],'High Output Management':['management','productivity'],'The Effective Executive':['management','productivity'],'The Innovator’s Dilemma':['innovation','strategy'],'Competitive Advantage':['strategy'],'Co-opetition':['strategy'],'The Discoverers':['history','science'],'Syrup':['literature','marketing'],'The Republic of Tea':['enterprise','marketing'],'New Rules for the New Economy':['technology','economy'],'The Personal MBA':['management'],'The Power of Habit':['productivity','psychology'],'Atomic Habits':['productivity','psychology'],'Musashi':['literature','biography'],'Meditations':['philosophy'],'Antifragile':['psychology','finance'],'Nonviolent Communication':['communication'],'Drive':['psychology','management']}
for title,cats in overrides.items():
 for bid in index.get(key(title),[]):addcat(books[bid],*cats)
# Mechanism-based entrepreneurship route assembled from the supplied
# recommendations and two independent research passes.
collections.append({k:v for k,v in entrepreneurship.items() if k!='groups'}|{'mark':'G','tag':'Editoryal rota','note':'Liste 100 kitaba doldurulmadı; yalnızca araştırmayla gerekçelendirilen eserler alındı.'})
for group in entrepreneurship['groups']:
 gid=entrepreneurship['id']+':'+group['id'];groups.append({'id':gid,'collectionId':entrepreneurship['id'],'title':group['title']})
 for item in group['books']:
  b=books.get(item.get('existingId')) if item.get('existingId') else None
  if not b:b=getbook(item['title'],item['author'],'entrepreneurship',extraTitles=[item.get('titleTr','')])
  elif 'entrepreneurship' not in b['origins']:b['origins'].append('entrepreneurship')
  offer_original(b,item['title'],2)
  if item.get('year') and item['year'] not in b['years']:b['years'].append(item['year'])
  if item.get('titleTr'):
   b['titleTr']=item['titleTr']
   source_type='publisher' if any(domain in item['translationSource'] for domain in ['timas.com.tr','pegasusyayinlari.com']) else 'retailer'
   b['verifiedEdition']={'title':item['titleTr'],'isbn':item['isbnTr'],'publisher':item['publisherTr'],'translators':[item['translator']],'sourceUrl':item['translationSource'],'sourceType':source_type}
  note(b,item['reason'],'Girişimcilik rotası')
  member(b,entrepreneurship['id'],gid,source=item['sourceUrl'],note=item['reason'])
  mapping['entrepreneurship:'+key(item['title'])]=b['id'];addcat(b,'enterprise')
# Foundational books are maintained as a separate editorial dataset. Their
# unlock relationships are guidance, not hard prerequisites or fixed scores.
FOUNDATION_DATA={'groups','start','links','notes'}
collections.append({k:v for k,v in foundations.items() if k not in FOUNDATION_DATA}|{'origin':'foundations','mark':'T','tag':'Küme anahtarı','note':'Belirli katalog kitaplarını daha verimli okumayı sağlayan temel ve eşlik kitapları.'})
foundation_links=[]
# The books to read first open the whole catalog. Their group leads the
# collection; most of them are keys listed below, a few are catalog books.
start=foundations.get('start')
if start:
 start_gid=foundations['id']+':'+start['id'];groups.append({'id':start_gid,'collectionId':foundations['id'],'title':start['title']})
for group in foundations['groups']:
 gid=foundations['id']+':'+group['id'];groups.append({'id':gid,'collectionId':foundations['id'],'title':group['title']})
 for item in group['books']:
  # A catalog book can be a key too: it keeps its identity and gains the unlocks.
  if item.get('existingId'):
   b=books[item['existingId']]
   if 'foundations' not in b['origins']:b['origins'].append('foundations')
  else:
   b=getbook(item['title'],item['author'],'foundations',extraTitles=[item.get('titleTr','')])
   # A new key must not silently merge into an unrelated catalog book; a catalog book is named by existingId.
   assert b['origins']==['foundations'],(item['title'],b['id'],b['origins'])
   # A translator's selection of stories has no single original title.
   if item.get('originalTitle',item['title']):b['originalTitle']=item.get('originalTitle',item['title'])
   if item.get('titleTr') and item['titleTr']!=item['title'] and not b['titleTr']:b['titleTr']=item['titleTr']
   if item.get('year') and item['year'] not in b['years']:b['years'].append(item['year'])
   if item.get('cover'):b['cover']=clean_cover(item['cover'])
   elif item.get('issue'):b['sourceIssue']={'note':item['issue']}
   elif not item.get('format'):b['sourceIssue']={'note':'Eser katalogda korunuyor; güvenilir ve baskıyla eşleşen kapak henüz doğrulanmadı.'}
   if item.get('edition'):b['verifiedEdition']={k:v for k,v in item['edition'].items() if k=='translators' or v not in (None,'',[])}
   apply_format(b,item)
  addcat(b,*item.get('categories',[]));note(b,item['reason'],'Temel okumalar araştırması')
  member(b,foundations['id'],gid,source=item.get('sourceUrl'),note=item['reason'])
  foundation_links.append((b['id'],item.get('unlocks',[]),item.get('companions',[]),item['reason'],item.get('sourceUrl')))
  mapping['foundations:'+(item.get('existingId') or key(item['title']))]=b['id']
if start:
 for order,reference in enumerate(start['books'],1):
  b=books[mapping.get('foundations:'+reference,reference)]
  if 'foundations' not in b['origins']:b['origins'].append('foundations')
  member(b,foundations['id'],start_gid,source=foundations['source'],note=start['note'],order=order)
for bid,text in foundations.get('notes',{}).items():
 assert bid in books,bid
 note(books[bid],text,'Temel okumalar araştırması')
covers={**(read('data/international-covers.json') if (ROOT/'data/international-covers.json').exists() else {}),**read('data/turkish-covers.json')}
for bid,cover in covers.items():
 assert bid in books,bid
 books[bid]['cover']=clean_cover(cover)
 if cover['language']=='tr':
  previous=books[bid]['titleTr']
  if previous and previous!=cover['title'] and previous not in books[bid]['aliases']:books[bid]['aliases'].append(previous)
  books[bid]['titleTr']=cover['title']
for bid,edition in read('data/edition-verification.json').items():
 assert bid in books,bid
 books[bid]['verifiedEdition']=edition
 if not books[bid]['titleTr']:books[bid]['titleTr']=edition['title']
for bid,issue in read('data/source-issues.json').items():
 assert bid in books,bid
 books[bid]['sourceIssue']=issue
# The library for the years before ten: the parent's selection, completed with
# the books independent children's lists agree on. Every list is a collection of
# its own, so the ranking engine counts each as a separate selection. Editions
# are verified on two websites; they replace an earlier cover only when marked.
children=read('data/children-library.json') if (ROOT/'data/children-library.json').exists() else None
children_ids={}
if children:
 cid=children['id']
 collections.append({k:children[k] for k in ('id','title','short','description','source')}|{'origin':'children','mark':'10','tag':'Çocuk kütüphanesi','note':children['note']})
 for group in children['groups']:groups.append({'id':cid+':'+group['id'],'collectionId':cid,'title':group['title']})
 # The external lists were read in one research step, so together they form a
 # single selection for the ranking engine; each list is one of its subsets.
 lists=children['lists']
 collections.append({k:lists[k] for k in ('id','title','short','description')}|{'source':children['source'],'origin':'children','mark':'L','tag':'Çocuk kitabı listesi','note':'Yalnız katalogdaki kitaplar işaretlendi; listelerin tamamı kataloğa alınmadı.'})
 for source in children['sources']:groups.append({'id':lists['id']+':'+source['id'],'collectionId':lists['id'],'title':source['title'],'source':source['url']})
 for item in children['books']:
  b=books[item['existingId']] if item.get('existingId') else getbook(item['title'],item['author'],'children',extraTitles=[item['titleTr']])
  if 'children' not in b['origins']:b['origins'].append('children')
  children_ids[item['key']]=b['id'];mapping['children:'+item['key']]=b['id']
  if not item.get('existingId'):
   b['titleTr']=item['titleTr']
   if item.get('originalLanguage')!='tr':offer_original(b,item['title'],1)
  if item.get('year') and not b['years']:b['years'].append(item['year'])
  if item.get('originalLanguage'):b['originalLanguage']=item['originalLanguage']
  addcat(b,'children')
  b['childAge']=item['age']
  if item.get('caution'):b['childCaution']=item['caution']
  note(b,item['reason'],children['short'])
  member(b,cid,cid+':'+item['group'],source=children['source'],note=item['reason'])
  for extra in item.get('extraGroups',[]):member(b,cid,cid+':'+extra,source=children['source'],note=item['reason'])
  for list_id in item.get('lists',[]):member(b,lists['id'],lists['id']+':'+list_id,source=next(s['url'] for s in children['sources'] if s['id']==list_id))
  edition=item.get('edition')
  # An existing book gains the checked edition when it had none or when the check chose another one.
  if edition and (not item.get('existingId') or item.get('replaceEdition') or item.get('addEdition')):
   b['verifiedEdition']={k:v for k,v in edition.items() if k=='translators' or v not in (None,'',[])}
   if item.get('originalLanguage')=='tr':b['verifiedEdition']['originalLanguage']='tr'
   if not item.get('keepTitle'):
    if b['titleTr'] and b['titleTr']!=edition['title'] and b['titleTr'] not in b['aliases']:b['aliases'].append(b['titleTr'])
    b['titleTr']=edition['title']
   b.pop('sourceIssue',None)
  if item.get('cover') and (not item.get('existingId') or item.get('replaceEdition')):b['cover']=item['cover']
  if item.get('issue'):b['sourceIssue']={'note':item['issue']}
  if item.get('keepTitle'):b['titleTr']=item['titleTr']
# Two editorial reviews share one shape: recommendations read from photographs
# of bookstore shelves (which visible books suit the reader, and under which
# conditions), and the original sources behind popular concepts beside their
# popular versions. New Turkish editions are verified on two websites.
# Priorities and roles stay notes and group names; the engine scores these
# books like every other, and look-alike warnings become notes on the real work.
REVIEWS=[('data/shelf-review.json','shelf','RAF','Raf taraması'),('data/original-sources.json','originals','ÖZ','Özgün kaynak'),('data/management-founders.json','founders','YD','Kurucu eserler')]
reviews={};review_links=[];review_purposes={}
for path,origin,mark,tag in REVIEWS:
 if not (ROOT/path).exists():continue
 review=reviews[origin]=read(path);cid=review['id']
 collections.append({k:review[k] for k in ('id','title','short','description','source','context')}|{'origin':origin,'mark':mark,'tag':tag,'note':review['note']})
 for group in review['groups']:groups.append({'id':cid+':'+group['id'],'collectionId':cid,'title':group['title']})
 for item in review['books']:
  b=books[item['existingId']] if item.get('existingId') else getbook(item['title'],item['author'],origin,extraTitles=[item.get('titleTr','')])
  if origin not in b['origins']:b['origins'].append(origin)
  # A new recommendation must not silently merge into an unrelated catalog book.
  assert item.get('existingId') or b['origins']==[origin],(item['key'],b['id'])
  mapping[origin+':'+item['key']]=b['id']
  if not item.get('existingId'):
   if item.get('titleTr'):b['titleTr']=item['titleTr']
   b['originalLanguage']=item['originalLanguage']
   if item['originalLanguage']!='tr':offer_original(b,item['title'],1)
   if item.get('year') and item['year'] not in b['years']:b['years'].append(item['year'])
   if item.get('edition'):
    b['verifiedEdition']={k:v for k,v in item['edition'].items() if k=='translators' or v not in (None,'',[])}
    if item['originalLanguage']=='tr':b['verifiedEdition']['originalLanguage']='tr'
   if item.get('cover'):b['cover']=item['cover']
   if item.get('issue'):b['sourceIssue']={'note':item['issue']}
   apply_format(b,item)
  addcat(b,*item.get('categories',[]))
  if item.get('childAge'):b['childAge']=item['childAge']
  if item.get('purpose'):review_purposes[b['id']]=item['purpose']
  # A role (original source, popular version, critique) names the note's source.
  label=review['short']+(' · '+item['role'] if item.get('role') else '')
  for placement in [{'id':item['group'],'reason':item['reason']},*item.get('extraGroups',[])]:
   note(b,placement['reason'],label)
   extra={k:v for k,v in (('role',item.get('role')),('order',placement.get('order'))) if v}
   member(b,cid,cid+':'+placement['id'],source=review['source'],note=placement['reason'],**extra)
 for bid,text in review.get('lookAlikes',{}).items():
  assert bid in books,bid
  note(books[bid],text,review['short'])
 review_links.extend((origin,link) for link in review.get('links',[]))
shelf=reviews.get('shelf')
review_links.extend(('foundations',link) for link in foundations.get('links',[]))
# This source contains ten ordered recommendations. Two already exist in the
# foundational collection, so membership is merged instead of duplicating the
# work. The supplied order remains editorial metadata, never a fixed score.
collections.append({'id':'preparation','title':'Ön hazırlık okuma rotası','short':'Ön hazırlık','description':'Temel okuma, düşünme, sayısal hazırlık ve alan bağlamı için doğrulanmış Türkçe baskılar.','origin':'preparation','source':'https://github.com/titanlar-com/kitaps','mark':'Ö','tag':'Başlangıç rafı','note':'Okuma sırası danışmanlık önerisidir; zorunlu önkoşul veya doğrudan puan değildir.'})
preparation_groups={}
preparation_categories={
 'hazirlik-01':['science'],'hazirlik-02':['philosophy','psychology'],'hazirlik-03':['science'],'hazirlik-04':['economy'],
 'hazirlik-05':['history'],'hazirlik-06':['philosophy'],'hazirlik-07':['psychology'],'hazirlik-08':['science','history'],
 'hazirlik-09':['science','productivity'],'hazirlik-10':['science','finance']
}
preparation_links=[]
for item in preparation['books']:
 stage=str(item['asama']).split('—',1)[0].strip();gid='preparation:'+stage
 if gid not in preparation_groups:
  preparation_groups[gid]=True;groups.append({'id':gid,'collectionId':'preparation','title':item['asama']})
 alternatives=[entry.get('ad') for entry in item.get('digerDillerdekiAdlar',[]) if entry.get('ad')]
 source_title=item.get('orijinalAdi') or (alternatives[0] if alternatives else item['turkceAdi'])
 author=' and '.join(item.get('orijinalYazarlar') or [])
 b=getbook(source_title,author,'preparation',extraTitles=[item['turkceAdi'],*alternatives])
 if not b.get('originalTitle') and item.get('orijinalAdi'):b['originalTitle']=item['orijinalAdi']
 b['titleTr']=item['turkceAdi'];b['cover']=preparation_covers[item['id']];b.pop('sourceIssue',None)
 original_turkish=item.get('orijinalAdi')==item['turkceAdi'] and not item.get('onerilenCevirmenler')
 b['verifiedEdition']={'title':item['turkceAdi'],'isbn':item['turkceBaskiISBN13'],'publisher':item['turkiyeYayinevi'],'translators':item.get('onerilenCevirmenler',[]),'sourceUrl':item['bibliyografikKaynaklar'][0],'sourceType':'publisher' if any(domain in item['bibliyografikKaynaklar'][0] for domain in ['bilgiyayinevi.com.tr','timas.com.tr','tubitak.gov.tr','remzi.com.tr','buzdagiyayinevi.com']) else 'retailer',**({'originalLanguage':'tr'} if original_turkish else {})}
 b['preparation']={'order':item['okumaSirasi'],'stage':item['asama'],'readingMethod':item['onerilenOkumaBicimi'],'concepts':item['calisilmasiOnerilenKavramlar'],'relation':item['iliskininNiteligi'],'verifiedAt':item['dogrulamaTarihi'],'verificationNote':item['dogrulamaNotu']}
 addcat(b,*preparation_categories[item['id']]);note(b,item['onerilmeNedeni'],'Ön hazırlık araştırması')
 member(b,'preparation',gid,source=item['bibliyografikKaynaklar'][0],note=item['onerilmeNedeni'],order=item['okumaSirasi'])
 preparation_links.append((b['id'],item['ornekHedefEserler'],item['onerilmeNedeni']))
 mapping['preparation:'+item['id']]=b['id']
for b in books.values():
 if any(origin in b['origins'] for origin in ['entrepreneurship','foundations']) and not b.get('cover') and not b.get('sourceIssue') and not b.get('format'):
  b['sourceIssue']={'note':'Kapak görseli eser ve baskı kimliğiyle birlikte henüz yerel kataloğa alınmadı; doğrulanmış bibliyografik kayıt görünür tutuluyor.'}
translation_records=validate_manifest(read('data/translation-availability.json'),set(books))
for bid,research in translation_records.items():
 assert not books[bid].get('format'),(bid,'articles and essays show their publication, not a Turkish edition')
 books[bid]['translationResearch']=research
 edition_title=(research.get('edition') or {}).get('title','').strip()
 if research['status']=='available' and edition_title:
  previous=books[bid]['titleTr']
  if previous and previous!=edition_title and previous not in books[bid]['aliases']:books[bid]['aliases'].append(previous)
  books[bid]['titleTr']=edition_title
# Researched original-edition facts fill gaps; curated source values stay.
fact_records=validate_facts(read('data/bibliographic-facts.json'),set(books))
for bid,fact in fact_records.items():
 b=books[bid]
 if fact.get('firstPublicationYear') and not b['years']:b['years'].append(fact['firstPublicationYear'])
 if fact.get('originalTitle') and not b.get('originalTitle'):b['originalTitle']=fact['originalTitle']
 if fact.get('originalLanguage'):b['originalLanguage']=fact['originalLanguage']
 if fact.get('firstPublisher'):b['originalPublisher']=fact['firstPublisher']
# A candidate equal to the Turkish edition title is not evidence of the
# original title; it stays unknown until researched.
for b in books.values():
 if b.get('originalTitle') or b['id'] not in original_titles:continue
 candidate=original_titles[b['id']][1]
 cover=b.get('cover') or {}
 turkish_titles=[b.get('titleTr',''),cover.get('title','') if cover.get('language')=='tr' else '']
 if not any(title and key(title)==key(candidate) for title in turkish_titles):b['originalTitle']=candidate
# The day each book entered the library, inferred from git history by
# scripts/infer-added-dates.py. A book without one is new: run that script and
# merge again (tests/added-dates.test.js fails while any date is missing).
added_dates=read('data/added-dates.json')['records'] if (ROOT/'data/added-dates.json').exists() else {}
for bid,b in books.items():
 if bid in added_dates:
  added=added_dates[bid]['date']
  assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',added) and date.fromisoformat(added),(bid,added)
  b['addedAt']=added
undated=[bid for bid in books if bid not in added_dates]
if undated:print(len(undated),'books have no added date; run scripts/infer-added-dates.py --write, then merge again:',', '.join(undated[:8]))
for bid,author in AUTHOR_FIXES.items():
 assert bid in books,bid
 # Book URLs are built from the author line; the corrected credit must not break shared links.
 books[bid]['slugAuthor']=books[bid]['author']
 books[bid]['author']=author
for b in books.values():
 if not b['categories']:addcat(b,'management')
 b['collectionIds']=list(dict.fromkeys(m['collectionId'] for m in b['memberships']));b['groupIds']=list(dict.fromkeys(m['groupId'] for m in b['memberships']))
for c in collections:
 c['count']=sum(c['id'] in b['collectionIds'] for b in books.values());c['groupIds']=[g['id'] for g in groups if g['collectionId']==c['id']]
for g in groups:g['count']=sum(g['id'] in b['groupIds'] for b in books.values())
readingGuides=read('data/reading-guides.json')
if children:
 for route in children['routes']:
  ids=[children_ids.get(key,key) for key in route['books']]
  assert all(i in books for i in ids),route['books']
  entry={'category':'children','heading':route['heading'],'goal':route['goal'],'books':ids,'reasons':{children_ids.get(k,k):v for k,v in route.get('reasons',{}).items()}}
  current=next((i for i,r in enumerate(readingGuides['routes']) if r.get('category')=='children'),None)
  # The age route becomes the category's primary route; others are added after it.
  if route.get('replaceCategoryRoute') and current is not None:readingGuides['routes'][current]=entry
  else:readingGuides['routes'].append(entry)
for foundation_id,target_ids,companion_ids,reason,source_url in foundation_links:
 if source_url:readingGuides['sources'].setdefault(foundation_id,[]).append({'label':source_label(source_url),'url':source_url})
 foundation_override=readingGuides['overrides'].setdefault(foundation_id,{'before':[],'after':[]})
 for target_id in target_ids:
  if target_id not in books:continue
  target_override=readingGuides['overrides'].setdefault(target_id,{'before':[],'after':[]})
  before={'id':foundation_id,'reason':reason}
  after={'id':target_id,'reason':'Bu temel okumadaki çerçeveyi katalogdaki bu eser üzerinde uygulayarak derinleştirebilirsin.'}
  if not any(item['id']==foundation_id for item in target_override['before']):target_override['before'].append(before)
  if not any(item['id']==target_id for item in foundation_override['after']):foundation_override['after'].append(after)
 for companion_id in companion_ids:
  if companion_id not in books:continue
  companion_override=readingGuides['overrides'].setdefault(companion_id,{'before':[],'after':[]})
  foundation_companions=foundation_override.setdefault('companions',[])
  target_companions=companion_override.setdefault('companions',[])
  link_to_target={'id':companion_id,'reason':reason}
  link_to_foundation={'id':foundation_id,'reason':reason}
  if not any(item['id']==companion_id for item in foundation_companions):foundation_companions.append(link_to_target)
  if not any(item['id']==foundation_id for item in target_companions):target_companions.append(link_to_foundation)
for preparation_id,target_titles,reason in preparation_links:
 source_override=readingGuides['overrides'].setdefault(preparation_id,{'before':[],'after':[]})
 for title in target_titles:
  wanted=key(title)
  candidates=[b['id'] for b in books.values() if wanted in {key(value) for value in [b['title'],b.get('titleTr',''),*b.get('aliases',[]),b.get('cover',{}).get('title','')] if value}]
  assert len(candidates)==1,(title,candidates)
  target_id=candidates[0];target_override=readingGuides['overrides'].setdefault(target_id,{'before':[],'after':[]})
  if not any(item['id']==preparation_id for item in target_override['before']):target_override['before'].append({'id':preparation_id,'reason':reason})
  if not any(item['id']==target_id for item in source_override['after']):source_override['after'].append({'id':target_id,'reason':'Bu hazırlıkta çalışılan kavramları katalogdaki bu eser üzerinde uygulayabilirsin.'})
# Review relations come from the review's own advice or from plain facts about
# the books (same authors, same system, same subject). A sequence is a suggested
# order, never a requirement; companions are read side by side.
def review_book(origin,reference):
 bid=mapping.get(origin+':'+reference,reference)
 assert bid in books,(origin,reference)
 return bid
# A book keeps a reading purpose it already had.
for bid,purpose in review_purposes.items():readingGuides['purposes'].setdefault(bid,purpose)
for origin,link in review_links:
 if link['type']=='sequence':
  first,then=review_book(origin,link['first']),review_book(origin,link['then'])
  then_override=readingGuides['overrides'].setdefault(then,{'before':[],'after':[]})
  first_override=readingGuides['overrides'].setdefault(first,{'before':[],'after':[]})
  if not any(item['id']==first for item in then_override['before']):then_override['before'].append({'id':first,'reason':link['why']})
  if not any(item['id']==then for item in first_override['after']):first_override['after'].append({'id':then,'reason':link['next']})
 else:
  assert link['type']=='companion',link
  left,right=(review_book(origin,reference) for reference in link['books'])
  for one,other in ((left,right),(right,left)):
   companions=readingGuides['overrides'].setdefault(one,{'before':[],'after':[]}).setdefault('companions',[])
   if not any(item['id']==other for item in companions):companions.append({'id':other,'reason':link['reason']})
MONTHS=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
def checked_dates():
 for edition in read('data/edition-verification.json').values():yield edition.get('checkedAt')
 for record in translation_records.values():yield from (record['stage1']['checkedAt'],record['stage2']['checkedAt'])
 for item in preparation['books']:yield item.get('dogrulamaTarihi')
 for record in fact_records.values():yield from (record['stage1']['checkedAt'],record['stage2']['checkedAt'])
 for review in reviews.values():yield from (item['edition'].get('checkedAt') for item in review['books'] if item.get('edition'))
 for group in foundations['groups']:yield from (item['edition'].get('checkedAt') for item in group['books'] if item.get('edition'))
# The catalog date follows its newest verified evidence, never the build clock.
latest=max(value for value in checked_dates() if isinstance(value,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',value))
updated=f"{int(latest[8:10])} {MONTHS[int(latest[5:7])-1]} {latest[:4]}"
result={'updated':updated,'readingGuides':readingGuides,'books':list(books.values()),'collections':collections,'groups':groups,'categories':[{'id':k,'label':v,'count':sum(k in b['categories'] for b in books.values())} for k,v in categoryNames.items()],'sourceTags':local['tags'],'mapping':mapping,'sourceCounts':{'atlasEntries':sum(len(g['books']) for c in atlas['collections'] for g in c['groups']),'localBooks':len(local['books']),'kitapsRecords':len(kitaps['books']),'foundationalBooks':sum(len(group['books']) for group in foundations['groups']),'preparationRecommendations':len(preparation['books']),'entrepreneurshipBooks':sum(len(group['books']) for group in entrepreneurship['groups']),'childrenLibraryBooks':len(children['books']) if children else 0,'shelfReviewBooks':len(shelf['books']) if shelf else 0,'originalSourceWorks':len(reviews['originals']['books']) if 'originals' in reviews else 0,'managementFounderWorks':len(reviews['founders']['books']) if 'founders' in reviews else 0}}
(ROOT/'src/catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(len(books),'books',len(collections),'collections',len(groups),'groups')
print('Edition records',sum(len(b['editions']) for b in books.values()))
