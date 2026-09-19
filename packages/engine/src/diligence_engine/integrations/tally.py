"""Read Tally over its XML gateway.

Tally Prime exposes an HTTP endpoint on port 9000 when "Act as Server" is
enabled under Gateway of Tally, and it speaks a documented XML dialect: you
POST an ENVELOPE describing a TDL collection, it returns the rows. That is the
whole integration surface, and it is the one the blueprint names (§07, §11).

Two things about how this is described, because both matter in a room:

**Say "we read Tally over its XML gateway on port 9000."** There is no
first-party Tally MCP server, and calling it one would be caught by anyone who
has looked. The gateway is real, documented and enough.

**Read-only, by choice.** Every request here is an Export. Nothing writes back
to a client's books, because a tool that can write to Tally is a tool a
conservative buyer has to get approval for, and the product is an assistant
rather than a replacement (§16).

Output is shaped to match the purchase-register CSV the ingester already
reads, so a firm that connects Tally directly and a firm that uploads an
export go through exactly the same normalisation, matching and evidence path.
There is no second code path to keep honest.
"""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from xml.etree import ElementTree

from diligence_engine.normalise import parse_amount, parse_date

DEFAULT_HOST = "localhost"
DEFAULT_PORT = 9000
DEFAULT_TIMEOUT = 10.0


class TallyUnavailable(RuntimeError):
    """Tally is not answering on the gateway.

    Raised rather than swallowed: a reconciliation run that silently used
    yesterday's data because the gateway was down is worse than one that
    stopped and said so.
    """


@dataclass(frozen=True)
class TallyVoucher:
    voucher_date: date
    voucher_number: str
    voucher_type: str
    party_ledger: str
    amount: Decimal
    narration: str


def _envelope(report: str, report_id: str, description: str) -> str:
    """A Tally request envelope: HEADER says what, BODY says how.

    The two are siblings. This used to splice the caller's `<BODY>` inside
    `<HEADER>`, which is not the shape Tally accepts — and the failure is
    silent rather than loud: the gateway answers with an empty result, the
    parser reads it happily, and `fetch_vouchers` returns an empty list. A
    live company with a thousand purchases reported "0 vouchers" as a clean
    success.
    """
    return (
        "<ENVELOPE>"
        "<HEADER>"
        "<VERSION>1</VERSION>"
        "<TALLYREQUEST>Export</TALLYREQUEST>"
        f"<TYPE>{report}</TYPE>"
        f"<ID>{report_id}</ID>"
        "</HEADER>"
        "<BODY>"
        f"{description}"
        "</BODY>"
        "</ENVELOPE>"
    )


def _post(xml: str, host: str, port: int, timeout: float) -> str:
    request = urllib.request.Request(
        f"http://{host}:{port}",
        data=xml.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except (TimeoutError, urllib.error.URLError, ConnectionError, OSError) as error:
        raise TallyUnavailable(
            f"No response from the Tally gateway at {host}:{port}. "
            "In Tally Prime, check Gateway of Tally > F1 Help > Settings > Connectivity "
            "and confirm 'Act as Server' is enabled on this port, then try again."
        ) from error


def probe(
    host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT
) -> list[str]:
    """The companies currently open in Tally. The cheapest proof the link works."""
    xml = _envelope(
        "Collection",
        "List of Companies",
        "<DESC><STATICVARIABLES>"
        "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>"
        "</STATICVARIABLES><TDL><TDLMESSAGE>"
        '<COLLECTION NAME="List of Companies" ISMODIFY="No">'
        "<TYPE>Company</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD>"
        "</COLLECTION>"
        "</TDLMESSAGE></TDL></DESC>",
    )
    response = _post(xml, host, port, timeout)
    return [
        (element.text or "").strip()
        for element in _parse(response).iter("NAME")
        if (element.text or "").strip()
    ]


def fetch_vouchers(
    company: str,
    from_date: date,
    to_date: date,
    *,
    voucher_type: str = "Purchase",
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    timeout: float = DEFAULT_TIMEOUT,
) -> list[TallyVoucher]:
    """Export vouchers of one type for a date range."""
    xml = _envelope(
        "Collection",
        "DRVouchers",
        "<DESC><STATICVARIABLES>"
        "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>"
        f"<SVFROMDATE>{from_date:%Y%m%d}</SVFROMDATE>"
        f"<SVTODATE>{to_date:%Y%m%d}</SVTODATE>"
        f"<SVCURRENTCOMPANY>{_escape(company)}</SVCURRENTCOMPANY>"
        "</STATICVARIABLES><TDL><TDLMESSAGE>"
        '<COLLECTION NAME="DRVouchers" ISMODIFY="No">'
        "<TYPE>Voucher</TYPE>"
        f"<FILTER>DRTypeFilter</FILTER>"
        "<FETCH>DATE,VOUCHERNUMBER,VOUCHERTYPENAME,PARTYLEDGERNAME,AMOUNT,NARRATION</FETCH>"
        "</COLLECTION>"
        '<SYSTEM TYPE="Formulae" NAME="DRTypeFilter">'
        f"$VOUCHERTYPENAME = &quot;{_escape(voucher_type)}&quot;"
        "</SYSTEM>"
        "</TDLMESSAGE></TDL></DESC>",
    )
    response = _post(xml, host, port, timeout)
    return _parse_vouchers(response)


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )


