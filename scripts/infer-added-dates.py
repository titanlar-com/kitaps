#!/usr/bin/env python3
"""Infer the day each catalog book was added to this digital library.

The library grew in three repositories: the first Kitaps site (its commits are
kept in this repository's history), the Kitap Atlası working copy that merged
the reading lists, and this repository. A book's date is the author date of the
earliest commit, in any of them, whose book data already contains the book.

Matching is deliberately strict. A first-Kitaps record is recognised by its key
(kept in each book's legacyKeys) or by its section and number (the catalog's
kitaps:<section>:<id> mapping); its bare number is never compared with catalog
ids, because the numbers restart in every section. Kitap Atlası records are
recognised by their atlas key, and the later catalogs, which share this
repository's id scheme, by catalog id. Titles are never used: different books
share titles (a workbook and its main work, for example). Books found in no
commit are new in the working tree and take --today.

The author date is used, so a rebase or an amended commit keeps the day the
change was written. Dates are stored by catalog id: if a title fix changes a
book's id, run once with --rebuild so the book is dated from history again.

The result is data/added-dates.json, which scripts/merge-data.py reads. The
working copy of Kitap Atlası lives outside the repository, so the derived file,
not this script, is the record CI relies on.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import date
from days import newest_day
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(repo: Path, *args: str) -> str:
    return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True, text=True).stdout


def commits(repo: Path, path: str) -> list[tuple[str, str]]:
    """Commits touching path on any branch, tag or remote (not stashes), oldest first, with their author day."""
    lines = git(repo, 'log', '--full-history', '--branches', '--tags', '--remotes', '--reverse', '--format=%H %ad', '--date=short', '--', path).splitlines()
    return [tuple(line.split(' ', 1)) for line in lines if line.strip()]


def books_at(repo: Path, commit: str, path: str) -> list[dict]:
    try:
        data = json.loads(git(repo, 'show', f'{commit}:{path}'))
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return []
    if isinstance(data, list):
        return data
    if 'books' in data:
        return data['books']
    # The first Kitap Atlası catalog nests its books inside collections and groups.
    return [book for collection in data.get('collections', []) for group in collection.get('groups', []) for book in group.get('books', [])]


def calendar_day(value: str) -> str:
    """A real calendar day written YYYY-MM-DD, not in the future."""
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f'{value!r} is not a YYYY-MM-DD day') from error
    if len(value) != 10 or parsed > newest_day():
        raise argparse.ArgumentTypeError(f'{value!r} must be a YYYY-MM-DD day, not in the future')
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--atlas', type=Path, help='Kitap Atlası working copy (a git repository)')
    parser.add_argument('--today', type=calendar_day, default=date.today().isoformat(), help='date for books not yet committed')
    parser.add_argument('--rebuild', action='store_true', help='ignore the recorded dates and infer every date again')
    parser.add_argument('--write', action='store_true', help='write data/added-dates.json')
    args = parser.parse_args()

    catalog = json.loads((ROOT / 'src/catalog.json').read_text())
    current = catalog['books']
    # Only the section-qualified entries: kitaps:<id> alone is ambiguous across sections.
    by_kitaps = {tuple(key.split(':')[1:]): bid for key, bid in catalog['mapping'].items() if key.startswith('kitaps:') and key.count(':') == 2}
    by_atlas = {key.split(':', 1)[1]: bid for key, bid in catalog['mapping'].items() if key.startswith('atlas:')}
    found: dict[str, dict] = {}

    def record(book_id: str, day: str, commit: str, repository: str, basis: str) -> None:
        if book_id not in found or day < found[book_id]['date']:
            found[book_id] = {'date': day, 'repository': repository, 'commit': commit[:7], 'matchedBy': basis}

    def match_ids(snapshot: list[dict], day: str, commit: str, repository: str) -> None:
        ids = {book.get('id') for book in snapshot}
        for book in current:
            if book['id'] in ids:
                record(book['id'], day, commit, repository, 'id')

    # 1. The first Kitaps site: its records carry a section, a number within it and a key.
    for commit, day in commits(ROOT, 'src/data/books.json'):
        snapshot = books_at(ROOT, commit, 'src/data/books.json')
        keys = {old.get('key') for old in snapshot if old.get('key')}
        for old in snapshot:
            bid = by_kitaps.get((str(old.get('section')), str(old.get('id'))))
            if bid:
                record(bid, day, commit, 'kitaps', 'first-kitaps-id')
        for book in current:
            if keys.intersection(book.get('legacyKeys') or []):
                record(book['id'], day, commit, 'kitaps', 'first-kitaps-key')
    # 2. The Kitap Atlası working copy, where the reading lists were first merged.
    if args.atlas:
        for commit, day in commits(args.atlas, 'src/catalog.json'):
            snapshot = books_at(args.atlas, commit, 'src/catalog.json')
            for old in snapshot:
                if old.get('key') in by_atlas:
                    record(by_atlas[old['key']], day, commit, 'kitap-atlasi', 'atlas-key')
            match_ids(snapshot, day, commit, 'kitap-atlasi')
    # 3. This repository's catalog.
    for commit, day in commits(ROOT, 'src/catalog.json'):
        match_ids(books_at(ROOT, commit, 'src/catalog.json'), day, commit, 'kitaplik')

    # An earlier run may have seen history this run cannot (the Kitap Atlası copy),
    # so a date already recorded is only ever replaced by an earlier one.
    target = ROOT / 'data/added-dates.json'
    previous = json.loads(target.read_text())['records'] if target.exists() and not args.rebuild else {}
    records = {}
    for book in current:
        inferred = found.get(book['id']) or {'date': args.today, 'repository': 'kitaplik', 'commit': None, 'matchedBy': 'working-tree'}
        earlier = previous.get(book['id'])
        # On the same day the fresh record wins, so a committed book gains its commit.
        records[book['id']] = earlier if earlier and earlier['date'] < inferred['date'] else inferred
    result = {
        'schemaVersion': 1,
        'policy': 'Bir kitabın eklenme günü, kitabı içeren ilk commit’in yazar tarihidir. Önce ilk Kitaps sitesi, sonra Kitap Atlası çalışma kopyası, sonra bu depo taranır. Henüz commit edilmemiş kitaplar çalışma günü tarihini alır.',
        'records': dict(sorted(records.items())),
    }
    summary = {}
    for item in records.values():
        summary[item['date']] = summary.get(item['date'], 0) + 1
    print(json.dumps(dict(sorted(summary.items())), ensure_ascii=False))
    print('matched by', {basis: sum(item['matchedBy'] == basis for item in records.values()) for basis in sorted({item['matchedBy'] for item in records.values()})})
    if args.write:
        target.write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
