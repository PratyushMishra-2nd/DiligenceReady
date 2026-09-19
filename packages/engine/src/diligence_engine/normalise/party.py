"""Party-name normalisation.

The Tally purchase register often has no GSTIN column at all — it carries a
ledger name a bookkeeper typed. GSTR-2B carries the registered legal name.
"ABC Traders" and "ABC TRADERS PVT LTD" are the same supplier, and matching
has to say so before any amount can be compared (Blueprint §03, §08).

Legal-suffix stripping is order-sensitive: "PRIVATE LIMITED" must go before
"LIMITED", or the longer form leaves a stray "PRIVATE" behind.
"""

from __future__ import annotations

import re

# Longest first. Order is load-bearing.
_LEGAL_SUFFIXES: tuple[str, ...] = (
    "PRIVATE LIMITED",
    "PVT LIMITED",
    "PRIVATE LTD",
    "PVT LTD",
    "P LTD",
    "LIMITED",
    "LTD",
    "LLP",
    "ENTERPRISES",
    "ENTERPRISE",
    "TRADERS",
    "TRADING CO",
    "AND SONS",
    "& SONS",
    "AND COMPANY",
    "AND CO",
    "& COMPANY",
    "& CO",
    "INDIA",
    "INDUSTRIES",
    "CORPORATION",
    "CORP",
    "INCORPORATED",
    "INC",
)

_NON_ALNUM = re.compile(r"[^A-Z0-9]")
_WHITESPACE = re.compile(r"\s+")

# M/s is a prefix a bookkeeper types and the portal never carries.
_MS_PREFIX = re.compile(r"^M\s*/?\s*S\.?\s+")

# Suffixes are matched as whole words, anchored on both sides.
#
# This was a plain substring `replace` and it ate letters out of the middle of
# ordinary names: "INC" turned PRINCE TRADERS into PRE, which then collided
# with PRE INDUSTRIES on the same normalised key. A collision here is not a
# missed match — the party resolver hands back the wrong supplier's id, the
# wrong GSTIN is stamped onto the invoice, and the whole matcher partitions on
# that GSTIN. Two unrelated businesses become one, quietly.
#
# The boundary is a lookaround on alphanumerics rather than `\b`, because
# several suffixes start or end with punctuation — `\b` does not fire between
# a space and the "&" of "& CO", so that suffix would never strip.
_SUFFIX_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?:"
    + "|".join(re.escape(suffix) for suffix in _LEGAL_SUFFIXES if suffix)
    + r")(?![A-Z0-9])"
)


def norm_party(raw: str | None) -> str:
    """Reduce a party name to a comparable key.

    >>> norm_party("ABC Traders")
    'ABC'
    >>> norm_party("ABC TRADERS PVT LTD")
    'ABC'
    >>> norm_party("M/s Sharma & Co.")
    'SHARMA'
    """
    if raw is None:
        return ""

    s = raw.upper().strip()
    if not s:
        return ""

    s = _MS_PREFIX.sub("", s)
    s = _WHITESPACE.sub(" ", s)

    stripped = _NON_ALNUM.sub("", _SUFFIX_PATTERN.sub(" ", s))

    # A name that is nothing but legal form — "Private Limited" as a ledger
    # entry — would otherwise normalise to the empty string, and every such
    # name would then match every other one. Keep the original instead: an
    # unhelpful key is recoverable, a key that matches everything is not.
    return stripped or _NON_ALNUM.sub("", s)


def display_party(raw: str | None) -> str:
    """A human-readable canonical name: collapsed whitespace, original casing kept."""
    if raw is None:
        return ""
    return _WHITESPACE.sub(" ", raw.strip())