# A bare ampersand, but not one that already starts an entity. Tally emits
# both: it escapes "&" in trade names as "&amp;" and also emits raw control
# entities. Escaping indiscriminately double-escaped the ones it had already
# done, so "Sharma &amp; Co" parsed as the literal text "Sharma &amp; Co" and
# normalised to SHARMAAMPCO — and "&" is everywhere in Indian trade names.
_BARE_AMPERSAND = re.compile(r"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);)")


def _parse(response: str) -> ElementTree.Element:
    """Tally emits characters that are not valid XML, so parsing is defensive."""
    cleaned = _BARE_AMPERSAND.sub("&amp;", response.replace("&#4;", ""))
    try:
        return ElementTree.fromstring(cleaned)
    except ElementTree.ParseError as error:
        raise TallyUnavailable(
            "The Tally gateway replied with something that is not parseable XML. "
            f"First 200 characters: {response[:200]!r}"
        ) from error


def _text(element: ElementTree.Element, tag: str) -> str:
    found = element.find(tag)
    return (found.text or "").strip() if found is not None and found.text else ""


def _parse_vouchers(response: str) -> list[TallyVoucher]:
    root = _parse(response)
    vouchers: list[TallyVoucher] = []

    for element in root.iter("VOUCHER"):
        raw_date = _text(element, "DATE")
        if not raw_date:
            continue
        vouchers.append(
            TallyVoucher(
                voucher_date=parse_date(raw_date),
                voucher_number=_text(element, "VOUCHERNUMBER"),
                voucher_type=_text(element, "VOUCHERTYPENAME"),
                party_ledger=_text(element, "PARTYLEDGERNAME"),
                # Tally signs a purchase amount negative from the party's side.
                amount=abs(parse_amount(_text(element, "AMOUNT") or "0")),
                narration=_text(element, "NARRATION"),
            )
        )
    return vouchers


PURCHASE_REGISTER_HEADER = (
    "Date",
    "Particulars",
    "Voucher Type",
    "Voucher No",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
    "Cess",
    "Invoice Value",
    "Narration",
)


def to_purchase_register_rows(vouchers: list[TallyVoucher]) -> list[list[str]]:
    """Shape gateway output like the CSV export the ingester already reads.

    The tax breakdown is not fetched here: a voucher's tax sits in its ledger
    entries rather than on the voucher head, and pulling it correctly means a
    second collection per voucher type. Until that is written the columns are
    emitted empty rather than guessed, and the invoice value carries the only
    figure the gateway actually returned. A zero that was never read is the
    kind of number this product exists not to print.
    """
    rows = []
    for voucher in vouchers:
        rows.append(
            [
                voucher.voucher_date.strftime("%d-%b-%Y"),
                voucher.party_ledger,
                voucher.voucher_type,
                voucher.voucher_number,
                "",  # taxable value: needs the ledger-entry collection
                "",
                "",
                "",
                "",
                f"{voucher.amount:.2f}",
                voucher.narration,
            ]
        )
    return rows
