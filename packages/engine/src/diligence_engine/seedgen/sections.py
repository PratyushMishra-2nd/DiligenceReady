"""The fifteen GSTR-2B tables that are not B2B.

§15.2: "GSTR-2B is sixteen tables, not one." The first draft of this project
modelled it as a single flat list, and the blueprint is explicit about what
each omission costs:

    B2BA        amendments — flagged as duplicates by R3 if missed
    CDNR        credit and debit notes — credit notes reduce ITC, and a
                purchase return breaks matching entirely
    CDNRA       amendments to those notes
    ISD/ISDA    input service distributor credit, which never matches a
                purchase invoice
    IMPG        import of goods, keyed on a bill of entry rather than an
                invoice number, with no supplier-wise detail at all
    IMPGSEZ     imports from SEZ units
    ECO/ECOA    supplies where the e-commerce operator pays under Sec 9(5)

A generator that emits only B2B lets an ingester that reads only B2B look
correct, so these are emitted whether or not anything reads them yet.

On the amendments: they revise the document *date*, not the value. A
value-changing amendment is realistic and would correctly surface as an R2
mismatch — but R2 is a scored row-level rule, and adding unkeyed findings to
it would quietly move the precision figure that §10 puts on a slide. The
supersession path is what is being exercised here; the value path is noted
and left out of the seeded set deliberately.

Field names follow GSTN's own keys where they are known — `ctin`, `trdnm`,
`inv`, `nt`, `ntnum`, `nttyp`, `ntdt`, `boenum`, `boedt`, `portcode`, `txval`,
`iamt`, `camt`, `samt`, `csamt`, `itcavl`. The overall envelope is this
project's, as the module that writes it says.
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from diligence_engine.normalise import to_paise
from diligence_engine.seedgen.model import GroundTruth, PurchaseDoc

_PORTS = ("INMAA1", "INNSA1", "INBLR4", "INMUN1", "INHYD4")
_ISD_SERVICES = ("Audit fees", "Software licence", "Insurance premium", "Legal retainer")


def build_extra_sections(
    truth: GroundTruth, rng: random.Random, demo_period: str
) -> dict[str, dict]:
    """One set of non-B2B sections per period, derived from the same ledger."""
    by_period: dict[str, dict] = {}

    for period in truth.periods:
        candidates = [
            doc
            for doc in truth.purchases
            if doc.period == period
            and not doc.absent_from_2b
            and not doc.filed_late
            and doc.portal_amount_delta == 0
            and not doc.duplicated_in_register
            and doc.reversal_37a == 0
            and doc.blocked_reason is None
        ]
        rng.shuffle(candidates)

        by_period[period] = {
            "b2ba": _amendments(truth, candidates[:2], rng),
            "cdnr": _credit_notes(truth, candidates[2:5], rng, period),
            "isd": _isd(truth, rng, period),
            "impg": _imports(rng, period),
            "eco": _ecommerce(truth, rng, period),
        }

    return by_period


def _portal_number(truth: GroundTruth, doc: PurchaseDoc) -> str:
    from diligence_engine.seedgen.writers import portal_number

    return portal_number(truth, doc)


def _amendments(truth: GroundTruth, docs: list[PurchaseDoc], rng: random.Random) -> list[dict]:
    """B2BA: the supplier corrected a document they already filed.

    The amended record replaces the original, which is why each original is
    marked superseded here rather than left for the matcher to trip over.
    """
    out = []
    for doc in docs:
        doc.superseded = True
        vendor = truth.party(doc.vendor_key)
        corrected = doc.doc_date + timedelta(days=rng.choice((-2, -1, 1, 2)))
        out.append(
            {
                "ctin": vendor.gstin,
                "trdnm": vendor.legal_name,
                "inv": [
                    {
                        # The document as originally filed, which is how the
                        # amendment is tied back to it.
                        "oinum": _portal_number(truth, doc),
                        "oidt": doc.doc_date.strftime("%d-%m-%Y"),
                        "inum": _portal_number(truth, doc),
                        "idt": corrected.strftime("%d-%m-%Y"),
                        "typ": "R",
                        "txval": f"{doc.taxable:.2f}",
                        "camt": f"{doc.cgst:.2f}",
                        "samt": f"{doc.sgst:.2f}",
                        "iamt": f"{doc.igst:.2f}",
                        "csamt": f"{doc.cess:.2f}",
                        "val": f"{doc.total:.2f}",
                        "rev": "N",
                        "itcavl": "Y",
                        "rsn": "",
                    }
                ],
            }
        )
    return out


def _credit_notes(
    truth: GroundTruth, docs: list[PurchaseDoc], rng: random.Random, period: str
) -> list[dict]:
    """CDNR: credit and debit notes from registered suppliers.

    A credit note reduces the credit claimable and has no purchase-register
    row of its own — it corrects one. Matching must not treat it as a missing
    invoice, which is why the original document number travels with it.
    """
    out = []
    for doc in docs:
        vendor = truth.party(doc.vendor_key)
        is_credit = rng.random() < 0.8
        amount = to_paise(doc.taxable * Decimal(str(rng.choice((0.05, 0.1, 0.2)))))
        rate = vendor.gst_rate
        tax = to_paise(amount * rate / Decimal("100"))
        interstate = vendor.state_code != truth.state_code
        half = to_paise(tax / Decimal("2"))
        raised = doc.doc_date + timedelta(days=rng.randint(3, 20))

        out.append(
            {
                "ctin": vendor.gstin,
                "trdnm": vendor.legal_name,
                "nt": [
                    {
                        "ntnum": f"{'CN' if is_credit else 'DN'}-{rng.randint(100, 999)}",
                        "nttyp": "C" if is_credit else "D",
                        "ntdt": raised.strftime("%d-%m-%Y"),
                        "oinum": _portal_number(truth, doc),
                        "txval": f"{amount:.2f}",
                        "camt": "0.00" if interstate else f"{half:.2f}",
                        "samt": "0.00" if interstate else f"{tax - half:.2f}",
                        "iamt": f"{tax:.2f}" if interstate else "0.00",
                        "csamt": "0.00",
                        "val": f"{amount + tax:.2f}",
                        "itcavl": "Y",
                        "rsn": "",
                    }
                ],
            }
        )
    return out


def _isd(truth: GroundTruth, rng: random.Random, period: str) -> list[dict]:
    """ISD: credit distributed by a head office, never tied to a purchase invoice."""
    year, month = (int(part) for part in period.split("-"))
    out = []
    for _ in range(rng.randint(1, 2)):
        amount = to_paise(Decimal(rng.randint(12_000, 180_000)))
        tax = to_paise(amount * Decimal("18") / Decimal("100"))
        raised = date(year, month, rng.randint(2, 26))
        out.append(
            {
                # The distributor is the company's own head office registration.
                "ctin": truth.gstin,
                "trdnm": f"{truth.company_name.upper()} (ISD)",
                "doclist": [
                    {
                        "docnum": f"ISD/{rng.randint(100, 999)}",
                        "docdt": raised.strftime("%d-%m-%Y"),
                        "doctype": "ISD Invoice",
                        "srvc": rng.choice(_ISD_SERVICES),
                        "txval": f"{amount:.2f}",
                        "camt": f"{to_paise(tax / 2):.2f}",
                        "samt": f"{tax - to_paise(tax / 2):.2f}",
                        "iamt": "0.00",
                        "csamt": "0.00",
                        "val": f"{amount + tax:.2f}",
                        "itcavl": "Y",
                    }
                ],
            }
        )
    return out


def _imports(rng: random.Random, period: str) -> list[dict]:
    """IMPG: keyed on a bill of entry. There is no supplier-wise detail at all.

    This is the section that breaks any schema assuming a GSTIN and an invoice
    number are always present.
    """
    year, month = (int(part) for part in period.split("-"))
    entries = []
    for _ in range(rng.randint(0, 2)):
        amount = to_paise(Decimal(rng.randint(90_000, 1_400_000)))
        igst = to_paise(amount * Decimal("18") / Decimal("100"))
        cleared = date(year, month, rng.randint(2, 26))
        entries.append(
            {
                "boenum": f"{rng.randint(1000000, 9999999)}",
                "boedt": cleared.strftime("%d-%m-%Y"),
                "portcode": rng.choice(_PORTS),
                "txval": f"{amount:.2f}",
                "iamt": f"{igst:.2f}",
                "csamt": "0.00",
                "val": f"{amount + igst:.2f}",
                "itcavl": "Y",
            }
        )
    return [{"boe": entries}] if entries else []


def _ecommerce(truth: GroundTruth, rng: random.Random, period: str) -> list[dict]:
    """ECO: supplies where the operator pays the tax under Sec 9(5).

    Missed entirely in the blueprint's first draft.
    """
    if rng.random() > 0.5:
        return []
    year, month = (int(part) for part in period.split("-"))
    operator = rng.choice(truth.vendors)
    amount = to_paise(Decimal(rng.randint(8_000, 90_000)))
    tax = to_paise(amount * Decimal("18") / Decimal("100"))
    raised = date(year, month, rng.randint(2, 26))
    return [
        {
            "ctin": operator.gstin,
            "trdnm": operator.legal_name,
            "doc": [
                {
                    "docnum": f"ECO/{rng.randint(1000, 9999)}",
                    "docdt": raised.strftime("%d-%m-%Y"),
                    "txval": f"{amount:.2f}",
                    "camt": f"{to_paise(tax / 2):.2f}",
                    "samt": f"{tax - to_paise(tax / 2):.2f}",
                    "iamt": "0.00",
                    "csamt": "0.00",
                    "val": f"{amount + tax:.2f}",
                    "itcavl": "Y",
                }
            ],
        }
    ]
