"""Feed parsers. Each row lands in a typed column with its provenance attached.

Design law (§07): every financial row carries source_document_id and
source_row. Nothing here inserts a record it cannot trace back to a line in a
file. `source_row` is the line number as a person would count it when they
open the file — the header is line 1 — so "row 1842" in an evidence card is
literally row 1842 in the CSV.

Sales invoices are ledger entries with voucher_type 'Sales'. The blueprint's
schema has no sales_invoices table, and it does not need one: R7 reads revenue
per party from these rows and R8 ages them against receipts.
"""

from __future__ import annotations

import csv
import json
import uuid
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest.columns import (
    BANK_STATEMENT,
    LEDGER_ENTRIES,
    PURCHASE_REGISTER,
    SALES_REGISTER,
    resolve,
)
from diligence_engine.ingest.documents import DocumentRef, stable_id
from diligence_engine.ingest.gstr2b_shape import iter_entries
from diligence_engine.ingest.parties import PartyResolver
from diligence_engine.normalise import (
    is_valid_gstin,
    norm_gstin,
    norm_invoice_no,
    optional_amount,
    parse_amount,
    parse_date,
    period_of,
)

_BATCH = 500


@dataclass
class IngestResult:
    kind: str
    filename: str
    rows: int
    skipped: bool = False
    unresolved_parties: int = 0


def _flush(conn: Connection, statement: str, rows: list[dict]) -> None:
    for start in range(0, len(rows), _BATCH):
        conn.execute(text(statement), rows[start : start + _BATCH])


# ── GSTR-2B ─────────────────────────────────────────────────────────────────

_GSTR2B_INSERT = """
insert into gstr2b_lines (
    id, company_id, period, section, supplier_gstin, supplier_name,
    invoice_no, norm_invoice_no, bill_of_entry_no, invoice_date,
    is_reverse_charge, is_amendment, amends_invoice_no, note_type,
    taxable_value, cgst, sgst, igst, cess, total_value,
    itc_available, itc_reversal_37a, source_document_id, source_row
) values (
    :id, :company_id, :period, :section, :supplier_gstin, :supplier_name,
    :invoice_no, :norm_invoice_no, :bill_of_entry_no, :invoice_date,
    :is_reverse_charge, :is_amendment, :amends_invoice_no, :note_type,
    :taxable_value, :cgst, :sgst, :igst, :cess, :total_value,
    :itc_available, :itc_reversal_37a, :source_document_id, :source_row
) on conflict (id) do nothing
"""


