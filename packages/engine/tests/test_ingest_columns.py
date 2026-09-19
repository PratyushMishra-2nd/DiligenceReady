"""Column resolution across accounting packages and banks.

§09 claims exports from Busy, Marg, Zoho and Vyapar reuse the same
normaliser — "an adapter, not a rewrite". These tests are what makes that
claim checkable rather than aspirational: each case is a header row in a
different vendor's spelling, and all of them have to land on the same logical
fields.

The header spellings are plausible reconstructions, not a verified
compatibility matrix. §14 week one is running real exports from three
friendly CA firms through this layer, and every layout that fails there
should add a name to a tuple and a case here.
"""

from __future__ import annotations

import csv
import io

import pytest

from diligence_engine.ingest.columns import (
    BANK_STATEMENT,
    LEDGER_ENTRIES,
    PURCHASE_REGISTER,
    SALES_REGISTER,
    UnreadableExport,
    resolve,
)

# ── purchase registers, one shape per package ───────────────────────────────

TALLY = (
    "Date,Particulars,Voucher Type,Voucher No,Taxable Value,"
    "CGST,SGST,IGST,Cess,Invoice Value,Narration"
)
BUSY = "Date,Party Name,Vch Type,Vch No,Taxable Amount,CGST,SGST,IGST,Cess,Bill Amount,Remarks"
ZOHO = "Invoice Date,Vendor Name,Invoice Number,Sub Total,Total,GSTIN"
MARG = "Bill Date,Supplier Name,Bill No,Assessable Value,Central Tax,State Tax,Grand Total"
VYAPAR = "Date,Party,Invoice No.,Net Amount,Total Amount"
SHOUTY = "DATE,PARTICULARS,VOUCHER NO,INVOICE VALUE"
SNAKE = "date,party_name,invoice_no,total_amount"

PURCHASE_HEADERS = [
    ("tally", TALLY),
    ("busy", BUSY),
    ("zoho", ZOHO),
    ("marg", MARG),
    ("vyapar", VYAPAR),
    ("upper_case", SHOUTY),
    ("snake_case", SNAKE),
]


@pytest.mark.parametrize(
    "header",
    [pytest.param(header, id=name) for name, header in PURCHASE_HEADERS],
)
def test_every_package_resolves_the_required_fields(header: str) -> None:
    columns = resolve(header.split(","), PURCHASE_REGISTER)
    for key in ("date", "party", "voucher_no", "total"):
        assert columns.has(key), f"{key} not resolved from {header}"


def test_the_same_row_reads_the_same_whatever_wrote_it() -> None:
    """Two packages, two spellings, one set of values."""
    tally_row = next(
        csv.DictReader(
            io.StringIO(
                TALLY + "\n21-Aug-2026,Maruthi Electricals,Purchase,BILL3707,"
                "720339.00,64830.51,64830.51,0.00,0.00,850000.02,Goods"
            )
        )
    )
    busy_row = next(
        csv.DictReader(
            io.StringIO(
                BUSY + "\n21-Aug-2026,Maruthi Electricals,Purchase,BILL3707,"
                "720339.00,64830.51,64830.51,0.00,0.00,850000.02,Goods"
            )
        )
    )

    tally = resolve(TALLY.split(","), PURCHASE_REGISTER)
    busy = resolve(BUSY.split(","), PURCHASE_REGISTER)

    for key in ("date", "party", "voucher_no", "taxable", "cgst", "total"):
        assert tally.get(tally_row, key) == busy.get(busy_row, key)


def test_a_gstin_column_is_picked_up_where_one_exists() -> None:
    """Tally's register has none. Zoho's does, and a stated GSTIN beats an inferred one."""
    assert not resolve(TALLY.split(","), PURCHASE_REGISTER).has("gstin")
    assert resolve(ZOHO.split(","), PURCHASE_REGISTER).has("gstin")


def test_optional_tax_columns_may_be_absent() -> None:
    """Vyapar exports a total and nothing else; that is still ingestible."""
    columns = resolve(VYAPAR.split(","), PURCHASE_REGISTER)
    assert not columns.has("cgst")
    assert columns.get({}, "cgst") == ""


def test_a_column_is_never_claimed_twice() -> None:
    """'Total Amount' cannot be both the taxable value and the invoice value."""
    columns = resolve("Date,Party,Invoice No,Total Amount".split(","), PURCHASE_REGISTER)
    claimed = list(columns.resolved.values())
    assert len(claimed) == len(set(claimed))


