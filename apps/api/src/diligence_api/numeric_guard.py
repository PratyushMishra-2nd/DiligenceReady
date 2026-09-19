"""One rule, in one place: a number in generated prose must come from the facts.

Both places a model writes text — `/explain` for a single finding, `/ask` for
the Strands agent over the whole ledger — are governed by this module. They
were two copies of the same regex until the copies disagreed, which is the
usual way a guarantee stops being one.

The rule is deliberately strict: every numeric token in the generated text
has to appear in the material the model was given. "About 4.8 lakh" for
4,82,000 fails. A sum of two supplied figures fails, because a total nobody
computed in SQL is a total the accountant cannot trace back to a document.
A rejection costs the reader a plainer sentence. A wrong number shown as
verified costs them a filing.

The one thing the rule has to be taught is that Indian GST vocabulary is full
of digits that are not quantities. "GSTR-2B" is a form, not the number two.
"Section 16(4)" is a deadline's name, not sixteen. Left unhandled, the guard
rejected almost every correct sentence a model could write about this
domain — and a guard that always fires is a guard that gets switched off.

So the terminology is enumerated rather than guessed at. A statutory
reference that is not on the list is treated as a figure and rejected, which
is the safe direction: the fallback is the deterministic sentence, which is
always correct.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

# The digits that are vocabulary, not quantities.
#
# Alternation is ordered, so longer names come before the prefixes they
# contain: B2BA before B2B, CDNRA before CDNR, IMPGSEZ before IMPG. Getting
# that backwards leaves a trailing "A" and the form is only half-recognised.
#
# The trailing guard is `(?!\w)` rather than `\b`, because several of these
# end in a closing bracket — "Section 16(4)" — and `\b` does not fire between
# ")" and a space, which silently dropped the bracketed part and left the
# subsection number looking like a figure.
_STATUTORY = re.compile(
    r"""(?ix)
    \b(?:
        GSTR [\s-]? (?: 1A | 2A | 2B | 3B | 9C | 1 | 4 | 9 )   # the returns
      | ITC [\s-]? 0?4
      | (?: DRC | ASMT | ADT | REG | PMT ) [\s-]? \d{1,2}      # notices and forms
      | (?: section | sec\.? | u/s ) \s* \d{1,3} (?: \s* \( [0-9a-z]+ \) )*
      | rule  \s* \d{1,3} [a-z]? (?: \s* \( [0-9a-z]+ \) )*
      | table \s* \d{1,2} [a-z]? (?: \. \d+ )? (?: \s* \( [0-9a-z]+ \) )*
      | B2BA | B2B | B2CL | B2CS | B2C
      | CDNRA | CDNR | ISDA | ISD | IMPGSEZ | IMPG | ECOA | ECO
      | 2B | 3B                                                # the shorthand
      | GSTIN | HSN | SAC | PAN | TDS | TCS | QRMP | IMS
    )
    (?!\w)
    """
)

# Any run of digits with optional thousands separators and decimals. Indian
# grouping (2,59,012.40) and Western grouping (259,012.40) reduce to the same
# value once the commas come out.
_NUMERIC = re.compile(r"\d[\d,]*(?:\.\d+)?")


def strip_terminology(text: str) -> str:
    """Blank out the statutory vocabulary so only quantities remain."""
    return _STATUTORY.sub(" ", text)


def numbers_in(text: str) -> set[Decimal]:
    """Every quantity in the text, as exact Decimals.

    Terminology is removed first. A trailing full stop from ordinary
    punctuation is stripped, so "of 259012.40." yields 259012.40 rather than
    failing to parse.
    """
    found: set[Decimal] = set()
    for raw in _NUMERIC.findall(strip_terminology(text)):
        cleaned = raw.replace(",", "").rstrip(".")
        if not cleaned:
            continue
        try:
            found.add(Decimal(cleaned))
        except InvalidOperation:
            continue
    return found


def check(generated: str, facts: str, *, subject: str = "generated prose") -> str | None:
    """Return a reason string when the prose holds a number the facts do not.

    `facts` is whatever the model was actually shown: the flattened finding
    for `/explain`, the concatenated tool results for `/ask`. Both sides run
    through the same terminology stripper, so a form number on one side and
    not the other cannot create a false match in either direction.
    """
    allowed = numbers_in(facts)
    for value in numbers_in(generated):
        if value not in allowed:
            return f"{subject} contains {value}, which is not in the finding"
    return None
