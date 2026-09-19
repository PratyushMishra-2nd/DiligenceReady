"""The Invoice Management System feed (live 1 October 2024).

Every inward document a supplier files lands on the recipient's IMS dashboard
with three possible actions — accept, reject, pending. Only accepted records
flow into GSTR-2B as eligible credit. **Taking no action is deemed
acceptance**, which is why the advisory can claim IMS adds no compliance
burden: for one company with thirty invoices, true. For a firm carrying fifty
clients, deemed acceptance *is* the burden — whatever the supplier filed flows
into the client's return unreviewed, on a portal capped at a thousand rows of
online display.

What this generator produces, and why each part is here (Blueprint §15):

* **Mostly `no_action`.** The default state is the problem, so the data has to
  show it. A feed where everything is already actioned would demonstrate
  nothing.
* **Original credit notes, where Pending is prohibited.** The advisory bars
  Pending on an original credit note, and a UI offering it produces a portal
  error the user cannot interpret. The schema carries `pending_allowed` so the
  interface can never offer it.
* **Credit notes whose rejection raises the supplier's liability.** Rejecting
  one increases what the supplier owes in their next GSTR-3B, and the supplier
  can see what action was taken. A reject is a commercial act with a visible
  counterparty, not a private bookkeeping flag.
* **Records saved but not filed.** A document reaches IMS on save and counts
  only once the supplier files, so it can be actionable and not yet countable.
* **Actions taken after the 14th.** Any action after the 2B drafts, or any
  change to a prior action, makes recomputing GSTR-2B mandatory.
* **Documents with no counterpart in the purchase register.** The reason to
  reject something.
"""

from __future__ import annotations

import json
import random
from datetime import date
from decimal import Decimal
from pathlib import Path

from diligence_engine.normalise import shift_period, to_paise
from diligence_engine.seedgen.model import Defect, GroundTruth, PurchaseDoc

# Share of filed documents the client has simply not looked at. High on
# purpose: it is the finding, not noise.
_NO_ACTION_SHARE = 0.86

# Documents that reached IMS on save but whose supplier has not filed yet.
_SAVED_NOT_FILED_SHARE = 0.04


def build_ims(truth: GroundTruth, rng: random.Random, demo_period: str) -> dict[str, list[dict]]:
    """One IMS dashboard per period, derived from the same ground truth."""
    by_period: dict[str, list[dict]] = {period: [] for period in truth.periods}

    for doc in truth.purchases:
        if doc.absent_from_2b:
            continue  # the supplier never filed it, so it never reaches IMS
        target = shift_period(doc.period, 1) if doc.filed_late else doc.period
        if target not in by_period:
            continue
        by_period[target].append(_invoice_record(truth, doc, rng, target))

    _add_credit_notes(truth, by_period, rng, demo_period)
    _add_orphan_documents(truth, by_period, rng, demo_period)

    for records in by_period.values():
        records.sort(key=lambda record: (record["ctin"], record["inum"]))
        for index, record in enumerate(records, start=1):
            record["row"] = index

    return by_period


def _portal_status(rng: random.Random) -> str:
    roll = rng.random()
    if roll < _NO_ACTION_SHARE:
        return "no_action"
    if roll < _NO_ACTION_SHARE + 0.10:
        return "accepted"
    return "pending"


def _invoice_record(truth: GroundTruth, doc: PurchaseDoc, rng: random.Random, period: str) -> dict:
    vendor = truth.party(doc.vendor_key)
    from diligence_engine.seedgen.writers import portal_number

    return {
        "ctin": vendor.gstin,
        "trdnm": vendor.legal_name,
        "doctype": "INV",
        "inum": portal_number(truth, doc),
        "idt": doc.doc_date.strftime("%d-%m-%Y"),
        "val": f"{doc.total + doc.portal_amount_delta:.2f}",
        "supplier_filed": rng.random() > _SAVED_NOT_FILED_SHARE,
        "is_amendment": False,
        "amend_direction": None,
        "status": _portal_status(rng),
        "actioned_at": _action_timestamp(rng, period),
    }


def _action_timestamp(rng: random.Random, period: str) -> str | None:
    """Some actions land after the 14th, which forces a 2B recompute."""
    if rng.random() > 0.08:
        return None
    year, month = (int(part) for part in shift_period(period, 1).split("-"))
    return date(year, month, rng.randint(15, 24)).strftime("%d-%m-%Y")


