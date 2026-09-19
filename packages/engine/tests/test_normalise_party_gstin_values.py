"""Party, GSTIN and value normalisation."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from diligence_engine.normalise import (
    ParseError,
    display_party,
    format_inr,
    gstin_check_digit,
    is_valid_gstin,
    norm_gstin,
    norm_party,
    pan_from_gstin,
    parse_amount,
    parse_date,
    period_of,
    periods_between,
    shift_period,
    state_code,
)

# ── party ───────────────────────────────────────────────────────────────────

PARTY_CASES = [
    ("ledger_name_vs_legal_name_a", "ABC Traders", "ABC"),
    ("ledger_name_vs_legal_name_b", "ABC TRADERS PVT LTD", "ABC"),
    ("private_limited_spelled_out", "ABC Private Limited", "ABC"),
    ("p_ltd_abbreviation", "ABC P Ltd", "ABC"),
    ("llp", "Sharma Gupta LLP", "SHARMAGUPTA"),
    ("ms_prefix", "M/s Sharma & Co.", "SHARMA"),
    ("ms_prefix_spaced", "M / S Sharma and Co", "SHARMA"),
    ("india_suffix", "Siemens India Limited", "SIEMENS"),
    ("industries_suffix", "Bharat Industries", "BHARAT"),
    ("punctuation_and_case", "  bharat   industries  ", "BHARAT"),
    ("empty", "", ""),
    ("none", None, ""),
]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [pytest.param(raw, expected, id=name) for name, raw, expected in PARTY_CASES],
)
def test_norm_party(raw: str | None, expected: str) -> None:
    assert norm_party(raw) == expected


def test_the_party_pair_that_defeats_vlookup_now_agrees() -> None:
    """§03: 'ABC Traders' in Tally is 'ABC TRADERS PVT LTD' on the portal."""
    assert norm_party("ABC Traders") == norm_party("ABC TRADERS PVT LTD")


def test_norm_party_is_idempotent() -> None:
    for _, raw, _ in PARTY_CASES:
        once = norm_party(raw)
        assert norm_party(once) == once


def test_display_party_keeps_casing_and_collapses_space() -> None:
    assert display_party("  ABC   Traders  Pvt Ltd ") == "ABC Traders Pvt Ltd"


# ── GSTIN ───────────────────────────────────────────────────────────────────


def test_known_valid_gstin_passes_checksum() -> None:
    """A real, published GSTIN. The check digit is the external proof the mod-36 is right."""
    assert is_valid_gstin("27AAPFU0939F1ZV")


def test_check_digit_round_trips() -> None:
    body = "27AAPFU0939F1Z"
    assert gstin_check_digit(body) == "V"


def test_wrong_check_digit_is_rejected() -> None:
    assert not is_valid_gstin("27AAPFU0939F1ZX")


def test_malformed_shapes_are_rejected() -> None:
    for bad in ("", None, "27AAPFU0939F1Z", "AAPFU0939F1ZV27", "27aapfu0939f1z"):
        assert not is_valid_gstin(bad)


def test_gstin_is_normalised_before_validation() -> None:
    assert is_valid_gstin(" 27-aapfu 0939 f1zv ")


def test_pan_and_state_are_extracted() -> None:
    assert pan_from_gstin("27AAPFU0939F1ZV") == "AAPFU0939F"
    assert state_code("27AAPFU0939F1ZV") == "27"


def test_norm_gstin_empty_is_none() -> None:
    assert norm_gstin("   ") is None
    assert norm_gstin(None) is None


def test_check_digit_rejects_wrong_length() -> None:
    with pytest.raises(ValueError, match="14 characters"):
        gstin_check_digit("TOOSHORT")


# ── amounts ─────────────────────────────────────────────────────────────────

AMOUNT_CASES = [
    ("indian_grouping", "4,82,000.00", Decimal("482000.00")),
    ("rupee_sign", "₹4,81,998", Decimal("481998.00")),
    ("parenthesised_negative", "(1,200)", Decimal("-1200.00")),
    ("leading_minus", "-1,200.50", Decimal("-1200.50")),
    ("tally_cr_suffix", "1,200.50 Cr", Decimal("1200.50")),
    ("tally_dr_suffix", "1,200.50 Dr", Decimal("1200.50")),
    ("plain_int", 4821, Decimal("4821.00")),
    ("float_routed_through_str", 0.1, Decimal("0.10")),
    ("already_decimal", Decimal("12.345"), Decimal("12.35")),
    ("blank_is_zero", "", Decimal("0.00")),
    ("none_is_zero", None, Decimal("0.00")),
]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [pytest.param(raw, expected, id=name) for name, raw, expected in AMOUNT_CASES],
)
def test_parse_amount(raw: object, expected: Decimal) -> None:
    assert parse_amount(raw) == expected


def test_parse_amount_rejects_garbage() -> None:
    with pytest.raises(ParseError):
        parse_amount("not a number")


def test_money_never_touches_float() -> None:
    """The residual a CA notices: 0.1 + 0.2 must be exactly 0.30."""
    assert parse_amount("0.1") + parse_amount("0.2") == Decimal("0.30")


# ── dates ───────────────────────────────────────────────────────────────────

DATE_CASES = [
    ("iso", "2026-08-15", date(2026, 8, 15)),
    ("tally_dd_mon_yyyy", "15-Aug-2026", date(2026, 8, 15)),
    ("bank_dd_mm_yyyy_slash", "15/08/2026", date(2026, 8, 15)),
    ("dd_mm_yyyy_hyphen", "15-08-2026", date(2026, 8, 15)),
    ("dotted", "15.08.2026", date(2026, 8, 15)),
    ("long_month", "15 August 2026", date(2026, 8, 15)),
    ("us_style_written", "Aug 15, 2026", date(2026, 8, 15)),
    ("compact", "20260815", date(2026, 8, 15)),
    ("with_time", "2026-08-15 10:30:00", date(2026, 8, 15)),
    ("already_a_date", date(2026, 8, 15), date(2026, 8, 15)),
]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [pytest.param(raw, expected, id=name) for name, raw, expected in DATE_CASES],
)
def test_parse_date(raw: object, expected: date) -> None:
    assert parse_date(raw) == expected


def test_day_first_is_assumed_for_ambiguous_numeric_dates() -> None:
    """Every Indian source is day-first. 08/09/2026 is 8 September, not 9 August."""
    assert parse_date("08/09/2026") == date(2026, 9, 8)


def test_parse_date_rejects_garbage() -> None:
    with pytest.raises(ParseError):
        parse_date("not a date")


# ── period arithmetic ───────────────────────────────────────────────────────


def test_period_of() -> None:
    assert period_of(date(2026, 8, 15)) == "2026-08"
    assert period_of("15-Aug-2026") == "2026-08"


def test_shift_period_across_year_boundary() -> None:
    assert shift_period("2026-08", 1) == "2026-09"
    assert shift_period("2026-12", 1) == "2027-01"
    assert shift_period("2027-01", -1) == "2026-12"
    assert shift_period("2026-08", 12) == "2027-08"


def test_periods_between() -> None:
    assert periods_between("2026-08", "2026-11") == 3
    assert periods_between("2026-11", "2026-08") == -3
    assert periods_between("2026-08", "2026-08") == 0


# ── presentation ────────────────────────────────────────────────────────────


def test_format_inr_groups_the_indian_way() -> None:
    assert format_inr(Decimal("482000")) == "4,82,000.00"
    assert format_inr(Decimal("100")) == "100.00"
    assert format_inr(Decimal("1000")) == "1,000.00"
    assert format_inr(Decimal("10000000")) == "1,00,00,000.00"
    assert format_inr(Decimal("-482000")) == "-4,82,000.00"