# ── the failure, which has to be useful ─────────────────────────────────────


def test_a_missing_column_names_itself_and_the_file() -> None:
    with pytest.raises(UnreadableExport) as error:
        resolve(["Date", "Some Column", "Another"], PURCHASE_REGISTER)

    message = str(error.value)
    assert "purchase register" in message
    assert "party" in message and "voucher_no" in message
    assert "'Some Column'" in message  # the file's own headers, quoted back
    assert "ingest/columns.py" in message  # and where to fix it


def test_nothing_is_guessed_by_similarity() -> None:
    """A header the layer does not know fails loudly rather than being approximated.

    Deciding that 'Amt' probably means the invoice value is exactly the kind
    of silent wrong number this product exists not to produce.
    """
    with pytest.raises(UnreadableExport):
        resolve(["Dt", "Pty", "Vch", "Amt"], PURCHASE_REGISTER)


def test_unmapped_headers_are_reported_not_silently_dropped() -> None:
    columns = resolve(
        "Date,Particulars,Voucher No,Invoice Value,Cost Centre,Godown".split(","),
        PURCHASE_REGISTER,
    )
    assert set(columns.unmapped_headers) == {"Cost Centre", "Godown"}


# ── bank statements ─────────────────────────────────────────────────────────

BANK_HEADERS = [
    (
        "hdfc",
        "Txn Date,Value Date,Narration,Chq / Ref No,Withdrawal Amt,Deposit Amt,Closing Balance",
    ),
    (
        "icici",
        "Transaction Date,Transaction Remarks,Withdrawal Amount (INR),"
        "Deposit Amount (INR),Balance (INR)",
    ),
    ("sbi", "Txn Date,Description,Ref No,Debit,Credit,Balance"),
    ("axis", "Tran Date,Particulars,Chq No,DR,CR,Balance"),
    ("kotak", "Date,Narration,Reference No,Withdrawal (Dr),Deposit (Cr),Running Balance"),
]


@pytest.mark.parametrize(
    "header",
    [pytest.param(header, id=name) for name, header in BANK_HEADERS],
)
def test_every_bank_layout_resolves_date_and_narration(header: str) -> None:
    """Five banks, five spellings. Date and narration are what the engine cannot do without."""
    columns = resolve(header.split(","), BANK_STATEMENT)
    assert columns.has("date")
    assert columns.has("narration")
    assert columns.has("debit") and columns.has("credit")


def test_bank_amounts_read_identically_across_layouts() -> None:
    hdfc_header, icici_header = BANK_HEADERS[0][1], BANK_HEADERS[1][1]
    hdfc_row = next(
        csv.DictReader(
            io.StringIO(
                hdfc_header + "\n12/08/2026,12/08/2026,RTGS CR 547333936 SUNDRY,"
                "547333936,,686516.00,3412000.00"
            )
        )
    )
    icici_row = next(
        csv.DictReader(
            io.StringIO(
                icici_header + "\n12/08/2026,RTGS CR 547333936 SUNDRY,,686516.00,3412000.00"
            )
        )
    )

    hdfc = resolve(hdfc_header.split(","), BANK_STATEMENT)
    icici = resolve(icici_header.split(","), BANK_STATEMENT)

    assert hdfc.get(hdfc_row, "credit") == icici.get(icici_row, "credit") == "686516.00"
    assert hdfc.get(hdfc_row, "narration") == icici.get(icici_row, "narration")


# ── the other two schemas ───────────────────────────────────────────────────


def test_sales_and_ledger_schemas_resolve_their_own_export() -> None:
    sales = "Date,Particulars,Voucher Type,Voucher No,Taxable Value,Tax Amount,Invoice Value"
    ledger = "Date,Voucher Type,Voucher No,Particulars,Debit,Credit"

    assert resolve(sales.split(","), SALES_REGISTER).has("total")
    assert resolve(ledger.split(","), LEDGER_ENTRIES).has("voucher_type")


def test_a_ledger_export_is_not_readable_as_a_sales_register() -> None:
    """The two files share most columns, and confusing them is a live risk.

    This caught a real bug: an edit applied the sales schema to the ledger
    parser, and the only thing that surfaced it was the missing total column.
    """
    ledger = "Date,Voucher Type,Voucher No,Particulars,Debit,Credit"
    with pytest.raises(UnreadableExport, match="sales register"):
        resolve(ledger.split(","), SALES_REGISTER)
