"""Ingestion orchestration for one company's feed directory.

Order is not arbitrary. GSTR-2B is read first because it is the only feed that
carries a GSTIN next to a legal name, and every later resolution leans on the
party rows it creates. The purchase register then arrives with ledger names
and no GSTIN and is stitched onto those parties; the bank arrives with neither
and is stitched onto whatever the first two established.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.engine import Connection

from diligence_engine.ingest import documents, feeds
from diligence_engine.ingest.columns import UnreadableExport
from diligence_engine.ingest.parties import PartyResolver, load_resolver
from diligence_engine.ingest.upload import periods_in_csv

_GSTR2B_FILENAME = re.compile(r"^gstr2b_(\d{4})_(\d{2})\.json$")
_IMS_FILENAME = re.compile(r"^ims_(\d{4})_(\d{2})\.json$")

# The firm the seeded demo companies belong to. It is a *default for the
# seeder only* — `ingest_company` takes the firm as an argument, because a
# constant here would silently attach every firm's clients to one tenant.
# That is a cross-tenant leak created by ingestion, below the access-control
# layer everyone audits, where `company_or_404` would then correctly hide a
# firm's own client from it.
DEMO_FIRM_NAME = "Mehta & Associates"


@dataclass
class CompanyIngest:
    company_id: uuid.UUID
    slug: str
    periods: list[str]
    results: list[feeds.IngestResult]

    @property
    def total_rows(self) -> int:
        return sum(result.rows for result in self.results)


def _periods_from_feeds(feed_dir: Path) -> list[str]:
    """Every period any feed touches, read from the files themselves.

    This used to glob `gstr2b_*.json` alone, and the four CSV parsers drop
    any row whose period is not in the resulting set. A client whose bank
    statement or purchase register covered a month with no 2B download —
    routine, since 2B lags and a CA often pulls only some months — lost every
    row in that month with no error and no row-count discrepancy, while the
    coverage percentage and the variance were computed over the truncated
    remainder and looked healthy.

    `upload.py` already scanned each file's own dates; this makes the CLI
    path agree with it.
    """
    found: set[str] = set()

    for path in feed_dir.glob("gstr2b_*.json"):
        match = _GSTR2B_FILENAME.match(path.name)
        if match:
            found.add(f"{match.group(1)}-{match.group(2)}")
    for path in feed_dir.glob("ims_*.json"):
        match = _IMS_FILENAME.match(path.name)
        if match:
            found.add(f"{match.group(1)}-{match.group(2)}")

    for filename, kind in (
        ("tally_purchase_register.csv", "purchase_register"),
        ("tally_sales_register.csv", "sales_ledger"),
        ("tally_ledger_entries.csv", "ledger"),
        ("bank_statement.csv", "bank_stmt"),
    ):
        path = feed_dir / filename
        if not path.exists():
            continue
        try:
            found.update(periods_in_csv(path, kind))
        except UnreadableExport:
            # A file this ingester cannot read will fail loudly in its own
            # parser, with a message naming the columns. Not here.
            continue

    return sorted(found)


def ingest_company(
    conn: Connection,
    *,
    name: str,
    slug: str,
    gstin: str,
    pan: str,
    fy_start: object,
    feed_dir: Path,
    firm_name: str = DEMO_FIRM_NAME,
) -> CompanyIngest:
    firm_id = documents.ensure_firm(conn, firm_name)
    company_id = documents.ensure_company(
        conn, firm_id, name=name, slug=slug, gstin=gstin, pan=pan, fy_start=fy_start
    )

    periods = _periods_from_feeds(feed_dir)
    documents.ensure_periods(conn, company_id, periods)
    known = set(periods)

    resolver: PartyResolver = load_resolver(conn, company_id)
    results: list[feeds.IngestResult] = []

    # 1. GSTR-2B: the only feed carrying GSTIN and legal name together.
    for path in sorted(feed_dir.glob("gstr2b_*.json")):
        match = _GSTR2B_FILENAME.match(path.name)
        if not match:
            continue
        period = f"{match.group(1)}-{match.group(2)}"
        document = documents.register_document(
            conn, company_id, slug, path, kind="gstr2b", period=period
        )
        if document.already_present:
            results.append(feeds.IngestResult("gstr2b", document.filename, rows=0, skipped=True))
            continue
        result = ingest_one_gstr2b(conn, company_id, document, path, period, resolver)
        documents.set_row_count(conn, document.id, result.rows)
        documents.mark_gstr2b_generated(conn, company_id, period)
        results.append(result)

    # 2. The IMS dashboard, which is the supplier's filing as the portal shows
    #    it, before 2B settles. Ingested before the register so recommendations
    #    have something to match against.
    for path in sorted(feed_dir.glob("ims_*.json")):
        match = _IMS_FILENAME.match(path.name)
        if not match:
            continue
        period = f"{match.group(1)}-{match.group(2)}"
        document = documents.register_document(
            conn, company_id, slug, path, kind="ims", period=period
        )
        if document.already_present:
            results.append(feeds.IngestResult("ims", document.filename, rows=0, skipped=True))
            continue
        result = feeds.ingest_ims(conn, company_id, document, path, period)
        documents.set_row_count(conn, document.id, result.rows)
        results.append(result)

    # 3. The purchase register: ledger names, no GSTIN.
    results.append(
        _ingest_csv(
            conn,
            company_id,
            slug,
            feed_dir / "tally_purchase_register.csv",
            kind="purchase_register",
            parser=lambda document, path: feeds.ingest_purchase_register(
                conn, company_id, document, path, resolver, known
            ),
        )
    )

    # 4. Sales, which R7 and R8 read.
    results.append(
        _ingest_csv(
            conn,
            company_id,
            slug,
            feed_dir / "tally_sales_register.csv",
            kind="sales_ledger",
            parser=lambda document, path: feeds.ingest_sales_register(
                conn, company_id, document, path, resolver, known
            ),
        )
    )

    # 5. Receipt and payment vouchers: the books' side of every movement.
    results.append(
        _ingest_csv(
            conn,
            company_id,
            slug,
            feed_dir / "tally_ledger_entries.csv",
            kind="ledger",
            parser=lambda document, path: feeds.ingest_ledger_entries(
                conn, company_id, document, path, resolver, known
            ),
        )
    )

    # 6. The bank, which knows no names at all.
    results.append(
        _ingest_csv(
            conn,
            company_id,
            slug,
            feed_dir / "bank_statement.csv",
            kind="bank_stmt",
            parser=lambda document, path: feeds.ingest_bank_statement(
                conn, company_id, document, path, resolver, known
            ),
        )
    )

    return CompanyIngest(
        company_id=company_id,
        slug=slug,
        periods=periods,
        results=[result for result in results if result is not None],
    )


def ingest_one_gstr2b(
    conn: Connection,
    company_id: uuid.UUID,
    document: documents.DocumentRef,
    path: Path,
    period: str,
    resolver: PartyResolver,
) -> feeds.IngestResult:
    return feeds.ingest_gstr2b(conn, company_id, document, path, period, resolver)


def _ingest_csv(
    conn: Connection,
    company_id: uuid.UUID,
    slug: str,
    path: Path,
    *,
    kind: str,
    parser,
) -> feeds.IngestResult:
    if not path.exists():
        return feeds.IngestResult(kind, path.name, rows=0, skipped=True)

    document = documents.register_document(conn, company_id, slug, path, kind=kind, period=None)
    if document.already_present:
        return feeds.IngestResult(kind, document.filename, rows=0, skipped=True)

    result = parser(document, path)
    documents.set_row_count(conn, document.id, result.rows)
    return result
