#!/usr/bin/env python3
"""Validate two independent research stages and merge accepted decisions.

Stage outputs (see scripts/prompts/bibliographic-research-stage*.md) live
outside the repository. A record is accepted only when the second reviewer
confirms it with evidence from different web domains; everything else is
listed for manual review and leaves the catalog unchanged.

Without --apply the script only reports. With --apply it adds the accepted
records to data/translation-availability.json and data/bibliographic-facts.json,
which scripts/merge-data.py validates again when it rebuilds the catalog.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import date
from days import newest_day
from pathlib import Path
from urllib.parse import urlparse

from bibliographic_facts import FIELDS, validate_facts
from translation_availability import SOURCE_TYPES, validate_manifest

ROOT = Path(__file__).resolve().parents[1]


def domain(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower().removeprefix('www.') if parsed.scheme == 'https' and parsed.netloc else ''


def evidence(items) -> list[dict]:
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict) and domain(str(item.get('url', ''))) and item.get('sourceType') in SOURCE_TYPES]


def sources(items: list[dict]) -> list[dict]:
    return [{'url': item['url'], 'type': item['sourceType']} for item in items]


def valid_isbn(value: str) -> bool:
    digits = re.sub(r'[^0-9X]', '', value.upper())
    if len(digits) == 13 and digits.isdigit():
        return sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(digits)) % 10 == 0
    if len(digits) == 10:
        return sum((10 if d == 'X' else int(d)) * (10 - i) for i, d in enumerate(digits)) % 11 == 0
    return False


def independent(first: list[dict], second: list[dict]) -> str | None:
    one = {domain(item['url']) for item in first}
    two = {domain(item['url']) for item in second}
    if not one or not two:
        return 'each stage needs evidence'
    if one & two:
        return 'the stages share an evidence domain'
    return None


def turkish_record(one: dict, two: dict, reviewers: tuple[str, str], checked_at: str) -> tuple[dict | None, str | None]:
    decision = one.get('decision')
    if decision not in {'available', 'original', 'unavailable'}:
        return None, f'stage 1 decision is {decision}'
    if two.get('verdict') != 'accept' or two.get('finalDecision') != decision:
        return None, f"stage 2 verdict {two.get('verdict')} / {two.get('finalDecision')}"
    if 'low' in {one.get('confidence'), two.get('confidence')}:
        return None, 'low confidence'
    first, second = evidence(one.get('evidence')), evidence(two.get('evidence'))
    problem = independent(first, second)
    if problem:
        return None, problem
    record = {
        'status': decision,
        'stage1': {'decision': decision, 'reviewer': reviewers[0], 'checkedAt': checked_at, 'sources': sources(first)},
        'stage2': {'decision': decision, 'reviewer': reviewers[1], 'checkedAt': checked_at, 'sources': sources(second)},
    }
    if decision == 'available':
        title, publisher, isbn = (str(one.get(key) or '').strip() for key in ('turkishTitle', 'publisher', 'isbn'))
        if not title or not publisher:
            return None, 'available edition lacks a title or publisher'
        if isbn and not valid_isbn(isbn):
            return None, f'invalid ISBN {isbn}'
        record['edition'] = {'title': title, 'publisher': publisher, 'isbn': re.sub(r'[^0-9X]', '', isbn.upper()), 'translators': [name.strip() for name in one.get('translatorNames') or [] if isinstance(name, str) and name.strip()]}
        if not isbn:
            record['edition']['isbnUnavailable'] = True
        if isinstance(one.get('turkishYear'), int):
            record['edition']['year'] = one['turkishYear']
    elif decision == 'original':
        record['originalLanguage'] = 'tr'
    else:
        types = {item['sourceType'] for item in first + second}
        if 'national-bibliography' not in types or one.get('confidence') != 'high' or two.get('confidence') != 'high':
            return None, 'absence lacks a high-confidence national-bibliography check'
        record['scopeNote'] = f"{one.get('reason', '').strip()} İkinci doğrulama: {two.get('reason', '').strip()}".strip()
    return record, None


def original_record(one: dict, two: dict, reviewers: tuple[str, str], checked_at: str) -> tuple[dict | None, list[str]]:
    if 'low' in {one.get('confidence'), two.get('confidence')}:
        return None, ['low confidence']
    first, second = evidence(one.get('evidence')), evidence(two.get('evidence'))
    problem = independent(first, second)
    if problem:
        return None, [problem]
    verdicts = two.get('fields') if isinstance(two.get('fields'), dict) else {}
    facts, rejected = {}, []
    for field in sorted(FIELDS):
        value = one.get(field)
        if value in (None, '', []):
            continue
        if verdicts.get(field) != 'accept':
            rejected.append(f'{field}: {verdicts.get(field, "missing")}')
            continue
        if field == 'firstPublicationYear' and not (isinstance(value, int) and 0 < value <= 2026):
            rejected.append(f'{field}: invalid {value!r}')
            continue
        if field == 'originalLanguage':
            value = str(value).strip().lower()
            if not re.fullmatch(r'[a-z]{2,3}', value):
                rejected.append(f'{field}: invalid {value!r}')
                continue
        facts[field] = value.strip() if isinstance(value, str) else value
    if not facts:
        return None, rejected or ['no facts']
    facts['stage1'] = {'reviewer': reviewers[0], 'checkedAt': checked_at, 'sources': sources(first)}
    facts['stage2'] = {'reviewer': reviewers[1], 'checkedAt': checked_at, 'sources': sources(second)}
    return facts, rejected


def calendar_day(value: str) -> str:
    """A real calendar day written YYYY-MM-DD, not in the future."""
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f'{value!r} is not a YYYY-MM-DD day') from error
    if len(value) != 10 or parsed > newest_day():
        raise argparse.ArgumentTypeError(f'{value!r} must be a YYYY-MM-DD day, not in the future')
    return value


def lost_edition_fields(old: dict, new: dict) -> list[str]:
    """What an accepted Turkish edition record would lose if the new one replaced it."""
    before, after = old.get('edition') or {}, new.get('edition') or {}
    lost = [field for field in ('isbn', 'translators', 'year') if before.get(field) and not after.get(field)]
    lost += [f'{field} changes' for field in ('title', 'publisher') if before.get(field) and after.get(field) and before[field] != after[field]]
    return lost


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path, required=True, help='directory with input/, stage1/ and stage2/')
    parser.add_argument('--report', type=Path, required=True, help='JSON report path outside the repository')
    parser.add_argument('--apply', action='store_true')
    # Required, so merging old research again never re-stamps it with a new day.
    parser.add_argument('--checked-at', type=calendar_day, required=True, help='day the stages were checked (YYYY-MM-DD)')
    args = parser.parse_args()
    if args.report.resolve().is_relative_to(ROOT):
        raise SystemExit('--report must be outside the repository')

    catalog_ids = {book['id'] for book in json.loads((ROOT / 'src/catalog.json').read_text())['books']}
    accepted_turkish, accepted_facts, review = {}, {}, []
    for batch_file in sorted((args.research / 'input').glob('*.json')):
        batch = json.loads(batch_file.read_text())
        batch_id = batch['batchId']
        stage1_file, stage2_file = args.research / 'stage1' / f'{batch_id}.json', args.research / 'stage2' / f'{batch_id}.json'
        if not stage1_file.exists() or not stage2_file.exists():
            review.append({'batch': batch_id, 'problem': 'stage output missing'})
            continue
        stage1, stage2 = json.loads(stage1_file.read_text()), json.loads(stage2_file.read_text())
        reviewers = (f'claude-stage1-{batch_id}', f'claude-stage2-{batch_id}')
        first = {record['id']: record for record in stage1.get('records', []) if isinstance(record, dict) and 'id' in record}
        second = {record['id']: record for record in stage2.get('records', []) if isinstance(record, dict) and 'id' in record}
        for item in batch['records']:
            book_id = item['id']
            if book_id not in catalog_ids:
                review.append({'id': book_id, 'problem': 'not in catalog'})
                continue
            one, two = first.get(book_id), second.get(book_id)
            if not one or not two:
                review.append({'id': book_id, 'problem': 'missing stage record'})
                continue
            if isinstance(one.get('turkish'), dict):
                record, problem = turkish_record(one['turkish'], two.get('turkish') or {}, reviewers, args.checked_at)
                if record:
                    accepted_turkish[book_id] = record
                else:
                    review.append({'id': book_id, 'part': 'turkish', 'problem': problem, 'stage1': one['turkish'], 'stage2': two.get('turkish')})
            if isinstance(one.get('original'), dict):
                facts, rejected = original_record(one['original'], two.get('original') or {}, reviewers, args.checked_at)
                if facts:
                    accepted_facts[book_id] = facts
                if rejected:
                    review.append({'id': book_id, 'part': 'original', 'problem': '; '.join(rejected), 'stage1': one['original'], 'stage2': two.get('original')})

    translation_path, facts_path = ROOT / 'data/translation-availability.json', ROOT / 'data/bibliographic-facts.json'
    translations, facts = json.loads(translation_path.read_text()), json.loads(facts_path.read_text())
    # A later review replaces an earlier record only when it keeps everything the
    # earlier one established; otherwise the earlier record stays for manual review.
    for book_id, record in list(accepted_turkish.items()):
        old = translations['records'].get(book_id)
        if not old:
            continue
        problem = f"status would change from {old['status']} to {record['status']}" if old['status'] != record['status'] else None
        lost = lost_edition_fields(old, record)
        if problem or lost:
            review.append({'id': book_id, 'part': 'turkish', 'problem': problem or 'would drop or change accepted ' + ', '.join(lost), 'earlier': old, 'proposed': record})
            del accepted_turkish[book_id]
    for book_id, record in list(accepted_facts.items()):
        earlier = facts['records'].get(book_id) or {}
        lost = sorted(field for field in earlier if field in FIELDS and field not in record)
        if lost:
            review.append({'id': book_id, 'part': 'original', 'problem': 'would drop accepted ' + ', '.join(lost), 'earlier': earlier, 'proposed': record})
            del accepted_facts[book_id]
    translations['records'] = {**translations['records'], **accepted_turkish}
    facts['records'] = {**facts['records'], **accepted_facts}
    validate_manifest(translations, catalog_ids)
    validate_facts(facts, catalog_ids)
    summary = {
        'turkishAccepted': dict(Counter(record['status'] for record in accepted_turkish.values())),
        'factsAccepted': dict(Counter(field for record in accepted_facts.values() for field in record if field in FIELDS)),
        'manualReview': len(review),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({'summary': summary, 'manualReview': review}, ensure_ascii=False, indent=2) + '\n')
    if args.apply:
        translation_path.write_text(json.dumps(translations, ensure_ascii=False, indent=2) + '\n')
        facts_path.write_text(json.dumps(facts, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
