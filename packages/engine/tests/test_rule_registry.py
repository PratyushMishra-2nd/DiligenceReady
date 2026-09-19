"""The rule registry is a switch, and switching a rule off has to mean something.

These run against the live database and skip when there isn't one, so the
suite stays runnable on a machine with no Postgres. They exist because of a
bug that shipped and was caught on screen: `run_rules` cleared only the rules
it was about to run, so disabling a rule removed it from the registry and left
its findings sitting on the dashboard.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from diligence_engine.db import connect
from diligence_engine.ingest.documents import stable_id
from diligence_engine.rules import IMPLEMENTED, run_rules


def _company_id() -> uuid.UUID | None:
    try:
        with connect() as conn:
            row = conn.execute(text("select id from companies order by name limit 1")).first()
    except Exception:  # noqa: BLE001 - no database is a skip, not a failure
        return None
    return row.id if row else None


COMPANY_ID = _company_id()

needs_data = pytest.mark.skipif(
    COMPANY_ID is None,
    reason="no ingested company; run `uv run diligence pipeline` first",
)


@needs_data
def test_stable_ids_are_reproducible() -> None:
    """Row ids are derived, so a rerun after a wipe points at the same records."""
    assert stable_id("company", "acme-industries") == stable_id("company", "acme-industries")
    assert stable_id("company", "acme-industries") != stable_id("company", "vertex-components")


@needs_data
def test_disabled_rules_leave_no_findings_behind() -> None:
    """Turning a rule off removes its findings, rather than freezing them.

    The registry is the interface for the IMS domain shipping switched off, so
    "off" has to mean the dashboard stops showing it — not that it stops being
    recomputed while the last run's output lingers.
    """
    with connect() as conn:
        enabled = {row.code for row in conn.execute(text("select code from rules where enabled"))}
        run_rules(conn, COMPANY_ID)
        present = {
            row.rule_code
            for row in conn.execute(
                text("select distinct rule_code from risks where company_id = :cid"),
                {"cid": COMPANY_ID},
            )
        }

    stale = (present & set(IMPLEMENTED)) - enabled
    assert not stale, f"findings survived for disabled rules: {sorted(stale)}"


@needs_data
def test_rerunning_the_rules_is_idempotent() -> None:
    """Reconciliation is a pure function of a period's inputs (§11)."""
    with connect() as conn:
        first = run_rules(conn, COMPANY_ID)
        second = run_rules(conn, COMPANY_ID)

    assert first.by_rule == second.by_rule
    assert first.total == second.total


@needs_data
def test_every_registry_row_is_either_implemented_or_deliberately_absent() -> None:
    """A rule the registry advertises but nothing can run would be a lie in a table."""
    with connect() as conn:
        codes = {row.code for row in conn.execute(text("select code from rules"))}

    unimplemented = codes - set(IMPLEMENTED)
    assert not unimplemented, (
        f"registry advertises rules with no implementation: {sorted(unimplemented)}"
    )


@needs_data
def test_enabled_rules_are_a_subset_of_what_can_run() -> None:
    with connect() as conn:
        enabled = {row.code for row in conn.execute(text("select code from rules where enabled"))}
    assert enabled <= set(IMPLEMENTED)
