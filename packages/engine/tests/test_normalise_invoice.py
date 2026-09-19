"""The §12 hour 12-15 gate: norm_invoice_no passes 30 unit tests.

Every case here is a spelling difference seen between a Tally voucher series
and the same document in GSTR-2B, or a trap the naive version falls into.
"""

from __future__ import annotations

import pytest

from diligence_engine.normalise import norm_invoice_no

# (case name, raw input, expected normalised form)
CASES: list[tuple[str, str | None, str]] = [
    # ── the blueprint's own example, both sides ──
    ("tally_slashed_with_fy", "INV/2026-27/4921", "4921"),
    ("portal_hyphenated", "INV-4921", "4921"),
    ("lowercase", "inv-4921", "4921"),
    ("space_separated", "INV 4921", "4921"),
    ("bare_number", "4921", "4921"),
    # ── document-type prefixes ──
    ("bill_prefix", "BILL/4921", "4921"),
    ("tax_prefix_with_fy", "TAX/2026-27/4921", "4921"),
    ("gst_prefix", "GST-4921", "4921"),
    ("invoice_spelled_out", "INVOICE-4921", "4921"),
    ("doubled_prefix", "TAXINV4921", "4921"),
    ("purchase_prefix_chain", "PUR/INV/2026-27/00123", "123"),
    ("inv_no_noise", "Inv No: 4921", "4921"),
    ("inv_number_noise", "Invoice Number 4921", "4921"),
    ("sales_prefix", "SI/2026-27/889", "889"),
    ("proforma_prefix", "PI-889", "889"),
    # ── financial-year forms ──
    ("fy_four_digit_range", "INV/2026-2027/4921", "4921"),
    ("fy_short_range", "INV/26-27/4921", "4921"),
    ("fy_label_prefix", "FY2026-27/INV/4921", "4921"),
    ("fy_spaced", "INV / 2026 - 27 / 4921", "4921"),
    ("fy_run_no_separator", "INV202627004921", "4921"),
    # ── leading zeros ──
    ("leading_zeros_stripped", "TI/2026-27/0045", "45"),
    ("bare_leading_zeros", "0045", "45"),
    ("all_zeros_survive", "0000", "0000"),
    # ── traps: things that must NOT be stripped ──
    ("genuine_number_resembling_fy", "2026001", "2026001"),
    ("non_consecutive_pair_kept", "INV/4921-01", "492101"),
    ("credit_note_keeps_its_type", "CN/2026-27/12", "CN12"),
    ("debit_note_keeps_its_type", "DN-12", "DN12"),
    ("single_digit_survives", "INV/2026-27/1", "1"),
    ("alpha_series_kept", "ABC/123", "ABC123"),
    ("alpha_suffix_kept", "INV/4921/A", "4921A"),
    # ── whitespace and empties ──
    ("leading_whitespace", "  INV/2026-27/4921", "4921"),
    ("trailing_whitespace", "INV/2026-27/4921   ", "4921"),
    ("punctuation_noise", "INV#4921", "4921"),
    ("empty_string", "", ""),
    ("whitespace_only", "   ", ""),
    ("none_input", None, ""),
]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [pytest.param(raw, expected, id=name) for name, raw, expected in CASES],
)
def test_norm_invoice_no(raw: str | None, expected: str) -> None:
    assert norm_invoice_no(raw) == expected


def test_case_count_meets_the_gate() -> None:
    """§12 sets the bar at 30 cases. Guard it so the suite cannot quietly shrink."""
    assert len(CASES) >= 30


def test_the_pair_that_defeats_vlookup_now_agrees() -> None:
    """§03: the exact pair the manual workflow cannot join."""
    assert norm_invoice_no("INV/2026-27/4921") == norm_invoice_no("INV-4921")


def test_credit_note_does_not_collide_with_invoice() -> None:
    """Document type is GSTN matching parameter 2. Never assume invoice."""
    assert norm_invoice_no("CN/2026-27/12") != norm_invoice_no("INV/2026-27/12")


def test_is_idempotent() -> None:
    """Normalising an already-normalised value must not change it again."""
    for _, raw, _ in CASES:
        once = norm_invoice_no(raw)
        assert norm_invoice_no(once) == once
