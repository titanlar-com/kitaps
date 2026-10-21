#!/usr/bin/env python3
"""Make covers sharper without changing which printing they show.

Book cards are up to 270 CSS px wide on desktop (four columns), so a sharp
cover needs about 540 real pixels on a 2x screen. Many covers were saved
smaller, and some that look large were upscaled by the shop that served
them. This script measures each cover's real resolution (upscaled pixels do
not count) and replaces it only with a larger copy of the same image from
the same source: the recorded image URL at a larger size or as the original
upload (FT, Porchlight, Open Library, Kitapyurdu and similar).

It never takes an image from another site. A shop listing the same ISBN
often shows another printing (another print-run badge, series header or
quote), and the cover is evidence of the catalog's edition: the book page
links to the page the cover came from. A cover from elsewhere is used only
after a person compared both at full size; such cases are listed in
REPLACE with the reason, and their source is written into the cover's data
record so the evidence link shows the same image.

Every cover then gets two files:
  public/covers/<name>     up to 720 px wide (2x desktop screens)
  public/covers/sm/<name>  up to 400 px wide (phones and thumbnails; srcset picks it)

What happened to each cover, with the URL of every larger copy, is merged
into data/cover-upgrades.json.

Usage:
  python3 scripts/upgrade-covers.py --cache <dir> [--base-rev REV] [--only id,...] [--force] [--write]

--base-rev reads each cover's original image from that git revision (use it
after covers were replaced, so measurements start from the originals).
Without it the files on disk are the starting point, and covers already in
data/cover-upgrades.json are skipped unless --force is given.
Without --write nothing in public/ or data/ changes.
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import datetime as dt
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
REPORT = ROOT / 'data' / 'cover-upgrades.json'
LARGE, SMALL = 720, 400
# Real detail is assumed where halving the image loses at least this much (mean
# absolute grey-level difference). True-resolution covers lose 1.4 to 10;
# upscaled ones 0.2 to 0.8.
DETAIL = 1.2
# 64-bit difference hash: a larger copy of the same image stays within a few bits.
SAME_IMAGE_BITS = 6
USER_AGENT = 'KitaplikCoverCheck/1.0 (+https://github.com/titanlar-com/kitaps)'
# Kitapyurdu stamps "kitapyurdu.com" across the lower cover at every size.
WATERMARKED = ('img.kitapyurdu.com',)

# Covers a person compared at full size and found wrong, with the right image of the
# same edition. The cover's data record names this source too (see the module docstring).
REPLACE = {
    'marketing': {
        'source': 'Amazon',
        'url': 'https://m.media-amazon.com/images/P/1500619213.01._SCLZZZZZZZ_.jpg',
        'reason': 'The previous image was a text page from inside the book; this is the cover of the same edition (ISBN 9781500619213).',
    },
}

_lock = threading.Lock()
_host_slots: dict[str, threading.BoundedSemaphore] = {}
_host_next: dict[str, float] = {}


def fetch(url: str, cache: pathlib.Path) -> bytes | None:
    """GET with a disk cache. Only answers that will not change (2xx, 404) are
    cached; timeouts, rate limits and server errors are retried on the next run.
    At most two requests per host at a time, started at least 0.6 s apart."""
    key = cache / hashlib.sha1(url.encode()).hexdigest()
    if key.exists():
        return key.read_bytes() or None
    host = urllib.parse.urlparse(url).netloc
    with _lock:
        slots = _host_slots.setdefault(host, threading.BoundedSemaphore(2))
    with slots:
        with _lock:
            start = max(time.monotonic(), _host_next.get(host, 0.0))
            _host_next[host] = start + 0.6
        time.sleep(max(0.0, start - time.monotonic()))
        began = time.monotonic()
        status: int | str
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'})
            with urllib.request.urlopen(request, timeout=15) as response:
                data, status = response.read(), response.status
        except urllib.error.HTTPError as error:
            data, status = b'', error.code
        except Exception as error:
            data, status = b'', type(error).__name__
    lasting = (isinstance(status, int) and 200 <= status < 300) or status == 404
    if lasting:
        temporary = key.with_suffix('.part')
        temporary.write_bytes(data)
        os.replace(temporary, key)
    with _lock, open(cache / 'requests.log', 'a') as log:
        log.write(f'{host}\t{status}\t{time.monotonic() - began:.1f}s\t{len(data)}\t{url}\n')
    return data or None


def flatten(image: Image.Image) -> Image.Image:
    """RGB on white, so transparent areas do not turn black in a JPEG."""
    if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
        image = image.convert('RGBA')
        background = Image.new('RGB', image.size, 'white')
        background.paste(image, mask=image.split()[-1])
        return background
    return image.convert('RGB')


def open_image(data: bytes | None) -> Image.Image | None:
    if not data or len(data) < 1500:  # placeholders and empty answers
        return None
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        return flatten(ImageOps.exif_transpose(image))
    except Exception:
        return None


def loss(image: Image.Image, scale: float) -> float:
    grey = image.convert('L')
    w, h = grey.size
    back = grey.resize((max(8, round(w * scale)), max(8, round(h * scale))), Image.LANCZOS).resize((w, h), Image.BICUBIC)
    return float(np.mean(np.abs(np.asarray(grey, dtype=np.float32) - np.asarray(back, dtype=np.float32))))


def effective_width(image: Image.Image) -> int:
    """The width up to which the image holds real detail: the largest size at
    which it still behaves like a true-resolution picture. When no size
    qualifies (a plain, low-contrast cover), the full width is assumed, so a
    cover is never shrunk on a guess."""
    w, h = image.size
    for scale in (1.0, 0.85, 0.7, 0.6, 0.5, 0.42, 0.35, 0.3, 0.25):
        width = round(w * scale)
        if width < 100:
            break
        test = image if scale == 1.0 else image.resize((width, max(8, round(h * scale))), Image.LANCZOS)
        if loss(test, 0.5) >= DETAIL:
            return width
    return w


def dhash(image: Image.Image) -> int:
    grey = np.asarray(image.convert('L').resize((9, 8), Image.LANCZOS), dtype=np.int16)
    bits = (grey[:, 1:] > grey[:, :-1]).flatten()
    return int(''.join('1' if bit else '0' for bit in bits), 2)


def same_image(reference: Image.Image, candidate: Image.Image) -> tuple[bool, int]:
    """A larger copy of the same upload: same proportions, nearly the same hash."""
    gap = abs(reference.height / reference.width - candidate.height / candidate.width) / (reference.height / reference.width)
    distance = bin(dhash(reference) ^ dhash(candidate)).count('1')
    return distance <= SAME_IMAGE_BITS and gap <= 0.03, distance


def larger_copies(url: str) -> list[str]:
    """Larger or original versions of the same image at the same source."""
    if not url:
        return []
    out: list[str] = []
    for marker in ('/image/v2/images/raw/', '/v3/image/raw/'):  # ft.com image service: the original upload
        if marker in url:
            out.append(urllib.parse.unquote(url.split(marker, 1)[1].split('?', 1)[0]))
    if 'covers.openlibrary.org' in url:
        out.append(re.sub(r'-[SM]\.jpg', '-L.jpg', url))
    if '/cdn/shop/' in url:  # Shopify: without a width it serves the original
        out.append(re.sub(r'([?&])width=\d+&?', r'\1', url).rstrip('?&'))
        out.append(re.sub(r'_\d+x\d+(\.\w+)', r'\1', url))
    match = re.search(r'img\.kitapyurdu\.com/v1/getImage/fn:(\d+)', url)
    if match:
        out.append(f'https://img.kitapyurdu.com/v1/getImage/fn:{match.group(1)}/wi:1600')
    if re.search(r'-O\.(jpg|png|webp)$', url):
        out.append(re.sub(r'-O\.(jpg|png|webp)$', r'-B.\1', url))
    if 'i.dr.com.tr/cache/' in url:
        out.append(re.sub(r'i\.dr\.com\.tr/cache/[^/]+/', 'i.dr.com.tr/', url))
    if 'cloudfront.net/fit-in/' in url:
        out.append(re.sub(r'/fit-in/\d+x\d+/', '/fit-in/2000x2000/', url))
    if 'mzstatic.com' in url:
        out.append(re.sub(r'/\d+x\d+\w*\.(jpg|png|webp)$', r'/2000x0w.\1', url))
    if 'od-cdn.com/ImageType-' in url:
        out.append(re.sub(r'ImageType-\d+', 'ImageType-100', re.sub(r'Img\d+\.', 'Img100.', url)))
    if '-medium.webp' in url:
        out.append(url.replace('-medium.webp', '.webp'))
    if re.search(r'/products/\d+/', url):
        out.append(re.sub(r'/products/\d+/', '/products/1000/', url))
    if '?w=' in url:
        out.append(re.sub(r'\?w=\d+', '?w=1600', url))
    return [candidate for candidate in dict.fromkeys(out) if candidate != url]


def save(image: Image.Image, path: pathlib.Path, width: int) -> None:
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    if suffix == '.png':
        image.save(path, 'PNG', optimize=True)
    elif suffix == '.webp':
        image.save(path, 'WEBP', quality=84, method=6)
    else:
        image.save(path, 'JPEG', quality=84, optimize=True, progressive=True)


def original(src: str, base_rev: str | None) -> tuple[Image.Image, bytes, str]:
    """The cover as it was before any upgrade: from git when a base revision is
    given (a cover converted from PNG to JPEG is found under its old name).
    Returns the image, its bytes and the file name it had."""
    name, data = src, b''
    if base_rev:
        for candidate in (src, re.sub(r'\.jpg$', '.png', src)):
            shown = subprocess.run(['git', 'show', f'{base_rev}:public/{candidate}'], cwd=ROOT, capture_output=True)
            if shown.returncode == 0:
                name, data = candidate, shown.stdout
                break
    if not data:
        data = (PUBLIC / src).read_bytes()
    image = Image.open(io.BytesIO(data))
    image.load()
    return flatten(ImageOps.exif_transpose(image)), data, name


def process(src: str, cover: dict, cache: pathlib.Path, write: bool, target: int, base_rev: str | None) -> dict:
    current, current_bytes, old_name = original(src, base_rev)
    eff0 = effective_width(current)
    stamped = urllib.parse.urlparse(cover.get('imageUrl') or '').netloc in WATERMARKED
    entry: dict = {'from': {'width': current.width, 'effective': eff0, **({'watermark': True} if stamped else {})}}
    best = None
    fix = REPLACE.get(cover.get('bookId'))
    if fix:
        image = open_image(fetch(fix['url'], cache))
        if image is None:
            raise RuntimeError(f"{cover['bookId']}: the reviewed replacement could not be downloaded")
        best = (fix['source'], fix['url'], effective_width(image), image, None)
        entry['reason'] = fix['reason']
    elif eff0 < target:
        for url in larger_copies(cover.get('imageUrl') or ''):
            image = open_image(fetch(url, cache))
            if image is None:
                continue
            same, distance = same_image(current, image)
            if not same:
                entry.setdefault('rejected', []).append({'url': url, 'distance': distance})
                continue
            eff = effective_width(image)
            if eff >= max(round(eff0 * 1.2), eff0 + 40) and (best is None or eff > best[2]):
                best = ('kaynağın büyük kopyası', url, eff, image, distance)
    if best:
        source, url, eff, image, distance = best
        if image.width > eff:  # pixels beyond the real detail only add bytes
            image = image.resize((eff, round(image.height * eff / image.width)), Image.LANCZOS)
        entry.update(
            status='replaced-by-review' if distance is None else 'upgraded',
            to={'width': min(image.width, LARGE), 'effective': eff, 'source': source, 'url': url, **({} if distance is None else {'hashDistance': distance})},
        )
        chosen = image
    else:
        entry['status'] = 'kept' if eff0 >= target else 'kept-no-larger-copy'
        chosen = current
    if write:
        large, small = PUBLIC / src, PUBLIC / 'covers' / 'sm' / pathlib.Path(src).name
        if best or current.width > LARGE or old_name != src:
            save(chosen, large, LARGE)  # resized, or converted to the file's format
        elif base_rev:
            large.write_bytes(current_bytes)  # a kept cover goes back to its original bytes
        save(chosen, small, SMALL)
    return entry


def cover_records() -> dict[str, dict]:
    """Each cover file's data record (image URL, source). A cover rejected for
    another work (rejected-cover-matches.json) lends it nothing."""
    records: dict[str, dict] = {}
    for path in sorted((ROOT / 'data').glob('*.json')):
        if path.name in ('rejected-cover-matches.json', 'cover-upgrades.json'):
            continue
        try:
            data = json.loads(path.read_text())
        except ValueError:
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                if isinstance(node.get('src'), str) and node['src'].startswith('covers/'):
                    records.setdefault(node['src'], {}).update({k: v for k, v in node.items() if v})
                stack.extend(value for key, value in node.items() if key != 'rejectedCover')
            elif isinstance(node, list):
                stack.extend(node)
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--cache', required=True, help='download cache directory (kept outside the repository)')
    parser.add_argument('--write', action='store_true', help='write images and merge data/cover-upgrades.json')
    parser.add_argument('--base-rev', default='', help='git revision holding the original covers')
    parser.add_argument('--only', default='', help='comma-separated book ids')
    parser.add_argument('--force', action='store_true', help='also redo covers already in the report')
    parser.add_argument('--target', type=int, default=540, help='real width a cover should reach (default 540)')
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    cache = pathlib.Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)

    previous = json.loads(REPORT.read_text())['covers'] if REPORT.exists() else {}
    records = cover_records()
    catalog = json.loads((ROOT / 'src/catalog.json').read_text())
    covers: dict[str, dict] = {}
    # Every cover still in the catalog keeps its report entry, also when --only picks a few.
    in_catalog = {book['cover']['src'] for book in catalog['books'] if (book.get('cover') or {}).get('src')}
    for book in catalog['books']:
        cover = book.get('cover')
        if cover and cover.get('src') and (not args.only or book['id'] in args.only.split(',')):
            covers.setdefault(cover['src'], {**records.get(cover['src'], {}), **cover, 'bookId': book['id']})
    todo = {src: cover for src, cover in covers.items() if args.force or args.base_rev or src not in previous}

    report: dict[str, dict] = {}
    with futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        jobs = {pool.submit(process, src, cover, cache, args.write, args.target, args.base_rev or None): src for src, cover in sorted(todo.items())}
        for done, job in enumerate(futures.as_completed(jobs), 1):
            src = jobs[job]
            try:
                report[src] = {'bookId': covers[src]['bookId'], **job.result()}
            except Exception as error:  # the cover stays as it is
                report[src] = {'bookId': covers[src]['bookId'], 'status': 'error', 'error': str(error)[:200]}
            if done % 100 == 0:
                print(f'{done}/{len(todo)}', flush=True)

    counts: dict[str, int] = {}
    for entry in report.values():
        counts[entry['status']] = counts.get(entry['status'], 0) + 1
    print(json.dumps(counts, ensure_ascii=False))
    if args.write:
        # A cover redone from its original (--base-rev) gets a fresh record; the others keep theirs.
        merged = {src: entry for src, entry in previous.items() if src in in_catalog and not (args.base_rev and src in covers)}
        merged.update({src: {k: v for k, v in entry.items() if k != 'rejected'} for src, entry in report.items()})
        REPORT.write_text(json.dumps({
            'note': 'Each cover\'s real resolution and, where one existed, the larger copy of the same image from the same source that replaced it. Written by scripts/upgrade-covers.py.',
            'checkedAt': dt.date.today().isoformat(),
            'target': args.target,
            'covers': dict(sorted(merged.items())),
        }, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
