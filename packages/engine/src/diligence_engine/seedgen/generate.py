"""Build the ground truth, then plant defects with known answers.

Blueprint §10. The generator is deterministic: same seed, same company, same
forty-one defects, every run. A demo that renumbers itself between rehearsals
is not a demo.

Two design rules the data has to respect, or the evaluation is worthless:

1.  **No accidental defects.** Every record that is not deliberately broken
    must reconcile exactly. Otherwise a rule firing correctly on unplanned
    noise is scored as a false positive and the precision figure is a lie.

2.  **Late filing is realism, not a defect.** §15.1: an invoice missing from
    August's 2B often appears in September's. The generator emits genuinely
    late-filed invoices on purpose, and they are *not* in the answer key —
    they are a trap for the matcher. A matcher that only looks inside one
    period will report them as unmatched, and the harness will show it as
    lost precision. That is the intended feedback.
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from diligence_engine.normalise import gstin_check_digit, period_of, shift_period, to_paise
from diligence_engine.seedgen.ims import build_ims
from diligence_engine.seedgen.model import (
    BankLine,
    Defect,
    GroundTruth,
    Party,
    PurchaseDoc,
    SalesDoc,
    Voucher,
)
from diligence_engine.seedgen.sections import build_extra_sections

# ── vocabulary for plausible Indian trade names ─────────────────────────────

_NAME_HEADS = (
    "Sharma",
    "Bharat",
    "Sunrise",
    "Precision",
    "Anand",
    "Vertex",
    "Kamal",
    "Shakti",
    "Orient",
    "Vishal",
    "Deccan",
    "Nandi",
    "Sagar",
    "Trimurti",
    "Konark",
    "Ganga",
    "Ashoka",
    "Maruthi",
    "Pioneer",
    "Galaxy",
    "Crystal",
    "Meridian",
    "Sterling",
    "Apex",
    "Vardhman",
    "Rajdhani",
    "Coastal",
    "Citadel",
    "Everest",
    "Falcon",
    "Greenfield",
    "Harmony",
    "Indus",
    "Jyoti",
    "Kaveri",
    "Lotus",
    "Metro",
    "Nexus",
    "Olympus",
    "Pinnacle",
    "Quantum",
    "Radiant",
    "Summit",
    "Tandem",
    "Unity",
    "Vega",
    "Westline",
    "Yash",
    "Zenith",
    "Aurora",
    "Bluepeak",
    "Cedar",
    "Dynamo",
    "Eastgate",
    "Fortune",
    "Grandeur",
    "Highland",
    "Ivory",
    "Junction",
    "Keystone",
    "Landmark",
    "Monsoon",
    "Northstar",
    "Oakridge",
    "Paramount",
)

_NAME_TAILS = (
    "Traders",
    "Enterprises",
    "Industries",
    "Steel",
    "Polymers",
    "Packaging",
    "Logistics",
    "Engineering",
    "Components",
    "Fabricators",
    "Chemicals",
    "Textiles",
    "Electricals",
    "Hardware",
    "Supplies",
    "Tools",
    "Castings",
    "Bearings",
    "Instruments",
    "Systems",
)

_LEGAL_FORMS = ("PRIVATE LIMITED", "PVT LTD", "LLP", "AND CO", "")

# The same underlying number, dressed differently by each system. Every style
# here must reduce to the same key under norm_invoice_no, which the normaliser
# test suite pins.
_BOOKS_SERIES = (
    "INV/{fy}/{n}",
    "INV-{n}",
    "{n}",
    "TI/{fy}/{n:04d}",
    "BILL{n}",
    "INV No. {n}",
    "PUR/INV/{fy}/{n:05d}",
)

_PORTAL_SERIES = (
    "INV-{n}",
    "{n}",
    "INV{n}",
    "{n:04d}",
)

# Karnataka. The company's own state decides CGST+SGST versus IGST.
_HOME_STATE = "29"
_OTHER_STATES = ("27", "07", "33", "24", "36", "19", "06", "32")

_GST_RATES = (Decimal("5"), Decimal("12"), Decimal("18"), Decimal("18"), Decimal("28"))

_OPERATING_NARRATIONS = (
    ("SALARY", "SALARY PAYMENT {period}"),
    ("GSTPMT", "GST PAYMENT CHALLAN {period}"),
    ("BANKCHG", "BANK CHARGES {period}"),
    ("ELEC", "ELECTRICITY BILL BESCOM {period}"),
    ("RENT", "OFFICE RENT {period}"),
)


def _make_gstin(rng: random.Random, state: str, entity_char: str = "C") -> str:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    pan = (
        "".join(rng.choice(letters) for _ in range(3))
        + entity_char
        + rng.choice(letters)
        + f"{rng.randint(0, 9999):04d}"
        + rng.choice(letters)
    )
    body = f"{state}{pan}1Z"
    return body + gstin_check_digit(body)


def _fy_label(day: date) -> str:
    """'2026-27' for any date on or after 1 April 2026."""
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def _months(end_period: str, count: int) -> list[str]:
    return [shift_period(end_period, -offset) for offset in range(count - 1, -1, -1)]


def _period_dates(period: str) -> tuple[date, date]:
    year, month = (int(part) for part in period.split("-"))
    first = date(year, month, 1)
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return first, next_month - timedelta(days=1)


def _random_day(rng: random.Random, period: str) -> date:
    first, last = _period_dates(period)
    return first + timedelta(days=rng.randint(0, (last - first).days))


def _split_tax(taxable: Decimal, rate: Decimal, interstate: bool) -> tuple[Decimal, ...]:
    tax = to_paise(taxable * rate / Decimal("100"))
    if interstate:
        return Decimal("0.00"), Decimal("0.00"), tax, Decimal("0.00")
    half = to_paise(tax / Decimal("2"))
    # The second half absorbs the odd paisa so CGST + SGST is exactly the tax.
    return half, tax - half, Decimal("0.00"), Decimal("0.00")


def _make_parties(rng: random.Random, count: int, kind: str) -> list[Party]:
    used: set[str] = set()
    parties: list[Party] = []
    index = 0
    while len(parties) < count:
        head = rng.choice(_NAME_HEADS)
        tail = rng.choice(_NAME_TAILS)
        base = f"{head} {tail}"
        if base in used:
            continue
        used.add(base)

        legal_form = rng.choice(_LEGAL_FORMS)
        state = _HOME_STATE if rng.random() < 0.6 else rng.choice(_OTHER_STATES)
        parties.append(
            Party(
                key=f"{kind[0]}{index:03d}",
                legal_name=f"{base.upper()} {legal_form}".strip(),
                # The bookkeeper drops the legal form and sometimes prefixes M/s.
                ledger_name=f"M/s {base}" if rng.random() < 0.25 else base,
                gstin=_make_gstin(rng, state),
                state_code=state,
                kind=kind,
                gst_rate=rng.choice(_GST_RATES),
                books_series=rng.choice(_BOOKS_SERIES),
                portal_series=rng.choice(_PORTAL_SERIES),
                payment_days=rng.choice((15, 21, 30, 30, 45, 60, 75)),
            )
        )
        index += 1
    return parties


def _purchase_amount(rng: random.Random) -> Decimal:
    band = rng.random()
    if band < 0.55:
        return to_paise(Decimal(rng.randint(8_000, 90_000)))
    if band < 0.88:
        return to_paise(Decimal(rng.randint(90_000, 400_000)))
    return to_paise(Decimal(rng.randint(400_000, 900_000)))


def _sales_amount(rng: random.Random) -> Decimal:
    band = rng.random()
    if band < 0.5:
        return to_paise(Decimal(rng.randint(20_000, 200_000)))
    if band < 0.9:
        return to_paise(Decimal(rng.randint(200_000, 900_000)))
    return to_paise(Decimal(rng.randint(900_000, 2_500_000)))


def build_ground_truth(
    company_name: str,
    company_slug: str,
    *,
    seed: int,
    # The twelve months ending with the one a CA would actually be closing.
    # On 19 September 2026, August's GSTR-2B generated on the 14th and
    # September's does not exist yet, so the newest period is 2026-08.
    end_period: str = "2026-08",
    month_count: int = 12,
    vendor_count: int = 40,
    customer_count: int = 25,
    purchases_per_month: int = 150,
    sales_per_month: int = 75,
    demo_period: str = "2026-08",
) -> GroundTruth:
    rng = random.Random(seed)
    periods = _months(end_period, month_count)

    company_gstin = _make_gstin(rng, _HOME_STATE)
    vendors = _make_parties(rng, vendor_count, "vendor")
    customers = _make_parties(rng, customer_count, "customer")

    truth = GroundTruth(
        company_name=company_name,
        company_slug=company_slug,
        gstin=company_gstin,
        pan=company_gstin[2:12],
        state_code=_HOME_STATE,
        fy_start=date(2026, 4, 1),
        periods=periods,
        vendors=vendors,
        customers=customers,
    )

    _generate_purchases(truth, rng, purchases_per_month)
    _generate_sales(truth, rng, sales_per_month, demo_period)
    # Before the money is generated, not after: a receipt voucher is only
    # created for a sale that settled, so a customer has to be marked
    # silent while those vouchers are still being decided. Doing it later
    # leaves the receipts in place and the balance never ages.
    _plant_receivables_ageing(truth, demo_period)
    _generate_money(truth, rng)
    plant_defects(truth, rng, demo_period)
    _finalise_bank(truth)
    truth.ims = build_ims(truth, rng, demo_period)
    truth.gstr2b_extra = build_extra_sections(truth, rng, demo_period)

    return truth


# ── purchases ───────────────────────────────────────────────────────────────


def _generate_purchases(truth: GroundTruth, rng: random.Random, per_month: int) -> None:
    counters = {vendor.key: 1000 + index * 137 for index, vendor in enumerate(truth.vendors)}
    seq = 0

    for period in truth.periods:
        for _ in range(per_month):
            vendor = rng.choice(truth.vendors)
            counters[vendor.key] += rng.randint(1, 4)
            taxable = _purchase_amount(rng)
            cgst, sgst, igst, cess = _split_tax(
                taxable, vendor.gst_rate, vendor.state_code != truth.state_code
            )
            doc_date = _random_day(rng, period)
            seq += 1
            truth.purchases.append(
                PurchaseDoc(
                    seq=seq,
                    vendor_key=vendor.key,
                    number=counters[vendor.key],
                    doc_date=doc_date,
                    period=period,
                    taxable=taxable,
                    cgst=cgst,
                    sgst=sgst,
                    igst=igst,
                    cess=cess,
                    total=taxable + cgst + sgst + igst + cess,
                )
            )


# ── sales, shaped so concentration is a designed event ──────────────────────


def _generate_sales(
    truth: GroundTruth, rng: random.Random, per_month: int, demo_period: str
) -> None:
    """Revenue is deliberately flat-ish, so a concentration spike is unambiguous.

    R7 fires when the top three customers exceed 50% of a period's revenue. If
    the baseline hovered near that line, half the months would trip it and the
    two planted spikes would be indistinguishable from noise. The baseline is
    therefore held near 40%, and exactly two periods are pushed above.
    """
    # The two periods that will carry a concentration spike.
    truth_spike_periods = (demo_period, shift_period(demo_period, -6))
    majors = truth.customers[:3]
    minors = truth.customers[3:]
    seq = 0
    counters = {customer.key: 500 + index * 91 for index, customer in enumerate(truth.customers)}

    for period in truth.periods:
        spiking = period in truth_spike_periods
        # Weight of revenue going to the top three. The baseline sits well
        # clear of R7's 50% line: if it hovered just under, random variation
        # would trip the rule in ordinary months and the two planted spikes
        # would be indistinguishable from noise.
        major_share = 0.588 if spiking else 0.32

        for _ in range(per_month):
            customer = rng.choice(majors) if rng.random() < major_share else rng.choice(minors)
            counters[customer.key] += rng.randint(1, 3)
            taxable = _sales_amount(rng)
            if spiking and customer in majors:
                taxable = to_paise(taxable * Decimal("1.6"))
            tax = to_paise(taxable * customer.gst_rate / Decimal("100"))
            doc_date = _random_day(rng, period)
            seq += 1
            truth.sales.append(
                SalesDoc(
                    seq=seq,
                    customer_key=customer.key,
                    number=counters[customer.key],
                    doc_date=doc_date,
                    period=period,
                    taxable=taxable,
                    tax=tax,
                    total=taxable + tax,
                )
            )

    # Settlement: most invoices are paid, some age. Unpaid invoices are what
    # R8 reads as receivables ageing, so the tail is deliberate.
    for sale in truth.sales:
        customer = truth.party(sale.customer_key)
        roll = rng.random()
        if roll < 0.84:
            delay = customer.payment_days + rng.randint(-5, 12)
        elif roll < 0.955:
            delay = customer.payment_days + rng.randint(40, 95)  # ages past 90 days
        else:
            # Most customers do eventually pay. A high background rate of
            # never-paid invoices buries a real receivables problem in
            # noise, which is how R8 ended up never firing on this data.
            sale.settled_on = None
            continue
        settled = sale.doc_date + timedelta(days=max(1, delay))
        # Anything settling past the window stays open on the books.
        sale.settled_on = settled if period_of(settled) <= truth.periods[-1] else None


# ── money: vouchers in the books, lines in the bank ─────────────────────────


def _generate_money(truth: GroundTruth, rng: random.Random) -> None:
    voucher_seq = 0
    bank_seq = 0

    # Vendor payments. Both sides of each one, same date and amount, until a
    # defect moves one of them.
    for purchase in truth.purchases:
        vendor = truth.party(purchase.vendor_key)
        if rng.random() > 0.85:
            continue  # still outstanding at period end
        paid_on = purchase.doc_date + timedelta(days=vendor.payment_days + rng.randint(-4, 10))
        if period_of(paid_on) > truth.periods[-1]:
            continue
        voucher_seq += 1
        bank_seq += 1
        truth.vouchers.append(
            Voucher(
                seq=voucher_seq,
                voucher_type="Payment",
                voucher_no=f"PMT/{voucher_seq:05d}",
                entry_date=paid_on,
                period=period_of(paid_on),
                party_key=vendor.key,
                ledger_name=vendor.ledger_name,
                debit=purchase.total,
                credit=None,
            )
        )
        truth.bank.append(
            BankLine(
                seq=bank_seq,
                txn_date=paid_on,
                period=period_of(paid_on),
                narration=_payment_narration(rng, vendor.legal_name, paid_on),
                ref_no=_utr(rng, paid_on),
                debit=purchase.total,
                credit=None,
            )
        )

    # Customer receipts.
    for sale in truth.sales:
        if sale.settled_on is None:
            continue
        customer = truth.party(sale.customer_key)
        voucher_seq += 1
        bank_seq += 1
        truth.vouchers.append(
            Voucher(
                seq=voucher_seq,
                voucher_type="Receipt",
                voucher_no=f"RCP/{voucher_seq:05d}",
                entry_date=sale.settled_on,
                period=period_of(sale.settled_on),
                party_key=customer.key,
                ledger_name=customer.ledger_name,
                debit=None,
                credit=sale.total,
            )
        )
        truth.bank.append(
            BankLine(
                seq=bank_seq,
                txn_date=sale.settled_on,
                period=period_of(sale.settled_on),
                narration=_receipt_narration(rng, customer.legal_name, sale.settled_on),
                ref_no=_utr(rng, sale.settled_on),
                debit=None,
                credit=sale.total,
            )
        )

    # Operating outflows: in both the books and the bank, so they reconcile.
    for period in truth.periods:
        for ledger_key, template in _OPERATING_NARRATIONS:
            amount = to_paise(Decimal(rng.randint(15_000, 320_000)))
            day = _random_day(rng, period)
            voucher_seq += 1
            bank_seq += 1
            truth.vouchers.append(
                Voucher(
                    seq=voucher_seq,
                    voucher_type="Payment",
                    voucher_no=f"PMT/{voucher_seq:05d}",
                    entry_date=day,
                    period=period,
                    party_key=None,
                    ledger_name=template.format(period=period).title(),
                    debit=amount,
                    credit=None,
                )
            )
            truth.bank.append(
                BankLine(
                    seq=bank_seq,
                    txn_date=day,
                    period=period,
                    narration=f"{ledger_key}-{template.format(period=period)}",
                    ref_no=None,
                    debit=amount,
                    credit=None,
                )
            )


def _utr(rng: random.Random, day: date) -> str:
    return f"N{day.strftime('%Y%m%d')}{rng.randint(10_000_000, 99_999_999)}"


def _payment_narration(rng: random.Random, legal_name: str, day: date) -> str:
    channel = rng.choice(("NEFT", "RTGS", "IMPS"))
    return f"{channel}-{_utr(rng, day)}-{legal_name}-PAYMENT"


def _receipt_narration(rng: random.Random, legal_name: str, day: date) -> str:
    channel = rng.choice(("NEFT", "RTGS", "IMPS", "UPI"))
    return f"{channel}/{_utr(rng, day)}/{legal_name}/COLLECTION"


# ── defects: forty-one, each with a known answer ────────────────────────────


def plant_defects(truth: GroundTruth, rng: random.Random, demo_period: str) -> None:
    """Inject the §10 defect set. Counts are fixed; placement is seeded."""
    _plant_missing_from_2b(truth, rng, demo_period)
    _plant_amount_mismatches(truth, rng, demo_period)
    _plant_duplicates(truth, rng, demo_period)
    _plant_37a_reversals(truth, rng, demo_period)
    variance_periods = _variance_periods(truth, demo_period)
    _plant_timing_gaps(truth, rng, variance_periods)
    _plant_unidentified_deposits(truth, rng, variance_periods)
    _plant_concentration_spikes(truth, demo_period)
    _plant_blocked_credits(truth, rng, demo_period)
    _plant_late_filers(truth, rng, demo_period)


def _pick_purchases(
    truth: GroundTruth, rng: random.Random, period: str, count: int, *, min_taxable: Decimal
) -> list[PurchaseDoc]:
    pool = [
        p
        for p in truth.purchases
        if p.period == period
        and p.taxable >= min_taxable
        and not p.absent_from_2b
        and p.portal_amount_delta == 0
        and not p.duplicated_in_register
        and p.reversal_37a == 0
        and p.blocked_reason is None
    ]
    rng.shuffle(pool)
    return pool[:count]


def _plant_missing_from_2b(truth: GroundTruth, rng: random.Random, demo_period: str) -> None:
    """12 invoices the vendor never filed. Aged so R1 severity has range (§15.1)."""
    spread = {
        demo_period: 4,
        shift_period(demo_period, -1): 3,
        shift_period(demo_period, -2): 2,
        shift_period(demo_period, -5): 2,
        shift_period(demo_period, -8): 1,
    }
    for period, count in spread.items():
        for doc in _pick_purchases(truth, rng, period, count, min_taxable=Decimal("150000")):
            doc.absent_from_2b = True
            vendor = truth.party(doc.vendor_key)
            truth.defects.append(
                Defect(
                    defect_type="vendor_didnt_file",
                    expected_rule="R1",
                    period=period,
                    target_kind="purchase_invoice",
                    natural_key={
                        "supplier_gstin": vendor.gstin,
                        "number": str(doc.number),
                        "period": period,
                    },
                    amount=doc.tax_total,
                    note="Invoice is in the purchase register with no counterpart in any 2B.",
                )
            )


def _plant_amount_mismatches(truth: GroundTruth, rng: random.Random, demo_period: str) -> None:
    """8 invoices where the portal value differs by 100 to 5,000 rupees."""
    spread = {demo_period: 4, shift_period(demo_period, -1): 2, shift_period(demo_period, -3): 2}
    for period, count in spread.items():
        for doc in _pick_purchases(truth, rng, period, count, min_taxable=Decimal("60000")):
            delta = to_paise(Decimal(rng.randint(100, 5000)) * rng.choice((1, -1)))
            doc.portal_amount_delta = delta
            vendor = truth.party(doc.vendor_key)
            truth.defects.append(
                Defect(
                    defect_type="amount_mismatch",
                    expected_rule="R2",
                    period=period,
                    target_kind="purchase_invoice",
                    natural_key={
                        "supplier_gstin": vendor.gstin,
                        "number": str(doc.number),
                        "period": period,
                    },
                    amount=abs(delta),
                    note="Taxable value differs between the register and 2B beyond tolerance.",
                )
            )


def _plant_duplicates(truth: GroundTruth, rng: random.Random, demo_period: str) -> None:
    """5 invoices booked twice in the register. The portal has one of each."""
    spread = {demo_period: 2, shift_period(demo_period, -2): 2, shift_period(demo_period, -4): 1}
    for period, count in spread.items():
        for doc in _pick_purchases(truth, rng, period, count, min_taxable=Decimal("40000")):
            doc.duplicated_in_register = True
            vendor = truth.party(doc.vendor_key)
            truth.defects.append(
                Defect(
                    defect_type="duplicate_invoice",
                    expected_rule="R3",
                    period=period,
                    target_kind="purchase_invoice",
                    natural_key={
                        "supplier_gstin": vendor.gstin,
                        "number": str(doc.number),
                        "period": period,
                    },
                    amount=doc.total,
                    note="Same supplier and invoice number booked twice in the register.",
                )
            )


def _plant_37a_reversals(truth: GroundTruth, rng: random.Random, demo_period: str) -> None:
    """3 vendors whose GSTR-3B is unfiled, so 2B itself carries the reversal.

    Read from GSTN, never inferred (§15 finding 02).
    """
    spread = {demo_period: 1, shift_period(demo_period, -1): 1, shift_period(demo_period, -4): 1}
    for period, count in spread.items():
        for doc in _pick_purchases(truth, rng, period, count, min_taxable=Decimal("200000")):
            doc.reversal_37a = doc.tax_total
            vendor = truth.party(doc.vendor_key)
            truth.defects.append(
                Defect(
                    defect_type="vendor_stopped_filing",
                    expected_rule="R4",
                    period=period,
                    target_kind="purchase_invoice",
                    natural_key={
                        "supplier_gstin": vendor.gstin,
                        "number": str(doc.number),
                        "period": period,
                    },
                    amount=doc.reversal_37a,
                    note="2B ITC Reversal section carries a Rule 37A amount for this invoice.",
                )
            )


def _variance_periods(truth: GroundTruth, demo_period: str) -> list[str]:
    """The four periods allowed to breach the bank variance threshold.

    Every other month reconciles to inside the threshold, so R5 firing anywhere
    else would be a genuine false positive rather than an artefact of noisy
    test data.
    """
    candidates = [
        demo_period,
        shift_period(demo_period, -2),
        shift_period(demo_period, -5),
        shift_period(demo_period, -8),
    ]
    return [period for period in candidates if period in truth.periods]


def _plant_timing_gaps(truth: GroundTruth, rng: random.Random, periods: list[str]) -> None:
    """4 month-end payment runs the books record in M and the bank clears in M+1.

    Two things have to be true for a planted defect to be findable, and
    getting either wrong puts something in the answer key that the engine is
    right to disagree with.

    **It has to cross the period boundary.** A payment made mid-month and
    cleared three days later stays inside the period and produces no
    variance at all, so vouchers are taken from the last few days of the
    month.

    **It has to be material.** R5 reports a variance above one per cent of
    turnover. A single large payment is under that in a month with a nine
    crore top line — which is exactly what happened here: one seeded defect
    went undetected and the rule was correct, the key was wrong. So payments
    are displaced together, oldest-largest first, until the displaced total
    clears the threshold the rule actually applies. A batch of month-end
    payments clearing a few days late is also what this looks like in
    practice; one cheque rarely travels alone.

    If a period cannot reach the threshold, nothing is planted for it rather
    than planting a defect that cannot be found.
    """
    # A clear margin over R5's one per cent, measured against the same base
    # the rule uses. R5 reads turnover from the Sales ledger entries, whose
    # debit is the invoice total including tax — sizing this against the
    # taxable value instead left the displacement fractionally short and a
    # seeded defect undetectable.
    threshold_pct = Decimal("1.8")

    for period in periods:
        turnover = sum(
            (sale.total for sale in truth.sales if sale.period == period), Decimal("0.00")
        )
        needed = to_paise(turnover * threshold_pct / Decimal("100"))

        _, last_day = _period_dates(period)
        month_end = last_day - timedelta(days=5)
        candidates = sorted(
            (
                v
                for v in truth.vouchers
                if v.period == period
                and v.voucher_type == "Payment"
                and v.party_key is not None
                and v.entry_date >= month_end
            ),
            key=lambda v: (-(v.debit or Decimal("0")), v.seq),
        )
        if not candidates:
            continue

        displaced: list = []
        total = Decimal("0.00")
        for voucher in candidates:
            matching = [
                line
                for line in truth.bank
                if line.debit == voucher.debit and line.txn_date == voucher.entry_date
            ]
            if not matching:
                continue
            line = matching[0]
            shifted = voucher.entry_date + timedelta(days=rng.randint(3, 9))
            line.txn_date = shifted
            line.period = period_of(shifted)
            displaced.append(line)
            total += voucher.debit or Decimal("0.00")
            if total >= needed:
                break

        if not displaced or total < needed:
            # Better to plant nothing than to claim a finding the rule is
            # right to consider immaterial.
            continue

        landing = displaced[0].period
        truth.defects.append(
            Defect(
                defect_type="bank_timing_gap",
                expected_rule="R5",
                period=period,
                target_kind="bank_txn",
                natural_key={
                    "ref_no": displaced[0].ref_no or "",
                    "period": period,
                    # A displaced payment perturbs two periods, not one: the
                    # month the books recorded it and the month the bank
                    # cleared it. Both are the correct footprint of this one
                    # defect, so both belong in the answer key — otherwise the
                    # harness scores a correct finding as a false positive.
                    "landing_period": landing,
                },
                amount=to_paise(total),
                note=(
                    f"{len(displaced)} month-end payments the books record in this "
                    "period and the bank clears in the next."
                ),
            )
        )


def _plant_unidentified_deposits(
    truth: GroundTruth, rng: random.Random, periods: list[str]
) -> None:
    """7 credits of 50k or more with no party and no ledger counterpart."""
    spread = dict(zip(periods, (3, 2, 1, 1), strict=False))
    next_seq = max((line.seq for line in truth.bank), default=0)

    for period, count in spread.items():
        for _ in range(count):
            next_seq += 1
            amount = to_paise(Decimal(rng.randint(60_000, 850_000)))
            day = _random_day(rng, period)
            ref = f"{rng.randint(100_000_000, 999_999_999)}"
            truth.bank.append(
                BankLine(
                    seq=next_seq,
                    txn_date=day,
                    period=period,
                    # No trade name anywhere in it: nothing for party resolution
                    # to grip, which is exactly why a CA cannot clear it either.
                    narration=f"RTGS CR {ref} SUNDRY DEPOSIT",
                    ref_no=ref,
                    debit=None,
                    credit=amount,
                )
            )
            truth.defects.append(
                Defect(
                    defect_type="unidentified_deposit",
                    expected_rule="R6",
                    period=period,
                    target_kind="bank_txn",
                    natural_key={"ref_no": ref, "period": period},
                    amount=amount,
                    note="Bank credit with no resolvable party and no ledger entry.",
                )
            )


def _plant_concentration_spikes(truth: GroundTruth, demo_period: str) -> None:
    """2 periods where the top three customers cross the 50% line.

    The spike is created in _generate_sales; this records the answer.
    """
    for period in (demo_period, shift_period(demo_period, -6)):
        if period not in truth.periods:
            continue
        revenue = sum(s.taxable for s in truth.sales if s.period == period)
        truth.defects.append(
            Defect(
                defect_type="concentration_spike",
                expected_rule="R7",
                period=period,
                target_kind="company",
                natural_key={"period": period},
                amount=to_paise(Decimal(revenue)),
                note="Top three customers exceed half of the period's revenue.",
            )
        )


def _plant_receivables_ageing(truth: GroundTruth, demo_period: str) -> None:
    """One customer stops paying, and the balance ages past ninety days.

    R8 was implemented and never fired, because every seeded customer paid
    eventually. A rule with no case in the data is a rule nobody has
    actually run — so one major customer's invoices over a four-month window
    are left open, which is what a receivables problem looks like: not
    everyone paying slightly late, one relationship that has gone quiet.

    The ageing is FIFO against that customer's receipts, so the open balance
    is genuinely the oldest invoices rather than a flag set on them.
    """
    if not truth.customers:
        return

    # The largest customer by revenue, since that is the one whose silence
    # actually moves the aged share.
    totals: dict[str, Decimal] = {}
    for sale in truth.sales:
        totals[sale.customer_key] = totals.get(sale.customer_key, Decimal("0")) + sale.taxable
    if not totals:
        return
    worst = max(totals, key=lambda key: totals[key])

    # Two relationships that go quiet and stay quiet. One customer is a
    # dispute; two that stop paying is the pattern a lender asks about.
    #
    # They stop from a date onwards rather than for a fixed window, and that
    # distinction is the whole rule. Ageing is FIFO, so if the customer keeps
    # paying afterwards those later receipts clear the older invoices and the
    # balance never ages — the debt just moves to the newest invoice. Only a
    # customer who stops entirely leaves genuinely old money outstanding.
    ranked = sorted(totals, key=lambda key: totals[key], reverse=True)
    silent = set(ranked[:2]) if len(ranked) >= 2 else {worst}
    quiet_from = shift_period(demo_period, -7)
    stopped = [
        sale for sale in truth.sales if sale.customer_key in silent and sale.period >= quiet_from
    ]
    if not stopped:
        return

    for sale in stopped:
        sale.settled_on = None

    open_value = sum((sale.total for sale in stopped), Decimal("0.00"))
    customer = truth.party(ranked[0])

    # The balance is over ninety days old from three periods after the window
    # closes, which is where the finding is expected.
    for offset in (0, -1):
        period = shift_period(demo_period, offset)
        if period not in truth.periods:
            continue
        truth.extended_defects.append(
            Defect(
                defect_type="receivables_aged",
                expected_rule="R8",
                period=period,
                target_kind="company",
                natural_key={"period": period, "customer": customer.legal_name},
                amount=to_paise(open_value),
                note=(
                    f"{len(silent)} customers, including {customer.legal_name}, have "
                    f"paid nothing invoiced since {quiet_from}, so the oldest of that "
                    "balance has aged past ninety days."
                ),
            )
        )


_BLOCKED_CATEGORIES = (
    ("Motor vehicle, 13 seats or fewer", "Sec 17(5)(a)"),
    ("Food, beverage and outdoor catering", "Sec 17(5)(b)"),
    ("Works contract for immovable property", "Sec 17(5)(c)"),
)


def _plant_blocked_credits(truth: GroundTruth, rng: random.Random, demo_period: str) -> None:
    """Credit that is ineligible however cleanly it reconciles (Sec 17(5)).

    These are not matching failures. The document is present on both sides and
    agrees exactly; the credit simply cannot be claimed. GSTR-2B already says
    so in its ITC Not Available section, so the engine reads that flag rather
    than reimplementing the statute — and the CA can override it, because
    eligibility depends on the client's own line of business, which 2B has no
    way to know.
    """
    spread = {demo_period: 2, shift_period(demo_period, -1): 1, shift_period(demo_period, -4): 1}
    for period, count in spread.items():
        for doc in _pick_purchases(truth, rng, period, count, min_taxable=Decimal("80000")):
            label, section = rng.choice(_BLOCKED_CATEGORIES)
            doc.blocked_reason = f"{label} ({section})"
            vendor = truth.party(doc.vendor_key)
            truth.extended_defects.append(
                Defect(
                    defect_type="blocked_credit",
                    expected_rule="R13",
                    period=period,
                    target_kind="gstr2b_line",
                    natural_key={
                        "supplier_gstin": vendor.gstin,
                        "number": str(doc.number),
                        "period": period,
                    },
                    amount=doc.tax_total,
                    note=f"GSTR-2B reports ITC not available: {doc.blocked_reason}.",
                )
            )


def _plant_late_filers(truth: GroundTruth, rng: random.Random, demo_period: str) -> None:
    """Realism, deliberately absent from the answer key.

    These invoices are filed by the supplier one period late, so they appear in
    the *following* month's 2B. §15.1 is explicit that this is not a loss. A
    matcher that only looks inside a single period will report all of them as
    unmatched, and the harness will score every one as a false positive. That
    is the intended signal, not a flaw in the data.
    """
    for offset in (0, -1, -2, -3):
        period = shift_period(demo_period, offset)
        if period not in truth.periods or period == truth.periods[-1]:
            continue
        for doc in _pick_purchases(truth, rng, period, 4, min_taxable=Decimal("30000")):
            doc.filed_late = True


def _finalise_bank(truth: GroundTruth) -> None:
    """Order the statement by date and run the balance down it.

    The opening balance is derived rather than fixed. A current account that
    dips several lakh negative mid-year is not a statement any bank would
    issue, and a CA would spot it before the first risk card loaded. Two
    passes: find the deepest cumulative dip, then open high enough to keep a
    working float underneath it.
    """
    truth.bank.sort(key=lambda line: (line.txn_date, line.seq))

    floor = Decimal("1500000.00")
    running = Decimal("0.00")
    lowest = Decimal("0.00")
    for line in truth.bank:
        running += (line.credit or Decimal("0.00")) - (line.debit or Decimal("0.00"))
        lowest = min(lowest, running)

    balance = to_paise(floor - lowest)
    for index, line in enumerate(truth.bank, start=1):
        balance = balance - (line.debit or Decimal("0.00")) + (line.credit or Decimal("0.00"))
        line.balance = to_paise(balance)
        line.seq = index
