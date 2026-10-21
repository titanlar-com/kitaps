#!/usr/bin/env python3
"""Validate two independent Claude research stages and merge accepted decisions.

No application data is modified. The merged proposal is written to --output and
must be reviewed before a separate integration step updates source data.
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


DECISIONS = {"original", "available", "unavailable", "manual_review"}
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
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class InvalidResult(ValueError):
    pass


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def unwrap(value):
    """Accept plain structured output or Claude CLI's JSON result envelope."""
    if isinstance(value, dict) and value.get("is_error") is True:
        raise InvalidResult("Claude CLI reported an error")
    if isinstance(value, dict) and isinstance(value.get("structured_output"), dict):
        return value["structured_output"]
    if isinstance(value, dict) and isinstance(value.get("result"), str):
        try:
            parsed = json.loads(value["result"])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    return value


def require(condition: bool, message: str) -> None:
    if not condition:
        raise InvalidResult(message)


def validate_date(value: str, context: str) -> None:
    require(isinstance(value, str) and bool(DATE.match(value)), f"{context} must be YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise InvalidResult(f"{context} is not a valid date") from error
    require(parsed <= newest_day(), f"{context} cannot be in the future")


def host(url: str) -> str:
    parsed = urlparse(url)
    require(parsed.scheme == "https" and bool(parsed.netloc), f"evidence URL must use HTTPS: {url!r}")
    return parsed.netloc.lower().removeprefix("www.")


def validate_evidence(items, context: str) -> list[dict]:
    require(isinstance(items, list), f"{context}.evidence must be an array")
    for index, item in enumerate(items):
        here = f"{context}.evidence[{index}]"
        require(isinstance(item, dict), f"{here} must be an object")
        for key in ("url", "sourceType", "claim", "accessedAt"):
            require(isinstance(item.get(key), str) and item[key].strip(), f"{here}.{key} is required")
        require(item["sourceType"] in SOURCE_TYPES, f"{here}.sourceType is invalid")
        validate_date(item["accessedAt"], f"{here}.accessedAt")
        host(item["url"])
    return items


def validate_stage1(value, expected_batch: dict) -> dict[str, dict]:
    value = unwrap(value)
    require(isinstance(value, dict), "stage 1 output must be an object")
    require(value.get("batchId") == expected_batch["batchId"], "stage 1 batchId mismatch")
    require(isinstance(value.get("records"), list), "stage 1 records must be an array")
    result = {}
    for item in value["records"]:
        require(isinstance(item, dict) and isinstance(item.get("id"), str), "stage 1 record id is required")
        require(item["id"] not in result, f"duplicate stage 1 id: {item['id']}")
        require(item.get("decision") in DECISIONS, f"invalid stage 1 decision for {item['id']}")
        require(item.get("confidence") in {"high", "medium", "low"}, f"invalid confidence for {item['id']}")
        require(isinstance(item.get("reason"), str) and item["reason"].strip(), f"reason missing for {item['id']}")
        for key in ("turkishTitle", "isbn", "publisher"):
            require(isinstance(item.get(key), str), f"{key} must be a string for {item['id']}")
        require(isinstance(item.get("translatorNames"), list) and all(isinstance(x, str) for x in item["translatorNames"]), f"translatorNames invalid for {item['id']}")
        item["evidence"] = validate_evidence(item.get("evidence"), f"stage1:{item['id']}")
        result[item["id"]] = item
    require(set(result) == set(expected_batch["recordIds"]), "stage 1 record ids do not match manifest")
    return result


def validate_stage2(value, expected_batch: dict) -> dict[str, dict]:
    value = unwrap(value)
    require(isinstance(value, dict), "stage 2 output must be an object")
    require(value.get("batchId") == expected_batch["batchId"], "stage 2 batchId mismatch")
    require(isinstance(value.get("records"), list), "stage 2 records must be an array")
    result = {}
    for item in value["records"]:
        require(isinstance(item, dict) and isinstance(item.get("id"), str), "stage 2 record id is required")
        require(item["id"] not in result, f"duplicate stage 2 id: {item['id']}")
        require(item.get("verdict") in {"accept", "reject", "manual_review"}, f"invalid verdict for {item['id']}")
        require(item.get("finalDecision") in DECISIONS, f"invalid finalDecision for {item['id']}")
        require(isinstance(item.get("reason"), str) and item["reason"].strip(), f"stage 2 reason missing for {item['id']}")
        require(item.get("confidence") in {"high", "medium", "low"}, f"invalid stage 2 confidence for {item['id']}")
        item["evidence"] = validate_evidence(item.get("evidence"), f"stage2:{item['id']}")
        result[item["id"]] = item
    require(set(result) == set(expected_batch["recordIds"]), "stage 2 record ids do not match manifest")
    return result


def acceptance_errors(stage1: dict, stage2: dict) -> list[str]:
    errors = []
    if stage2["verdict"] != "accept":
        errors.append(f"verifier verdict is {stage2['verdict']}")
    if stage1["decision"] != stage2["finalDecision"]:
        errors.append("the two stages disagree on the decision")
    if stage1["decision"] == "manual_review":
        errors.append("researcher requested manual review")
    if stage1["decision"] == "available":
        if not stage1["turkishTitle"].strip():
            errors.append("available edition has no Turkish title")
        if not stage1["publisher"].strip():
            errors.append("available edition has no publisher")
    first_domains = {host(item["url"]) for item in stage1["evidence"]}
    second_domains = {host(item["url"]) for item in stage2["evidence"]}
    if not first_domains or not second_domains:
        errors.append("each stage needs evidence")
    if first_domains & second_domains:
        errors.append("research stages reused an evidence domain")
    if len(first_domains | second_domains) < 2:
        errors.append("fewer than two independent evidence domains")
    if stage1["decision"] == "unavailable":
        types = {item["sourceType"] for item in stage1["evidence"] + stage2["evidence"]}
        if "national-bibliography" not in types:
            errors.append("absence lacks a national-bibliography check")
        if stage1["confidence"] != "high" or stage2["confidence"] != "high":
            errors.append("absence is not high confidence in both stages")
    return errors


def source_record(item: dict) -> dict:
    return {"url": item["url"], "type": item["sourceType"]}


def availability_record(stage1: dict, stage2: dict, checked_at: str, reviewers: tuple[str, str]) -> dict:
    status = stage1["decision"]
    record = {
        "status": status,
        "stage1": {
            "decision": status,
            "reviewer": reviewers[0],
            "checkedAt": checked_at,
            "sources": [source_record(item) for item in stage1["evidence"]],
        },
        "stage2": {
            "decision": status,
            "reviewer": reviewers[1],
            "checkedAt": checked_at,
            "sources": [source_record(item) for item in stage2["evidence"]],
        },
    }
    if status == "available":
        record["edition"] = {
            "title": stage1["turkishTitle"],
            "publisher": stage1["publisher"],
            "isbn": stage1["isbn"],
            "translators": stage1["translatorNames"],
        }
        if not stage1["isbn"]:
            record["edition"]["isbnUnavailable"] = True
    elif status == "original":
        record["originalLanguage"] = "tr"
    elif status == "unavailable":
        record["scopeNote"] = f"{stage1['reason']} İkinci doğrulama: {stage2['reason']}"
    return record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--stage1-dir", type=Path, required=True)
    parser.add_argument("--stage2-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stage1-reviewer", required=True)
    parser.add_argument("--stage2-reviewer", required=True)
    parser.add_argument("--checked-at", default=date.today().isoformat())
    args = parser.parse_args()
    require(args.stage1_reviewer != args.stage2_reviewer, "reviewer labels must be different")
    validate_date(args.checked_at, "--checked-at")
    require(not args.output.resolve().is_relative_to(Path(__file__).resolve().parents[1]), "--output must be outside the repository")

    manifest = read_json(args.manifest)
    accepted, review = {}, []
    seen = set()
    for batch in manifest.get("batches", []):
        batch_id = batch["batchId"]
        require(bool(re.fullmatch(r"translation-\d{4}", batch_id)), f"invalid batchId: {batch_id!r}")
        stage1_path = args.stage1_dir / f"{batch_id}.json"
        stage2_path = args.stage2_dir / f"{batch_id}.json"
        require(stage1_path.exists(), f"missing stage 1 output: {stage1_path}")
        require(stage2_path.exists(), f"missing stage 2 output: {stage2_path}")
        one = validate_stage1(read_json(stage1_path), batch)
        two = validate_stage2(read_json(stage2_path), batch)
        for record_id in batch["recordIds"]:
            require(record_id not in seen, f"duplicate manifest id: {record_id}")
            seen.add(record_id)
            errors = acceptance_errors(one[record_id], two[record_id])
            combined = {
                **one[record_id],
                "stage2Verdict": two[record_id]["verdict"],
                "stage2Reason": two[record_id]["reason"],
                "stage2Evidence": two[record_id]["evidence"],
            }
            if errors:
                combined["validationErrors"] = errors
                review.append(combined)
            else:
                accepted[record_id] = availability_record(
                    one[record_id],
                    two[record_id],
                    args.checked_at,
                    (args.stage1_reviewer, args.stage2_reviewer),
                )

    require(len(seen) == manifest.get("targetCount"), "manifest targetCount mismatch")
    summary = Counter(item["status"] for item in accepted.values())
    result = {
        "schemaVersion": 1,
        "decisionPolicy": {
            "provenance": str(args.manifest.resolve()),
            "catalogSha256": manifest.get("catalogSha256"),
            "note": "Two independent structured research stages; review before integration.",
        },
        "summary": {"accepted": len(accepted), "manualReview": len(review), "decisions": dict(summary)},
        "records": accepted,
        "manualReview": review,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Accepted {len(accepted)} records; routed {len(review)} to manual review; wrote {args.output}")


if __name__ == "__main__":
    try:
        main()
    except (InvalidResult, KeyError, TypeError) as error:
        raise SystemExit(f"Invalid research result: {error}") from error
