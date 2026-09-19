"""Tenancy and provenance: firms, companies, periods, documents.

Row ids are uuid5, derived from the document and the row number rather than
drawn at random. Two consequences worth the small cost: a rerun after a wipe
reproduces the same ids, and a piece of evidence keeps pointing at the same
record across environments.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest import storage

# A fixed namespace so ids are stable across machines and reruns.
NAMESPACE = uuid.UUID("6f9b2b1e-7c2a-5d3f-8a4b-1c2d3e4f5a6b")


def stable_id(*parts: object) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, ":".join(str(part) for part in parts))


@dataclass(frozen=True)
class DocumentRef:
    id: uuid.UUID
    filename: str
    sha256: str
    already_present: bool


def ensure_firm(conn: Connection, name: str) -> uuid.UUID:
    firm_id = stable_id("firm", name)
    conn.execute(
        text("insert into firms (id, name) values (:id, :name) on conflict (id) do nothing"),
        {"id": firm_id, "name": name},
    )
    return firm_id


def ensure_company(
    conn: Connection,
    firm_id: uuid.UUID,
    *,
    name: str,
    slug: str,
    gstin: str,
    pan: str,
    fy_start: object,
) -> uuid.UUID:
    company_id = stable_id("company", slug)
    conn.execute(
        text(
            "insert into companies (id, firm_id, name, gstin, pan, fy_start) "
            "values (:id, :firm_id, :name, :gstin, :pan, :fy_start) "
            "on conflict (id) do update set name = excluded.name, gstin = excluded.gstin"
        ),
        {
            "id": company_id,
            "firm_id": firm_id,
            "name": name,
            "gstin": gstin,
            "pan": pan,
            "fy_start": fy_start,
        },
    )
    return company_id


def ensure_periods(conn: Connection, company_id: uuid.UUID, periods: list[str]) -> None:
    """Every fact table points at a period, so periods must exist before rows do."""
    conn.execute(
        text(
            "insert into periods (id, company_id, period) "
            "values (:id, :company_id, :period) "
            "on conflict (company_id, period) do nothing"
        ),
        [
            {
                "id": stable_id("period", company_id, period),
                "company_id": company_id,
                "period": period,
            }
            for period in periods
        ],
    )


def mark_gstr2b_generated(conn: Connection, company_id: uuid.UUID, period: str) -> None:
    """Record that this period's 2B has actually arrived.

    §15.3: 2B is sequential — a period generates only once the prior period's
    GSTR-3B is filed. A period with no 2B is not a period with nothing wrong;
    it is a period whose numbers are unknowable. R12 reads this.
    """
    conn.execute(
        text(
            "update periods set gstr2b_generated_at = now() "
            "where company_id = :company_id and period = :period"
        ),
        {"company_id": company_id, "period": period},
    )


def register_document(
    conn: Connection,
    company_id: uuid.UUID,
    company_slug: str,
    path: Path,
    *,
    kind: str,
    period: str | None,
    row_count: int | None = None,
) -> DocumentRef:
    """Store the bytes and record the document. Idempotent on (company, sha256)."""
    sha256 = storage.sha256_of(path)
    key = storage.storage_key(company_slug, sha256, path.name)
    storage.put(path, key)

    existing = conn.execute(
        text("select id from documents where company_id = :company_id and sha256 = :sha256"),
        {"company_id": company_id, "sha256": sha256},
    ).first()
    if existing is not None:
        return DocumentRef(id=existing.id, filename=path.name, sha256=sha256, already_present=True)

    document_id = stable_id("document", company_id, sha256)
    conn.execute(
        text(
            "insert into documents "
            "(id, company_id, period, kind, filename, storage_key, sha256, row_count) "
            "values (:id, :company_id, :period, :kind, :filename, :storage_key, "
            ":sha256, :row_count)"
        ),
        {
            "id": document_id,
            "company_id": company_id,
            "period": period,
            "kind": kind,
            "filename": path.name,
            "storage_key": key,
            "sha256": sha256,
            "row_count": row_count,
        },
    )
    return DocumentRef(id=document_id, filename=path.name, sha256=sha256, already_present=False)


def set_row_count(conn: Connection, document_id: uuid.UUID, row_count: int) -> None:
    conn.execute(
        text("update documents set row_count = :row_count where id = :id"),
        {"id": document_id, "row_count": row_count},
    )
