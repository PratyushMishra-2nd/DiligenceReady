"""A filled example of every file this system accepts.

The upload panel says column names are resolved on the way in, and that a
failure will name the column it wanted. Both are true, and neither helps the
person staring at a file picker who has not chosen a file yet. They have a
Tally export with thirty columns, six document kinds to choose between, and
no way to find out what is expected except by uploading something and reading
the error. That is a guess-and-check loop over a 25 MB upload.

So each kind can be downloaded as a filled example. Two properties make it
worth having rather than decorative:

*   **The headers are generated, not written here.** A CSV template's header
    row is the first spelling in each `Field.names` tuple in `columns.py` —
    the same tuple `resolve()` matches against. A column renamed there is
    renamed in the template by the next request, so a template cannot drift
    into telling people to send something the parser will reject.
*   **Every template is read by the real readers.** `test_templates.py` puts
    each one through `resolve()`, `parse_date`, `parse_amount`,
    `periods_in_csv` and `period_of_json` — the same code that would reject a
    customer's file, with no database in the way. A template that stopped
    being a valid file fails the build, which is the only thing that keeps a
    file like this true a year from now.

The example values are deliberately ordinary — one month, a couple of
suppliers, two or three rows — because the job is to show shape, not to be a
dataset. Optional columns are all present: a reader learning what the system
can use is better served by seeing `Cess` and being told it may be blank than
by discovering later that it was accepted all along.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass

from diligence_engine.ingest.columns import (
    BANK_STATEMENT,
    LEDGER_ENTRIES,
    PURCHASE_REGISTER,
    SALES_REGISTER,
    FileSchema,
)


@dataclass(frozen=True)
class Template:
    """One downloadable example, ready to be served or written to disk."""

    kind: str
    label: str
    filename: str
    media_type: str
    body: str
    #: The columns a file of this kind cannot be read without.
    required: tuple[str, ...]
    notes: tuple[str, ...]


def _csv(schema: FileSchema, rows: tuple[dict[str, str], ...]) -> str:
    """Render example rows under the canonical spelling of each column.

    The header comes from the schema rather than being repeated here, so the
    only thing this function decides is the order, which is the schema's own
    order — the order a reader of `columns.py` would expect.
    """
    headers = [entry.names[0] for entry in schema.fields]
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(entry.key, "") for entry in schema.fields])
    return buffer.getvalue()


def _required(schema: FileSchema) -> tuple[str, ...]:
    return tuple(entry.names[0] for entry in schema.fields if entry.required)


def _json(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


# ── the examples ────────────────────────────────────────────────────────────
#
# Keyed by logical field, not by header, so renaming a column in `columns.py`
# moves the value with it instead of silently shifting every cell one to the
# left.

_PURCHASE_ROWS = (
    {
        "date": "02-Apr-2026",
        "party": "Olympus Chemicals LLP",
        "voucher_type": "Purchase",
        "voucher_no": "PUR/2026-27/0001",
        "taxable": "84263.00",
        "cgst": "0.00",
        "sgst": "0.00",
        "igst": "4213.15",
        "cess": "0.00",
        "total": "88476.15",
        "gstin": "06OSOCQ7499G1Z8",
        "narration": "Interstate purchase, so the tax sits in IGST",
    },
    {
        "date": "11-Apr-2026",
        "party": "Citadel Supplies",
        "voucher_type": "Purchase",
        "voucher_no": "PUR/2026-27/0002",
        "taxable": "20221.00",
        "cgst": "1213.26",
        "sgst": "1213.26",
        "igst": "0.00",
        "cess": "0.00",
        "total": "22647.52",
        "gstin": "29AABCC1234D1Z5",
        "narration": "Within the state, so CGST and SGST split it",
    },
    {
        "date": "26-Apr-2026",
        "party": "Citadel Supplies",
        "voucher_type": "Purchase",
        "voucher_no": "PUR/2026-27/0003",
        "taxable": "45000.00",
        "cgst": "2700.00",
        "sgst": "2700.00",
        "igst": "0.00",
        "cess": "0.00",
        "total": "50400.00",
        "gstin": "",
        "narration": "GSTIN left blank, which most Tally registers do",
    },
)

_SALES_ROWS = (
    {
        "date": "04-Apr-2026",
        "party": "Meridian Traders",
        "voucher_no": "SAL/2026-27/0001",
        "taxable": "150000.00",
        "tax": "27000.00",
        "total": "177000.00",
    },
    {
        "date": "19-Apr-2026",
        "party": "Northwind Enterprises",
        "voucher_no": "SAL/2026-27/0002",
        "taxable": "62500.00",
        "tax": "11250.00",
        "total": "73750.00",
    },
)

_LEDGER_ROWS = (
    {
        "date": "06-Apr-2026",
        "voucher_type": "Payment",
        "party": "Olympus Chemicals LLP",
        "voucher_no": "PMT/0001",
        "debit": "88476.15",
        "credit": "",
    },
    {
        "date": "21-Apr-2026",
        "voucher_type": "Receipt",
        "party": "Meridian Traders",
        "voucher_no": "RCT/0001",
        "debit": "",
        "credit": "177000.00",
    },
)

_BANK_ROWS = (
    {
        "date": "06/04/2026",
        "narration": "NEFT-OLYMPUS CHEMICALS LLP-PUR/2026-27/0001",
        "ref_no": "N026041234567",
        "debit": "88476.15",
        "credit": "",
        "balance": "1911523.85",
    },
    {
        "date": "21/04/2026",
        "narration": "NEFT-MERIDIAN TRADERS-SAL/2026-27/0001",
        "ref_no": "N026049876543",
        "debit": "",
        "credit": "177000.00",
        "balance": "2088523.85",
    },
    {
        "date": "30/04/2026",
        "narration": "GSTPMT-GST PAYMENT CHALLAN 2026-04",
        "ref_no": "",
        "debit": "15750.00",
        "credit": "",
        "balance": "2072773.85",
    },
)

# GSTR-2B is the portal's own download and is never typed by hand; this is the
# shape a real one has, trimmed to two sections. `data` at the top level and
# `rtnprd` as MMYYYY are both load-bearing: the period a file is filed under
# is read from `rtnprd`, and only if it is absent is the filename consulted.
_GSTR2B = {
    "data": {
        "rtnprd": "042026",
        "gstin": "29PNRCT2430K1ZP",
        "gendt": "14-05-2026",
        "docdata": {
            "b2b": [
                {
                    "ctin": "06OSOCQ7499G1Z8",
                    "trdnm": "OLYMPUS CHEMICALS LLP",
                    "supprd": "042026",
                    "inv": [
                        {
                            "inum": "INV-6227",
                            "idt": "02-04-2026",
                            "typ": "R",
                            "txval": "84263.00",
                            "camt": "0.00",
                            "samt": "0.00",
                            "iamt": "4213.15",
                            "csamt": "0.00",
                            "val": "88476.15",
                            "rev": "N",
                            "itcavl": "Y",
                            "rsn": "",
                        }
                    ],
                },
                {
                    "ctin": "29AABCC1234D1Z5",
                    "trdnm": "CITADEL SUPPLIES",
                    "supprd": "042026",
                    "inv": [
                        {
                            "inum": "INV No. 5803",
                            "idt": "11-04-2026",
                            "typ": "R",
                            "txval": "20221.00",
                            "camt": "1213.26",
                            "samt": "1213.26",
                            "iamt": "0.00",
                            "csamt": "0.00",
                            "val": "22647.52",
                            "rev": "N",
                            "itcavl": "Y",
                            "rsn": "",
                        }
                    ],
                },
            ],
            "cdnr": [
                {
                    "ctin": "29AABCC1234D1Z5",
                    "trdnm": "CITADEL SUPPLIES",
                    "supprd": "042026",
                    "nt": [
                        {
                            "ntnum": "CN-118",
                            "ntdt": "24-04-2026",
                            "nttyp": "C",
                            "typ": "R",
                            "txval": "5000.00",
                            "camt": "300.00",
                            "samt": "300.00",
                            "iamt": "0.00",
                            "csamt": "0.00",
                            "val": "5600.00",
                            "itcavl": "Y",
                            "rsn": "",
                        }
                    ],
                }
            ],
        },
        # Rule 37A reversals are read from the file, never inferred. An empty
        # list is normal; a populated one keys back onto ctin plus inum.
        "itcrev37a": [],
    }
}

# IMS has no published downloadable schema — GSTN's advisory describes the
# semantics and nothing else — so this shape is defined by this project, and
# the file says so about itself rather than implying an authority it does not
# have.
_IMS = {
    "schema": "diligenceready/ims-export/1",
    "note": (
        "Shape defined by DiligenceReady. GSTN publishes no downloadable IMS "
        "schema; the field semantics follow its advisory."
    ),
    "rtnprd": "042026",
    "gstin": "29PNRCT2430K1ZP",
    "records": [
        {
            "ctin": "06OSOCQ7499G1Z8",
            "trdnm": "OLYMPUS CHEMICALS LLP",
            "doctype": "INV",
            "inum": "INV-6227",
            "idt": "02-04-2026",
            "val": "88476.15",
            "supplier_filed": True,
            "is_amendment": False,
            "amend_direction": None,
            "status": "no_action",
            "actioned_at": None,
            "row": 1,
        },
        {
            "ctin": "29AABCC1234D1Z5",
            "trdnm": "CITADEL SUPPLIES",
            "doctype": "CN",
            "inum": "CN-118",
            "orig_inum": "INV No. 5803",
            "idt": "24-04-2026",
            "val": "5600.00",
            "supplier_filed": True,
            "is_amendment": False,
            "amend_direction": None,
            "status": "accepted",
            "actioned_at": "28-04-2026",
            "row": 2,
        },
    ],
}


TEMPLATES: dict[str, Template] = {
    "purchase_register": Template(
        kind="purchase_register",
        label="Purchase register",
        filename="purchase_register_template.csv",
        media_type="text/csv",
        body=_csv(PURCHASE_REGISTER, _PURCHASE_ROWS),
        required=_required(PURCHASE_REGISTER),
        notes=(
            "One row per purchase invoice. Columns the system does not know are "
            "ignored, so a raw Tally export can be uploaded as it comes.",
            "Dates in any Indian convention: 02-Apr-2026, 02/04/2026, 2026-04-02.",
            "Either IGST, or CGST plus SGST. Leave the unused heads at 0.00.",
            "GSTIN may be blank. Suppliers are matched by name when it is.",
        ),
    ),
    "gstr2b": Template(
        kind="gstr2b",
        label="GSTR-2B",
        filename="gstr2b_2026_04_template.json",
        media_type="application/json",
        body=_json(_GSTR2B),
        required=("data.rtnprd", "data.docdata"),
        notes=(
            "Download this from the GST portal rather than building it. The "
            "example is here so a file can be checked before it is uploaded.",
            "Every table is read, not just B2B: credit notes, amendments, ISD "
            "and imports all land.",
            "The period comes from rtnprd as MMYYYY. If that is missing the "
            "filename is read instead, so keep a YYYY_MM in it.",
        ),
    ),
    "bank_stmt": Template(
        kind="bank_stmt",
        label="Bank statement",
        filename="bank_statement_template.csv",
        media_type="text/csv",
        body=_csv(BANK_STATEMENT, _BANK_ROWS),
        required=_required(BANK_STATEMENT),
        notes=(
            "Every bank names these differently and the common spellings are all "
            "recognised: HDFC's 'Withdrawal Amt.', ICICI's 'Withdrawal Amount "
            "(INR)', SBI's 'Debit', Axis's 'DR'.",
            "A single signed Amount column is read too — a trailing Cr or Dr, or "
            "a leading minus, is understood.",
            "The narration is what party matching reads, so do not strip it.",
        ),
    ),
    "sales_ledger": Template(
        kind="sales_ledger",
        label="Sales register",
        filename="sales_register_template.csv",
        media_type="text/csv",
        body=_csv(SALES_REGISTER, _SALES_ROWS),
        required=_required(SALES_REGISTER),
        notes=(
            "One row per sales invoice.",
            "Tax may be one total rather than split by head.",
        ),
    ),
    "ledger": Template(
        kind="ledger",
        label="Receipts and payments",
        filename="ledger_entries_template.csv",
        media_type="text/csv",
        body=_csv(LEDGER_ENTRIES, _LEDGER_ROWS),
        required=_required(LEDGER_ENTRIES),
        notes=(
            "The receipts and payments side of the books, which is what the bank "
            "statement is reconciled against.",
            "One of Debit or Credit per row, the other blank.",
        ),
    ),
    "ims": Template(
        kind="ims",
        label="IMS dashboard",
        filename="ims_2026_04_template.json",
        media_type="application/json",
        body=_json(_IMS),
        required=("rtnprd", "records"),
        notes=(
            "The Invoice Management System actions taken on the portal: accepted, "
            "rejected, pending or no_action.",
            "doctype is INV, CN or DN. A credit note carries orig_inum, the "
            "invoice it corrects, without which a purchase return cannot be told "
            "from a document the client never bought.",
            "The period comes from rtnprd as MMYYYY, with the filename as fallback.",
        ),
    ),
}
