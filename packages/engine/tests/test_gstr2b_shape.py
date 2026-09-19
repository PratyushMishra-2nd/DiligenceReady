"""The 2B reading order, which two subsystems depend on agreeing.

`source_row` is a position in this order. The ingester assigns it and the
evidence drill-down counts to it, and when those two derived the order
separately they disagreed: the ingester walked all ten sections, the
drill-down rebuilt only `b2b`, and every finding on a credit note, an ISD
document or an import opened an evidence card with nothing in it — HTTP 200,
no error, a blank where the file line should be.

These tests pin the order itself and the property that made the bug possible.
"""

from __future__ import annotations

from diligence_engine.ingest.gstr2b_shape import (
    SECTIONS,
    describe,
    entry_at,
    iter_entries,
)

STATEMENT = {
    "data": {
        "rtnprd": "082026",
        "docdata": {
            "b2b": [
                {
                    "ctin": "29AABCA1234F1Z5",
                    "trdnm": "ABC TRADERS PRIVATE LIMITED",
                    "inv": [
                        {"inum": "INV-1", "idt": "01-08-2026", "txval": "100.00"},
                        {"inum": "INV-2", "idt": "02-08-2026", "txval": "200.00"},
                    ],
                }
            ],
            "b2ba": [
                {
                    "ctin": "29AABCA1234F1Z5",
                    "trdnm": "ABC TRADERS PRIVATE LIMITED",
                    "inv": [{"inum": "INV-1", "oinum": "INV-1", "idt": "03-08-2026"}],
                }
            ],
            "cdnr": [
                {
                    "ctin": "27AAPFU0939F1ZV",
                    "trdnm": "SOMEONE ELSE LLP",
                    "nt": [{"ntnum": "CN-9", "nttyp": "C", "ntdt": "04-08-2026"}],
                }
            ],
            "isd": [
                {
                    "ctin": "29AAAAA0000A1Z5",
                    "trdnm": "HEAD OFFICE (ISD)",
                    "doclist": [{"docnum": "ISD/1", "docdt": "05-08-2026"}],
                }
            ],
            "impg": [{"boe": [{"boenum": "7654321", "boedt": "06-08-2026", "portcode": "INMAA1"}]}],
            "eco": [
                {
                    "ctin": "29AAGCB7383J1Z1",
                    "trdnm": "OPERATOR",
                    "doc": [{"docnum": "ECO/1", "docdt": "07-08-2026"}],
                }
            ],
        },
    }
}


def test_every_section_is_reached() -> None:
    """A section missing from the walk is a section whose evidence never resolves."""
    seen = [shape.section for shape, _, _ in iter_entries(STATEMENT)]
    assert seen == ["B2B", "B2B", "B2BA", "CDNR", "ISD", "IMPG", "ECO"]


def test_b2b_comes_first_which_is_why_the_bug_hid() -> None:
    """B2B is read first, so a b2b-only index looks right until it doesn't.

    Every B2B row resolved correctly under the old code. Only the sections
    after it broke, which is why nothing caught it.
    """
    order = [shape.section for shape, _, _ in iter_entries(STATEMENT)]
    assert order[0] == "B2B"
    assert set(order[2:]) == {"B2BA", "CDNR", "ISD", "IMPG", "ECO"}


def test_entry_at_is_one_based_and_matches_the_walk() -> None:
    for position, (shape, block, entry) in enumerate(iter_entries(STATEMENT), start=1):
        found = entry_at(STATEMENT, position)
        assert found is not None
        assert found[0].section == shape.section
        assert found[2][shape.number_field] == entry[shape.number_field]
        assert found[1] is block


def test_a_row_past_the_end_is_none_rather_than_a_wrong_entry() -> None:
    """Returning the wrong supplier's row would be worse than returning nothing."""
    assert entry_at(STATEMENT, 999) is None
    assert entry_at(STATEMENT, 0) is None


def test_each_section_is_read_with_its_own_field_names() -> None:
    """CDNR keys on ntnum, ISD on docnum, IMPG on boenum. One parser, a table of shapes."""
    numbers = {
        shape.section: entry[shape.number_field] for shape, _, entry in iter_entries(STATEMENT)
    }
    assert numbers["CDNR"] == "CN-9"
    assert numbers["ISD"] == "ISD/1"
    assert numbers["IMPG"] == "7654321"
    assert numbers["ECO"] == "ECO/1"


def test_imports_carry_no_supplier() -> None:
    """IMPG has no supplier-wise detail at all, which any consumer has to handle."""
    shapes = {shape.section: shape for shape in SECTIONS}
    assert shapes["IMPG"].has_supplier is False
    assert shapes["B2B"].has_supplier is True

    rendered = [
        describe(shape, block, entry)
        for shape, block, entry in iter_entries(STATEMENT)
        if shape.section == "IMPG"
    ][0]
    assert "ctin" not in rendered
    assert rendered["boenum"] == "7654321"


def test_describe_puts_the_supplier_beside_the_document() -> None:
    rendered = [
        describe(shape, block, entry)
        for shape, block, entry in iter_entries(STATEMENT)
        if shape.section == "CDNR"
    ][0]
    assert rendered["ctin"] == "27AAPFU0939F1ZV"
    assert rendered["ntnum"] == "CN-9"
    assert rendered["section"] == "CDNR"


def test_amendment_sections_are_flagged_as_such() -> None:
    amendments = {shape.section for shape in SECTIONS if shape.is_amendment}
    assert amendments == {"B2BA", "CDNRA", "ISDA", "ECOA"}


def test_an_empty_or_partial_statement_does_not_raise() -> None:
    assert list(iter_entries({"data": {"docdata": {}}})) == []
    assert list(iter_entries({"data": {}})) == []
    assert list(iter_entries({"data": {"docdata": {"b2b": None}}})) == []