def _add_credit_notes(
    truth: GroundTruth,
    by_period: dict[str, list[dict]],
    rng: random.Random,
    demo_period: str,
) -> None:
    """Credit notes the supplier raised against an earlier invoice.

    A credit note carries the document it corrects, and that reference is the
    whole point of modelling them: a credit note never has a purchase-register
    row of its own, so a recommender that expects one would reject every
    legitimate purchase return in the file. Rejecting a credit note raises the
    supplier's liability visibly, which makes that the most damaging mistake
    this engine could make.

    Most reference an invoice the client has booked. A few do not, which is
    the case that genuinely needs a human.
    """
    from diligence_engine.seedgen.writers import portal_number

    for offset, count in ((0, 3), (-1, 2), (-3, 2)):
        period = shift_period(demo_period, offset)
        if period not in by_period:
            continue
        bookable = [
            doc
            for doc in truth.purchases
            if doc.period == period and not doc.absent_from_2b and not doc.filed_late
        ]
        for index in range(count):
            year, month = (int(part) for part in period.split("-"))
            raised = date(year, month, rng.randint(2, 26))
            # The last one in each period references nothing the client booked.
            orphaned = index == count - 1 and bool(bookable)
            original = rng.choice(bookable) if bookable else None
            vendor = (
                truth.party(original.vendor_key)
                if original and not orphaned
                else rng.choice(truth.vendors)
            )
            amount = to_paise(Decimal(rng.randint(15_000, 240_000)))
            original_number = (
                f"UNBOOKED-{rng.randint(1000, 9999)}"
                if orphaned or original is None
                else portal_number(truth, original)
            )
            number = f"CN-{rng.randint(100, 999)}"

            by_period[period].append(
                {
                    "ctin": vendor.gstin,
                    "trdnm": vendor.legal_name,
                    "doctype": "CRN",
                    "inum": number,
                    "orig_inum": original_number,
                    "idt": raised.strftime("%d-%m-%Y"),
                    "val": f"{amount:.2f}",
                    "supplier_filed": True,
                    "is_amendment": False,
                    "amend_direction": None,
                    "status": _portal_status(rng),
                    "actioned_at": None,
                }
            )

            if orphaned:
                truth.extended_defects.append(
                    Defect(
                        defect_type="credit_note_unbooked_original",
                        expected_rule="R10",
                        period=period,
                        target_kind="ims_record",
                        natural_key={
                            "supplier_gstin": vendor.gstin,
                            "number": number,
                            "period": period,
                        },
                        amount=amount,
                        note=(
                            "Credit note against an invoice the client has not booked. "
                            "Needs a decision, and rejecting it raises the supplier's "
                            "liability."
                        ),
                    )
                )


def _add_orphan_documents(
    truth: GroundTruth,
    by_period: dict[str, list[dict]],
    rng: random.Random,
    demo_period: str,
) -> None:
    """Documents on the dashboard with nothing behind them in the books.

    Either the client has not booked the purchase or the supplier filed it
    against the wrong GSTIN. Deemed acceptance pulls both into the return.
    These are the IMS answer key.
    """
    spread = {demo_period: 3, shift_period(demo_period, -1): 2, shift_period(demo_period, -2): 1}
    for period, count in spread.items():
        if period not in by_period:
            continue
        for _ in range(count):
            vendor = rng.choice(truth.vendors)
            amount = to_paise(Decimal(rng.randint(80_000, 620_000)))
            year, month = (int(part) for part in period.split("-"))
            raised = date(year, month, rng.randint(2, 26))
            number = f"X{rng.randint(70_000, 99_999)}"
            by_period[period].append(
                {
                    "ctin": vendor.gstin,
                    "trdnm": vendor.legal_name,
                    "doctype": "INV",
                    "inum": number,
                    "idt": raised.strftime("%d-%m-%Y"),
                    "val": f"{amount:.2f}",
                    "supplier_filed": True,
                    "is_amendment": False,
                    "amend_direction": None,
                    "status": "no_action",
                    "actioned_at": None,
                }
            )
            truth.extended_defects.append(
                Defect(
                    defect_type="ims_no_counterpart",
                    expected_rule="R10",
                    period=period,
                    target_kind="ims_record",
                    natural_key={
                        "supplier_gstin": vendor.gstin,
                        "number": number,
                        "period": period,
                    },
                    amount=amount,
                    note=(
                        "On the IMS dashboard with no purchase-register counterpart. "
                        "Deemed acceptance pulls it into the return unreviewed."
                    ),
                )
            )


def write_ims(truth: GroundTruth, by_period: dict[str, list[dict]], feeds: Path) -> dict[str, Path]:
    """One file per period, in the shape the dashboard exports.

    GSTN does not publish a downloadable IMS JSON schema the way it does for
    GSTR-2B, so this shape is ours and is labelled as such rather than
    presented as the portal's.
    """
    written: dict[str, Path] = {}
    for period, records in by_period.items():
        year, month = period.split("-")
        payload = {
            "schema": "diligenceready/ims-export/1",
            "note": (
                "Shape defined by this project. GSTN publishes no downloadable IMS "
                "schema; the field semantics follow its advisory."
            ),
            "rtnprd": f"{month}{year}",
            "gstin": truth.gstin,
            "records": records,
        }
        path = feeds / f"ims_{year}_{month}.json"
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        written[period] = path
    return written
