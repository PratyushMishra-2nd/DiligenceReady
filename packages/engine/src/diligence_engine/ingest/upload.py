"""Ingest one uploaded file.

`ingest_company` walks a directory the generator produced. That is the right
shape for seeded data and the wrong shape for a CA who has just exported one
month's purchase register and wants to see what is in it.

The difference that matters: a seeded run knows its periods in advance
because the generator made them. An upload does not, so the file is scanned
for the periods it actually covers and those are created before any row
lands. A row silently dropped for belonging to a period nobody had declared
is the kind of quiet data loss that makes a reconciliation figure wrong
without making it look wrong.
"""

from __future__ import annotations

import csv
import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.engine import Connection

from diligence_engine.ingest import documents, feeds
from diligence_engine.ingest.columns import (
    BANK_STATEMENT,
    LEDGER_ENTRIES,
    PURCHASE_REGISTER,
    SALES_REGISTER,
    UnreadableExport,
    resolve,
)
from diligence_engine.ingest.parties import load_resolver
from diligence_engine.normalise import ParseError, parse_date, period_of

_PERIOD_IN_NAME = re.compile(r"(20\d{2})[-_]?(0[1-9]|1[0-2])")

# The kinds a person can upload, and the schema each is read with.
CSV_KINDS = {
    "purchase_register": PURCHASE_REGISTER,
    "sales_ledger": SALES_REGISTER,
    "ledger": LEDGER_ENTRIES,
    "bank_stmt": BANK_STATEMENT,
}
JSON_KINDS = ("gstr2b", "ims")
UPLOADABLE = (*CSV_KINDS, *JSON_KINDS)


class UnsupportedUpload(ValueError):
    """The file is not a kind this system knows how to read."""


@dataclass
class UploadResult:
    kind: str
    filename: str
    rows: int
    periods: list[str]
    already_present: bool = False
    unresolved_parties: int = 0


def periods_in_csv(path: Path, kind: str) -> list[str]:
    """Every tax period the file touches, read from its own date column."""
    schema = CSV_KINDS[kind]
    found: set[str] = set()

    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        columns = resolve(list(reader.fieldnames or []), schema)
        for row in reader:
            raw = columns.get(row, "date")
            if not raw:
                continue
            try:
                found.add(period_of(parse_date(raw)))
            except ParseError:
                # One unparseable date is a bad row, not a bad file. The
                # parser will reject it by name when it gets there.
                continue

    return sorted(found)


def period_of_json(path: Path, kind: str) -> str:
    """A 2B or IMS export states the period it is for; the filename is the fallback."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    data = payload.get("data", payload)
    stated = data.get("rtnprd")
    if stated and len(stated) == 6 and stated.isdigit():
        # GSTN writes MMYYYY.
        return f"{stated[2:]}-{stated[:2]}"

    match = _PERIOD_IN_NAME.search(path.name)
    if match:
        return f"{match.group(1)}-{match.group(2)}"

    raise UnsupportedUpload(
        f"Could not tell which period {path.name} is for. The file states no return "
        "period and the filename carries no YYYY-MM. Rename it, for example "
        "gstr2b_2026_08.json."
    )


def ingest_upload(
    conn: Connection,
    *,
    company_id: uuid.UUID,
    company_slug: str,
    path: Path,
    kind: str,
) -> UploadResult:
    """Read one uploaded file into the typed tables, creating periods as needed."""
    if kind not in UPLOADABLE:
        raise UnsupportedUpload(
            f"{kind!r} is not something this system reads. Known kinds: "
            f"{', '.join(sorted(UPLOADABLE))}."
        )

    if kind in JSON_KINDS:
        period = period_of_json(path, kind)
        periods = [period]
    else:
        periods = periods_in_csv(path, kind)
        if not periods:
            raise UnreadableExport(
                f"{path.name} has a readable header but no parseable dates, so there is "
                "nothing to file it under."
            )
        period = None

    documents.ensure_periods(conn, company_id, periods)

    document = documents.register_document(
        conn, company_id, company_slug, path, kind=kind, period=period
    )
    if document.already_present:
        # Documents are keyed by content hash, so re-uploading the same export
        # is a no-op rather than a duplicate. Saying so is more useful than
        # silently reporting zero rows.
        return UploadResult(
            kind=kind,
            filename=document.filename,
            rows=0,
            periods=periods,
            already_present=True,
        )

    resolver = load_resolver(conn, company_id)
    known = set(periods)

    if kind == "gstr2b":
        result = feeds.ingest_gstr2b(conn, company_id, document, path, period, resolver)
        documents.mark_gstr2b_generated(conn, company_id, period)
    elif kind == "ims":
        result = feeds.ingest_ims(conn, company_id, document, path, period)
    elif kind == "purchase_register":
        result = feeds.ingest_purchase_register(conn, company_id, document, path, resolver, known)
    elif kind == "sales_ledger":
        result = feeds.ingest_sales_register(conn, company_id, document, path, resolver, known)
    elif kind == "ledger":
        result = feeds.ingest_ledger_entries(conn, company_id, document, path, resolver, known)
    else:
        result = feeds.ingest_bank_statement(conn, company_id, document, path, resolver, known)

    documents.set_row_count(conn, document.id, result.rows)

    return UploadResult(
        kind=kind,
        filename=document.filename,
        rows=result.rows,
        periods=periods,
        unresolved_parties=result.unresolved_parties,
    )
