"""Write the ground truth out as the three feeds, each degraded its own way.

    tally_purchase_register.csv   ledger names, mixed invoice series, NO GSTIN
    gstr2b_YYYY_MM.json           GSTIN-keyed, legal names, portal field names
    bank_statement.csv            free-text narration, UTR references

On the 2B field names: `ctin`, `trdnm`, `inum`, `idt`, `txval`, `iamt`,
`camt`, `samt`, `csamt`, `val`, `rev` and `itcavl` are GSTN's own keys, used
here so the ingester is written against the real shape rather than an
invented one. The `itcrev37a` block is **not** a portal key — the published
statement carries Rule 37A in its own summary section, and this file flattens
it to one entry per document so the seeded feed stays a single file per
period. That simplification is called out here rather than left for someone
to discover in the ingester.

The answer key goes to a sibling `answers/` directory, never into `feeds/`.
Nothing in the ingestion path can read it.
"""

from __future__ import annotations

import csv
import json
from decimal import Decimal
from pathlib import Path

from diligence_engine.normalise import shift_period
from diligence_engine.seedgen.ims import write_ims
from diligence_engine.seedgen.model import GroundTruth, PurchaseDoc

_PURCHASE_HEADER = (
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

_SALES_HEADER = (
    "Date",
    "Particulars",
    "Voucher Type",
    "Voucher No",
    "Taxable Value",
    "Tax Amount",
    "Invoice Value",
)

_LEDGER_HEADER = (
    "Date",
    "Voucher Type",
    "Voucher No",
    "Particulars",
    "Debit",
    "Credit",
)

_BANK_HEADER = (
    "Txn Date",
    "Value Date",
    "Narration",
    "Chq / Ref No",
    "Withdrawal Amt",
    "Deposit Amt",
    "Closing Balance",
)


def _money(value: Decimal | None) -> str:
    return "" if value is None else f"{value:.2f}"


def _books_number(truth: GroundTruth, doc: PurchaseDoc) -> str:
    vendor = truth.party(doc.vendor_key)
    return vendor.books_series.format(n=doc.number, fy=_fy_of(doc))


def portal_number(truth: GroundTruth, doc: PurchaseDoc) -> str:
    vendor = truth.party(doc.vendor_key)
    return vendor.portal_series.format(n=doc.number, fy=_fy_of(doc))


def _fy_of(doc: PurchaseDoc) -> str:
    start = doc.doc_date.year if doc.doc_date.month >= 4 else doc.doc_date.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def write_feeds(truth: GroundTruth, root: Path) -> dict[str, Path]:
    """Write every feed and the answer key. Returns a map of label to path."""
    feeds = root / truth.company_slug / "feeds"
    answers = root / truth.company_slug / "answers"
    feeds.mkdir(parents=True, exist_ok=True)
    answers.mkdir(parents=True, exist_ok=True)

    written: dict[str, Path] = {
        "purchase_register": _write_purchase_register(truth, feeds),
        "sales_register": _write_sales_register(truth, feeds),
        "ledger": _write_ledger(truth, feeds),
        "bank_statement": _write_bank_statement(truth, feeds),
        "answers": _write_answers(truth, answers),
    }
    for period, path in _write_gstr2b(truth, feeds).items():
        written[f"gstr2b:{period}"] = path
    for period, path in write_ims(truth, truth.ims, feeds).items():
        written[f"ims:{period}"] = path
    return written


# ── Tally side ──────────────────────────────────────────────────────────────


def _write_purchase_register(truth: GroundTruth, feeds: Path) -> Path:
    """The register as Tally exports it: a ledger name, and no GSTIN column.

    The missing GSTIN is the single most consequential thing about this file.
    It is why matching has to resolve a party before it can compare an amount,
    and why GSTN's own offline tool — which requires a rigid template the
    export does not satisfy — cannot read it.
    """
    path = feeds / "tally_purchase_register.csv"
    rows = sorted(truth.purchases, key=lambda d: (d.doc_date, d.seq))

    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(_PURCHASE_HEADER)
        for doc in rows:
            vendor = truth.party(doc.vendor_key)
            record = [
                doc.doc_date.strftime("%d-%b-%Y"),
                vendor.ledger_name,
                "Purchase",
                _books_number(truth, doc),
                _money(doc.taxable),
                _money(doc.cgst),
                _money(doc.sgst),
                _money(doc.igst),
                _money(doc.cess),
                _money(doc.total),
                f"Being goods purchased from {vendor.ledger_name}",
            ]
            writer.writerow(record)
            if doc.duplicated_in_register:
                # Booked twice, a fortnight apart, exactly as it happens.
                writer.writerow(record)

    return path


def _write_sales_register(truth: GroundTruth, feeds: Path) -> Path:
    path = feeds / "tally_sales_register.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(_SALES_HEADER)
        for sale in sorted(truth.sales, key=lambda s: (s.doc_date, s.seq)):
            customer = truth.party(sale.customer_key)
            writer.writerow(
                [
                    sale.doc_date.strftime("%d-%b-%Y"),
                    customer.ledger_name,
                    "Sales",
                    f"S/{sale.number}",
                    _money(sale.taxable),
                    _money(sale.tax),
                    _money(sale.total),
                ]
            )
    return path


def _write_ledger(truth: GroundTruth, feeds: Path) -> Path:
    path = feeds / "tally_ledger_entries.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(_LEDGER_HEADER)
        for voucher in sorted(truth.vouchers, key=lambda v: (v.entry_date, v.seq)):
            writer.writerow(
                [
                    voucher.entry_date.strftime("%d-%b-%Y"),
                    voucher.voucher_type,
                    voucher.voucher_no,
                    voucher.ledger_name,
                    _money(voucher.debit),
                    _money(voucher.credit),
                ]
            )
    return path


# ── portal side ─────────────────────────────────────────────────────────────


def _write_gstr2b(truth: GroundTruth, feeds: Path) -> dict[str, Path]:
    """One statement per period, in GSTN's own field names.

    Three defect switches are honoured here:
      · absent_from_2b        the document is simply not written
      · portal_amount_delta   the portal's taxable value differs
      · filed_late            the document lands in the following period
      · reversal_37a          an entry appears in the reversal block
    """
    by_period: dict[str, list[PurchaseDoc]] = {period: [] for period in truth.periods}

    for doc in truth.purchases:
        if doc.absent_from_2b:
            continue
        target = shift_period(doc.period, 1) if doc.filed_late else doc.period
        if target in by_period:
            by_period[target].append(doc)

    written: dict[str, Path] = {}
    for period, docs in by_period.items():
        suppliers: dict[str, list[PurchaseDoc]] = {}
        for doc in docs:
            suppliers.setdefault(truth.party(doc.vendor_key).gstin, []).append(doc)

        b2b = []
        for gstin in sorted(suppliers):
            supplier_docs = sorted(suppliers[gstin], key=lambda d: (d.doc_date, d.number))
            vendor = truth.party(supplier_docs[0].vendor_key)
            b2b.append(
                {
                    "ctin": gstin,
                    "trdnm": vendor.legal_name,
                    "supprd": period.replace("-", "")[4:] + period[:4],
                    "inv": [_portal_invoice(truth, doc) for doc in supplier_docs],
                }
            )

        reversals = [
            {
                "ctin": truth.party(doc.vendor_key).gstin,
                "inum": portal_number(truth, doc),
                "idt": doc.doc_date.strftime("%d-%m-%Y"),
                "rev_amt": f"{doc.reversal_37a:.2f}",
                "rsn": "Supplier GSTR-3B not filed (Rule 37A)",
            }
            for doc in sorted(docs, key=lambda d: d.seq)
            if doc.reversal_37a > 0
        ]

        year, month = period.split("-")
        # GSTR-2B is sixteen tables. Emitting only B2B would let an ingester
        # that reads only B2B look correct (section 15.2).
        extra = truth.gstr2b_extra.get(period, {})
        docdata = {"b2b": b2b}
        for section in ("b2ba", "cdnr", "isd", "impg", "eco"):
            rows = extra.get(section) or []
            if rows:
                docdata[section] = rows

        payload = {
            "data": {
                "rtnprd": f"{month}{year}",
                "gstin": truth.gstin,
                "gendt": f"14-{month}-{year}",
                "docdata": docdata,
                # Not a portal key. See the module docstring.
                "itcrev37a": reversals,
            }
        }

        path = feeds / f"gstr2b_{year}_{month}.json"
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        written[period] = path

    return written


def _portal_invoice(truth: GroundTruth, doc: PurchaseDoc) -> dict[str, object]:
    delta = doc.portal_amount_delta
    taxable = doc.taxable + delta
    if delta:
        vendor = truth.party(doc.vendor_key)
        interstate = vendor.state_code != truth.state_code
        tax = (taxable * vendor.gst_rate / Decimal("100")).quantize(Decimal("0.01"))
        if interstate:
            cgst, sgst, igst = Decimal("0.00"), Decimal("0.00"), tax
        else:
            half = (tax / Decimal("2")).quantize(Decimal("0.01"))
            cgst, sgst, igst = half, tax - half, Decimal("0.00")
    else:
        cgst, sgst, igst = doc.cgst, doc.sgst, doc.igst

    return {
        "inum": portal_number(truth, doc),
        "idt": doc.doc_date.strftime("%d-%m-%Y"),
        "typ": "R",
        "txval": f"{taxable:.2f}",
        "camt": f"{cgst:.2f}",
        "samt": f"{sgst:.2f}",
        "iamt": f"{igst:.2f}",
        "csamt": f"{doc.cess:.2f}",
        "val": f"{taxable + cgst + sgst + igst + doc.cess:.2f}",
        "rev": "N",
        # GSTR-2B's ITC Not Available section. Read, not reimplemented.
        "itcavl": "N" if doc.blocked_reason else "Y",
        "rsn": doc.blocked_reason or "",
    }


# ── bank side ───────────────────────────────────────────────────────────────


def _write_bank_statement(truth: GroundTruth, feeds: Path) -> Path:
    path = feeds / "bank_statement.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(_BANK_HEADER)
        for line in truth.bank:
            writer.writerow(
                [
                    line.txn_date.strftime("%d/%m/%Y"),
                    line.txn_date.strftime("%d/%m/%Y"),
                    line.narration,
                    line.ref_no or "",
                    _money(line.debit),
                    _money(line.credit),
                    _money(line.balance),
                ]
            )
    return path


# ── the answer key, kept away from the feeds ────────────────────────────────


def _write_answers(truth: GroundTruth, answers: Path) -> Path:
    path = answers / "planted_defects.json"
    payload = {
        "company": truth.company_name,
        "company_slug": truth.company_slug,
        "gstin": truth.gstin,
        "periods": truth.periods,
        "disclosure": (
            "Synthetic and seeded. Ground truth lets the engine be measured "
            "instead of asserted. Late-filed invoices are present in the feeds "
            "on purpose and are deliberately absent from this key."
        ),
        "counts": _defect_counts(truth),
        "extended": {
            "note": (
                "Defects for rules outside the fixed set of section 10 - the IMS "
                "domain and Sec 17(5) blocked credits. Scored only when those "
                "rules are enabled, and never folded into the forty-one."
            ),
            "counts": _extended_counts(truth),
            "defects": [
                {
                    "defect_type": defect.defect_type,
                    "expected_rule": defect.expected_rule,
                    "period": defect.period,
                    "target_kind": defect.target_kind,
                    "natural_key": defect.natural_key,
                    "amount": f"{defect.amount:.2f}",
                    "note": defect.note,
                }
                for defect in sorted(
                    truth.extended_defects,
                    key=lambda d: (d.expected_rule, d.period, d.defect_type),
                )
            ],
        },
        "defects": [
            {
                "defect_type": defect.defect_type,
                "expected_rule": defect.expected_rule,
                "period": defect.period,
                "target_kind": defect.target_kind,
                "natural_key": defect.natural_key,
                "amount": f"{defect.amount:.2f}",
                "note": defect.note,
            }
            for defect in sorted(
                truth.defects, key=lambda d: (d.expected_rule, d.period, d.defect_type)
            )
        ],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def _extended_counts(truth: GroundTruth) -> dict[str, int]:
    counts: dict[str, int] = {}
    for defect in truth.extended_defects:
        counts[defect.defect_type] = counts.get(defect.defect_type, 0) + 1
    counts["total"] = len(truth.extended_defects)
    return counts


def _defect_counts(truth: GroundTruth) -> dict[str, int]:
    counts: dict[str, int] = {}
    for defect in truth.defects:
        counts[defect.defect_type] = counts.get(defect.defect_type, 0) + 1
    counts["total"] = len(truth.defects)
    return counts
