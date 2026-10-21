"""Cover provenance: title + author matched FT/Porchlight records, then OL editions.
Never interprets missing Turkish records as proof a translation does not exist.
"""
import json,re,hashlib,time,unicodedata,io
from pathlib import Path
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]; WORK=ROOT.parents[1]/'work/research'
books=json.loads((ROOT/'src/catalog.json').read_text())['books']
turkish=json.loads((ROOT/'data/turkish-covers.json').read_text())
out=ROOT/'data/international-covers.json'; found=json.loads(out.read_text()) if out.exists() else {}
cache=WORK/'international-cache';cache.mkdir(exist_ok=True)
s=requests.Session();s.headers['User-Agent']='KitapAtlasi/1.0 (https://github.com/titanlar-com/kitaps; public bibliography)'
def norm(v):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',v).encode('ascii','ignore').decode().lower())
def title(v):return norm(re.split(r'[:：]',v)[0].removeprefix('The ').removeprefix('A '))
def author(v):return {x for x in re.findall(r'[a-z]{3,}',unicodedata.normalize('NFKD',v).encode('ascii','ignore').decode().lower()) if x not in ['and','the']}
def match(b,t,a):return title(b['title'])==title(t) and bool(author(b['author'])&author(a))
def save():out.write_text(json.dumps(found,ensure_ascii=False,indent=2)+'\n')
def get(url,api=False):
 p=cache/(hashlib.sha256(url.encode()).hexdigest()+'.json')
 if api and p.exists():return json.loads(p.read_text())
 if api:time.sleep(1.05)
 r=s.get(url,timeout=35);r.raise_for_status()
 if api:p.write_text(r.text);return r.json()
 return r.content

def download(pair):
 bid,record=pair
 try:
  data=get(record['imageUrl']);ext='jpg' if data[:2]==b'\xff\xd8' else 'png' if data[:4]==b'\x89PNG' else 'webp' if data[8:12]==b'WEBP' else None
  if not ext or len(data)<1800:return None
  name='covers/'+hashlib.sha256(record['imageUrl'].encode()).hexdigest()[:16]+'.'+ext
  (ROOT/'public'/name).write_bytes(data)
  return bid,dict(record,src=name,language='en',checkedAt='2026-09-28',turkishStatus='unverified')
 except Exception as e:print('image failed',bid,str(e)[:80],flush=True)
records=[]
for f in [WORK/'ft.html']:
 soup=BeautifulSoup(f.read_text(),'html.parser')
 for img in soup.select('.book-promo__media img'):
  a=img.find_parent('a');t=a.select_one('.book-promo__title');au=a.select_one('.book-promo__byline')
  if t and au:records.append(dict(title=t.get_text(' ',strip=True),author=au.get_text(' ',strip=True),sourceUrl=urljoin('https://ig.ft.com',a['href']),imageUrl=img['src'],sourceName='Financial Times',publisher='',isbn=''))
for f in WORK.glob('porch*.html'):
 soup=BeautifulSoup(f.read_text(),'html.parser')
 for a in soup.select('a.grid-product__link'):
  img=a.select_one('img');t=a.select_one('.grid-product__title');au=a.select_one('.grid-product__author');p=a.select_one('.grid-product__vendor')
  if img and t and au:
   u='https:'+img['src'] if img['src'].startswith('//') else img['src'];u=re.sub(r'width=\d+','width=360',u)
   isbn=re.search(r'(97[89]\d{10})(?:\?|$)',a['href'])
   records.append(dict(title=t.get_text(' ',strip=True),author=au.get_text(' ',strip=True),sourceUrl=urljoin('https://www.porchlightbooks.com',a['href']),imageUrl=u,sourceName='Porchlight Books',publisher=(p.get_text(' ',strip=True).split('—')[-1].strip() if p else ''),isbn=isbn.group(1) if isbn else ''))
queue=[]
for b in books:
 if b['id'] in turkish or b['id'] in found:continue
 candidates=[r for r in records if match(b,r['title'],r['author'])]
 if candidates:queue.append((b['id'],next((r for r in candidates if r['isbn']),candidates[0])))
print('Matched primary cached sources',len(queue),flush=True)
with ThreadPoolExecutor(max_workers=5) as pool:
 for result in pool.map(download,queue):
  if result:found[result[0]]=result[1];save()
print('Source images',len(found),flush=True)
for n,b in enumerate(books):
 if b['id'] in turkish or b['id'] in found:continue
 try:
  from urllib.parse import urlencode
  q=urlencode(dict(title=b['title'],author=b['author'].split(',')[0].split('&')[0],fields='key,title,author_name,cover_i,cover_edition_key',limit=5))
  data=get('https://openlibrary.org/search.json?'+q,True)
  candidates=[d for d in data.get('docs',[]) if d.get('cover_edition_key') and match(b,d['title'],' '.join(d.get('author_name',[])))]
  if not candidates:print('unresolved',b['id'],flush=True);continue
  d=candidates[0];ed=get('https://openlibrary.org/books/'+d['cover_edition_key']+'.json',True)
  lang=[l['key'].split('/')[-1] for l in ed.get('languages',[])];covers=ed.get('covers',[])
  if not covers or 'eng' not in lang or not title(ed['title'])==title(b['title']):continue
  record=dict(title=ed['title'],author=', '.join(d['author_name']),publisher=', '.join(ed.get('publishers',[])),isbn=next(iter(ed.get('isbn_13',ed.get('isbn_10',[]))),''),imageUrl=f'https://covers.openlibrary.org/b/id/{covers[0]}-M.jpg?default=false',sourceUrl='https://openlibrary.org/books/'+d['cover_edition_key'],sourceName='Open Library',verification='Title, author and English edition cover matched')
  result=download((b['id'],record))
  if result:found[result[0]]=result[1];save();print('OL',len(found),b['id'],flush=True)
 except Exception as e:print('OL failed',b['id'],str(e)[:90],flush=True)
print('TOTAL international covers',len(found),flush=True)
