"""Measure the engine against ground truth (Blueprint §10).

The answer key was written before the feeds existed and never enters the
ingestion path, so this is a measurement rather than an assertion.

What gets reported, and why each number is phrased the way it is:

**Recall** is unambiguous: of the planted defects, how many did the engine
find. Nothing about the scoring can flatter it.

**Precision** is reported strictly — every finding inside a scored rule that
the key does not account for counts against it — and every such finding is
listed by name so a reader can judge it rather than trust the ratio.

**Unscored rules** are named, not folded in. R8 has no planted defects, so its
findings are neither correct nor incorrect against this key, and quietly
counting them either way would be dishonest.

The phrase to use out loud is "on our seeded evaluation set". Never "our AI is
94% accurate". A synthetic set you designed yourself proves the engine works,
not that it works in production, and the hedge makes the claim stronger.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest.documents import stable_id
from diligence_engine.normalise import norm_invoice_no

# Row-level rules. Each finding is a property of one record, so the answer key
# is complete by construction: every firing should correspond to an injected
# defect, and anything else is a false positive. Precision is measured here.
ROW_RULES = ("R1", "R2", "R3", "R4", "R6")

# Period-level rules. A finding is a property of a whole month — a threshold
# crossed by the period's aggregate — so the key cannot enumerate every correct
# firing: baseline data can cross a threshold on its own without any defect
# being injected, and that is the rule working, not failing. Recall is
# measured here; precision is not, and every firing is listed instead.
PERIOD_RULES = ("R5", "R7")

SCORED_RULES = ROW_RULES + PERIOD_RULES

# Rules outside the fixed forty-one of section 10, with their own answer key.
# Scored only when the registry has them enabled: reporting a miss for a rule
# that never ran would be meaningless.
EXTENDED_ROW_RULES = ("R10", "R13")
EXTENDED_PERIOD_RULES = ("R8", "R9", "R11", "R12")


@dataclass
class DefectOutcome:
    defect_type: str
    expected_rule: str
    period: str
    amount: Decimal
    detected: bool
    risk_id: uuid.UUID | None
    target_id: uuid.UUID | None
    note: str


@dataclass
class Report:
    company: str
    planted: int = 0
    detected: int = 0
    row_findings: int = 0
    false_positives: list[dict] = field(default_factory=list)
    period_findings: list[dict] = field(default_factory=list)
    unscored: dict[str, int] = field(default_factory=dict)
    outcomes: list[DefectOutcome] = field(default_factory=list)
    extended: dict = field(default_factory=dict)

    @property
    def missed(self) -> int:
        return self.planted - self.detected

    @property
    def recall(self) -> float:
        return self.detected / self.planted if self.planted else 0.0

    @property
    def row_planted(self) -> int:
        return sum(1 for o in self.outcomes if o.expected_rule in ROW_RULES)

    @property
    def row_detected(self) -> int:
        return sum(1 for o in self.outcomes if o.expected_rule in ROW_RULES and o.detected)

    @property
    def precision(self) -> float:
        """Row-level only, where every correct firing is in the key."""
        return self.row_detected / self.row_findings if self.row_findings else 0.0

    @property
    def period_planted(self) -> int:
        return sum(1 for o in self.outcomes if o.expected_rule in PERIOD_RULES)

    @property
    def period_detected(self) -> int:
        return sum(1 for o in self.outcomes if o.expected_rule in PERIOD_RULES and o.detected)

    def as_dict(self) -> dict:
        return {
            "company": self.company,
            "disclosure": (
                "Synthetic and seeded, and disclosed as such. Ground truth lets the "
                "engine be measured instead of asserted. These figures describe a "
                "dataset we designed; they are not a production accuracy claim."
            ),
            "method": (
                "Precision is measured on row-level rules only, where a finding is a "
                "property of one record and the answer key is therefore complete: any "
                "firing outside the key is a false positive. Period-level rules compare "
                "a month's aggregate against a threshold, which baseline data can cross "
                "without any defect being injected, so recall is measured for them and "
                "every firing is listed rather than scored."
            ),
            "planted": self.planted,
            "detected": self.detected,
            "missed": self.missed,
            "recall": round(self.recall, 3),
            "row_level": {
                "rules": list(ROW_RULES),
                "planted": self.row_planted,
                "detected": self.row_detected,
                "findings": self.row_findings,
                "precision": round(self.precision, 3),
                "false_positives": self.false_positives,
            },
            "period_level": {
                "rules": list(PERIOD_RULES),
                "planted": self.period_planted,
                "detected": self.period_detected,
                "all_findings": self.period_findings,
            },
            "extended": self.extended,
            "unscored_rules": self.unscored,
            "by_defect_type": _tally(self.outcomes),
            "missed_detail": [
                {
                    "defect_type": outcome.defect_type,
                    "expected_rule": outcome.expected_rule,
                    "period": outcome.period,
                    "amount": str(outcome.amount),
                    "note": outcome.note,
                }
                for outcome in self.outcomes
                if not outcome.detected
            ],
        }


def _tally(outcomes: list[DefectOutcome]) -> dict[str, dict[str, int]]:
    tally: dict[str, dict[str, int]] = {}
    for outcome in outcomes:
        bucket = tally.setdefault(
            outcome.defect_type, {"planted": 0, "detected": 0, "rule": outcome.expected_rule}
        )
        bucket["planted"] += 1
        if outcome.detected:
            bucket["detected"] += 1
    return tally


def _load_risks(conn: Connection, company_id: uuid.UUID) -> dict[tuple[str, str], uuid.UUID]:
    """Every risk, indexed by (period, risk_key)."""
    return {
        (row.period, row.risk_key): row.id
        for row in conn.execute(
            text("select id, period, risk_key, rule_code from risks where company_id = :cid"),
            {"cid": company_id},
        )
    }


def _risks_by_rule(conn: Connection, company_id: uuid.UUID) -> dict[str, list]:
    grouped: dict[str, list] = {}
    for row in conn.execute(
        text(
            "select id, period, risk_key, rule_code, headline_amount "
            "from risks where company_id = :cid order by rule_code, period, risk_key"
        ),
        {"cid": company_id},
    ):
        grouped.setdefault(row.rule_code, []).append(row)
    return grouped


def _expected_key(defect: dict) -> tuple[str, ...]:
    """The risk_key a correct engine would produce for this defect."""
    rule = defect["expected_rule"]
    key = defect["natural_key"]
    if rule in ("R1", "R2", "R3", "R4"):
        return (f"{rule}:{key['supplier_gstin']}:{key['number']}",)
    if rule == "R6":
        return (f"R6:{key['ref_no']}",)
    if rule in EXTENDED_ROW_RULES:
        # The answer key carries the document number as the feed spells it;
        # the engine keys risks on the normalised form.
        return (f"{rule}:{key['supplier_gstin']}:{norm_invoice_no(key['number'])}",)
    if rule == "R5":
        return ("R5:bank_books_variance",)
    if rule == "R7":
        return ("R7:customer_concentration",)
    if rule == "R8":
        return ("R8:receivables_ageing",)
    raise KeyError(rule)


def _expected_periods(defect: dict) -> list[str]:
    key = defect["natural_key"]
    periods = [defect["period"]]
    landing = key.get("landing_period")
    if landing and landing not in periods:
        periods.append(landing)
    return periods


def _resolve_target(conn: Connection, company_id: uuid.UUID, defect: dict) -> uuid.UUID | None:
    key = defect["natural_key"]
    if defect["target_kind"] == "purchase_invoice":
        return conn.execute(
            text(
                "select id from purchase_invoices where company_id = :cid "
                "and supplier_gstin = :gstin and norm_invoice_no = :number "
                "and period = :period order by source_row limit 1"
            ),
            {
                "cid": company_id,
                "gstin": key["supplier_gstin"],
                "number": key["number"],
                "period": defect["period"],
            },
        ).scalar()
    if defect["target_kind"] == "bank_txn":
        return conn.execute(
            text(
                "select id from bank_txns where company_id = :cid and ref_no = :ref "
                "order by source_row limit 1"
            ),
            {"cid": company_id, "ref": key.get("ref_no")},
        ).scalar()
    return None


def evaluate(
    conn: Connection, company_id: uuid.UUID, company_name: str, answers_path: Path
) -> Report:
    key = json.loads(answers_path.read_text(encoding="utf-8"))
    defects = key["defects"]

    risk_index = _load_risks(conn, company_id)
    by_rule = _risks_by_rule(conn, company_id)
    report = Report(company=company_name, planted=len(defects))

    matched_risk_ids: set[uuid.UUID] = set()
    rows: list[dict] = []

    for defect in defects:
        candidates = _expected_key(defect)
        periods = _expected_periods(defect)

        # Credit the defect's whole footprint, not just the first hit. A
        # displaced payment legitimately surfaces in two consecutive periods;
        # crediting one and calling the other a false positive would penalise
        # the engine for being right twice.
        footprint = [
            risk_index[(period, candidate)]
            for period in periods
            for candidate in candidates
            if (period, candidate) in risk_index
        ]
        risk_id = footprint[0] if footprint else None
        matched_risk_ids.update(footprint)

        target_id = _resolve_target(conn, company_id, defect)
        detected = risk_id is not None
        if detected:
            report.detected += 1

        report.outcomes.append(
            DefectOutcome(
                defect_type=defect["defect_type"],
                expected_rule=defect["expected_rule"],
                period=defect["period"],
                amount=Decimal(defect["amount"]),
                detected=detected,
                risk_id=risk_id,
                target_id=target_id,
                note=defect["note"],
            )
        )
        rows.append(
            {
                "id": stable_id(
                    "defect",
                    company_id,
                    defect["expected_rule"],
                    defect["period"],
                    json.dumps(defect["natural_key"], sort_keys=True),
                ),
                "company_id": company_id,
                "period": defect["period"],
                "defect_type": defect["defect_type"],
                "target_type": defect["target_kind"],
                "target_id": target_id,
                "amount": Decimal(defect["amount"]),
                "detected": detected,
                "detected_by_risk_id": risk_id,
            }
        )

    for rule_code, risks in by_rule.items():
        if rule_code in ROW_RULES:
            report.row_findings += len(risks)
            report.false_positives.extend(
                {
                    "rule": rule_code,
                    "period": risk.period,
                    "risk_key": risk.risk_key,
                    "headline_amount": str(risk.headline_amount),
                }
                for risk in risks
                if risk.id not in matched_risk_ids
            )
        elif rule_code in PERIOD_RULES:
            report.period_findings.extend(
                {
                    "rule": rule_code,
                    "period": risk.period,
                    "headline_amount": str(risk.headline_amount),
                    "planted": risk.id in matched_risk_ids,
                }
                for risk in risks
            )
        elif rule_code in EXTENDED_ROW_RULES or rule_code in EXTENDED_PERIOD_RULES:
            # Covered by the extended key below, not unscored.
            continue
        else:
            report.unscored[rule_code] = len(risks)

    report.extended = _score_extended(conn, company_id, key, risk_index, by_rule)
    _persist(conn, company_id, rows)
    return report


def _enabled_rules(conn: Connection) -> set[str]:
    return {row.code for row in conn.execute(text("select code from rules where enabled")).all()}


def _score_extended(
    conn: Connection,
    company_id: uuid.UUID,
    key: dict,
    risk_index: dict[tuple[str, str], uuid.UUID],
    by_rule: dict[str, list],
) -> dict:
    """The IMS and Sec 17(5) answer key, scored only where the rule ran.

    Kept apart from the forty-one on purpose. That number is quoted on a
    slide, and a domain that can be switched on and off must not be able to
    move it.
    """
    section = key.get("extended") or {}
    defects = section.get("defects", [])
    if not defects:
        return {}

    enabled = _enabled_rules(conn)
    matched: set[uuid.UUID] = set()
    outcomes: dict[str, dict[str, int]] = {}
    skipped: set[str] = set()

    for defect in defects:
        rule = defect["expected_rule"]
        bucket = outcomes.setdefault(
            defect["defect_type"], {"planted": 0, "detected": 0, "rule": rule}
        )
        bucket["planted"] += 1

        if rule not in enabled:
            skipped.add(rule)
            continue

        found = None
        for candidate in _expected_key(defect):
            found = risk_index.get((defect["period"], candidate))
            if found is not None:
                break
        if found is not None:
            matched.add(found)
            bucket["detected"] += 1

    row_findings = 0
    false_positives = []
    for rule_code in EXTENDED_ROW_RULES:
        if rule_code not in enabled:
            continue
        for risk in by_rule.get(rule_code, []):
            row_findings += 1
            if risk.id not in matched:
                false_positives.append(
                    {
                        "rule": rule_code,
                        "period": risk.period,
                        "risk_key": risk.risk_key,
                        "headline_amount": str(risk.headline_amount),
                    }
                )

    planted = sum(bucket["planted"] for bucket in outcomes.values())
    detected = sum(bucket["detected"] for bucket in outcomes.values())
    scored_planted = sum(
        bucket["planted"] for bucket in outcomes.values() if bucket["rule"] in enabled
    )

    # Precision compares like with like. `detected` includes period-level
    # rules, whose findings are deliberately not in `row_findings`, so
    # dividing one by the other produced a ratio above 1.0 the moment R8 was
    # given a case. Only row-level detections belong in this numerator.
    row_detected = sum(
        bucket["detected"] for bucket in outcomes.values() if bucket["rule"] in EXTENDED_ROW_RULES
    )

    return {
        "note": section.get("note", ""),
        "planted": planted,
        "scored_planted": scored_planted,
        "detected": detected,
        "recall": round(detected / scored_planted, 3) if scored_planted else None,
        "row_findings": row_findings,
        "row_detected": row_detected,
        "precision": round(row_detected / row_findings, 3) if row_findings else None,
        "false_positives": false_positives,
        "rules_not_enabled": sorted(skipped),
        "period_rule_findings": {
            rule_code: len(by_rule.get(rule_code, []))
            for rule_code in EXTENDED_PERIOD_RULES
            if rule_code in enabled
        },
        "by_defect_type": outcomes,
    }


def _persist(conn: Connection, company_id: uuid.UUID, rows: list[dict]) -> None:
    conn.execute(text("delete from planted_defects where company_id = :cid"), {"cid": company_id})
    if not rows:
        return
    conn.execute(
        text(
            "insert into planted_defects "
            "(id, company_id, period, defect_type, target_type, target_id, amount, "
            " detected, detected_by_risk_id) "
            "values (:id, :company_id, :period, :defect_type, :target_type, :target_id, "
            ":amount, :detected, :detected_by_risk_id)"
        ),
        rows,
    )
