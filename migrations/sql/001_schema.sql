-- ════════════════════════════════════════════════════════════════════════
-- DiligenceReady — initial schema
-- Source of truth: Blueprint §07 (PostgreSQL schema).
--
-- Typed financial tables throughout. No entity-attribute-value: an EAV store
-- turns every rupee into a string, kills type safety, and makes each query a
-- self-join — unacceptable in a system whose entire output is arithmetic.
--
-- Design law (§07): every financial row carries source_document_id and
-- source_row. Every risk carries evidence rows. Every number on the dashboard
-- answers "where did this come from?" in one click.
--
-- Deviations from the blueprint listing, all additive:
--   · periods absorbs the §07 ALTER columns directly (single create).
--   · company_id / (company_id, period) foreign keys are declared rather than
--     left implicit. Ingestion must create the period before rows land in it.
--   · CHECK constraints encode the value sets the blueprint wrote as comments.
-- ════════════════════════════════════════════════════════════════════════

-- ═══ tenancy ═══

create table firms (
    id         uuid primary key,
    name       text        not null,
    created_at timestamptz not null default now()
);

create table companies (
    id       uuid primary key,
    firm_id  uuid not null references firms (id),
    name     text not null,
    gstin    text,
    pan      text,
    fy_start date not null default '2026-04-01'
);

create index on companies (firm_id);

create table periods (
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,                    -- '2026-08'
    status     text    not null default 'open',

    -- 2B is sequential: a period generates only once the prior period's
    -- GSTR-3B is filed. Track it, or a client in arrears is silently shown
    -- stale data — and clients in arrears are exactly who needs the tool.
    gstr3b_filed        boolean     not null default false,
    gstr3b_filed_at     timestamptz,
    gstr2b_generated_at timestamptz,
    gstr2b_stale        boolean     not null default false,  -- action taken after the 14th
    filing_frequency    text        not null default 'monthly',

    constraint periods_period_fmt  check (period ~ '^[0-9]{4}-[0-9]{2}$'),
    constraint periods_status_vals check (status in ('open', 'locked', 'filed')),
    -- QRMP: no 2B for months M-1 and M-2. A multi-company dashboard must not
    -- show a QRMP client as "missing 2B" in those months.
    constraint periods_freq_vals   check (filing_frequency in ('monthly', 'qrmp')),
    unique (company_id, period)
);

-- ═══ provenance ═══

create table documents (
    id          uuid primary key,
    company_id  uuid        not null references companies (id),
    period      char(7),
    kind        text        not null,
    filename    text        not null,
    storage_key text        not null,
    sha256      text        not null,
    row_count   int,
    uploaded_at timestamptz not null default now(),

    constraint documents_kind_vals check (kind in (
        'gstr2b', 'purchase_register', 'bank_stmt', 'sales_ledger',
        'ledger', 'ims', 'invoice_pdf'
    )),
    unique (company_id, sha256),                     -- idempotent re-upload
    foreign key (company_id, period) references periods (company_id, period)
);

-- ═══ party resolution ═══

create table parties (
    id             uuid primary key,
    company_id     uuid not null references companies (id),
    gstin          text,
    pan            text,
    canonical_name text not null,
    norm_name      text not null,                    -- uppercased, legal suffixes stripped
    kind           text not null,

    constraint parties_kind_vals check (kind in ('vendor', 'customer', 'both'))
);

create index on parties (company_id, norm_name);
create index on parties (company_id, gstin);

create table party_aliases (                         -- Tally ledger name -> party
    id         uuid primary key,
    party_id   uuid not null references parties (id) on delete cascade,
    alias      text not null,
    norm_alias text not null,
    source     text not null,

    constraint party_aliases_source_vals check (source in (
        'tally_ledger', 'gstr2b', 'bank_narration'
    ))
);

create index on party_aliases (norm_alias);

-- ═══ typed financial records ═══

create table purchase_invoices (
    id              uuid    primary key,
    company_id      uuid    not null references companies (id),
    period          char(7) not null,
    party_id        uuid    references parties (id),
    supplier_gstin  text,
    invoice_no      text    not null,
    norm_invoice_no text    not null,
    invoice_date    date    not null,
    taxable_value   numeric(15, 2) not null,
    cgst            numeric(15, 2) not null default 0,
    sgst            numeric(15, 2) not null default 0,
    igst            numeric(15, 2) not null default 0,
    cess            numeric(15, 2) not null default 0,
    total_value     numeric(15, 2) not null,

    source_document_id uuid not null references documents (id),
    source_row         int  not null,

    foreign key (company_id, period) references periods (company_id, period)
);

create index on purchase_invoices (company_id, period);
create index on purchase_invoices (company_id, supplier_gstin, norm_invoice_no);

