"""Ground-truth model for the synthetic company.

One ledger is the truth. Every feed is *derived* from it, then degraded in the
specific way the real source degrades it (Blueprint §10):

    tally_purchase_register.csv   messy invoice formats, ledger names, no GSTIN
    gstr2b_YYYY_MM.json           clean, GSTIN-keyed, portal schema
    bank_statement.csv            free-text narration, UTR references

Because the truth is known before the feeds exist, a defect injected into a
feed has a known answer — which is what lets the evaluation harness report
precision and recall instead of an assertion.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Party:
    """A vendor or customer, with the two names the two systems know it by."""

    key: str
    legal_name: str  # as the portal carries it: "ABC TRADERS PRIVATE LIMITED"
    ledger_name: str  # as the bookkeeper typed it in Tally: "ABC Traders"
    gstin: str
    state_code: str
    kind: str  # vendor | customer
    gst_rate: Decimal
    books_series: str  # how the invoice number is written in the register
    portal_series: str  # how the same number reaches GSTR-2B
    payment_days: int


@dataclass
class PurchaseDoc:
    """A purchase invoice as the ground truth knows it, before either feed sees it."""

    seq: int
    vendor_key: str
    number: int  # the bare sequence number both systems dress differently
    doc_date: date
    period: str
    taxable: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    cess: Decimal
    total: Decimal

    # defect switches, set by the injector, read by the writers
    absent_from_2b: bool = False
    portal_amount_delta: Decimal = Decimal("0.00")
    duplicated_in_register: bool = False
    reversal_37a: Decimal = Decimal("0.00")

    # Realism rather than a defect: the supplier filed a period late, so this
    # invoice reaches the *following* month's 2B. Not in the answer key. A
    # matcher that cannot see across periods will report it as unmatched.
    filed_late: bool = False

    # Superseded by a B2BA amendment: the amended record replaces the
    # original in IMS and in 2B regardless of any action already taken on
    # it, so the original must not also be matched.
    superseded: bool = False

    # Sec 17(5): credit that is ineligible however cleanly it reconciles.
    # GSTR-2B flags it in its ITC Not Available section, so the engine reads
    # the classification instead of reimplementing the statute.
    blocked_reason: str | None = None

    @property
    def tax_total(self) -> Decimal:
        return self.cgst + self.sgst + self.igst + self.cess


@dataclass
class SalesDoc:
    seq: int
    customer_key: str
    number: int
    doc_date: date
    period: str
    taxable: Decimal
    tax: Decimal
    total: Decimal
    settled_on: date | None = None


@dataclass
class Voucher:
    """A Tally receipt or payment voucher: the books' side of a money movement."""

    seq: int
    voucher_type: str  # Receipt | Payment
    voucher_no: str
    entry_date: date
    period: str
    party_key: str | None
    ledger_name: str
    debit: Decimal | None
    credit: Decimal | None


@dataclass
class BankLine:
    """The bank's side of the same movement, or something only the bank knows."""

    seq: int
    txn_date: date
    period: str
    narration: str
    ref_no: str | None
    debit: Decimal | None
    credit: Decimal | None
    balance: Decimal = Decimal("0.00")


@dataclass(frozen=True)
class Defect:
    """One planted defect, with the natural key that identifies it after ingestion.

    Row ids do not exist yet at generation time, so the answer key travels as a
    natural key and is resolved to a uuid once the feeds have been ingested.
    Keeping it out of the feeds is the point: the engine must find these
    without ever being told where they are.
    """

    defect_type: str
    expected_rule: str
    period: str
    target_kind: str  # purchase_invoice | bank_txn | company
    natural_key: dict[str, str]
    amount: Decimal
    note: str


@dataclass
class GroundTruth:
    company_name: str
    company_slug: str
    gstin: str
    pan: str
    state_code: str
    fy_start: date
    periods: list[str]
    vendors: list[Party]
    customers: list[Party]
    purchases: list[PurchaseDoc] = field(default_factory=list)
    sales: list[SalesDoc] = field(default_factory=list)
    vouchers: list[Voucher] = field(default_factory=list)
    bank: list[BankLine] = field(default_factory=list)
    defects: list[Defect] = field(default_factory=list)
    # Rules outside the fixed forty-one of section 10 keep their own answer
    # key: the IMS domain and blocked credits. That number is quoted on a
    # slide, and folding new domains into it would quietly change the claim.
    extended_defects: list[Defect] = field(default_factory=list)
    # period -> the IMS dashboard as the portal would show it that month
    ims: dict[str, list[dict]] = field(default_factory=dict)
    # period -> the 2B sections beyond B2B. GSTR-2B is sixteen tables, and
    # a generator that only emits one lets an ingester that only reads one
    # look correct (section 15.2).
    gstr2b_extra: dict[str, dict] = field(default_factory=dict)

    def party(self, key: str) -> Party:
        for candidate in (*self.vendors, *self.customers):
            if candidate.key == key:
                return candidate
        raise KeyError(key)
