"""Rule plumbing: what a rule produces, and how it is written down.

Every rule writes four things beside its number, and none of them is optional
(Blueprint §09):

    metrics      every input the calculation consumed
    calculation  the arithmetic as a person would read it back
    rule_text    the threshold that was crossed
    evidence     rows pointing at the records and the file lines behind it

The model is invoked last, elsewhere, and handed the finished risk object to
write `explanation`. At that point it has never seen a document and cannot
produce a number. That separation is the product's central claim, so the
engine package imports no model client at all — the boundary is structural,
not a convention someone has to remember.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest.documents import stable_id


@dataclass(frozen=True)
class Evidence:
    """A pointer from a risk to the record and the file line that produced it."""

    record_type: str
    record_id: uuid.UUID
    document_id: uuid.UUID | None = None
    source_row: int | None = None
    source_page: int | None = None
    note: str | None = None


@dataclass
class RiskDraft:
    rule_code: str
    risk_key: str
    severity: str
    metrics: dict
    calculation: str
    rule_text: str
    headline_amount: Decimal | None = None
    headline_pct: Decimal | None = None
    evidence: list[Evidence] = field(default_factory=list)


def document_key(rule_code: str, supplier: str | None, number: str | None, row_id) -> str:
    """A risk key that stays unique when the supplier or the number is missing.

    These were f-strings straight over the columns, so a NULL GSTIN rendered
    as the literal "None". Two unresolved suppliers in one period produced
    the same key, and `unique (company_id, period, risk_key)` made the second
    upsert overwrite the first in place — one finding shown where there were
    two, and the sum driving ITC at risk understated by a whole invoice.

    The row id is a uuid5 of the document and line number, so falling back to
    it is stable across reruns rather than random.
    """
    return f"{rule_code}:{supplier or f'no-gstin-{row_id}'}:{number or f'no-number-{row_id}'}"


@dataclass(frozen=True)
class RuleSpec:
    code: str
    domain: str
    title: str
    severity_fn: str
    thresholds: dict
    enabled: bool


def load_rules(conn: Connection) -> dict[str, RuleSpec]:
    rows = conn.execute(
        text("select code, domain, title, severity_fn, thresholds, enabled from rules")
    ).all()
    return {
        row.code: RuleSpec(
            code=row.code,
            domain=row.domain,
            title=row.title,
            severity_fn=row.severity_fn,
            thresholds=row.thresholds,
            enabled=row.enabled,
        )
        for row in rows
    }


_RISK_UPSERT = """
insert into risks (
    id, company_id, period, rule_code, risk_key, severity,
    headline_amount, headline_pct, metrics, calculation, rule_text
) values (
    :id, :company_id, :period, :rule_code, :risk_key, :severity,
    :headline_amount, :headline_pct, cast(:metrics as jsonb), :calculation, :rule_text
)
on conflict (company_id, period, risk_key) do update set
    severity        = excluded.severity,
    headline_amount = excluded.headline_amount,
    headline_pct    = excluded.headline_pct,
    metrics         = excluded.metrics,
    calculation     = excluded.calculation,
    rule_text       = excluded.rule_text,
    computed_at     = now()
returning id
"""

_EVIDENCE_INSERT = """
insert into risk_evidence
    (id, risk_id, record_type, record_id, document_id, source_row, source_page, note)
values
    (:id, :risk_id, :record_type, :record_id, :document_id, :source_row, :source_page, :note)
"""


def write_risks(
    conn: Connection, company_id: uuid.UUID, period: str, drafts: list[RiskDraft]
) -> int:
    """Upsert drafts and replace their evidence. Rerunning changes nothing."""
    for draft in drafts:
        risk_id = conn.execute(
            text(_RISK_UPSERT),
            {
                "id": stable_id("risk", company_id, period, draft.risk_key),
                "company_id": company_id,
                "period": period,
                "rule_code": draft.rule_code,
                "risk_key": draft.risk_key,
                "severity": draft.severity,
                "headline_amount": draft.headline_amount,
                "headline_pct": draft.headline_pct,
                "metrics": json.dumps(draft.metrics, default=str),
                "calculation": draft.calculation,
                "rule_text": draft.rule_text,
            },
        ).scalar_one()

        conn.execute(
            text("delete from risk_evidence where risk_id = :risk_id"), {"risk_id": risk_id}
        )
        if draft.evidence:
            conn.execute(
                text(_EVIDENCE_INSERT),
                [
                    {
                        "id": stable_id("evidence", risk_id, index),
                        "risk_id": risk_id,
                        "record_type": item.record_type,
                        "record_id": item.record_id,
                        "document_id": item.document_id,
                        "source_row": item.source_row,
                        "source_page": item.source_page,
                        "note": item.note,
                    }
                    for index, item in enumerate(draft.evidence)
                ],
            )

    return len(drafts)


def retire_absent_risks(
    conn: Connection,
    company_id: uuid.UUID,
    rule_codes: list[str],
    produced: set[str],
) -> int:
    """Remove findings this build can produce but this run did not.

    This replaces a blanket delete-then-reinsert, which was quietly
    destructive: `status` and `explanation` live on the risk row, the upsert
    in `write_risks` deliberately preserves them, and clearing the table
    first meant the conflict branch could never fire. A CA marking a finding
    resolved and an analyst then running `diligence rules` lost the decision,
    the generated prose and the evidence rows, with nothing journalled.

    So findings that still exist are upserted in place and keep their
    decision; only the ones that have genuinely gone away are removed. A
    defect the client fixed disappears, which is the behaviour the blanket
    delete was reaching for.

    `produced` holds "period|risk_key" for everything this run wrote.
    """
    result = conn.execute(
        text(
            "delete from risks "
            "where company_id = :company_id "
            "  and rule_code = any(:codes) "
            "  and (period || '|' || risk_key) <> all(:produced)"
        ),
        {
            "company_id": company_id,
            "codes": rule_codes,
            "produced": sorted(produced) or [""],
        },
    )
    return result.rowcount or 0