def ingest_gstr2b(
    conn: Connection,
    company_id: uuid.UUID,
    document: DocumentRef,
    path: Path,
    period: str,
    resolver: PartyResolver,
) -> IngestResult:
    """Read every section of the statement, not just B2B.

    Section 15.2: GSTR-2B is sixteen tables. Each has its own shape — CDNR
    keys on a note number and carries a direction, IMPG keys on a bill of
    entry and has no supplier at all, ISD distributes credit that will never
    match a purchase invoice. Reading only B2B silently drops credit notes,
    which reduce the claim, and amendments, which R3 would otherwise call
    duplicates.

    The reading order comes from `gstr2b_shape.iter_entries`, which the
    evidence drill-down also walks. `source_row` is a position in that order,
    so the two must never derive it separately.
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    data = payload["data"]

    # Rule 37A comes from GSTN's own computation, keyed back onto the document
    # it belongs to. Read, never inferred (section 15 finding 02).
    reversals: dict[tuple[str, str], Decimal] = {}
    for entry in data.get("itcrev37a", []):
        key = (entry["ctin"], norm_invoice_no(entry["inum"]))
        reversals[key] = reversals.get(key, Decimal("0.00")) + parse_amount(entry["rev_amt"])

    rows: list[dict] = []
    registered: set[str] = set()

    for row_number, (shape, block, entry) in enumerate(iter_entries(payload), start=1):
        gstin = block.get("ctin") if shape.has_supplier else None
        trade_name = block.get("trdnm", "") if shape.has_supplier else ""

        if gstin and gstin not in registered:
            resolver.upsert(conn, gstin=gstin, name=trade_name, kind="vendor")
            if trade_name:
                resolver.add_alias(conn, resolver.by_gstin[gstin], trade_name, "gstr2b")
            registered.add(gstin)

        number = entry[shape.number_field]
        normalised = norm_invoice_no(number)
        is_import = not shape.has_supplier

        rows.append(
            {
                "id": stable_id("gstr2b", document.id, row_number),
                "company_id": company_id,
                "period": period,
                "section": shape.section,
                "supplier_gstin": gstin,
                "supplier_name": (
                    f"Bill of entry, port {entry.get('portcode', '')}".strip()
                    if is_import
                    else trade_name
                ),
                "invoice_no": number,
                "norm_invoice_no": normalised,
                "bill_of_entry_no": number if is_import else None,
                "invoice_date": parse_date(entry[shape.date_field]),
                "is_reverse_charge": entry.get("rev", "N") == "Y",
                "is_amendment": shape.is_amendment,
                "amends_invoice_no": (
                    norm_invoice_no(entry["oinum"]) if entry.get("oinum") else None
                ),
                # C reduces the claim, D increases it. Values stay positive
                # and match the file; the direction rides alongside so no
                # aggregate has to guess.
                "note_type": entry.get("nttyp"),
                "taxable_value": parse_amount(entry.get("txval")),
                "cgst": parse_amount(entry.get("camt")),
                "sgst": parse_amount(entry.get("samt")),
                "igst": parse_amount(entry.get("iamt")),
                "cess": parse_amount(entry.get("csamt")),
                "total_value": parse_amount(entry.get("val")),
                "itc_available": entry.get("itcavl", "Y") == "Y",
                "itc_reversal_37a": (
                    reversals.get((gstin, normalised), Decimal("0.00"))
                    if gstin
                    else Decimal("0.00")
                ),
                "source_document_id": document.id,
                "source_row": row_number,
            }
        )

    resolver.reindex()
    _flush(conn, _GSTR2B_INSERT, rows)
    return IngestResult(kind="gstr2b", filename=document.filename, rows=len(rows))


# ── Tally purchase register ─────────────────────────────────────────────────

_PURCHASE_INSERT = """
insert into purchase_invoices (
    id, company_id, period, party_id, supplier_gstin,
    invoice_no, norm_invoice_no, invoice_date,
    taxable_value, cgst, sgst, igst, cess, total_value,
    source_document_id, source_row
) values (
    :id, :company_id, :period, :party_id, :supplier_gstin,
    :invoice_no, :norm_invoice_no, :invoice_date,
    :taxable_value, :cgst, :sgst, :igst, :cess, :total_value,
    :source_document_id, :source_row
) on conflict (id) do nothing
"""


def ingest_purchase_register(
    conn: Connection,
    company_id: uuid.UUID,
    document: DocumentRef,
    path: Path,
    resolver: PartyResolver,
    known_periods: set[str],
) -> IngestResult:
    """The file with no GSTIN column — the reason party resolution exists."""
    rows: list[dict] = []
    unresolved = 0

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = resolve(list(reader.fieldnames or []), PURCHASE_REGISTER)

        for line_number, record in enumerate(reader, start=2):
            invoice_date = parse_date(columns.get(record, "date"))
            period = period_of(invoice_date)
            if period not in known_periods:
                continue

            ledger_name = columns.get(record, "party")

            # Some packages do export a GSTIN column, and a GSTIN the file
            # states beats one inferred from a name. Tally's register has
            # none, which is why the party layer exists at all — but where a
            # column is present it is used, and only checked for shape.
            stated_gstin = (
                norm_gstin(columns.get(record, "gstin")) if columns.has("gstin") else None
            )
            if stated_gstin and not is_valid_gstin(stated_gstin):
                # A GSTIN that fails its own check digit is a typo in the
                # register, not a supplier the portal has never heard of.
                stated_gstin = None

            resolved = resolver.resolve_name(ledger_name)
            if stated_gstin:
                party_id = resolver.upsert(
                    conn, gstin=stated_gstin, name=ledger_name, kind="vendor"
                )
                resolver.reindex()
            elif resolved is None:
                # A vendor that appears nowhere in any 2B still needs a party
                # row, or its invoices lose their supplier entirely.
                party_id = resolver.upsert(conn, gstin=None, name=ledger_name, kind="vendor")
                resolver.reindex()
                unresolved += 1
            else:
                party_id = resolved.party_id
            resolver.add_alias(conn, party_id, ledger_name, "tally_ledger")

            # §08 step 2: where the register has no GSTIN column, it is
            # resolved through party_aliases -> parties.gstin and stamped here.
            supplier_gstin = stated_gstin or resolver.gstin_of.get(party_id)

            taxable = parse_amount(columns.get(record, "taxable"))
            cgst = parse_amount(columns.get(record, "cgst"))
            sgst = parse_amount(columns.get(record, "sgst"))
            igst = parse_amount(columns.get(record, "igst"))
            cess = parse_amount(columns.get(record, "cess"))
            rows.append(
                {
                    "id": stable_id("purchase", document.id, line_number),
                    "company_id": company_id,
                    "period": period,
                    "party_id": party_id,
                    "supplier_gstin": supplier_gstin,
                    "invoice_no": columns.get(record, "voucher_no"),
                    "norm_invoice_no": norm_invoice_no(columns.get(record, "voucher_no")),
                    "invoice_date": invoice_date,
                    "taxable_value": taxable,
                    "cgst": cgst,
                    "sgst": sgst,
                    "igst": igst,
                    "cess": cess,
                    "total_value": parse_amount(columns.get(record, "total")),
                    "source_document_id": document.id,
                    "source_row": line_number,
                }
            )

    _flush(conn, _PURCHASE_INSERT, rows)
    return IngestResult(
        kind="purchase_register",
        filename=document.filename,
        rows=len(rows),
        unresolved_parties=unresolved,
    )


# ── Tally sales register and vouchers ───────────────────────────────────────

_LEDGER_INSERT = """
insert into ledger_entries (
    id, company_id, period, voucher_type, voucher_no, entry_date,
    party_id, debit, credit, ledger_name, source_document_id, source_row
) values (
    :id, :company_id, :period, :voucher_type, :voucher_no, :entry_date,
    :party_id, :debit, :credit, :ledger_name, :source_document_id, :source_row
) on conflict (id) do nothing
"""


def ingest_sales_register(
    conn: Connection,
    company_id: uuid.UUID,
    document: DocumentRef,
    path: Path,
    resolver: PartyResolver,
    known_periods: set[str],
) -> IngestResult:
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = resolve(list(reader.fieldnames or []), SALES_REGISTER)

        for line_number, record in enumerate(reader, start=2):
            entry_date = parse_date(columns.get(record, "date"))
            period = period_of(entry_date)
            if period not in known_periods:
                continue

            ledger_name = columns.get(record, "party")
            resolved = resolver.resolve_name(ledger_name)
            party_id = (
                resolved.party_id
                if resolved
                else resolver.upsert(conn, gstin=None, name=ledger_name, kind="customer")
            )
            resolver.add_alias(conn, party_id, ledger_name, "tally_ledger")

            rows.append(
                {
                    "id": stable_id("sales", document.id, line_number),
                    "company_id": company_id,
                    "period": period,
                    "voucher_type": "Sales",
                    "voucher_no": columns.get(record, "voucher_no"),
                    "entry_date": entry_date,
                    "party_id": party_id,
                    # A sale debits the receivable and is what R8 ages.
                    "debit": parse_amount(columns.get(record, "total")),
                    "credit": None,
                    "ledger_name": ledger_name,
                    "source_document_id": document.id,
                    "source_row": line_number,
                }
            )
    resolver.reindex()
    _flush(conn, _LEDGER_INSERT, rows)
    return IngestResult(kind="sales_ledger", filename=document.filename, rows=len(rows))


def ingest_ledger_entries(
    conn: Connection,
    company_id: uuid.UUID,
    document: DocumentRef,
    path: Path,
    resolver: PartyResolver,
    known_periods: set[str],
) -> IngestResult:
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = resolve(list(reader.fieldnames or []), LEDGER_ENTRIES)

        for line_number, record in enumerate(reader, start=2):
            entry_date = parse_date(columns.get(record, "date"))
            period = period_of(entry_date)
            if period not in known_periods:
                continue

            ledger_name = columns.get(record, "party")
            resolved = resolver.resolve_name(ledger_name)
            rows.append(
                {
                    "id": stable_id("voucher", document.id, line_number),
                    "company_id": company_id,
                    "period": period,
                    "voucher_type": columns.get(record, "voucher_type"),
                    "voucher_no": columns.get(record, "voucher_no"),
                    "entry_date": entry_date,
                    "party_id": resolved.party_id if resolved else None,
                    "debit": optional_amount(columns.get(record, "debit")),
                    "credit": optional_amount(columns.get(record, "credit")),
                    "ledger_name": ledger_name,
                    "source_document_id": document.id,
                    "source_row": line_number,
                }
            )
    _flush(conn, _LEDGER_INSERT, rows)
    return IngestResult(kind="ledger", filename=document.filename, rows=len(rows))


# ── bank statement ──────────────────────────────────────────────────────────

_BANK_INSERT = """
insert into bank_txns (
    id, company_id, period, txn_date, narration, ref_no,
    debit, credit, balance, party_id, source_document_id, source_row
) values (
    :id, :company_id, :period, :txn_date, :narration, :ref_no,
    :debit, :credit, :balance, :party_id, :source_document_id, :source_row
) on conflict (id) do nothing
"""


def ingest_bank_statement(
    conn: Connection,
    company_id: uuid.UUID,
    document: DocumentRef,
    path: Path,
    resolver: PartyResolver,
    known_periods: set[str],
) -> IngestResult:
    """Narration is free text. Whatever cannot be resolved stays unresolved.

    A party guessed from a narration is worse than no party: it produces a
    match that looks explained and is not. Unresolved rows are exactly what R6
    reads.
    """
    rows: list[dict] = []
    unresolved = 0
    non_transactions = 0

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        columns = resolve(list(reader.fieldnames or []), BANK_STATEMENT)

        for line_number, record in enumerate(reader, start=2):
            txn_date = parse_date(columns.get(record, "date"))
            period = period_of(txn_date)
            if period not in known_periods:
                continue

            narration = columns.get(record, "narration")
            resolved = resolver.resolve_narration(narration)
            if resolved is None:
                unresolved += 1

            debit = optional_amount(columns.get(record, "debit"))
            credit = optional_amount(columns.get(record, "credit"))

            # A statement carries lines that move no money: an opening or
            # closing balance, a narration-only advice, a memo written as
            # 0.00 in both columns. The schema requires exactly one side, so
            # these are skipped and counted rather than aborting the load.
            if debit == 0:
                debit = None
            if credit == 0:
                credit = None
            if debit is None and credit is None:
                non_transactions += 1
                continue
            rows.append(
                {
                    "id": stable_id("bank", document.id, line_number),
                    "company_id": company_id,
                    "period": period,
                    "txn_date": txn_date,
                    "narration": narration,
                    "ref_no": columns.get(record, "ref_no") or None,
                    "debit": debit,
                    "credit": credit,
                    "balance": parse_amount(columns.get(record, "balance")),
                    "party_id": resolved.party_id if resolved else None,
                    "source_document_id": document.id,
                    "source_row": line_number,
                }
            )

    _flush(conn, _BANK_INSERT, rows)
    return IngestResult(
        kind="bank_stmt",
        filename=document.filename,
        rows=len(rows),
        unresolved_parties=unresolved,
    )


# ── Invoice Management System ───────────────────────────────────────────────

_IMS_INSERT = """
insert into ims_records (
    id, company_id, period, supplier_gstin, doc_type, invoice_no, norm_invoice_no,
    orig_norm_invoice_no,
    invoice_date, total_value, supplier_filed, is_amendment, amendment_direction,
    portal_status, pending_allowed, reject_raises_supplier_liability,
    actioned_at, source_document_id, source_row
) values (
    :id, :company_id, :period, :supplier_gstin, :doc_type, :invoice_no, :norm_invoice_no,
    :orig_norm_invoice_no,
    :invoice_date, :total_value, :supplier_filed, :is_amendment, :amendment_direction,
    :portal_status, :pending_allowed, :reject_raises_supplier_liability,
    :actioned_at, :source_document_id, :source_row
) on conflict (id) do nothing
"""

_DOC_TYPE = {"INV": "invoice", "DBN": "debit_note", "CRN": "credit_note"}


def pending_allowed(doc_type: str, is_amendment: bool, direction: str | None) -> bool:
    """The advisory's prohibitions, applied at ingestion rather than in the UI.

    Pending is barred on an original credit note, on an upward amendment of a
    credit note whatever was done to the original, and on a downward amendment
    of a credit note. A screen that offers it on those produces a portal error
    the user cannot interpret, so the flag is computed once, here, and the
    interface reads it rather than re-deriving the rule.
    """
    if doc_type == "credit_note":
        return False
    if is_amendment and direction == "downward":
        # A downward amendment of an invoice or debit note whose original was
        # accepted and filed also bars pending. The filing state of the
        # original is not in this feed, so the safe reading is taken.
        return False
    return True


def ingest_ims(
    conn: Connection,
    company_id: uuid.UUID,
    document: DocumentRef,
    path: Path,
    period: str,
) -> IngestResult:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows: list[dict] = []

    for index, record in enumerate(payload.get("records", []), start=1):
        doc_type = _DOC_TYPE.get(record.get("doctype", "INV"), "invoice")
        direction = record.get("amend_direction")
        is_amendment = bool(record.get("is_amendment"))
        actioned_at = record.get("actioned_at")

        rows.append(
            {
                "id": stable_id("ims", document.id, index),
                # A credit note corrects an earlier document. Without that
                # reference the recommender cannot tell a legitimate purchase
                # return from a document the client never bought.
                "orig_norm_invoice_no": (
                    norm_invoice_no(record["orig_inum"]) if record.get("orig_inum") else None
                ),
                "company_id": company_id,
                "period": period,
                "supplier_gstin": record["ctin"],
                "doc_type": doc_type,
                "invoice_no": record["inum"],
                "norm_invoice_no": norm_invoice_no(record["inum"]),
                "invoice_date": parse_date(record["idt"]),
                "total_value": parse_amount(record["val"]),
                "supplier_filed": bool(record.get("supplier_filed", True)),
                "is_amendment": is_amendment,
                "amendment_direction": direction,
                "portal_status": record.get("status", "no_action"),
                "pending_allowed": pending_allowed(doc_type, is_amendment, direction),
                # Rejecting a credit note raises what the supplier owes in
                # their next GSTR-3B, and they can see the action taken.
                "reject_raises_supplier_liability": doc_type == "credit_note",
                "actioned_at": parse_date(actioned_at) if actioned_at else None,
                "source_document_id": document.id,
                "source_row": index,
            }
        )

    _flush(conn, _IMS_INSERT, rows)
    return IngestResult(kind="ims", filename=document.filename, rows=len(rows))
