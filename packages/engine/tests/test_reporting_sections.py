"""The two aggregates the API exposed before anything computed them.

`/other-itc` and `/ims` both called `reporting` functions that did not exist.
Every request to either returned a 500, and no test noticed, because the
suite reached the reporting layer through the CLI and the CLI never asks for
those two.

So these tests go through the reporting functions the routes actually call,
and they assert the invariants rather than the figures: a seeded dataset that
changes should not have to be chased through the test file, but counts that
stop adding up are always a bug.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from diligence_engine import reporting
from diligence_engine.db import connect


def _database_ready() -> bool:
    try:
        with connect() as conn:
            return conn.execute(text("select count(*) from gstr2b_lines")).scalar_one() > 0
    except Exception:  # noqa: BLE001 - no database is a skip, not a failure
        return False


needs_data = pytest.mark.skipif(
    not _database_ready(),
    reason="no ingested data; run `uv run diligence pipeline` first",
)


@pytest.fixture(scope="module")
def company_and_period() -> tuple[uuid.UUID, str]:
    """A company and a period that actually has 2B rows in it.

    Picked by query rather than hard-coded: the newest period exists in
    `periods` before any statement lands in it, and a test that silently
    lands on an empty month asserts nothing.
    """
    with connect() as conn:
        row = conn.execute(
            text(
                "select company_id, period from gstr2b_lines "
                "group by company_id, period order by count(*) desc limit 1"
            )
        ).one()
    return row.company_id, row.period


@needs_data
def test_other_itc_never_reports_the_sections_the_register_matches(
    company_and_period: tuple[uuid.UUID, str],
) -> None:
    """B2B and B2BA are coverage, not residue.

    Including them here would double-count: the same invoice would appear as
    matched on the readiness card and as unexplained credit beside it.
    """
    company_id, period = company_and_period
    with connect() as conn:
        summary = reporting.other_itc(conn, company_id, period)

    sections = {group["section"] for group in summary["groups"]}
    assert "B2B" not in sections
    assert "B2BA" not in sections
    assert sections, "the seed has no non-B2B sections, so this test proves nothing"


@needs_data
def test_every_other_itc_group_is_labelled_for_a_human(
    company_and_period: tuple[uuid.UUID, str],
) -> None:
    company_id, period = company_and_period
    with connect() as conn:
        summary = reporting.other_itc(conn, company_id, period)

    for group in summary["groups"]:
        assert group["label"], group["section"]
        # An unlabelled section falls back to its own code, which reads as a
        # bug on screen. This catches a new section reaching the data before
        # anyone writes its label.
        assert group["label"] != group["section"], group["section"]


@needs_data
def test_credit_notes_reduce_the_net_adjustment_and_debit_notes_raise_it(
    company_and_period: tuple[uuid.UUID, str],
) -> None:
    """The sign is the whole meaning of the row.

    Values are stored positive so the drill-down agrees with the file, which
    means the direction has to be applied in the aggregate — and an aggregate
    that adds credit and debit notes together is off by twice the credit
    notes.
    """
    company_id, period = company_and_period
    with connect() as conn:
        summary = reporting.other_itc(conn, company_id, period)

    credit = sum(g["tax"] for g in summary["groups"] if g["note_type"] == "C")
    debit = sum(g["tax"] for g in summary["groups"] if g["note_type"] == "D")
    assert summary["net_note_adjustment"] == debit - credit
    if credit:
        assert summary["net_note_adjustment"] < debit


@needs_data
def test_a_period_with_no_2b_rows_is_empty_rather_than_an_error() -> None:
    with connect() as conn:
        company_id = conn.execute(text("select id from companies limit 1")).scalar_one()
        summary = reporting.other_itc(conn, company_id, "1999-01")
    assert summary["groups"] == []
    assert summary["net_note_adjustment"] == 0


# ── IMS ─────────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def ims_company_and_period() -> tuple[uuid.UUID, str] | None:
    with connect() as conn:
        row = conn.execute(
            text(
                "select company_id, period from ims_records "
                "group by company_id, period order by count(*) desc limit 1"
            )
        ).first()
    return (row.company_id, row.period) if row else None


@needs_data
def test_the_ims_buckets_add_up_to_the_total(
    ims_company_and_period: tuple[uuid.UUID, str] | None,
) -> None:
    """Recommendations partition the records, so the four have to sum exactly.

    Counting these with separate queries against a table that changes between
    them is how a dashboard shows 1806 records out of 1801 — the earlier
    version of this aggregate did exactly that, through a join that fanned
    out on duplicate bookings.
    """
    if ims_company_and_period is None:
        pytest.skip("no IMS records in the seed")
    company_id, period = ims_company_and_period
    with connect() as conn:
        summary = reporting.ims_summary(conn, company_id, period)

    assert summary is not None
    assert (
        summary["accept"] + summary["reject"] + summary["pending"] + summary["decide"]
        == summary["total"]
    )


@needs_data
def test_pending_is_never_recommended_where_the_portal_bars_it(
    ims_company_and_period: tuple[uuid.UUID, str] | None,
) -> None:
    """A recommendation the portal refuses is worse than none.

    The schema enforces this with a CHECK; this asserts the summary a CA
    reads agrees with it, so a barred record can never be sitting inside the
    `pending` count.
    """
    if ims_company_and_period is None:
        pytest.skip("no IMS records in the seed")
    company_id, period = ims_company_and_period
    with connect() as conn:
        barred_and_pending = conn.execute(
            text(
                "select count(*) from ims_records where company_id = :c and period = :p "
                "and not pending_allowed and recommended_action = 'pending'"
            ),
            {"c": company_id, "p": period},
        ).scalar_one()
    assert barred_and_pending == 0


@needs_data
def test_deemed_acceptance_is_reported_in_rupees_not_only_in_rows(
    ims_company_and_period: tuple[uuid.UUID, str] | None,
) -> None:
    """Inaction became an action in October 2024.

    A count of records nobody touched is not a number a partner acts on. The
    value of them is.
    """
    if ims_company_and_period is None:
        pytest.skip("no IMS records in the seed")
    company_id, period = ims_company_and_period
    with connect() as conn:
        summary = reporting.ims_summary(conn, company_id, period)

    assert summary is not None
    if summary["deemed_accepted"]:
        assert summary["deemed_accepted_value"] > 0


@needs_data
def test_a_period_with_no_ims_feed_is_none_rather_than_zeroes() -> None:
    """None means "no IMS here", which the route turns into a 404.

    A summary full of zeroes would render as a dashboard claiming the firm
    has nothing to action, which is a different and much worse claim.
    """
    with connect() as conn:
        company_id = conn.execute(text("select id from companies limit 1")).scalar_one()
        assert reporting.ims_summary(conn, company_id, "1999-01") is None


# ── which period the firm screen headlines ─────────────────────────────────


@needs_data
def test_the_dashboard_headlines_a_period_that_has_a_2b() -> None:
    """The latest period that exists is not the latest period you can reconcile.

    A period row appears as soon as any feed carries a date inside it. Two
    bank value-dates spilling into a new month created a September with no
    GSTR-2B, no purchases and nothing to match — and the firm's landing
    screen headlined it at 0.0% coverage with zero exposure, which reads as
    a broken product rather than as a month that has not started.

    GSTR-2B for month M generates on the 14th of M+1, so the month a firm is
    working on is the latest one that has a 2B.
    """
    with connect() as conn:
        firm_id = conn.execute(text("select id from firms order by name limit 1")).scalar_one()
        cards = reporting.firm_dashboard(conn, firm_id)

        assert cards, "no companies on the dashboard, so this test proves nothing"
        for card in cards:
            generated = conn.execute(
                text(
                    "select gstr2b_generated_at is not null from periods "
                    "where company_id = :c and period = :p"
                ),
                {"c": card["company_id"], "p": card["period"]},
            ).scalar()
            assert generated, f"{card['name']} headlines {card['period']}, which has no 2B"


@needs_data
def test_a_client_with_no_2b_at_all_still_appears() -> None:
    """The fallback matters: a new client whose books are loaded but whose
    first GSTR-2B has not arrived should show on the dashboard, not vanish
    from it."""
    with connect() as conn:
        firm_id = conn.execute(text("select id from firms order by name limit 1")).scalar_one()
        companies = conn.execute(
            text("select count(*) from companies where firm_id = :f"), {"f": firm_id}
        ).scalar_one()
        with_periods = conn.execute(
            text(
                "select count(distinct c.id) from companies c "
                "join periods p on p.company_id = c.id where c.firm_id = :f"
            ),
            {"f": firm_id},
        ).scalar_one()
        cards = reporting.firm_dashboard(conn, firm_id)

    # Every company that has any period at all gets a card.
    assert len(cards) == with_periods
    assert with_periods <= companies


@needs_data
def test_the_headline_total_subtracts_credit_notes(
    company_and_period: tuple[uuid.UUID, str],
) -> None:
    """`claimable_tax` is signed, and an unsigned sum is not an acceptable
    substitute for it.

    The dashboard collapses this section by default, so its one-line summary
    is the only figure most readers ever see. The interface used to compute
    that line by summing `groups[].tax`, which adds a credit note as though
    it were credit: Rs 3.18 L where the answer was Rs 3.15 L, over by twice
    the credit-note tax.

    Overstating available credit is the one direction of error that costs a
    client money at assessment rather than only time, which is why this is
    asserted rather than left to the caller's discipline.
    """
    company_id, period = company_and_period
    with connect() as conn:
        summary = reporting.other_itc(conn, company_id, period)

    credit = sum(g["tax"] for g in summary["groups"] if g["note_type"] == "C")
    unsigned = sum(g["tax"] for g in summary["groups"])

    # The identity that makes the sign explicit: an unsigned sum differs from
    # the signed one by exactly twice the credit-note tax, never by less.
    assert summary["claimable_tax"] == unsigned - 2 * credit

    if credit:
        assert summary["claimable_tax"] < unsigned, (
            "credit notes did not reduce the claim; the summary line is "
            "overstating the credit available"
        )


@needs_data
def test_claimable_tax_and_the_note_adjustment_agree(
    company_and_period: tuple[uuid.UUID, str],
) -> None:
    """Two figures on one panel, derived in one pass, must not disagree.

    `claimable_tax` is every section signed; `net_note_adjustment` is the note
    sections alone. Their difference is therefore exactly the unsigned total
    of everything that is not a note.
    """
    company_id, period = company_and_period
    with connect() as conn:
        summary = reporting.other_itc(conn, company_id, period)

    not_notes = sum(g["tax"] for g in summary["groups"] if g["note_type"] is None)
    assert summary["claimable_tax"] - summary["net_note_adjustment"] == not_notes
