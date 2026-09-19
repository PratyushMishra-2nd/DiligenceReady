-- ════════════════════════════════════════════════════════════════════════
-- Rule registry — Blueprint §09 (fourteen rules, four domains).
--
-- Scope for this build is the 48-hour target in §12: R1–R8 enabled.
-- The IMS domain (R9–R13) and the Rule 37A reclaim (R4b) are seeded as
-- disabled rows rather than omitted, because §15 lists a practising CA's
-- review of the GST rule set as the one outstanding dependency. The rows
-- exist so the schema, the dashboard and the evaluation harness already
-- know their shape; flipping `enabled` is the only change needed once the
-- review lands.
--
-- thresholds is every tunable the rule reads. A rule must not carry a
-- magic number in code — the number belongs here, where a firm can see it.
-- ════════════════════════════════════════════════════════════════════════

insert into rules (code, domain, title, severity_fn, thresholds, enabled) values

-- ─── domain A: GST / ITC — the money ───

('R1', 'gst', 'ITC_UNMATCHED', 'age_based',
 '{"watch_periods": 1, "chase_periods": 2, "at_risk_periods": 3,
   "sec_16_4_cutoff_mmdd": "11-30",
   "note": "Severity is a function of age, never of a single month snapshot. An invoice missing from August 2B often appears in September: the supplier filed late, or it sits in IMS Pending."}',
 true),

('R2', 'gst', 'ITC_AMOUNT_MISMATCH', 'static_medium',
 '{"tolerance_inr": 1.00, "applies_per_tax_head": true,
   "note": "GSTN allows a tolerance of 0-10 applied to each tax head separately (Integrated, Central, State/UT, Cess) and never to the consolidated tax amount. Clear publishes a default of +/-1 rupee, which sits inside that range."}',
 true),

('R3', 'gst', 'DUPLICATE_PURCHASE', 'static_high',
 '{"key": ["supplier_gstin", "norm_invoice_no"], "min_occurrences": 2,
   "exclude_amendments": true,
   "note": "B2BA / CDNRA rows are legitimate amendments, not duplicates."}',
 true),

('R4', 'gst', 'ITC_REVERSAL_37A', 'deadline_proximity',
 '{"supplier_cutoff_mmdd": "09-30", "recipient_cutoff_mmdd": "11-30",
   "interest_pct_pa": 24, "read_from": "gstr2b_lines.itc_reversal_37a",
   "note": "GSTN computes the Rule 37A reversal in the 2B ITC Reversal section. Read it. Do not infer non-filers: a heuristic that disagrees with the government figure is a bug, not a feature."}',
 true),

('R4b', 'gst', 'REVERSAL_RECLAIMABLE', 'static_info',
 '{"reclaim_table": "4(D)(1)",
   "note": "Previously reversed under 37A, supplier has since filed. Sec 16(4) does not bar the reclaim. Money found, not money lost. Out of 48h scope, pending CA review of section 15."}',
 false),

-- ─── domain B: bank vs books — the truth test ───

('R5', 'bank', 'BANK_BOOKS_VARIANCE', 'threshold_band',
 '{"turnover_pct": 1.0, "residual_inr": 50000,
   "note": "Residual is residual. Never dress it as a cause."}',
 true),

('R6', 'bank', 'UNIDENTIFIED_DEPOSIT', 'static_medium',
 '{"min_credit_inr": 50000, "requires_no_party": true, "requires_no_ledger_match": true}',
 true),

-- ─── domain C: commercial — the diligence hook ───

('R7', 'commercial', 'CUSTOMER_CONCENTRATION', 'band',
 '{"top_n": 3, "medium_pct": 50, "high_pct": 65}',
 true),

('R8', 'commercial', 'RECEIVABLES_AGEING', 'band',
 '{"bucket_days": 90, "pct_of_total": 20}',
 true),

-- ─── domain D: IMS — seeded, disabled, pending CA review (section 15) ───

('R9', 'ims', 'IMS_ACTION_REQUIRED', 'count_and_value',
 '{"portal_status": "no_action",
   "note": "Deemed acceptance pulls these into the return unreviewed."}',
 false),

('R10', 'ims', 'IMS_RECOMMEND_REJECT', 'static_high',
 '{"tolerance_inr": 1.00,
   "note": "Any recommendation to reject must surface reject_raises_supplier_liability first. A reject is a commercial act with a visible counterparty."}',
 false),

('R11', 'ims', 'GSTR2B_STALE', 'static_high',
 '{"blocks_downstream": true, "trigger_day_of_month": 14,
   "note": "An action after the 14th, or a change to a prior action, makes recomputing 2B mandatory."}',
 false),

('R12', 'ims', 'FILING_CHAIN_BLOCKED', 'static_high',
 '{"surface_at": "firm_dashboard",
   "note": "Prior period GSTR-3B unfiled, so this period 2B cannot generate. Every number for this client is stale."}',
 false),

('R13', 'gst', 'BLOCKED_CREDIT_17_5', 'static_medium',
 '{"read_from": "gstr2b ITC Not Available section", "ca_overridable": true,
   "note": "Eligibility depends on the client line of business, which 2B cannot know. Read the classification, do not reimplement the statute."}',
 false);
