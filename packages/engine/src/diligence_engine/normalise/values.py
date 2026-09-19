"""Amount and date parsing for messy real-world exports.

Everything arithmetic in this system is Decimal. Floats are banned in the
financial path: 0.1 + 0.2 is the kind of residual a CA notices immediately and
never trusts again.

Amounts arrive Indian-formatted ("4,82,000.00" groups by two after the first
three), sometimes with a rupee sign, sometimes with a Dr/Cr suffix from Tally,
sometimes parenthesised for negative.

Dates arrive in whatever convention the exporting system uses. "15-Aug-2026"
from Tally, "15/08/2026" from a bank, ISO from a JSON payload. Day-first is
assumed for ambiguous numeric dates, because every Indian source is day-first.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

_CURRENCY_NOISE = re.compile(r"[₹$,\s]")
_DR_CR_SUFFIX = re.compile(r"\s*(DR|CR)\.?$", re.IGNORECASE)
_PARENTHESISED = re.compile(r"^\((.*)\)$")

_DATE_FORMATS: tuple[str, ...] = (
    "%Y-%m-%d",
    "%d-%m-%Y",
    "%d/%m/%Y",
    "%d.%m.%Y",
    "%d-%b-%Y",
    "%d-%B-%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%d-%m-%y",
    "%d/%m/%y",
    "%d-%b-%y",
    "%Y%m%d",
    "%d-%m-%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
)

ZERO = Decimal("0.00")


class ParseError(ValueError):
    """A value could not be parsed. Never swallowed silently in the financial path."""


def to_paise(value: Decimal) -> Decimal:
    """Quantise to two places, half-up.

    Decimal's default is ROUND_HALF_EVEN (banker's rounding), which sends
    12.345 to 12.34. Accounting convention here is half-up, and it is set
    explicitly rather than inherited from the ambient decimal context — a
    caller changing that context must not silently change every rupee in the
    system.
    """
    return value.quantize(ZERO, rounding=ROUND_HALF_UP)


def parse_amount(raw: str | int | float | Decimal | None) -> Decimal:
    """Parse a money value to Decimal, quantised to paise.

    >>> parse_amount("4,82,000.00")
    Decimal('482000.00')
    >>> parse_amount("(1,200)")
    Decimal('-1200.00')
    >>> parse_amount("1,200.50 Cr")
    Decimal('1200.50')
    """
    if raw is None or raw == "":
        return ZERO
    if isinstance(raw, Decimal):
        return to_paise(raw)
    if isinstance(raw, int):
        return to_paise(Decimal(raw))
    if isinstance(raw, float):
        # Route through str so 0.1 becomes Decimal("0.1"), not its binary neighbour.
        return to_paise(Decimal(str(raw)))

    s = str(raw).strip()
    if not s:
        return ZERO

    negative = False
    parenthesised = _PARENTHESISED.match(s)
    if parenthesised:
        negative = True
        s = parenthesised.group(1)

    s = _DR_CR_SUFFIX.sub("", s)
    s = _CURRENCY_NOISE.sub("", s)

    if s.startswith("-"):
        negative = True
        s = s[1:]
    if not s:
        return ZERO

    try:
        value = to_paise(Decimal(s))
    except InvalidOperation as exc:
        raise ParseError(f"cannot parse amount from {raw!r}") from exc

    return -value if negative else value


def optional_amount(raw: str | int | float | Decimal | None) -> Decimal | None:
    """None for an absent value, a Decimal for a present one — including zero.

    `parse_amount(cell) or None` reads naturally and is wrong: Decimal("0.00")
    is falsy, so a bank row carrying a literal 0.00 in both columns became two
    NULLs and tripped the one-side CHECK, aborting the whole upload
    transaction and losing every other row in the file. Absence and zero are
    different facts and the caller has to be able to tell them apart.
    """
    if raw is None:
        return None
    if isinstance(raw, str) and not raw.strip():
        return None
    return parse_amount(raw)


def parse_date(raw: str | date | datetime | None) -> date:
    """Parse a date from any convention the Indian sources use.

    >>> parse_date("15-Aug-2026")
    datetime.date(2026, 8, 15)
    >>> parse_date("15/08/2026")
    datetime.date(2026, 8, 15)
    """
    if raw is None or raw == "":
        raise ParseError("cannot parse a date from an empty value")
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw

    s = str(raw).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue

    raise ParseError(f"cannot parse date from {raw!r}")


def period_of(value: date | str) -> str:
    """The 'YYYY-MM' tax period a date falls in."""
    parsed = value if isinstance(value, date) else parse_date(value)
    return f"{parsed.year:04d}-{parsed.month:02d}"


def shift_period(period: str, months: int) -> str:
    """Move a 'YYYY-MM' period forward or backward by whole months."""
    year, month = (int(part) for part in period.split("-"))
    index = (year * 12 + (month - 1)) + months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def periods_between(start: str, end: str) -> int:
    """Whole months from start to end. Negative when end precedes start."""
    start_year, start_month = (int(part) for part in start.split("-"))
    end_year, end_month = (int(part) for part in end.split("-"))
    return (end_year * 12 + end_month) - (start_year * 12 + start_month)


def format_inr(amount: Decimal) -> str:
    """Indian digit grouping, for text a CA reads: 4,82,000.00."""
    sign = "-" if amount < 0 else ""
    whole, _, fraction = f"{abs(amount):.2f}".partition(".")

    if len(whole) <= 3:
        grouped = whole
    else:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        grouped = ",".join([*parts, tail])

    return f"{sign}{grouped}.{fraction}"
