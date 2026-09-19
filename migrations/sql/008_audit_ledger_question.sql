-- "Ask the ledger" is a read of a client's books, so it is auditable.
--
-- The audit action list is an allow-list rather than free text, and it earned
-- that: a typo'd action name is a line nobody can search for later, and an
-- audit trail you cannot query is decoration. The cost is this migration
-- every time a new auditable thing exists, which is the right cost - it
-- forces the question "should this be audited, and under what name" to be
-- answered once, in one place, instead of at each call site.
--
-- Adding it caught exactly that: the /ask route was written, the audit line
-- was written with it, and the insert failed the CHECK on the first real
-- request. Which is the constraint working.
--
-- What the detail column holds for this action: the question the user typed,
-- whether the agent answered or was refused, and which read-only tools ran.
-- Not the answer. A stored answer would be an unversioned copy of figures
-- that the engine can recompute exactly, and the audit log is not a cache.

alter table audit_log
    drop constraint audit_action_vals;

alter table audit_log
    add constraint audit_action_vals check (action in (
        'login', 'login_failed', 'logout',
        'document_uploaded', 'ingest_run', 'reconcile_run', 'rules_run',
        'risk_status_changed', 'explanation_generated',
        'evidence_viewed', 'ims_action_recorded',
        -- New here.
        'ledger_question'
    ));
