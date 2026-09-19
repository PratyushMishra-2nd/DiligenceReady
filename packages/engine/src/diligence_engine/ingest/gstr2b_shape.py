"""The canonical reading order of a GSTR-2B statement.

`source_row` on a `gstr2b_lines` row is its position in this order, and the
evidence drill-down finds the original entry by counting to that position.
Two places deriving the order independently is a drift bug waiting to
happen — and it happened: the ingester counted across all ten sections while
the drill-down rebuilt the index from `b2b` alone, so every finding on a
credit note, an ISD document or an import silently returned an empty source
with HTTP 200. On a smaller B2B block it could land on a real but *different*
invoice and show the wrong supplier's row beside the amount.

So the order lives here once, and both sides walk it.

The sections disagree about what a document is called: B2B nests invoices
under `inv` keyed on `inum`, credit notes sit under `nt` keyed on `ntnum`,
ISD under `doclist`, imports under `boe` keyed on a bill-of-entry number.
Those differences are data in the table below rather than branches in a
parser.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass


@dataclass(frozen=True)
class SectionShape:
    """One 2B table: where its documents live and what they call themselves."""

    section: str
    key: str
    child: str
    number_field: str
    date_field: str
    is_amendment: bool = False
    #: Imports carry no supplier-wise detail at all.
    has_supplier: bool = True


# Reading order. Changing it renumbers `source_row`, so a change here needs a
# re-ingest, not just a redeploy.
SECTIONS: tuple[SectionShape, ...] = (
    SectionShape("B2B", "b2b", "inv", "inum", "idt"),
    SectionShape("B2BA", "b2ba", "inv", "inum", "idt", is_amendment=True),
    SectionShape("CDNR", "cdnr", "nt", "ntnum", "ntdt"),
    SectionShape("CDNRA", "cdnra", "nt", "ntnum", "ntdt", is_amendment=True),
    SectionShape("ISD", "isd", "doclist", "docnum", "docdt"),
    SectionShape("ISDA", "isda", "doclist", "docnum", "docdt", is_amendment=True),
    SectionShape("IMPG", "impg", "boe", "boenum", "boedt", has_supplier=False),
    SectionShape("IMPGSEZ", "impgsez", "boe", "boenum", "boedt", has_supplier=False),
    SectionShape("ECO", "eco", "doc", "docnum", "docdt"),
    SectionShape("ECOA", "ecoa", "doc", "docnum", "docdt", is_amendment=True),
)


def iter_entries(payload: dict) -> Iterator[tuple[SectionShape, dict, dict]]:
    """Every document in the statement, in the order `source_row` counts.

    Yields the section it came from, the block it sits under (the supplier,
    or the bill-of-entry container), and the entry itself.
    """
    docdata = payload.get("data", payload).get("docdata", {}) or {}
    for shape in SECTIONS:
        for block in docdata.get(shape.key, []) or []:
            for entry in block.get(shape.child, []) or []:
                yield shape, block, entry


def entry_at(payload: dict, source_row: int) -> tuple[SectionShape, dict, dict] | None:
    """The entry at a 1-based `source_row`, or None if the file no longer has it."""
    for index, found in enumerate(iter_entries(payload), start=1):
        if index == source_row:
            return found
    return None


def describe(shape: SectionShape, block: dict, entry: dict) -> dict:
    """A flat, readable rendering of one entry, for the evidence card."""
    described: dict[str, object] = {"section": shape.section}
    if shape.has_supplier:
        described["ctin"] = block.get("ctin")
        described["trdnm"] = block.get("trdnm")
    described.update(entry)
    return described
