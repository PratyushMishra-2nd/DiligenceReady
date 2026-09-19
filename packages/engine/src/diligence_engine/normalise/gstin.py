"""GSTIN handling: shape, checksum, and the PAN embedded inside it.

A GSTIN is 15 characters: two state-code digits, the ten-character PAN of the
registrant, an entity number, a fixed 'Z', and a check digit computed mod 36
over the preceding fourteen.

Validating the check digit is cheap and worth doing at ingestion. A GSTIN that
fails it is a typo in the purchase register, not a supplier the portal has
never heard of — and those two produce very different conversations with the
client.
"""

from __future__ import annotations

import re

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_MOD = 36

# 2 digits state, 5 letters + 4 digits + 1 letter PAN, 1 entity char, 1 'Z', 1 check char.
_GSTIN_SHAPE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$")

_NON_ALNUM = re.compile(r"[^0-9A-Z]")


def norm_gstin(raw: str | None) -> str | None:
    """Uppercase and strip punctuation. Returns None for anything empty."""
    if raw is None:
        return None
    s = _NON_ALNUM.sub("", raw.upper())
    return s or None


def gstin_check_digit(first_fourteen: str) -> str:
    """Compute the fifteenth character from the first fourteen."""
    if len(first_fourteen) != 14:
        raise ValueError(f"expected 14 characters, got {len(first_fourteen)}")

    factor = 2
    total = 0
    for index in range(13, -1, -1):
        code_point = _ALPHABET.index(first_fourteen[index])
        product = factor * code_point
        factor = 1 if factor == 2 else 2
        total += (product // _MOD) + (product % _MOD)

    return _ALPHABET[(_MOD - (total % _MOD)) % _MOD]


def is_valid_gstin(raw: str | None) -> bool:
    """True only when the shape holds and the check digit agrees."""
    gstin = norm_gstin(raw)
    if gstin is None or len(gstin) != 15 or not _GSTIN_SHAPE.match(gstin):
        return False
    try:
        return gstin_check_digit(gstin[:14]) == gstin[14]
    except ValueError:
        return False


def pan_from_gstin(raw: str | None) -> str | None:
    """Characters 3 to 12 of a GSTIN are the registrant's PAN."""
    gstin = norm_gstin(raw)
    if gstin is None or len(gstin) != 15:
        return None
    return gstin[2:12]


def state_code(raw: str | None) -> str | None:
    """The first two characters: the state of registration."""
    gstin = norm_gstin(raw)
    if gstin is None or len(gstin) < 2:
        return None
    return gstin[:2]
