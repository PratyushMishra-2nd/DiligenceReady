-- The engine is meant to be rerun: reconciliation is a pure function of a
-- period's inputs, and `diligence rules` clears and recomputes. Once the
-- evaluation harness had linked a planted defect to the risk that found it,
-- that rerun hit a foreign key violation and the whole pipeline stopped being
-- idempotent — the property §09 and §11 both claim for it.
--
-- Deleting a risk should leave the defect recorded and simply undetected
-- again, which is exactly what the next evaluation run will re-establish.

alter table planted_defects
    drop constraint planted_defects_detected_by_risk_id_fkey;

alter table planted_defects
    add constraint planted_defects_detected_by_risk_id_fkey
    foreign key (detected_by_risk_id) references risks (id) on delete set null;
