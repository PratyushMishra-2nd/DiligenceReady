"""A span of months, served as one request.

The property that matters and would not be noticed if it broke: the totals
row has to be the months above it. A range view whose total disagrees with its
own table is worse than no range view, because a partner reads the total and
nobody re-adds the column.

The second property is the subtle one. Coverage across a span is computed from
summed counts, not by averaging the monthly percentages — a month with three
purchase documents and a month with three thousand are not two equal opinions
about how well a client reconciles. That is asserted here rather than trusted,
because both arithmetics produce a plausible-looking percentage.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi.testclient import TestClient

from diligence_api.main import app

from .conftest import PASSWORD, headers, needs_data, sign_in


def span(client: TestClient, company: str, auth: dict, start: str, end: str):
    return client.get(
        f"/api/companies/{company}/range",
        params={"from": start, "to": end},
        headers=auth,
    )


@needs_data
def test_totals_are_the_months(client: TestClient, tenants: dict) -> None:
    """Every total is the sum of the column it stands under."""
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))
    company = client.get(f"/api/companies/{tenants['home_company']}", headers=auth).json()
    periods = [entry["period"] for entry in company["periods"]]
    start, end = periods[-1], periods[0]

    body = span(client, tenants["home_company"], auth, start, end).json()
    months, totals = body["months"], body["totals"]

    assert body["from"] == start
    assert body["to"] == end
    assert totals["months"] == len(months)

    for key in ("open_risks", "high_risks", "gst_matched", "gst_total"):
        assert totals[key] == sum(month[key] for month in months), key

    for key in ("itc_at_risk", "bank_variance", "itc_reversal_37a"):
        # Compared as Decimal, not float: these are rupees and the whole
        # product is the claim that they are exact.
        assert Decimal(totals[key]) == sum(
            (Decimal(month[key]) for month in months), Decimal("0")
        ), key


@needs_data
def test_coverage_is_weighted_by_documents_not_by_month(client: TestClient, tenants: dict) -> None:
    """The total's percentage comes from summed counts, not from an average.

    Asserted against the counts the same response carries, so this cannot pass
    by agreeing with a second copy of the same mistake.
    """
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))
    company = client.get(f"/api/companies/{tenants['home_company']}", headers=auth).json()
    periods = [entry["period"] for entry in company["periods"]]

    body = span(client, tenants["home_company"], auth, periods[-1], periods[0]).json()
    totals = body["totals"]

    if not totals["gst_total"]:
        return

    expected = (Decimal(totals["gst_matched"]) / Decimal(totals["gst_total"]) * 100).quantize(
        Decimal("0.1")
    )
    assert Decimal(totals["gst_coverage_pct"]) == expected

    # The same figure, computed the wrong way, for the sake of saying which
    # one this is. They coincide only when every month carries the same number
    # of documents; on any real book they do not, and a regression to the mean
    # would be caught here rather than read off a dashboard.
    sized = [month for month in body["months"] if month["gst_total"]]
    if len({month["gst_total"] for month in sized}) > 1:
        mean = sum((Decimal(month["gst_coverage_pct"]) for month in sized), Decimal("0")) / len(
            sized
        )
        assert Decimal(totals["gst_coverage_pct"]) != mean or mean == expected


@needs_data
def test_a_month_with_no_documents_is_reported_not_dropped(
    client: TestClient, tenants: dict
) -> None:
    """A gap in the books is a finding, so the row is present and marked.

    Asking for a year before this company existed is the clearest form of it:
    every month comes back, every one flagged absent.
    """
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))
    body = span(client, tenants["home_company"], auth, "2019-01", "2019-06").json()

    assert [month["period"] for month in body["months"]] == [
        "2019-01",
        "2019-02",
        "2019-03",
        "2019-04",
        "2019-05",
        "2019-06",
    ]
    assert all(month["present"] is False for month in body["months"])
    assert body["totals"]["months_with_data"] == 0


@needs_data
def test_findings_carry_the_month_they_are_from(client: TestClient, tenants: dict) -> None:
    """Two identical duplicates three months apart are one sentence twice."""
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))
    company = client.get(f"/api/companies/{tenants['home_company']}", headers=auth).json()
    periods = [entry["period"] for entry in company["periods"]]

    body = span(client, tenants["home_company"], auth, periods[-1], periods[0]).json()
    for risk in body["risks"]:
        assert risk["period"] in periods


@needs_data
def test_a_reversed_range_is_refused_by_name(client: TestClient, tenants: dict) -> None:
    """Silently swapping the ends would hide a link that stays wrong."""
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))
    response = span(client, tenants["home_company"], auth, "2026-08", "2026-04")

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "2026-08" in detail and "2026-04" in detail


@needs_data
def test_a_period_that_is_not_a_period_is_refused(client: TestClient, tenants: dict) -> None:
    """These interpolate into `between`, so they are validated, not trusted."""
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))

    for bad in ("2026-13", "2026", "26-04", "2026-04-01", "'; drop table risks; --"):
        response = span(client, tenants["home_company"], auth, bad, "2026-08")
        assert response.status_code == 400, bad
        assert "YYYY-MM" in response.json()["detail"]


@needs_data
def test_an_absurd_span_is_refused_rather_than_served_slowly(
    client: TestClient, tenants: dict
) -> None:
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))
    response = span(client, tenants["home_company"], auth, "1900-01", "2026-08")

    assert response.status_code == 400
    assert "months" in response.json()["detail"]


@needs_data
def test_a_span_is_scoped_to_the_callers_firm(client: TestClient, tenants: dict) -> None:
    """The range endpoint is a data endpoint, so it answers the same way.

    A new route that reads company data is a new chance to forget the scoping,
    and forgetting it here would be invisible: the response would look like an
    ordinary table of months.
    """
    auth = headers(sign_in(client, "ca@mehta.example", PASSWORD))
    response = span(client, tenants["rival_company"], auth, "2026-04", "2026-08")
    assert response.status_code == 404


@needs_data
def test_a_span_needs_a_session(tenants: dict) -> None:
    """A fresh client, because the shared one has a cookie jar.

    Signing in through `client` earlier in the session leaves `dr_session` in
    it, and a test asking "is this endpoint protected?" through that client is
    a test that answers yes whatever the endpoint does — it passed against an
    unauthenticated route the first time it was written.
    """
    with TestClient(app) as bare:
        response = bare.get(
            f"/api/companies/{tenants['home_company']}/range",
            params={"from": "2026-04", "to": "2026-08"},
        )
    assert response.status_code == 401