create table gstr2b_lines (
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,

    -- GSTR-2B is sixteen tables, not one (§15.2). Modelling it as a flat list
    -- flags legitimate amendments as duplicates and drops ISD, imports and ECO
    -- supplies entirely.
    section text not null,

    supplier_gstin   text,                           -- null for IMPG: no supplier-wise detail
    supplier_name    text,
    invoice_no       text not null,
    norm_invoice_no  text not null,
    bill_of_entry_no text,                           -- IMPG / IMPGSEZ key instead of invoice_no
    invoice_date     date not null,

    is_reverse_charge boolean not null default false,
    is_amendment      boolean not null default false,  -- B2BA / CDNRA / ISDA / ECOA
    amends_invoice_no text,                            -- so R3 does not call an amendment a duplicate

    taxable_value numeric(15, 2) not null,
    cgst          numeric(15, 2) not null default 0,
    sgst          numeric(15, 2) not null default 0,
    igst          numeric(15, 2) not null default 0,
    cess          numeric(15, 2) not null default 0,
    total_value   numeric(15, 2) not null,

    itc_available    boolean not null default true,
    -- GSTN computes Rule 37A for you, from the periods for which the supplier's
    -- GSTR-3B is unfiled. Read it, do not infer it: a heuristic that disagrees
    -- with the government's own figure is a bug, not a feature (§15 finding 02).
    itc_reversal_37a numeric(15, 2) not null default 0,

    source_document_id uuid not null references documents (id),
    source_row         int  not null,

    constraint gstr2b_section_vals check (section in (
        'B2B', 'B2BA', 'CDNR', 'CDNRA', 'ISD', 'ISDA',
        'IMPG', 'IMPGSEZ', 'ECO', 'ECOA',
        'ITC_REVERSED', 'B2B_DNR'
    )),
    foreign key (company_id, period) references periods (company_id, period)
);

create index on gstr2b_lines (company_id, period, section);
create index on gstr2b_lines (company_id, supplier_gstin, norm_invoice_no);

-- ═══ Invoice Management System (live 01 Oct 2024) ═══

create table ims_records (
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,

    supplier_gstin text not null,
    doc_type       text not null,                    -- GSTN parameter 2. never assume invoice.

    invoice_no      text not null,
    norm_invoice_no text not null,
    invoice_date    date not null,
    total_value     numeric(15, 2) not null,

    supplier_filed      boolean not null default false,  -- reaches IMS on SAVE, counts on FILE
    is_amendment        boolean not null default false,
    amends_record_id    uuid references ims_records (id),
    amendment_direction text,                            -- upward | downward (gates Pending)

    portal_status   text not null,
    deemed_accepted boolean generated always as
        (portal_status = 'no_action') stored,        -- inaction = acceptance

    -- false for original credit notes and the amendment cases in §15.2.
    -- Never offer Pending in the UI when false: it produces a portal error the
    -- user cannot interpret.
    pending_allowed boolean not null default true,

    -- Rejecting a credit note raises the supplier's liability in their next
    -- GSTR-3B, and the supplier can see the action taken. A reject is a
    -- commercial act with a visible counterparty. Warn before recommending.
    reject_raises_supplier_liability boolean not null default false,

    recommended_action    text,                      -- OUR computed suggestion
    recommendation_reason text,
    matched_invoice_id    uuid references purchase_invoices (id),
    actioned_by uuid,
    actioned_at timestamptz,

    source_document_id uuid not null references documents (id),
    source_row         int  not null,

    constraint ims_doc_type_vals check (doc_type in ('invoice', 'debit_note', 'credit_note')),
    constraint ims_portal_status_vals check (portal_status in (
        'accepted', 'rejected', 'pending', 'no_action'
    )),
    constraint ims_amendment_direction_vals check (
        amendment_direction is null or amendment_direction in ('upward', 'downward')
    ),
    constraint ims_recommended_action_vals check (
        recommended_action is null or recommended_action in ('accept', 'reject', 'pending')
    ),
    -- Never recommend an action the portal will refuse.
    constraint ims_pending_not_recommended_when_barred check (
        pending_allowed or recommended_action is distinct from 'pending'
    ),
    foreign key (company_id, period) references periods (company_id, period)
);

create index on ims_records (company_id, period, portal_status);
create index on ims_records (company_id, supplier_gstin, norm_invoice_no);

-- ═══ bank and books ═══

create table bank_txns (
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,

    txn_date  date not null,
    narration text not null,
    ref_no    text,
    debit     numeric(15, 2),
    credit    numeric(15, 2),
    balance   numeric(15, 2),
    party_id  uuid references parties (id),          -- resolved from narration

    source_document_id uuid not null references documents (id),
    source_row         int  not null,

    constraint bank_txns_one_side check (
        (debit is not null and credit is null) or
        (credit is not null and debit is null)
    ),
    foreign key (company_id, period) references periods (company_id, period)
);

