"""Run the enabled rules over a company, period by period.

A rule that is disabled in the registry does not run. That is how the IMS
domain (R9-R13) and the Rule 37A reclaim (R4b) sit in this build: present in
the schema and the registry, switched off until a practising CA has reviewed
the GST rule set, which §15 names as the one outstanding dependency. Nothing
about turning them on requires a code change.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.rules import bank, commercial, gst, ims
from diligence_engine.rules.base import (
    RiskDraft,
    RuleSpec,
    load_rules,
    retire_absent_risks,
    write_risks,
)

# Every rule this build can run. A code here still only runs if the registry
# says it is enabled, which is how the IMS domain ships written and switched
# off pending the CA review section 15 names as the outstanding dependency.
IMPLEMENTED = (
    "R1",
    "R2",
    "R3",
    "R4",
    "R4b",
    "R5",
    "R6",
    "R7",
    "R8",
    "R9",
    "R10",
    "R11",
    "R12",
    "R13",
)


@dataclass
class RuleRun:
    company_id: uuid.UUID
    periods: list[str]
    by_rule: dict[str, int] = field(default_factory=dict)
    by_severity: dict[str, int] = field(default_factory=dict)
    skipped: list[str] = field(default_factory=list)
    # Findings that existed before this run and no longer apply.
    retired: int = 0

    @property
    def total(self) -> int:
        return sum(self.by_rule.values())


def _periods(conn: Connection, company_id: uuid.UUID) -> list[str]:
    return [
        row.period
        for row in conn.execute(
            text("select period from periods where company_id = :company_id order by period"),
            {"company_id": company_id},
        )
    ]


def _dispatch(
    code: str,
    spec: RuleSpec,
    conn: Connection,
    company_id: uuid.UUID,
    period: str,
    *,
    latest_period: str,
    today: date,
) -> list[RiskDraft]:
    if code == "R1":
        return gst.rule_r1_itc_unmatched(
            conn, company_id, period, spec, latest_period=latest_period, today=today
        )
    if code == "R2":
        return gst.rule_r2_amount_mismatch(conn, company_id, period, spec)
    if code == "R3":
        return gst.rule_r3_duplicate(conn, company_id, period, spec)
    if code == "R4":
        return gst.rule_r4_reversal_37a(conn, company_id, period, spec, today=today)
    if code == "R5":
        return bank.rule_r5_variance(conn, company_id, period, spec)
    if code == "R6":
        return bank.rule_r6_unidentified_deposit(conn, company_id, period, spec)
    if code == "R7":
        return commercial.rule_r7_concentration(conn, company_id, period, spec)
    if code == "R8":
        return commercial.rule_r8_receivables_ageing(conn, company_id, period, spec)
    if code == "R4b":
        return ims.rule_r4b_reversal_reclaimable(conn, company_id, period, spec, today=today)
    if code == "R9":
        return ims.rule_r9_action_required(conn, company_id, period, spec)
    if code == "R10":
        return ims.rule_r10_recommend_reject(conn, company_id, period, spec)
    if code == "R11":
        return ims.rule_r11_gstr2b_stale(conn, company_id, period, spec)
    if code == "R12":
        return ims.rule_r12_filing_chain_blocked(conn, company_id, period, spec)
    if code == "R13":
        return ims.rule_r13_blocked_credit(conn, company_id, period, spec)
    raise KeyError(code)


def run_rules(conn: Connection, company_id: uuid.UUID, *, today: date | None = None) -> RuleRun:
    """Recompute every enabled rule for every period. Idempotent."""
    registry = load_rules(conn)
    periods = _periods(conn, company_id)
    run = RuleRun(company_id=company_id, periods=periods)
    if not periods:
        return run

    latest_period = periods[-1]
    as_of = today or date.today()

    runnable = [code for code in IMPLEMENTED if code in registry and registry[code].enabled]
    run.skipped = [
        code
        for code, spec in sorted(registry.items())
        if not spec.enabled or code not in IMPLEMENTED
    ]

    # Findings produced by this run, as "period|risk_key". Anything this
    # build can produce but did not is removed at the end.
    produced: set[str] = set()

    for period in periods:
        for code in runnable:
            drafts = _dispatch(
                code,
                registry[code],
                conn,
                company_id,
                period,
                latest_period=latest_period,
                today=as_of,
            )
            if not drafts:
                continue
            write_risks(conn, company_id, period, drafts)
            run.by_rule[code] = run.by_rule.get(code, 0) + len(drafts)
            for draft in drafts:
                produced.add(f"{period}|{draft.risk_key}")
                run.by_severity[draft.severity] = run.by_severity.get(draft.severity, 0) + 1

    run.retired = retire_absent_risks(conn, company_id, list(IMPLEMENTED), produced)
    return run
