"""Authentication, firm scoping, and the audit log.

§14 week two, described there as non-negotiable because this is client
financial data. A CA firm is handing over its clients' books; the access
model has to be boring and correct rather than clever.

Choices, and why:

**scrypt from the standard library.** A real memory-hard KDF with no new
dependency. Parameters are stored beside each digest, so raising the cost
later is a rehash-on-next-login rather than a forced reset for everyone.

**Tokens are random, and only their hash is stored.** The token is returned
once at login. A database dump is then a set of useless hashes rather than a
set of working credentials.

**Firm scoping is a parameter, not a convention.** Every read takes a
`Principal` and filters on its `firm_id`. A query that forgets returns
nothing rather than someone else's client list — a mistake that fails closed.

**Login failures say one thing.** "Email or password is incorrect", whether
or not the address exists, so the endpoint is not an account-existence
oracle.

Not done here, and not pretended: rate limiting on login, multi-factor,
password reset, and encryption at rest (a deployment property — an encrypted
volume or a managed Postgres with encryption on).
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import secrets
import uuid
from base64 import b64decode, b64encode
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine import authz
from diligence_engine.ingest.documents import stable_id

# scrypt cost. n is the memory/CPU knob; these land around a tenth of a
# second per hash on ordinary hardware, which is the usual balance between
# a login that feels instant and an offline attack that does not.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
KEY_BYTES = 32

TOKEN_BYTES = 32
SESSION_HOURS = 12

ROLES = ("owner", "member", "readonly")


class AuthError(Exception):
    """Authentication or authorisation failed. The message is safe to show."""


@dataclass(frozen=True)
class Principal:
    """Who is asking, and what they are allowed to see."""

    user_id: uuid.UUID
    firm_id: uuid.UUID
    email: str
    display_name: str
    role: str

    # These two are what the interface greys out a button with. They are
    # NOT the enforcement — `auth.may()` is, and it asks Cedar. A property on
    # a dataclass cannot see which company is being written to, and the
    # tenant half of the rule is the half that matters.

    @property
    def can_write(self) -> bool:
        return self.role in ("owner", "member")

    @property
    def can_manage_users(self) -> bool:
        return self.role == "owner"

    def require_write(self) -> None:
        if not self.can_write:
            raise AuthError("This account has read-only access.")


# ── passwords ───────────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """scrypt, with its parameters and salt encoded alongside the digest."""
    if len(password) < 12:
        raise AuthError("Password must be at least 12 characters.")

    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=KEY_BYTES
    )
    return "$".join(
        (
            "scrypt",
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            b64encode(salt).decode("ascii"),
            b64encode(digest).decode("ascii"),
        )
    )


def verify_password(password: str, encoded: str) -> bool:
    """Constant-time comparison against a stored digest."""
    try:
        scheme, n, r, p, salt_b64, digest_b64 = encoded.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False

    try:
        candidate = hashlib.scrypt(
            password.encode("utf-8"),
            salt=b64decode(salt_b64),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(b64decode(digest_b64)),
        )
    except (ValueError, TypeError):
        return False

    return hmac.compare_digest(candidate, b64decode(digest_b64))


# ── users ───────────────────────────────────────────────────────────────────


def create_user(
    conn: Connection,
    *,
    firm_id: uuid.UUID,
    email: str,
    password: str,
    display_name: str,
    role: str = "member",
) -> uuid.UUID:
    if role not in ROLES:
        raise AuthError(f"Unknown role {role!r}. Known roles: {', '.join(ROLES)}.")

    normalised = email.strip().lower()
    if "@" not in normalised:
        raise AuthError("That does not look like an email address.")

    user_id = stable_id("user", normalised)
    conn.execute(
        text(
            "insert into users (id, firm_id, email, password_hash, display_name, role) "
            "values (:id, :firm_id, :email, :password_hash, :display_name, :role) "
            "on conflict (email) do update set "
            "  password_hash = excluded.password_hash, "
            "  display_name = excluded.display_name, "
            "  role = excluded.role, "
            "  is_active = true"
        ),
        {
            "id": user_id,
            "firm_id": firm_id,
            "email": normalised,
            "password_hash": hash_password(password),
            "display_name": display_name,
            "role": role,
        },
    )
    return user_id


# ── sessions ────────────────────────────────────────────────────────────────


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@lru_cache(maxsize=1)
def _dummy_digest() -> str:
    """A hash to verify against when there is no account, so timing matches."""
    return hash_password(secrets.token_urlsafe(32))


def _record_failure(*, user_id: uuid.UUID | None, firm_id: uuid.UUID | None, email: str) -> None:
    """Write the failed-login line on its own connection.

    The caller raises immediately afterwards, and `connect()` rolls its
    transaction back on any exception — so recording the failure on the same
    connection meant it was discarded every time. `login_failed` was a value
    the schema reserved and nothing could ever write: ten thousand password
    guesses produced zero audit rows.

    Its own short transaction commits before the refusal propagates. A
    failure to write the audit line must not itself become the login error,
    so it is swallowed here rather than raised.
    """
    from diligence_engine.db import connect

    try:
        with connect() as audit_conn:
            record(
                audit_conn,
                action="login_failed",
                user_id=user_id,
                firm_id=firm_id,
                detail={"email": email},
            )
    except Exception:  # noqa: BLE001 - never turn an audit failure into a login error
        pass


def login(
    conn: Connection, email: str, password: str, *, user_agent: str | None = None
) -> tuple[str, Principal]:
    """Returns the bearer token, once, and who it belongs to.

    The same error is raised whether the address is unknown, the password is
    wrong, or the account is disabled. A login endpoint that distinguishes
    them is a way to enumerate a firm's staff.
    """
    normalised = email.strip().lower()
    row = conn.execute(
        text(
            "select id, firm_id, email, password_hash, display_name, role, is_active "
            "from users where email = :email"
        ),
        {"email": normalised},
    ).first()

    # Always spend the hash, even when the address is unknown or the account
    # is disabled. Python's `or` short-circuits, so skipping scrypt for an
    # unknown email answered in ~1ms where a real one took ~50ms — the
    # endpoint was an account-existence oracle by latency, which is exactly
    # what the module docstring says it is not. The dummy digest below is a
    # real scrypt hash, so the work is the same either way.
    stored = row.password_hash if row is not None else _dummy_digest()
    password_ok = verify_password(password, stored)

    if row is None or not row.is_active or not password_ok:
        _record_failure(
            user_id=row.id if row else None,
            firm_id=row.firm_id if row else None,
            email=normalised,
        )
        raise AuthError("Email or password is incorrect.")

    token = secrets.token_urlsafe(TOKEN_BYTES)
    expires = datetime.now(UTC) + timedelta(hours=SESSION_HOURS)
    conn.execute(
        text(
            "insert into sessions (id, user_id, token_sha256, expires_at, user_agent) "
            "values (:id, :user_id, :token_sha256, :expires_at, :user_agent)"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": row.id,
            "token_sha256": _token_hash(token),
            "expires_at": expires,
            "user_agent": (user_agent or "")[:400] or None,
        },
    )
    conn.execute(text("update users set last_login_at = now() where id = :id"), {"id": row.id})

    principal = Principal(
        user_id=row.id,
        firm_id=row.firm_id,
        email=row.email,
        display_name=row.display_name,
        role=row.role,
    )
    record(conn, action="login", principal=principal)
    return token, principal


def principal_for(conn: Connection, token: str) -> Principal:
    """Resolve a bearer token, or refuse."""
    row = conn.execute(
        text(
            """
            select s.id as session_id, s.expires_at, s.revoked_at,
                   u.id, u.firm_id, u.email, u.display_name, u.role, u.is_active
            from sessions s
            join users u on u.id = s.user_id
            where s.token_sha256 = :token_sha256
            """
        ),
        {"token_sha256": _token_hash(token)},
    ).first()

    if row is None:
        raise AuthError("Not signed in.")
    if row.revoked_at is not None:
        raise AuthError("This session has been signed out.")
    if row.expires_at <= datetime.now(UTC):
        raise AuthError("This session has expired. Sign in again.")
    if not row.is_active:
        raise AuthError("This account is disabled.")

    conn.execute(
        text("update sessions set last_seen_at = now() where id = :id"),
        {"id": row.session_id},
    )
    return Principal(
        user_id=row.id,
        firm_id=row.firm_id,
        email=row.email,
        display_name=row.display_name,
        role=row.role,
    )


def logout(conn: Connection, token: str) -> None:
    conn.execute(
        text(
            "update sessions set revoked_at = now() "
            "where token_sha256 = :token_sha256 and revoked_at is null"
        ),
        {"token_sha256": _token_hash(token)},
    )


def purge_expired_sessions(conn: Connection) -> int:
    result = conn.execute(
        text("delete from sessions where expires_at < now() - interval '30 days'")
    )
    return result.rowcount or 0


# ── firm scoping ────────────────────────────────────────────────────────────


def firm_of_company(conn: Connection, company_id: uuid.UUID) -> uuid.UUID | None:
    """Which firm owns this company. A fact, read from the database.

    The split matters: the database answers facts, Cedar answers decisions.
    This function does not know what the caller is allowed to do, and the
    policy does not know how to run SQL.
    """
    return conn.execute(
        text("select firm_id from companies where id = :id"), {"id": company_id}
    ).scalar()


def may(conn: Connection, principal: Principal, action: str, company_id: uuid.UUID) -> bool:
    """Whether the caller may take this action on this company. Cedar decides.

    Every firm-scoping decision in the product funnels through here, and from
    here into `authz/policies.cedar`. There is deliberately no second
    implementation of the rule to drift from the first.
    """
    return authz.decide(
        action=action,
        user_id=principal.user_id,
        user_firm_id=principal.firm_id,
        role=principal.role,
        resource_kind="Company",
        resource_id=company_id,
        resource_firm_id=firm_of_company(conn, company_id),
    )


def may_manage_users(principal: Principal) -> bool:
    """Account administration is scoped to the caller's own practice."""
    return authz.decide(
        action=authz.MANAGE_USERS,
        user_id=principal.user_id,
        user_firm_id=principal.firm_id,
        role=principal.role,
        resource_kind="Firm",
        resource_id=principal.firm_id,
        resource_firm_id=None,
    )


