"""Request authentication and firm scoping.

Every endpoint that touches client data takes a `Principal`, and every
company lookup goes through `company_or_404`. The scoping is therefore a
parameter the handler cannot forget rather than a rule it has to remember —
and when it is wrong, it fails closed.

One deliberate choice: asking for a company in another firm returns the same
404 as asking for one that does not exist. A 403 would confirm the company
is real, which is enough to enumerate a competitor's client list one guess
at a time.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.engine import Connection

from diligence_engine import auth
from diligence_engine.db import connect


@contextmanager
def transaction() -> Iterator[Connection]:
    with connect() as conn:
        yield conn


def bearer_token(
    authorization: str | None = Header(default=None),
    request: Request = None,  # type: ignore[assignment]
) -> str:
    """The session token, from the Authorization header or the session cookie.

    The cookie exists so the browser app does not have to keep a token in
    JavaScript-reachable storage; the header exists so the API is usable
    without a browser.
    """
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()

    cookie = request.cookies.get("dr_session") if request is not None else None
    if cookie:
        return cookie

    raise HTTPException(status_code=401, detail="Not signed in.")


def current_principal(token: str = Depends(bearer_token)) -> auth.Principal:
    with connect() as conn:
        try:
            return auth.principal_for(conn, token)
        except auth.AuthError as error:
            raise HTTPException(status_code=401, detail=str(error)) from error


def require_writer(principal: auth.Principal = Depends(current_principal)) -> auth.Principal:
    if not principal.can_write:
        raise HTTPException(status_code=403, detail="This account has read-only access.")
    return principal


def parse_uuid(value: str, label: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"{label} is not a uuid") from error


def company_or_404(conn: Connection, principal: auth.Principal, company_id: str) -> uuid.UUID:
    """Resolve a company id the caller is actually allowed to see."""
    identifier = parse_uuid(company_id, "company_id")
    if not auth.company_in_firm(conn, principal, identifier):
        # Same answer as a company that does not exist. See the module note.
        raise HTTPException(status_code=404, detail="No such company.")
    return identifier


def client_ip(request: Request) -> str | None:
    """Best-effort source address for the audit log.

    Behind a proxy this is the proxy unless the deployment sets
    X-Forwarded-For, which is a header the client controls — so it is
    recorded as a hint, never treated as identity. The audit log's subject is
    the authenticated user; this is only ever context beside it.

    `auth.record` validates the value again before it reaches an inet column,
    because a made-up header must not be able to fail the write.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
