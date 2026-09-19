"""The pipeline, as Lambda stages a Step Functions state machine can drive.

"Continuous reconciliation" is the product's first word and it has to mean
something operationally. It means this: every night, for every client
company, the engine recomputes — without anybody opening a laptop.

The subtle part is *why* a nightly run finds anything when no new file was
uploaded. It is not that documents arrived. It is that the government's copy
changed:

*   A supplier files GSTR-1 on the 13th for an invoice dated the 2nd. The
    invoice appears in next month's GSTR-2B, and an invoice the engine
    called unmatched yesterday is matched today.
*   GSTN recomputes Rule 37A reversals as suppliers file or fail to file
    their GSTR-3B.
*   An IMS record nobody actioned moves one day closer to being deemed
    accepted, and the Sec 16(4) window closes one day further.

A monthly reconciliation cannot see any of that until it is too late to act
on it. That is the whole argument for the schedule, and it is why `ingest`
is *not* one of these stages: ingestion happens when a CA uploads an export
or a Tally client pushes one. The nightly job re-reads what is already
there.

Why stages rather than one function:

*   `reconcile` is CPU over the match table, `rules` is a sweep of SQL.
    They fail for different reasons and want different retries, and a state
    machine that can retry only the failed stage beats one that redoes the
    month.
*   Step Functions keeps an execution history per stage, which is the
    operational answer to "why does this client's August look wrong" — a
    question a CA firm will ask.
*   The 15-minute Lambda ceiling applies per stage, not per pipeline.

The handler is deliberately thin. It parses an event, calls the same engine
function the CLI calls, and returns a JSON-serialisable summary for the next
stage. There is no reconciliation logic here and there must not be: a second
implementation that runs only in production is one nobody tests.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

from sqlalchemy import text

from diligence_engine import migrate as migrations
from diligence_engine.config import settings
from diligence_engine.db import connect
from diligence_engine.ingest.documents import stable_id
from diligence_engine.matching import reconcile_bank, reconcile_gst
from diligence_engine.matching.ims import recommend as recommend_ims
from diligence_engine.rules import run_rules

#: `migrate` runs on deploy, `demo-seed` once by hand; the other three
#: are the nightly sweep.
STAGES = ("migrate", "demo-seed", "reconcile", "ims", "rules")


class UnknownStage(ValueError):
    """The event named a stage this handler does not run."""


def _companies(slug: str | None) -> list[tuple[str, uuid.UUID]]:
    """Every company, or the one named. Returns (display name, id) pairs.

    Read out of the database rather than out of the seed generator's list.
    A deployed pipeline reconciles the firm's real clients, and a nightly job
    that only knows about two synthetic companies is a nightly job that does
    nothing.

    `companies` stores no slug: the slug is the seed for `stable_id`, which
    derives the uuid, and only the uuid is kept. So a named company is
    resolved by hashing the slug back to its id, and the summary reports the
    company's name, which is what a person reading an execution history
    wants to see anyway.
    """
    with connect() as conn:
        if slug:
            identifier = stable_id("company", slug)
            row = conn.execute(
                text("select id, name from companies where id = :id"), {"id": identifier}
            ).first()
            if row is None:
                raise UnknownStage(
                    f"no company with slug {slug!r} has been ingested "
                    "(the slug is hashed to the company id, so it must match exactly)"
                )
            return [(row.name, row.id)]
        rows = conn.execute(text("select name, id from companies order by name")).all()
    return [(row.name, row.id) for row in rows]


def handler(event: dict[str, Any] | None, context: Any = None) -> dict[str, Any]:
    """One pipeline stage.

    Event shape, which is also the Step Functions task payload:

        {"stage": "reconcile", "company": "acme-industries"}

    `company` is optional; without it the stage runs for every company in the
    database. The return value is JSON-serialisable on purpose — Step
    Functions stores it in the execution history, so it doubles as the run
    log a CA firm's operations person reads.
    """
    event = event or {}
    stage = str(event.get("stage", "")).strip().lower()
    slug = event.get("company") or None
    started = time.monotonic()

    if stage not in STAGES:
        raise UnknownStage(f"unknown stage {stage!r}. Known: {', '.join(STAGES)}")

    result: dict[str, Any] = {"stage": stage}
    if slug:
        result["company"] = slug

    if stage == "migrate":
        # Idempotent and hash-checked: a migration whose text changed after
        # it was applied is an error, not a silent re-run.
        applied = migrations.run()
        result["applied"] = [str(name) for name in applied]
        result["seconds"] = round(time.monotonic() - started, 2)
        return result

    if stage == "demo-seed":
        result.update(_demo_seed(event))
        result["seconds"] = round(time.monotonic() - started, 2)
        return result

    per_company: list[dict[str, Any]] = []
    for company_name, company_id in _companies(slug):
        with connect() as conn:
            if stage == "reconcile":
                gst = reconcile_gst(conn, company_id)
                bank = reconcile_bank(conn, company_id)
                per_company.append(
                    {
                        "company": company_name,
                        "gst_pairs": gst.pairs,
                        "gst_unmatched_register": gst.unmatched_pr,
                        "gst_unmatched_2b": gst.unmatched_2b,
                        # The reason the nightly run exists, surfaced as a
                        # number: invoices that only matched because a
                        # supplier filed late.
                        "gst_late_filed": gst.late_filed,
                        "bank_unmatched": bank.unmatched_bank,
                    }
                )
            elif stage == "ims":
                stats = recommend_ims(conn, company_id)
                per_company.append(
                    {
                        "company": company_name,
                        "records": stats.total,
                        "recommended": dict(stats.by_recommendation),
                        "no_recommendation": stats.no_recommendation,
                        "deemed_accepted": stats.deemed_accepted,
                    }
                )
            elif stage == "rules":
                run = run_rules(conn, company_id)
                per_company.append(
                    {
                        "company": company_name,
                        "periods": len(run.periods),
                        "risks": run.total,
                        "by_severity": dict(run.by_severity),
                        "skipped": sorted(run.skipped),
                    }
                )

    result["companies"] = per_company
    result["seconds"] = round(time.monotonic() - started, 2)
    return result


# ── the demo bootstrap ──────────────────────────────────────────────────────
#
# Not part of the nightly state machine, and deliberately a separate stage
# name rather than an `ingest` one: this generates synthetic companies. It
# exists because the deployed database sits in private subnets with no route
# in, which is the right call for somebody else's books and also means there
# is no psql session from a laptop to load a demo with.
#
# So the load runs inside the VPC, in the same image as everything else,
# invoked once by hand after the stack comes up.


def _demo_seed(event: dict[str, Any]) -> dict[str, Any]:
    """Generate the synthetic firm, ingest it, and create one owner account.

    Returns the generated password exactly once, in the invoke response. It
    is never written to a log, an environment variable or the template: the
    operator reads it out of the response and signs in with it.
    """
    import secrets
    import tempfile
    from pathlib import Path

    from diligence_engine import auth
    from diligence_engine.ingest import ingest_company
    from diligence_engine.ingest.documents import ensure_firm
    from diligence_engine.seedgen import COMPANIES, generate_company

    firm_name = event.get("firm") or "Mehta & Associates"
    email = event.get("email") or "ca@mehta.example"
    display_name = event.get("name") or "Priya Mehta"

    # os.environ, not a parameter: `settings()` is cached and reads the
    # environment once, and seedgen writes through it.
    workspace = Path(os.environ.get("SEED_DIR") or tempfile.mkdtemp(prefix="seed-"))
    workspace.mkdir(parents=True, exist_ok=True)
    os.environ["SEED_DIR"] = str(workspace)
    settings.cache_clear()

    generated: list[dict[str, Any]] = []
    for spec in COMPANIES:
        truth, written = generate_company(spec["name"], spec["slug"], spec["seed"], workspace)
        with connect() as conn:
            outcome = ingest_company(
                conn,
                name=spec["name"],
                slug=spec["slug"],
                gstin=truth.gstin,
                pan=truth.pan,
                fy_start=truth.fy_start,
                feed_dir=workspace / spec["slug"] / "feeds",
                firm_name=firm_name,
            )
        generated.append(
            {
                "company": spec["name"],
                "files": len(written),
                "planted_defects": len(truth.defects),
                "rows": outcome.total_rows,
                "periods": len(outcome.periods),
            }
        )

    password = secrets.token_urlsafe(18)
    with connect() as conn:
        firm_id = ensure_firm(conn, firm_name)
        auth.create_user(
            conn,
            firm_id=firm_id,
            email=email,
            password=password,
            display_name=display_name,
            role="owner",
        )

    return {
        "stage": "demo-seed",
        "firm": firm_name,
        "companies": generated,
        "sign_in": {"email": email, "password": password},
        "note": "This password is returned once and stored nowhere. Save it now.",
    }
