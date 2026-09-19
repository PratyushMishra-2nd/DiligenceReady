"""Every audit action the code writes must be one the database accepts.

`audit_log.action` is an allow-list, not free text, and that is the right
design: a typo'd action name is a line nobody can search for afterwards, and
an audit trail you cannot query is decoration.

The cost is that adding an auditable event means adding a migration. That
cost is paid at the wrong moment without this test — the /ask route shipped
with its audit line written, and the CHECK rejected it on the first real
request, turning a 200 into a 500 in the browser.

So the two lists are compared here instead: the action literals the source
actually passes to `auth.record`, and the values the live constraint permits.
"""

from __future__ import annotations

import re

import pytest
from sqlalchemy import text

from diligence_engine.config import project_root
from diligence_engine.db import connect

# `action="document_uploaded",` as it appears in a call to auth.record.
_ACTION_LITERAL = re.compile(r"""\baction=["']([a-z_]+)["']""")

# Directories whose Python actually writes audit lines. The seedgen and the
# tests do not, and scanning them would only add false positives.
_SOURCE_DIRS = ("packages/engine/src", "apps/api/src")


def _database_ready() -> bool:
    try:
        with connect() as conn:
            conn.execute(text("select 1 from audit_log limit 1"))
        return True
    except Exception:  # noqa: BLE001 - no database is a skip, not a failure
        return False


needs_database = pytest.mark.skipif(
    not _database_ready(), reason="no database; run `uv run diligence migrate` first"
)


def actions_in_source() -> set[str]:
    root = project_root()
    found: set[str] = set()
    for directory in _SOURCE_DIRS:
        for path in (root / directory).rglob("*.py"):
            found |= set(_ACTION_LITERAL.findall(path.read_text(encoding="utf-8")))
    return found


def actions_the_database_allows() -> set[str]:
    """Read the values straight out of the live CHECK constraint.

    Parsed from the constraint rather than duplicated as a Python list,
    because a duplicated list is a third place to forget to update.
    """
    with connect() as conn:
        definition = conn.execute(
            text(
                "select pg_get_constraintdef(oid) from pg_constraint "
                "where conname = 'audit_action_vals'"
            )
        ).scalar_one()
    return set(re.findall(r"'([a-z_]+)'", definition))


@needs_database
def test_every_action_the_code_writes_is_one_the_database_accepts() -> None:
    written = actions_in_source()
    allowed = actions_the_database_allows()

    assert written, "found no action literals at all; the regex has drifted"

    unlisted = written - allowed
    assert not unlisted, (
        f"these audit actions are written by the code but rejected by the "
        f"CHECK constraint: {sorted(unlisted)}. Add a migration that extends "
        f"audit_action_vals, or the first request that triggers one is a 500."
    )


@needs_database
def test_the_action_scanner_sees_the_actions_we_know_exist() -> None:
    """Guards the guard.

    A regex that silently stops matching turns the test above into one that
    always passes. These four are spread across three modules and are not
    going away.
    """
    written = actions_in_source()
    for action in ("login", "login_failed", "document_uploaded", "ledger_question"):
        assert action in written, f"the scanner no longer finds {action!r}"


@needs_database
def test_the_allow_list_is_not_wider_than_the_code_needs() -> None:
    """An action nobody writes is either a plan or a leftover.

    Not a failure — `ingest_run`, `reconcile_run` and `rules_run` are
    reserved for the pipeline stages and are legitimately unused today. This
    reports them so the gap stays deliberate rather than forgotten.
    """
    unused = actions_the_database_allows() - actions_in_source()
    assert unused <= {"ingest_run", "reconcile_run", "rules_run", "ims_action_recorded"}, (
        f"unexpected unused audit actions: {sorted(unused)}"
    )
