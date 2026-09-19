"""The Tally XML gateway parser.

No live Tally is required, and that is the point: the response shape is
pinned by a fixture, so the parser is verifiable on a machine with no Tally
installed, and a real gateway only has to be reachable to be useful.

The fixtures below are the shape Tally Prime's gateway returns for a
Collection export. They are labelled as fixtures rather than presented as
captured traffic.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from diligence_engine.integrations import tally

COMPANIES_RESPONSE = """<ENVELOPE>
 <BODY>
  <DATA>
   <COLLECTION>
    <COMPANY><NAME>Acme Industries</NAME></COMPANY>
    <COMPANY><NAME>Vertex Components</NAME></COMPANY>
   </COLLECTION>
  </DATA>
 </BODY>
</ENVELOPE>"""

VOUCHERS_RESPONSE = """<ENVELOPE>
 <BODY>
  <DATA>
   <COLLECTION>
    <VOUCHER>
     <DATE>20260821</DATE>
     <VOUCHERNUMBER>BILL3707</VOUCHERNUMBER>
     <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
     <PARTYLEDGERNAME>Maruthi Electricals</PARTYLEDGERNAME>
     <AMOUNT>-850000.02</AMOUNT>
     <NARRATION>Being goods purchased from Maruthi Electricals</NARRATION>
    </VOUCHER>
    <VOUCHER>
     <DATE>20260822</DATE>
     <VOUCHERNUMBER>INV/2026-27/1256</VOUCHERNUMBER>
     <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
     <PARTYLEDGERNAME>Lotus Industries</PARTYLEDGERNAME>
     <AMOUNT>-150635.26</AMOUNT>
     <NARRATION></NARRATION>
    </VOUCHER>
   </COLLECTION>
  </DATA>
 </BODY>
</ENVELOPE>"""


def test_company_list_is_parsed() -> None:
    names = [
        (element.text or "").strip() for element in tally._parse(COMPANIES_RESPONSE).iter("NAME")
    ]
    assert names == ["Acme Industries", "Vertex Components"]


def test_vouchers_are_parsed() -> None:
    vouchers = tally._parse_vouchers(VOUCHERS_RESPONSE)
    assert len(vouchers) == 2

    first = vouchers[0]
    assert first.voucher_date == date(2026, 8, 21)
    assert first.voucher_number == "BILL3707"
    assert first.party_ledger == "Maruthi Electricals"
    assert first.narration.startswith("Being goods purchased")


def test_purchase_amounts_come_back_positive() -> None:
    """Tally signs a purchase negative from the party's side; a register does not."""
    vouchers = tally._parse_vouchers(VOUCHERS_RESPONSE)
    assert vouchers[0].amount == Decimal("850000.02")
    assert all(voucher.amount > 0 for voucher in vouchers)


def test_rows_match_the_purchase_register_shape() -> None:
    """One ingestion path, whether the data arrives by gateway or by upload."""
    from diligence_engine.ingest.feeds import _PURCHASE_INSERT  # noqa: F401 - import guard

    rows = tally.to_purchase_register_rows(tally._parse_vouchers(VOUCHERS_RESPONSE))
    assert len(rows[0]) == len(tally.PURCHASE_REGISTER_HEADER)
    header = dict(zip(tally.PURCHASE_REGISTER_HEADER, rows[0], strict=True))
    assert header["Date"] == "21-Aug-2026"
    assert header["Voucher No"] == "BILL3707"
    assert header["Invoice Value"] == "850000.02"


def test_tax_columns_are_left_empty_rather_than_guessed() -> None:
    """A zero that was never read is exactly the kind of number this product avoids.

    Voucher tax sits in ledger entries, not on the voucher head. Until that
    second collection is written, the columns stay blank.
    """
    rows = tally.to_purchase_register_rows(tally._parse_vouchers(VOUCHERS_RESPONSE))
    header = dict(zip(tally.PURCHASE_REGISTER_HEADER, rows[0], strict=True))
    for column in ("Taxable Value", "CGST", "SGST", "IGST", "Cess"):
        assert header[column] == ""


def test_unreachable_gateway_raises_something_actionable() -> None:
    """Port 1 is reserved and nothing listens there."""
    with pytest.raises(tally.TallyUnavailable) as error:
        tally.probe(host="127.0.0.1", port=1, timeout=1.0)
    assert "Act as Server" in str(error.value)


def test_unparseable_response_is_reported_not_swallowed() -> None:
    with pytest.raises(tally.TallyUnavailable, match="not parseable XML"):
        tally._parse("<ENVELOPE><UNCLOSED>")


def test_company_names_with_ampersands_are_escaped() -> None:
    """'Mehta & Associates' must not break the request envelope."""
    assert tally._escape("Mehta & Associates") == "Mehta &amp; Associates"


# ── the request envelope, which was never exercised ─────────────────────────


def test_the_envelope_is_well_formed_xml() -> None:
    """HEADER and BODY are siblings.

    This spliced BODY inside HEADER and nothing caught it, because the
    failure is silent: Tally answers an empty result, the parser reads it
    happily, and a live company with a thousand purchases reports "0
    vouchers" as a clean success.
    """
    from xml.etree import ElementTree

    envelope = tally._envelope("Collection", "List of Companies", "<DESC><X/></DESC>")
    root = ElementTree.fromstring(envelope)

    assert root.tag == "ENVELOPE"
    assert [child.tag for child in root] == ["HEADER", "BODY"]
    assert root.find("HEADER/ID").text == "List of Companies"
    assert root.find("BODY/DESC") is not None
    assert root.find("HEADER/BODY") is None


def test_both_requests_build_a_parseable_envelope() -> None:
    from datetime import date as date_type
    from unittest.mock import patch
    from xml.etree import ElementTree

    captured: list[str] = []

    def capture(xml, host, port, timeout):
        captured.append(xml)
        return COMPANIES_RESPONSE

    with patch.object(tally, "_post", capture):
        tally.probe()
        tally.fetch_vouchers("Acme Industries", date_type(2026, 8, 1), date_type(2026, 8, 31))

    assert len(captured) == 2
    for envelope in captured:
        root = ElementTree.fromstring(envelope)
        assert [child.tag for child in root] == ["HEADER", "BODY"]


def test_an_escaped_ampersand_survives_the_parse() -> None:
    """ "&" is everywhere in Indian trade names.

    Escaping every ampersand double-escaped the ones Tally had already
    escaped, so "Sharma &amp; Co" parsed as the literal text and normalised
    to SHARMAAMPCO — a party that matches nothing.
    """
    from diligence_engine.normalise import norm_party

    parsed = tally._parse("<E><NAME>Sharma &amp; Co</NAME></E>").find("NAME").text
    assert parsed == "Sharma & Co"
    assert norm_party(parsed) == "SHARMA"


def test_a_bare_ampersand_is_still_repaired() -> None:
    """Tally also emits unescaped ampersands, which are not valid XML."""
    parsed = tally._parse("<E><NAME>Sharma & Co</NAME></E>").find("NAME").text
    assert parsed == "Sharma & Co"


def test_numeric_entities_are_left_alone() -> None:
    assert tally._parse("<E><N>A&#38;B</N></E>").find("N").text == "A&B"
