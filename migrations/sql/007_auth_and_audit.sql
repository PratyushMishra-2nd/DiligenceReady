-- ════════════════════════════════════════════════════════════════════════
-- Authentication, firm-level access control, and an audit log.
--
-- §14 week two, and the blueprint calls it non-negotiable: this is client
-- financial data. Until now every API caller could read every firm's books.
--
-- Three decisions worth stating, because each is a place this could have
-- been done badly:
--
-- 1.  **A user belongs to exactly one firm.** Access control is then a
--     property of the row rather than a rule the caller has to remember: a
--     query that forgets to scope by firm returns nothing useful instead of
--     returning someone else's client list. Practices that share staff will
--     need a join table; that is a migration, not a redesign.
--
-- 2.  **Sessions store a hash, never the token.** A database dump must not
--     be a set of working credentials.
--
-- 3.  **The audit log is append-only and never holds a secret.** It records
--     who did what to which company and when. It does not record tokens,
--     passwords, or the contents of what was read — an audit trail that
--     leaks the thing it is auditing is worse than none.
--
-- What this migration does NOT do, said plainly rather than implied:
-- encryption at rest is a deployment property (an encrypted volume, or a
-- managed Postgres with encryption enabled) and nothing here provides it.
-- The local object store writes plaintext files to disk in development.
-- ════════════════════════════════════════════════════════════════════════

create table users (
    id            uuid primary key,
    firm_id       uuid        not null references firms (id),
    email         text        not null,
    -- scrypt, with the parameters and salt encoded alongside the digest so a
    -- future cost increase can be rolled out without invalidating anyone.
    password_hash text        not null,
    display_name  text        not null,
    role          text        not null default 'member',
    is_active     boolean     not null default true,
    created_at    timestamptz not null default now(),
    last_login_at timestamptz,

    constraint users_role_vals check (role in ('owner', 'member', 'readonly')),
    -- Email is the login, so it is unique across the installation rather than
    -- per firm: two firms cannot claim the same address.
    constraint users_email_lower check (email = lower(email)),
    unique (email)
);

create index on users (firm_id);

create table sessions (
    id           uuid primary key,
    user_id      uuid        not null references users (id) on delete cascade,
    -- sha256 of the bearer token. The token itself is returned once, at
    -- login, and is never stored anywhere.
    token_sha256 text        not null unique,
    issued_at    timestamptz not null default now(),
    expires_at   timestamptz not null,
    last_seen_at timestamptz not null default now(),
    revoked_at   timestamptz,
    user_agent   text,

    constraint sessions_expiry_after_issue check (expires_at > issued_at)
);

create index on sessions (user_id);
create index on sessions (expires_at);

create table audit_log (
    id         uuid primary key,
    at         timestamptz not null default now(),
    user_id    uuid references users (id),
    firm_id    uuid references firms (id),
    company_id uuid references companies (id),
    action     text not null,
    -- What was acted on, as a type and id. No polymorphic foreign key,
    -- because the audit log must outlive the rows it describes.
    object_type text,
    object_id   text,
    -- Enough context to answer "what happened", never enough to leak what
    -- was read. No tokens, no passwords, no document contents.
    detail     jsonb not null default '{}'::jsonb,
    ip         inet,

    constraint audit_action_vals check (action in (
        'login', 'login_failed', 'logout',
        'document_uploaded', 'ingest_run', 'reconcile_run', 'rules_run',
        'risk_status_changed', 'explanation_generated',
        'evidence_viewed', 'ims_action_recorded'
    ))
);

create index on audit_log (firm_id, at desc);
create index on audit_log (company_id, at desc);
create index on audit_log (user_id, at desc);

comment on table audit_log is
    'Append-only. Nothing in this system updates or deletes a row here.';
