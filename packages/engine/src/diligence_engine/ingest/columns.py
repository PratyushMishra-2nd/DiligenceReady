"""Column resolution: the layer that makes "adapter, not rewrite" true.

§09 claims that because the purchase register arrives as CSV, exports from
Busy, Marg, Zoho and Vyapar reuse the same normaliser. That claim is only
worth anything if the parsers do not depend on one vendor's exact header
spelling — and §14's first week of work is hardening ingestion against real
Tally exports, "whose column layouts differ for every client".

So a parser asks for a *logical* field and this layer finds it:

    columns = resolve(header_row, PURCHASE_REGISTER)
    ledger_name = columns.get(row, "party")

Three rules it follows, in order:

1.  **Exact match on a known name wins.** No cleverness where none is needed.
2.  **Then a normalised match** — case, punctuation and spacing removed — so
    "Voucher No.", "VOUCHER NO" and "voucher_no" are one name.
3.  **Then nothing.** There is no fuzzy fallback for a column. Guessing that
    "Amount" means taxable value rather than invoice value is exactly the
    kind of silent wrong number this product exists to avoid; a header the
    layer does not recognise is a failure that names itself and asks for a
    synonym to be added.

Adding support for a new accounting package is therefore a line in a tuple,
which is what "adapter, not rewrite" has to mean to be worth saying.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_NOISE = re.compile(r"[^a-z0-9]")


def _norm(header: str) -> str:
    return _NOISE.sub("", header.lower())


@dataclass(frozen=True)
class Field:
    """One logical column, and every header a real export has called it."""

    key: str
    names: tuple[str, ...]
    required: bool = True
    # What this field means, quoted back when it cannot be found.
    describes: str = ""


@dataclass(frozen=True)
class FileSchema:
    name: str
    fields: tuple[Field, ...]

    def field(self, key: str) -> Field:
        for candidate in self.fields:
            if candidate.key == key:
                return candidate
        raise KeyError(key)


class UnreadableExport(ValueError):
    """The file does not carry the columns this parser needs.

    Carries the actual headers and what was looked for, because the fix is
    almost always "this vendor calls it something else" and the person
    fixing it needs both halves.
    """


@dataclass
class ColumnMap:
    schema: FileSchema
    resolved: dict[str, str] = field(default_factory=dict)
    unmapped_headers: tuple[str, ...] = ()

    def has(self, key: str) -> bool:
        return key in self.resolved

    def get(self, row: dict[str, str], key: str, default: str = "") -> str:
        """Read a logical field out of a raw CSV row."""
        header = self.resolved.get(key)
        if header is None:
            return default
        value = row.get(header)
        return default if value is None else value.strip()


def resolve(headers: list[str], schema: FileSchema) -> ColumnMap:
    """Map a file's headers onto the schema's logical fields."""
    present = [header for header in headers if header and header.strip()]
    by_exact = {header.strip(): header for header in present}
    by_norm: dict[str, str] = {}
    for header in present:
        by_norm.setdefault(_norm(header), header)

    resolved: dict[str, str] = {}
    taken: set[str] = set()

    for entry in schema.fields:
        for name in entry.names:
            header = by_exact.get(name)
            if header is not None and header not in taken:
                resolved[entry.key] = header
                taken.add(header)
                break
        else:
            for name in entry.names:
                header = by_norm.get(_norm(name))
                if header is not None and header not in taken:
                    resolved[entry.key] = header
                    taken.add(header)
                    break

    missing = [entry for entry in schema.fields if entry.required and entry.key not in resolved]
    if missing:
        detail = "; ".join(
            f"{entry.key} ({entry.describes or 'no description'}) — looked for "
            f"{', '.join(repr(name) for name in entry.names[:4])}"
            for entry in missing
        )
        raise UnreadableExport(
            f"{schema.name}: {len(missing)} required column(s) not found. {detail}. "
            f"The file's headers are: {', '.join(repr(header) for header in present)}. "
            "If this export calls the column something else, add that spelling to the "
            "field's names tuple in ingest/columns.py."
        )

    return ColumnMap(
        schema=schema,
        resolved=resolved,
        unmapped_headers=tuple(header for header in present if header not in taken),
    )


# ── the schemas ─────────────────────────────────────────────────────────────
#
# Names marked below come from the export this project generates plus the
# spellings that commonly appear in Indian accounting exports. They are
# candidates, not a verified compatibility matrix: §14 week one is running
# real exports from three friendly CA firms through this, and every layout
# that fails will add a name here rather than a parser elsewhere.

PURCHASE_REGISTER = FileSchema(
    name="purchase register",
    fields=(
        Field(
            "date",
            ("Date", "Invoice Date", "Voucher Date", "Bill Date", "Dated", "Doc Date"),
            describes="the invoice date",
        ),
        Field(
            "party",
            (
                "Particulars",
                "Party Name",
                "Supplier Name",
                "Ledger Name",
                "Vendor Name",
                "Party",
                "Supplier",
                "Account Name",
            ),
            describes="the supplier as the books name them",
        ),
        Field(
            "voucher_no",
            (
                "Voucher No",
                "Voucher No.",
                "Invoice No",
                "Invoice No.",
                "Bill No",
                "Bill Number",
                "Document No",
                "Invoice Number",
                "Vch No",
            ),
            describes="the document number",
        ),
        Field(
            "total",
            (
                "Invoice Value",
                "Total",
                "Total Amount",
                "Gross Total",
                "Bill Amount",
                "Amount",
                "Invoice Amount",
                "Grand Total",
            ),
            describes="the total document value including tax",
        ),
        Field(
            "taxable",
            ("Taxable Value", "Taxable Amount", "Assessable Value", "Net Amount", "Sub Total"),
            required=False,
            describes="value before tax",
        ),
        Field("cgst", ("CGST", "CGST Amount", "Central Tax"), required=False, describes="CGST"),
        Field(
            "sgst",
            ("SGST", "SGST Amount", "State Tax", "SGST/UTGST"),
            required=False,
            describes="SGST",
        ),
        Field("igst", ("IGST", "IGST Amount", "Integrated Tax"), required=False, describes="IGST"),
        Field("cess", ("Cess", "Cess Amount"), required=False, describes="cess"),
        Field(
            "voucher_type",
            ("Voucher Type", "Vch Type", "Type"),
            required=False,
            describes="the voucher type",
        ),
        Field(
            "gstin",
            ("GSTIN", "Supplier GSTIN", "GSTIN/UIN", "Party GSTIN", "GST No"),
            required=False,
            describes="the supplier GSTIN, which a Tally register usually omits",
        ),
        Field(
            "narration",
            ("Narration", "Remarks", "Description"),
            required=False,
            describes="free text",
        ),
    ),
)

SALES_REGISTER = FileSchema(
    name="sales register",
    fields=(
        Field("date", ("Date", "Invoice Date", "Voucher Date", "Dated"), describes="invoice date"),
        Field(
            "party",
            ("Particulars", "Party Name", "Customer Name", "Ledger Name", "Party", "Buyer"),
            describes="the customer",
        ),
        Field(
            "voucher_no",
            ("Voucher No", "Voucher No.", "Invoice No", "Invoice No.", "Bill No", "Vch No"),
            describes="the document number",
        ),
        Field(
            "total",
            ("Invoice Value", "Total", "Total Amount", "Bill Amount", "Amount", "Grand Total"),
            describes="the total document value",
        ),
        Field(
            "taxable",
            ("Taxable Value", "Taxable Amount", "Net Amount"),
            required=False,
            describes="value before tax",
        ),
        Field(
            "tax", ("Tax Amount", "Total Tax", "GST Amount"), required=False, describes="total tax"
        ),
    ),
)

LEDGER_ENTRIES = FileSchema(
    name="ledger entries",
    fields=(
        Field("date", ("Date", "Voucher Date", "Dated", "Txn Date"), describes="the entry date"),
        Field("voucher_type", ("Voucher Type", "Vch Type", "Type"), describes="receipt or payment"),
        Field(
            "party",
            ("Particulars", "Party Name", "Ledger Name", "Account Name", "Party"),
            describes="the ledger",
        ),
        Field(
            "voucher_no",
            ("Voucher No", "Voucher No.", "Vch No", "Reference"),
            required=False,
            describes="the voucher number",
        ),
        Field(
            "debit",
            ("Debit", "Dr", "Debit Amount", "Withdrawal"),
            required=False,
            describes="the debit column",
        ),
        Field(
            "credit",
            ("Credit", "Cr", "Credit Amount", "Deposit"),
            required=False,
            describes="the credit column",
        ),
    ),
)

# Bank statements vary most of all, and the spread below is the point: HDFC
# writes "Withdrawal Amt.", ICICI writes "Withdrawal Amount (INR)", SBI writes
# "Debit", Axis writes "DR", Kotak writes "Withdrawal(Dr)". One schema, many
# spellings, and a failure that names the file's actual headers.
BANK_STATEMENT = FileSchema(
    name="bank statement",
    fields=(
        Field(
            "date",
            (
                "Txn Date",
                "Transaction Date",
                "Date",
                "Tran Date",
                "Value Date",
                "Post Date",
                "DATE",
            ),
            describes="the transaction date",
        ),
        Field(
            "narration",
            (
                "Narration",
                "Description",
                "Transaction Remarks",
                "Particulars",
                "Transaction Details",
                "Remarks",
            ),
            describes="the free-text narration party resolution reads",
        ),
        Field(
            "debit",
            (
                "Withdrawal Amt",
                "Withdrawal Amt.",
                "Withdrawal Amount (INR)",
                "Withdrawal (Dr)",
                "Withdrawal",
                "Debit",
                "Debit Amount",
                "DR",
                "Dr Amount",
            ),
            required=False,
            describes="money out",
        ),
        Field(
            "credit",
            (
                "Deposit Amt",
                "Deposit Amt.",
                "Deposit Amount (INR)",
                "Deposit (Cr)",
                "Deposit",
                "Credit",
                "Credit Amount",
                "CR",
                "Cr Amount",
            ),
            required=False,
            describes="money in",
        ),
        Field(
            "balance",
            (
                "Closing Balance",
                "Balance",
                "Balance (INR)",
                "Running Balance",
                "Available Balance",
            ),
            required=False,
            describes="the running balance",
        ),
        Field(
            "ref_no",
            (
                "Chq / Ref No",
                "Chq/Ref Number",
                "Cheque No",
                "Ref No",
                "Reference No",
                "Transaction ID",
                "UTR",
                "Chq No",
            ),
            required=False,
            describes="the cheque or UTR reference",
        ),
    ),
)


def signed_amount_columns(columns: ColumnMap, row: dict[str, str]) -> tuple[str, str]:
    """Split a single signed amount column into debit and credit, where that is the shape.

    Some exports carry one "Amount" column with a sign or a Dr/Cr suffix
    instead of two columns. This is the one shape difference that cannot be
    fixed by renaming a header, so it is handled explicitly rather than
    guessed at inside a parser.
    """
    debit = columns.get(row, "debit")
    credit = columns.get(row, "credit")
    if debit or credit:
        return debit, credit

    amount = columns.get(row, "amount")
    if not amount:
        return "", ""

    text = amount.strip()
    if text.upper().endswith(("CR", "CR.")):
        return "", text
    if text.upper().endswith(("DR", "DR.")):
        return text, ""
    if text.startswith("-"):
        return text[1:], ""
    return "", text
