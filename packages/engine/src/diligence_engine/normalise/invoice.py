"""Invoice-number normalisation.

This function and `norm_party` are the product. Step 4 of the manual workflow
(Blueprint §03) is a VLOOKUP on invoice number, and it breaks because the same
document is written two different ways in two systems:

    Tally purchase register        GSTR-2B
    "INV/2026-27/4921"      vs     "INV-4921"

GSTN calls its own version of this "approximation logic" and applies it as a
user-triggered refinement. Applying it automatically is the improvement, not
the invention (§08).

Three deviations from the sketch in §08, all deliberate, all covered by tests
-----------------------------------------------------------------------------
1.  The sketch strips an embedded financial year with a bare
    ``re.sub(r'20\\d{2}\\d{2}', '', s)`` after separators are gone. Too eager:
    a genuine invoice ``2026001`` matches ``202600`` and normalises to ``1``,
    colliding with every other invoice ending in one digit. Here a financial
    year is recognised *before* separators are discarded, and only when the
    two halves are consecutive years — ``2026-27`` yes, ``4921-01`` no. A
    separator-free run is stripped only when two or more characters survive.

2.  ``26-27`` is as common as ``2026-27`` in a Tally voucher series. The
    consecutive-year test makes the short form safe to strip too.

3.  Credit- and debit-note prefixes (CN, DN) are deliberately **not** stripped.
    Document type is GSTN's matching parameter 2 and the schema's ``doc_type``
    — "never assume invoice". Normalising ``CN/12`` to ``12`` would merge a
    credit note with invoice 12, which is a wrong number on a dashboard, not
    just a missed match.

A false strip is worse than a missed one. A missed strip leaves two records
unmatched and visible; a false strip silently merges two different documents.
"""

from __future__ import annotations

import re

# Document-type prefixes a CA types and the portal does not. Repeatable, so
# "TAXINV4921" and "PUR/INV/..." both reduce. CN and DN are absent on purpose.
_DOC_PREFIX = re.compile(
    r"^(?:INVOICE|TAXINV|GSTINV|PURCHASE|PURCH|INV|BILL|TAX|GST|PUR|PINV|SINV|TI|PI|SI)+"
    r"(?:NUMBER|NUM|NO)?"
)

_NON_ALNUM = re.compile(r"[^A-Z0-9]")

# A year range while its separator survives: 2026-27, 26/27, FY 2026-2027.
# The lookbehind forbids only a preceding digit rather than requiring a word
# boundary, so the F and Y of "FY2026-27" do not block the match.
_FY_CANDIDATE = re.compile(
    r"(?:F\.?\s?Y\.?\s?)?(?<![0-9])(\d{4}|\d{2})\s*[-/]\s*(\d{4}|\d{2})(?![0-9])"
)

# A financial year that reached the digit run intact: 202627 or 20262027.
_FY_RUN = re.compile(r"20\d{2}(?:20)?\d{2}")

_MIN_SURVIVING_CHARS = 2


def _is_year_range(left: str, right: str) -> bool:
    """True when two tokens read as consecutive years: 2026-27, 26-27, 2026-2027."""
    start = int(left)
    end = int(right)
    if len(left) == 4:
        start_short = start % 100
    elif len(left) == 2:
        start_short = start
    else:
        return False
    end_short = end % 100 if len(right) == 4 else end
    return end_short == (start_short + 1) % 100


def _strip_fy_range(s: str) -> str:
    return _FY_CANDIDATE.sub(
        lambda m: "" if _is_year_range(m.group(1), m.group(2)) else m.group(0), s
    )


def norm_invoice_no(raw: str | None) -> str:
    """Reduce an invoice number to the part both systems agree on.

    >>> norm_invoice_no("INV/2026-27/4921")
    '4921'
    >>> norm_invoice_no("inv-4921")
    '4921'
    >>> norm_invoice_no("2026001")          # not a year range; left alone
    '2026001'
    >>> norm_invoice_no("CN/2026-27/12")    # document type is never discarded
    'CN12'
    """
    if raw is None:
        return ""

    s = raw.upper().strip()
    if not s:
        return ""

    # Everything the document number could reduce to, before anything is
    # discarded. Used as the floor below.
    bare = _NON_ALNUM.sub("", s)

    s = _strip_fy_range(s)
    s = _NON_ALNUM.sub("", s)
    s = _DOC_PREFIX.sub("", s)

    candidate = _FY_RUN.sub("", s, count=1)
    if len(candidate) >= _MIN_SURVIVING_CHARS:
        s = candidate

    stripped = s.lstrip("0")
    result = stripped or s

    # Never return an empty key for a document that has a number.
    #
    # "12-13" reads as a consecutive-year pair, so the range stripper removed
    # the whole thing. Two empty keys then compare *exactly equal*, which
    # scored a full 0.30 on the document-number component and let unrelated
    # documents from one supplier clear the accept floor — and every blank
    # number bucketed together, so one supplier produced a cascade of false
    # pairs, each consuming a real 2B line.
    #
    # A number that is entirely a year range is unusual; matching two of them
    # to each other because both vanished is not a trade-off worth making.
    return result or bare
