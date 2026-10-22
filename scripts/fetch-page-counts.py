#!/usr/bin/env python3
"""Find the page count of every edition the catalog shows.

A page count belongs to a printing, not to a work, so it is kept per ISBN in
data/page-counts.json and the book page shows the count of the ISBN it shows.
A count is taken only from a page or record of that same ISBN:

1. the edition's own pages the catalog already cites (kitapyurdu.com,
   dr.com.tr, kitapsepeti.com), and only when the page shows the ISBN;
2. Open Library's record of the ISBN;
3. Google Books' record of the ISBN;
4. for Turkish ISBNs, the kitapyurdu.com product found by searching the ISBN,
   again only when that page shows it.

Nothing is guessed: an ISBN no source counts stays unknown, and the page says
so. Responses are cached outside the repository; each host gets at most one
request a second.

Usage:
  python3 scripts/fetch-page-counts.py --cache <dir> [--only isbn,...] [--refresh] [--write]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/page-counts.json'
UA = 'Mozilla/5.0 (compatible; kitaps-page-count; +https://github.com/titanlar-com/kitaps)'
POLICY = ('Sayfa sayısı baskıya aittir ve ISBN ile tutulur. Yalnız aynı ISBN’i gösteren bir '
          'sayfadan ya da o ISBN’in kaydından alınır: kataloğun zaten kaynak gösterdiği baskı '
          'sayfası, Open Library, Google Books ya da ISBN ile bulunan kitapyurdu.com ürünü.')
NAMES = {'kitapyurdu.com': 'kitapyurdu.com', 'dr.com.tr': 'dr.com.tr', 'kitapsepeti.com': 'kitapsepeti.com',
         'openlibrary.org': 'Open Library', 'books.google.com': 'Google Books', 'googleapis.com': 'Google Books'}


def digits(value: str) -> str:
    return re.sub(r'[^0-9Xx]', '', value or '').upper()


def isbn10(isbn13: str) -> str:
    if len(isbn13) != 13 or not isbn13.startswith('978'):
        return ''
    core = isbn13[3:12]
    check = (11 - sum((10 - i) * int(d) for i, d in enumerate(core)) % 11) % 11
    return core + ('X' if check == 10 else str(check))


def valid13(value: str) -> bool:
    return bool(re.fullmatch(r'\d{13}', value)) and sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(value)) % 10 == 0


def to13(value: str) -> str:
    value = digits(value)
    if valid13(value):
        return value
    if len(value) == 10:
        core = '978' + value[:9]
        check = (10 - sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(core)) % 10) % 10
        return core + str(check)
    return ''


def host(url: str) -> str:
    return urllib.parse.urlparse(url).netloc.lower().removeprefix('www.')


class Fetcher:
    """Caches responses and spaces requests to each host."""

    def __init__(self, cache: Path):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.last: dict[str, float] = defaultdict(float)
        self.locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
        self.guard = threading.Lock()
        self.refused: set[str] = set()

    def get(self, url: str) -> str:
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + '.txt')
        if path.exists():
            return path.read_text(encoding='utf-8', errors='ignore')
        name = host(url)
        if name in self.refused:
            return ''
        with self.guard:
            lock = self.locks[name]
        with lock:
            wait = 1.0 - (time.monotonic() - self.last[name])
            if wait > 0:
                time.sleep(wait)
            try:
                request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'tr,en'})
                with urllib.request.urlopen(request, timeout=15) as response:
                    text = response.read().decode('utf-8', errors='ignore')
            except urllib.error.HTTPError as error:
                # A host that says "too many requests" is left alone for the rest of the run.
                if error.code == 429:
                    self.refused.add(name)
                return '' if error.code != 404 else self.keep(path, '')
            except Exception:
                return ''
            finally:
                self.last[name] = time.monotonic()
        return self.keep(path, text)

    def keep(self, path: Path, text: str) -> str:
        # Only answers are cached; a failed request is tried again on the next run.
        path.write_text(text, encoding='utf-8')
        return text


def shows(text: str, isbn: str) -> bool:
    flat = re.sub(r'[\s-]', '', text)
    return isbn in flat or bool(isbn10(isbn)) and isbn10(isbn) in flat


def number(value: str) -> int | None:
    match = re.search(r'\d{1,5}', value or '')
    pages = int(match.group(0)) if match else 0
    return pages if 0 < pages < 20000 else None


def from_page(url: str, text: str) -> int | None:
    name = host(url)
    if name == 'kitapyurdu.com':
        match = re.search(r'ky-pd-attributes__label">\s*Sayfa Sayısı:?\s*</span>\s*<span class="ky-pd-attributes__value">\s*([^<]+)', text)
    elif name == 'dr.com.tr':
        match = re.search(r'Sayfa Sayısı:?\s*</strong>\s*<span>\s*([^<]+)', text)
    elif name == 'kitapsepeti.com':
        match = re.search(r'Sayfa Sayısı</span>\s*<span[^>]*>:</span>\s*<span class="book-info-desc">\s*([^<]+)', text)
    else:
        return None
    return number(unescape(match.group(1))) if match else None


def count(isbn: str, urls: list[str], fetch: Fetcher) -> dict | None:
    # 1. The edition's own pages the catalog cites.
    for url in urls:
        if host(url) in ('kitapyurdu.com', 'dr.com.tr', 'kitapsepeti.com') and '/search' not in url and 'route=product/search' not in url:
            text = fetch.get(url)
            pages = from_page(url, text)
            if pages and shows(text, isbn):
                return {'pages': pages, 'sourceUrl': url}
    # 2. Open Library's record of the ISBN.
    text = fetch.get(f'https://openlibrary.org/isbn/{isbn}.json')
    try:
        record = json.loads(text)
    except ValueError:
        record = {}
    pages = record.get('number_of_pages') if isinstance(record, dict) else None
    if isinstance(pages, int) and 0 < pages < 20000:
        return {'pages': pages, 'sourceUrl': f'https://openlibrary.org/isbn/{isbn}'}
    # 3. Google Books' record of the ISBN.
    text = fetch.get(f'https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}')
    try:
        items = json.loads(text).get('items') or []
    except (ValueError, AttributeError):
        items = []
    for item in items:
        info = item.get('volumeInfo') or {}
        ids = {to13(entry.get('identifier', '')) for entry in info.get('industryIdentifiers') or []}
        pages = info.get('pageCount')
        if isbn in ids and isinstance(pages, int) and 0 < pages < 20000:
            return {'pages': pages, 'sourceUrl': f"https://books.google.com/books?id={item.get('id')}"}
    # 4. A Turkish ISBN's kitapyurdu.com product, found by searching the ISBN.
    if isbn.startswith(('978605', '978975', '978625', '9789944')):
        search = fetch.get('https://www.kitapyurdu.com/index.php?' + urllib.parse.urlencode({'route': 'product/search', 'filter_name': isbn}))
        for link in list(dict.fromkeys(re.findall(r'https://www\.kitapyurdu\.com/kitap/[^"#?]+/\d+\.html', search)))[:3]:
            text = fetch.get(link)
            pages = from_page(link, text)
            if pages and shows(text, isbn):
                return {'pages': pages, 'sourceUrl': link}
    return None


def wanted() -> dict[str, list[str]]:
    """Every ISBN a book page can show, with the pages the catalog cites for that book."""
    catalog = json.loads((ROOT / 'src/catalog.json').read_text())
    found: dict[str, list[str]] = defaultdict(list)
    for book in catalog['books']:
        research = book.get('translationResearch') or {}
        isbns = [(book.get('verifiedEdition') or {}).get('isbn'), (research.get('edition') or {}).get('isbn'), (book.get('cover') or {}).get('isbn')]
        urls = [(book.get('verifiedEdition') or {}).get('sourceUrl'), (book.get('verifiedEdition') or {}).get('secondSourceUrl'), (book.get('cover') or {}).get('sourceUrl'),
                *[source.get('url') for stage in ('stage1', 'stage2') for source in (research.get(stage) or {}).get('sources') or []]]
        for isbn in {to13(value) for value in isbns if value} - {''}:
            found[isbn].extend(url for url in urls if url and url.startswith('https://') and url not in found[isbn])
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--cache', required=True, type=Path)
    parser.add_argument('--only', default='')
    parser.add_argument('--refresh', action='store_true', help='look up ISBNs that already have a count again')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    current = json.loads(OUT.read_text())['records'] if OUT.exists() else {}
    targets = wanted()
    if args.only:
        only = {to13(value) for value in args.only.split(',')}
        targets = {isbn: urls for isbn, urls in targets.items() if isbn in only}
    if not args.refresh:
        targets = {isbn: urls for isbn, urls in targets.items() if isbn not in current}
    fetch = Fetcher(args.cache)
    today = date.today().isoformat()
    records = dict(current)
    with ThreadPoolExecutor(max_workers=6) as pool:
        for done, (isbn, result) in enumerate(zip(targets, pool.map(lambda item: count(item[0], item[1], fetch), targets.items())), 1):
            if done % 50 == 0:
                print(f'{done}/{len(targets)}', flush=True)
            if result:
                records[isbn] = {**result, 'sourceName': NAMES.get(host(result['sourceUrl']), host(result['sourceUrl'])), 'checkedAt': today}
    found = sum(1 for isbn in targets if isbn in records and isbn not in current or args.refresh and isbn in records)
    print(json.dumps({'isbns': len(wanted()), 'lookedUp': len(targets), 'found': found, 'records': len(records)}))
    if args.write:
        OUT.write_text(json.dumps({'schemaVersion': 1, 'policy': POLICY, 'records': dict(sorted(records.items()))}, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
