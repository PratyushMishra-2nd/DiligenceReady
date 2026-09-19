-- A credit note corrects an earlier document, and IMS carries that reference.
-- Without it the recommender has to treat every credit note as a document with
-- no counterpart, and the only safe recommendation for those raises the
-- supplier's liability. Storing the original lets a legitimate purchase return
-- be recognised as one.
--
-- amends_record_id already exists for amendments of IMS records. This is a
-- different relationship: the document being credited, which may have reached
-- the books long before it reached the dashboard.

alter table ims_records
    add column orig_norm_invoice_no text;

create index on ims_records (company_id, supplier_gstin, orig_norm_invoice_no);
