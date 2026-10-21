"""Validation for independently researched original-edition facts.

Each accepted fact (original title, original language, first publication year,
first publisher) carries two review stages by different reviewers whose
evidence comes from different web domains, mirroring the translation policy.
"""
from datetime import date
from days import newest_day
from urllib.parse import urlparse

from translation_availability import SOURCE_TYPES

FIELDS = {"originalTitle", "originalLanguage", "firstPublicationYear", "firstPublisher"}


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _domain(url):
    return urlparse(url).netloc.lower().removeprefix("www.")


def _stage(stage, path):
    _require(isinstance(stage, dict), f"{path} must be an object")
    _require(isinstance(stage.get("reviewer"), str) and stage["reviewer"].strip(), f"{path}.reviewer is required")
    checked = stage.get("checkedAt")
    _require(isinstance(checked, str), f"{path}.checkedAt must be an ISO date")
    _require(date.fromisoformat(checked) <= newest_day(), f"{path}.checkedAt cannot be in the future")
    sources = stage.get("sources")
    _require(isinstance(sources, list) and sources, f"{path}.sources must contain evidence")
    for index, source in enumerate(sources):
        _require(isinstance(source, dict) and source.get("type") in SOURCE_TYPES, f"{path}.sources[{index}].type is invalid")
        url = source.get("url")
        _require(isinstance(url, str) and urlparse(url).scheme == "https" and urlparse(url).netloc, f"{path}.sources[{index}].url must be HTTPS")
    return {_domain(source["url"]) for source in sources}


def validate_facts(manifest, valid_book_ids=None):
    """Return the records after enforcing the two-stage evidence policy."""
    _require(isinstance(manifest, dict) and manifest.get("schemaVersion") == 1, "bibliographic facts schemaVersion must be 1")
    records = manifest.get("records")
    _require(isinstance(records, dict), "bibliographic facts records must be an object")
    for book_id, record in records.items():
        path = f"records.{book_id}"
        _require(isinstance(record, dict), f"{path} must be an object")
        if valid_book_ids is not None:
            _require(book_id in valid_book_ids, f"{path} does not match a catalog book")
        facts = {key: value for key, value in record.items() if key in FIELDS}
        _require(facts, f"{path} has no facts")
        _require(set(record) <= FIELDS | {"stage1", "stage2"}, f"{path} has unknown fields")
        if "firstPublicationYear" in facts:
            year = facts["firstPublicationYear"]
            _require(isinstance(year, int) and -3000 <= year <= date.today().year, f"{path}.firstPublicationYear is invalid")
        for key in ("originalTitle", "firstPublisher"):
            if key in facts:
                _require(isinstance(facts[key], str) and facts[key].strip(), f"{path}.{key} must be text")
        if "originalLanguage" in facts:
            _require(isinstance(facts["originalLanguage"], str) and 2 <= len(facts["originalLanguage"]) <= 3, f"{path}.originalLanguage must be an ISO 639 code")
        first = _stage(record.get("stage1"), f"{path}.stage1")
        second = _stage(record.get("stage2"), f"{path}.stage2")
        _require(record["stage1"]["reviewer"] != record["stage2"]["reviewer"], f"{path} requires two independent reviewers")
        _require(first.isdisjoint(second), f"{path} requires evidence from independent domains")
    return records
