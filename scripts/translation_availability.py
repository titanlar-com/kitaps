"""Validation for independently researched Turkish translation decisions."""
from datetime import date
from days import newest_day
from urllib.parse import urlparse

STATUSES = {"available", "unavailable", "original"}
SOURCE_TYPES = {
    "publisher",
    "publisher-preview",
    "bibliographic",
    "national-bibliography",
    "library-catalog",
    "retailer",
    "rights-holder",
    "author",
    "official",
}


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _validate_date(value, path):
    _require(isinstance(value, str), f"{path} must be an ISO date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{path} must be an ISO date") from error
    _require(parsed <= newest_day(), f"{path} cannot be in the future")


def _validate_stage(stage, status, path):
    _require(isinstance(stage, dict), f"{path} must be an object")
    _require(stage.get("decision") == status, f"{path}.decision must equal record status")
    _require(isinstance(stage.get("reviewer"), str) and stage["reviewer"].strip(), f"{path}.reviewer is required")
    _validate_date(stage.get("checkedAt"), f"{path}.checkedAt")
    sources = stage.get("sources")
    _require(isinstance(sources, list) and sources, f"{path}.sources must contain evidence")
    for index, source in enumerate(sources):
        source_path = f"{path}.sources[{index}]"
        _require(isinstance(source, dict), f"{source_path} must be an object")
        _require(source.get("type") in SOURCE_TYPES, f"{source_path}.type is invalid")
        url = source.get("url")
        _require(isinstance(url, str) and urlparse(url).scheme == "https" and urlparse(url).netloc, f"{source_path}.url must be HTTPS")
    return sources


def validate_manifest(manifest, valid_book_ids=None):
    """Return the records after enforcing the two-stage evidence policy."""
    _require(isinstance(manifest, dict), "translation availability manifest must be an object")
    _require(manifest.get("schemaVersion") == 1, "translation availability schemaVersion must be 1")
    records = manifest.get("records")
    _require(isinstance(records, dict), "translation availability records must be an object")
    for book_id, record in records.items():
        path = f"records.{book_id}"
        _require(isinstance(record, dict), f"{path} must be an object")
        if valid_book_ids is not None:
            _require(book_id in valid_book_ids, f"{path} does not match a catalog book")
        status = record.get("status")
        _require(status in STATUSES, f"{path}.status is invalid")
        stage1_sources = _validate_stage(record.get("stage1"), status, f"{path}.stage1")
        stage2_sources = _validate_stage(record.get("stage2"), status, f"{path}.stage2")
        _require(record["stage1"]["reviewer"] != record["stage2"]["reviewer"], f"{path} requires two independent reviewers")
        first_urls = {source["url"] for source in stage1_sources}
        second_urls = {source["url"] for source in stage2_sources}
        _require(first_urls.isdisjoint(second_urls), f"{path} requires independent source evidence")

        if status == "available":
            edition = record.get("edition")
            _require(isinstance(edition, dict), f"{path}.edition is required for available")
            _require(isinstance(edition.get("title"), str) and edition["title"].strip(), f"{path}.edition.title is required")
            _require(isinstance(edition.get("publisher"), str) and edition["publisher"].strip(), f"{path}.edition.publisher is required")
            isbn = edition.get("isbn")
            _require((isinstance(isbn, str) and isbn.strip()) or edition.get("isbnUnavailable") is True, f"{path}.edition needs isbn or isbnUnavailable=true")
        elif status == "original":
            _require(record.get("originalLanguage") == "tr", f"{path}.originalLanguage must be tr for original")
        else:
            _require(isinstance(record.get("scopeNote"), str) and record["scopeNote"].strip(), f"{path}.scopeNote is required for unavailable")
    return records
