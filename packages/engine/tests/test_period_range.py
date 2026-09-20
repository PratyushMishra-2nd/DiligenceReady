"""Month arithmetic for a chosen span.

`period_range` itself needs a database and is exercised through the API
suite. What is here is the part that has no excuse to be untested: walking
from one 'YYYY-MM' to another. It is the function that decides which months a
range contains, so an off-by-one in it is an off-by-one in every total the
span reports — and it crosses a year boundary, which is where that kind of
bug lives.
"""

from __future__ import annotations

import pytest

from diligence_engine.reporting import months_between


def test_a_single_month_is_a_span_of_one():
    assert months_between("2026-04", "2026-04") == ["2026-04"]


def test_both_ends_are_included():
    """A range a reader described as April to June contains June."""
    assert months_between("2026-04", "2026-06") == ["2026-04", "2026-05", "2026-06"]


def test_it_crosses_a_calendar_year():
    """December to January is one month apart, not eleven."""
    assert months_between("2025-11", "2026-02") == [
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]


def test_a_financial_year_is_twelve_months():
    """April to March, which is the span 'This FY' asks for."""
    span = months_between("2026-04", "2027-03")
    assert len(span) == 12
    assert span[0] == "2026-04"
    assert span[-1] == "2027-03"
    # Every month appears once and the order is the order it is read in.
    assert span == sorted(span)


def test_months_are_zero_padded():
    """'2026-9' would sort after '2026-10' as a string and break `between`."""
    assert months_between("2026-08", "2026-10") == ["2026-08", "2026-09", "2026-10"]


@pytest.mark.parametrize(
    ("start", "end"),
    [("2026-06", "2026-04"), ("2027-01", "2026-12")],
)
def test_a_reversed_span_is_empty(start: str, end: str):
    """Not an exception: the caller is the one that knows what to say.

    The API rejects a reversed range with a message naming both ends, and the
    page falls back to the single month. Raising here would make both of those
    handle an error for a case they have each already decided about.
    """
    assert months_between(start, end) == []