create index on bank_txns (company_id, period, txn_date);
create index on bank_txns (company_id, party_id);

create table ledger_entries (                        -- Tally vouchers: sales, receipts, payments
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,

    voucher_type text not null,
    voucher_no   text,
    entry_date   date not null,
    party_id     uuid references parties (id),
    debit        numeric(15, 2),
    credit       numeric(15, 2),
    ledger_name  text not null,

    source_document_id uuid not null references documents (id),
    source_row         int  not null,

    foreign key (company_id, period) references periods (company_id, period)
);

create index on ledger_entries (company_id, period, voucher_type);
create index on ledger_entries (company_id, party_id);

-- ═══ the core table ═══
-- Every headline figure on the dashboard is a COUNT or SUM over this one table.
-- Without it, "23 unmatched" has nothing underneath it and no drill-down is
-- possible.

create table matches (
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,
    domain     text    not null,                     -- gst | bank

    -- Polymorphic by design: no foreign key is possible on either side.
    left_type  text not null,
    left_id    uuid not null,
    right_type text,
    right_id   uuid,                                 -- null = unmatched

    status       text not null,
    match_method text not null,

    -- COMPUTED, never model-reported. It is a deterministic scoring heuristic,
    -- not a probability — which is why it is never called confidence, and why
    -- the component breakdown always ships with it.
    match_score     numeric(4, 3),
    score_breakdown jsonb,                           -- {gstin:1.0, invno:0.94, amount:0.99}

    amount_delta    numeric(15, 2),
    date_delta_days int,
    computed_at     timestamptz not null default now(),

    constraint matches_domain_vals check (domain in ('gst', 'bank')),
    constraint matches_status_vals check (status in (
        'matched', 'unmatched', 'duplicate', 'disputed', 'residual'
    )),
    constraint matches_method_vals check (match_method in (
        -- GSTN's six categories (§08 step 3) plus the bank-side methods.
        'exact', 'partial', 'probable', 'value_mismatch', 'orphan_2b', 'orphan_pr',
        'strong', 'fuzzy', 'amount_date', 'none'
    )),
    constraint matches_unmatched_has_no_right check (
        (status = 'unmatched') = (right_id is null)
    ),
    foreign key (company_id, period) references periods (company_id, period)
);

create index on matches (company_id, period, domain, status);
create index on matches (left_type, left_id);
create index on matches (right_type, right_id);

-- ═══ risks ═══

create table rules (
    code        text primary key,
    domain      text    not null,
    title       text    not null,
    severity_fn text    not null,
    thresholds  jsonb   not null,
    enabled     boolean not null default true,

    constraint rules_domain_vals check (domain in ('gst', 'ims', 'bank', 'commercial'))
);

create table risks (
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,
    rule_code  text    not null references rules (code),

    risk_key text not null,                          -- deterministic, for idempotent upsert
    severity text not null,

    headline_amount numeric(15, 2),
    headline_pct    numeric(6, 2),

    metrics     jsonb not null,                      -- every input to the calculation
    calculation text  not null,                      -- "10.82Cr / 18.41Cr = 58.77%"
    rule_text   text  not null,                      -- "Top 3 customers > 50% of revenue"
    explanation text,                                -- model-written, generated LAST

    status      text        not null default 'open',
    computed_at timestamptz not null default now(),

    constraint risks_severity_vals check (severity in ('high', 'medium', 'low', 'info')),
    -- Clear's ITC action set rather than a generic open/closed (§15.6).
    constraint risks_status_vals check (status in (
        'open', 'acknowledged', 'resolved', 'ignored',
        'claim', 'reversed', 'ineligible', 'pending', 'reset'
    )),
    unique (company_id, period, risk_key),           -- rerun-safe
    foreign key (company_id, period) references periods (company_id, period)
);

create index on risks (company_id, period, severity);
create index on risks (rule_code);

create table risk_evidence (
    id          uuid primary key,
    risk_id     uuid not null references risks (id) on delete cascade,
    record_type text not null,
    record_id   uuid not null,
    document_id uuid references documents (id),
    source_row  int,
    source_page int,
    note        text
);

create index on risk_evidence (risk_id);

-- ═══ evaluation ═══
-- Ground truth lets us measure the engine instead of manufacturing a success
-- story. Synthetic and seeded — disclosed (§10).

create table planted_defects (
    id         uuid    primary key,
    company_id uuid    not null references companies (id),
    period     char(7) not null,

    defect_type text not null,
    target_type text,
    target_id   uuid,
    amount      numeric(15, 2),

    detected            boolean not null default false,
    detected_by_risk_id uuid references risks (id),

    foreign key (company_id, period) references periods (company_id, period)
);

create index on planted_defects (company_id, period, defect_type);