def company_in_firm(conn: Connection, principal: Principal, company_id: uuid.UUID) -> bool:
    """A company belongs to the caller's firm, or it does not exist to them."""
    return may(conn, principal, authz.VIEW_COMPANY, company_id)


def require_company(conn: Connection, principal: Principal, company_id: uuid.UUID) -> None:
    """Raise if the caller may not see this company.

    The message is deliberately the same as a genuinely missing company: a
    firm should not be able to discover that another firm's client exists by
    watching how the error changes.
    """
    if not company_in_firm(conn, principal, company_id):
        raise AuthError("No such company.")


# ── audit log ───────────────────────────────────────────────────────────────


def _safe_ip(value: str | None) -> str | None:
    """Only a real address reaches an inet column.

    The source of this is `X-Forwarded-For` when a proxy is in front, which
    is a client-controlled header. Postgres rejects anything that is not an
    address, and an audit insert that raises would fail the very operation it
    exists to record — so a header someone made up becomes a null here rather
    than a 500 there.
    """
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def record(
    conn: Connection,
    *,
    action: str,
    principal: Principal | None = None,
    user_id: uuid.UUID | None = None,
    firm_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    object_type: str | None = None,
    object_id: str | None = None,
    detail: dict | None = None,
    ip: str | None = None,
) -> None:
    """Append one line to the audit log.

    Never pass a token, a password, or document contents in `detail`. The log
    answers who did what to which company and when; a log that leaks what it
    is auditing is worse than not having one.
    """
    conn.execute(
        text(
            "insert into audit_log "
            "(id, user_id, firm_id, company_id, action, object_type, object_id, detail, ip) "
            "values (:id, :user_id, :firm_id, :company_id, :action, :object_type, "
            ":object_id, cast(:detail as jsonb), cast(:ip as inet))"
        ),
        {
            "id": uuid.uuid4(),
            "user_id": principal.user_id if principal else user_id,
            "firm_id": principal.firm_id if principal else firm_id,
            "company_id": company_id,
            "action": action,
            "object_type": object_type,
            "object_id": str(object_id) if object_id is not None else None,
            "detail": json.dumps(detail or {}, default=str),
            "ip": _safe_ip(ip),
        },
    )


def recent_activity(conn: Connection, principal: Principal, limit: int = 50) -> list[dict]:
    """The firm's own audit trail. Scoped, like everything else."""
    rows = conn.execute(
        text(
            """
            select a.at, a.action, a.object_type, a.object_id, a.detail,
                   u.display_name, c.name as company_name
            from audit_log a
            left join users u on u.id = a.user_id
            left join companies c on c.id = a.company_id
            where a.firm_id = :firm_id
            order by a.at desc
            limit :limit
            """
        ),
        {"firm_id": principal.firm_id, "limit": limit},
    ).all()

    return [
        {
            "at": row.at,
            "action": row.action,
            "by": row.display_name,
            "company": row.company_name,
            "object_type": row.object_type,
            "object_id": row.object_id,
            "detail": row.detail,
        }
        for row in rows
    ]
