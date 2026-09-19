"""Scoring and GSTN categorisation.

These are pure functions over two records, so they are tested without a
database. The claim they support — "the number is computed, and here is the
breakdown" — is only as good as the arithmetic underneath it.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from diligence_engine.matching.score import (
    ACCEPT_FLOOR,
    Candidate,
    categorise,
    doc_type_of,
    score_pair,
)

TOLERANCE = Decimal("1.00")


def candidate(
    *,
    gstin: str = "29AABCA1234F1Z5",
    number: str = "4921",
    day: date = date(2026, 8, 15),
    taxable: str = "482000.00",
    cgst: str = "43380.00",
    sgst: str = "43380.00",
    igst: str = "0.00",
    cess: str = "0.00",
) -> Candidate:
    return Candidate(
        row_id=f"{gstin}:{number}",
        gstin=gstin,
        norm_invoice_no=number,
        doc_date=day,
        taxable=Decimal(taxable),
        cgst=Decimal(cgst),
        sgst=Decimal(sgst),
        igst=Decimal(igst),
        cess=Decimal(cess),
    )


# ── the seven parameters and six categories ─────────────────────────────────


def test_identical_records_are_an_exact_match() -> None:
    result = score_pair(candidate(), candidate(), tolerance=TOLERANCE)
    assert result.category == "exact"
    assert result.matched_parameters == 7
    assert result.score == Decimal("1.000")


def test_one_differing_parameter_is_a_partial_match() -> None:
    """GSTIN and document type agree; exactly one of parameters 3-7 differs."""
    result = score_pair(
        candidate(),
        candidate(day=date(2026, 8, 14)),
        tolerance=TOLERANCE,
    )
    assert result.category == "partial"
    assert result.matched_parameters == 6
    assert result.date_delta_days == 1


def test_a_taxable_value_two_rupees_out_is_still_only_a_partial_match() -> None:
    """Six of seven parameters still align, which is GSTN's Partial, not Unmatched.

    The tax heads move by eighteen paise here, inside the tolerance, so only
    the taxable value differs. Calling this a value mismatch would overstate
    what the engine actually found.
    """
    result = score_pair(
        candidate(),
        candidate(taxable="481998.00", cgst="43379.82", sgst="43379.82"),
        tolerance=TOLERANCE,
    )
    assert result.category == "partial"
    assert result.amount_delta == Decimal("2.00")


def test_a_real_value_mismatch_moves_the_tax_with_it() -> None:
    """GSTN calls this category Unmatched; the pair is still a pair.

    A supplier who keyed a different value files different tax against it, so
    the taxable value, the total tax and the individual heads all move — four
    of seven parameters, which is GSTN's Unmatched band.
    """
    result = score_pair(
        candidate(),
        candidate(taxable="478000.00", cgst="43020.00", sgst="43020.00"),
        tolerance=TOLERANCE,
    )
    assert result.category == "value_mismatch"
    assert result.parameters["taxable_value"] is False
    assert result.parameters["tax_total"] is False
    assert result.parameters["tax_head_wise"] is False
    assert result.amount_delta == Decimal("4000.00")


def test_tolerance_is_applied_per_tax_head_not_to_the_total() -> None:
    """GSTN's specification, and the reason the heads are compared separately.

    CGST is 2 rupees high and SGST is 2 rupees low. The consolidated tax is
    unchanged, so a tool comparing only the total would call this an exact
    match. Per head, both breach a one-rupee tolerance.
    """
    result = score_pair(
        candidate(),
        candidate(cgst="43382.00", sgst="43378.00"),
        tolerance=TOLERANCE,
    )
    assert result.parameters["tax_total"] is True
    assert result.parameters["tax_head_wise"] is False
    assert result.category == "partial"


def test_tolerance_of_ten_admits_a_larger_difference() -> None:
    """The offline tool allows 0 to 10, per head. The engine honours the range."""
    pair = (candidate(), candidate(cgst="43388.00", sgst="43372.00"))
    assert score_pair(*pair, tolerance=Decimal("1.00")).parameters["tax_head_wise"] is False
    assert score_pair(*pair, tolerance=Decimal("10.00")).parameters["tax_head_wise"] is True


def test_probable_match_when_only_the_gstin_differs() -> None:
    result = score_pair(
        candidate(),
        candidate(gstin="27AAPFU0939F1ZV"),
        tolerance=TOLERANCE,
    )
    assert result.category == "probable"
    assert result.parameters["gstin"] is False


# ── document type: GSTN parameter 2 ─────────────────────────────────────────


def test_doc_type_is_read_from_the_normalised_number() -> None:
    assert doc_type_of("4921") == "invoice"
    assert doc_type_of("CN12") == "credit_note"
    assert doc_type_of("DN12") == "debit_note"


def test_a_credit_note_never_matches_an_invoice_of_the_same_number() -> None:
    """Never assume invoice. A credit note reduces credit; an invoice adds it."""
    result = score_pair(
        candidate(number="CN12"),
        candidate(number="12"),
        tolerance=TOLERANCE,
    )
    assert result.parameters["doc_type"] is False
    assert result.category != "exact"


# ── the weighting ───────────────────────────────────────────────────────────


def test_weights_sum_to_one_and_are_reported() -> None:
    result = score_pair(candidate(), candidate(), tolerance=TOLERANCE)
    assert set(result.breakdown) == {"gstin", "invno", "amount", "date"}
    assert sum(result.breakdown.values()) == pytest.approx(4.0)


def test_an_exact_document_number_alone_clears_the_floor() -> None:
    """GSTIN 0.45 plus document number 0.30 is enough to consider a pair."""
    result = score_pair(
        candidate(),
        candidate(taxable="999999.00", day=date(2026, 1, 1)),
        tolerance=TOLERANCE,
    )
    assert result.score >= ACCEPT_FLOOR


def test_a_different_document_number_alone_does_not() -> None:
    result = score_pair(
        candidate(number="4921"),
        candidate(number="8888", taxable="999999.00", day=date(2026, 1, 1)),
        tolerance=TOLERANCE,
    )
    assert result.score < ACCEPT_FLOOR


def test_score_is_never_called_confidence() -> None:
    """A deterministic heuristic, and the vocabulary has to say so."""
    result = score_pair(candidate(), candidate(), tolerance=TOLERANCE)
    assert not hasattr(result, "confidence")


# ── categorisation in isolation ─────────────────────────────────────────────


def test_categorise_handles_every_parameter_combination_it_claims_to() -> None:
    all_true = dict.fromkeys(
        (
            "gstin",
            "doc_type",
            "doc_number",
            "doc_date",
            "taxable_value",
            "tax_total",
            "tax_head_wise",
        ),
        True,
    )
    assert categorise(all_true) == "exact"

    no_gstin = {**all_true, "gstin": False}
    assert categorise(no_gstin) == "probable"

    one_off = {**all_true, "doc_date": False}
    assert categorise(one_off) == "partial"

    values_off = {**all_true, "taxable_value": False, "tax_total": False}
    assert categorise(values_off) == "value_mismatch"

    wreckage = {**all_true, "doc_number": False, "doc_date": False, "taxable_value": False}
    assert categorise(wreckage) == "fuzzy"
