"""HTTP surface over the engine.

Read-mostly by design, and firm-scoped throughout: every endpoint that
touches client data resolves a `Principal` first, and every company lookup
goes through `company_or_404`, so a caller can only ever see the firm they
belong to.

Nothing here recomputes a figure. Every number in every response comes from
`diligence_engine.reporting`, which is the same code the CLI prints — a
second implementation in a view layer is a second thing to keep honest.

The writes are deliberately few: sign in and out, upload a document, record
a decision on a finding, and store a generated explanation. Each of them
writes a line to the audit log.
"""

from __future__ import annotations

import json
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text

from diligence_api.deps import (
    bearer_token,
    client_ip,
    company_or_404,
    current_principal,
    parse_uuid,
    require_writer,
)
from diligence_api.explain import explain
from diligence_engine import auth, reporting
from diligence_engine.db import connect
from diligence_engine.ingest.columns import UnreadableExport
from diligence_engine.ingest.upload import UPLOADABLE, UnsupportedUpload, ingest_upload
from diligence_engine.normalise import ParseError

app = FastAPI(
    title="DiligenceReady",
    description="Continuous reconciliation of books, GST and bank data for Indian SMEs.",
    version="0.2.0",
)

# The dashboard runs on a different port in development. Credentials are
# allowed because the session travels as a cookie; the origin list stays
# explicit rather than a wildcard, which is what makes that safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# 25 MB. A twelve-month purchase register is a few hundred kilobytes; a file
# larger than this is a mistake or an attack, and either way the answer is no.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _jsonable(value: Any) -> Any:
    """Decimals go out as strings. A rupee figure must not touch a float."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


# ── session ─────────────────────────────────────────────────────────────────


class Credentials(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=1024)


@app.get("/api/health")
def health() -> dict:
    """Unauthenticated on purpose: a load balancer has no session."""
    with connect() as conn:
        conn.execute(text("select 1"))
    return {"status": "ok"}


@app.post("/api/session")
def sign_in(credentials: Credentials, request: Request, response: Response) -> dict:
    with connect() as conn:
        try:
            token, principal = auth.login(
                conn,
                credentials.email,
                credentials.password,
                user_agent=request.headers.get("user-agent"),
            )
        except auth.AuthError as error:
            # 401 with one message, whatever actually went wrong.
            raise HTTPException(status_code=401, detail=str(error)) from error

    response.set_cookie(
        "dr_session",
        token,
        httponly=True,
        samesite="lax",
        max_age=auth.SESSION_HOURS * 3600,
        # Set this on any TLS deployment. It is off here so the cookie works
        # over plain http on localhost, and that is not a production default.
        secure=False,
        path="/",
    )
    return {
        "token": token,
        "user": {
            "email": principal.email,
            "display_name": principal.display_name,
            "role": principal.role,
        },
    }


@app.post("/api/session/end")
def sign_out(response: Response, token: str = Depends(bearer_token)) -> dict:
    with connect() as conn:
        try:
            principal = auth.principal_for(conn, token)
            auth.record(conn, action="logout", principal=principal)
        except auth.AuthError:
            pass
        auth.logout(conn, token)

    response.delete_cookie("dr_session", path="/")
    return {"status": "signed out"}


@app.get("/api/me")
def me(principal: auth.Principal = Depends(current_principal)) -> dict:
    with connect() as conn:
        firm = conn.execute(
            text("select name from firms where id = :id"), {"id": principal.firm_id}
        ).scalar()
    return {
        "email": principal.email,
        "display_name": principal.display_name,
        "role": principal.role,
        "firm": firm,
        "can_write": principal.can_write,
    }


# ── reading ─────────────────────────────────────────────────────────────────


@app.get("/api/firm/dashboard")
def firm_dashboard(principal: auth.Principal = Depends(current_principal)) -> dict:
    """The first screen: every client company this firm carries, and only those."""
    with connect() as conn:
        companies = reporting.firm_dashboard(conn, principal.firm_id)
    return _jsonable({"companies": companies})


@app.get("/api/firm/activity")
def firm_activity(principal: auth.Principal = Depends(current_principal)) -> dict:
    """The firm's own audit trail."""
    with connect() as conn:
        return _jsonable({"activity": auth.recent_activity(conn, principal)})


@app.get("/api/companies/{company_id}")
def company(company_id: str, principal: auth.Principal = Depends(current_principal)) -> dict:
    with connect() as conn:
        identifier = company_or_404(conn, principal, company_id)
        found = reporting.company(conn, identifier)
        if found is None:
            raise HTTPException(status_code=404, detail="No such company.")
        found["periods"] = reporting.periods(conn, identifier)
    return _jsonable(found)


@app.get("/api/companies/{company_id}/periods/{period}/readiness")
def readiness(
    company_id: str, period: str, principal: auth.Principal = Depends(current_principal)
) -> dict:
    with connect() as conn:
        identifier = company_or_404(conn, principal, company_id)
        return _jsonable(reporting.readiness(conn, identifier, period))


@app.get("/api/companies/{company_id}/periods/{period}/other-itc")
def other_itc(
    company_id: str, period: str, principal: auth.Principal = Depends(current_principal)
) -> dict:
    """The 2B sections the purchase register was never going to match."""
    with connect() as conn:
        identifier = company_or_404(conn, principal, company_id)
        return _jsonable(reporting.other_itc(conn, identifier, period))


@app.get("/api/companies/{company_id}/periods/{period}/ims")
def ims_summary(
    company_id: str, period: str, principal: auth.Principal = Depends(current_principal)
) -> dict:
    """The IMS dashboard reduced to the decision a CA has to make."""
    with connect() as conn:
        identifier = company_or_404(conn, principal, company_id)
        summary = reporting.ims_summary(conn, identifier, period)
    if summary is None:
        raise HTTPException(status_code=404, detail="No IMS records for this period.")
    return _jsonable(summary)


@app.get("/api/companies/{company_id}/periods/{period}/risks")
def risks(
    company_id: str,
    period: str,
    rule_code: str | None = None,
    principal: auth.Principal = Depends(current_principal),
) -> dict:
    with connect() as conn:
        identifier = company_or_404(conn, principal, company_id)
        found = reporting.risks(conn, identifier, period, rule_code=rule_code)
    return _jsonable({"risks": found})


@app.get("/api/risks/{risk_id}")
def risk_detail(risk_id: str, principal: auth.Principal = Depends(current_principal)) -> dict:
    with connect() as conn:
        detail = reporting.risk_detail(conn, parse_uuid(risk_id, "risk_id"))
        if detail is None:
            raise HTTPException(status_code=404, detail="No such finding.")
        company_or_404(conn, principal, detail.risk["company_id"])

    return _jsonable(
        {
            "risk": detail.risk,
            "match": detail.match,
            "evidence": [item.__dict__ for item in detail.evidence],
        }
    )


@app.get("/api/evidence/{evidence_id}/source")
def evidence_source(
    evidence_id: str,
    request: Request,
    principal: auth.Principal = Depends(current_principal),
) -> dict:
    """The drill-down: the raw file line behind a figure."""
    identifier = parse_uuid(evidence_id, "evidence_id")
    with connect() as conn:
        owner = conn.execute(
            text(
                "select r.company_id from risk_evidence e "
                "join risks r on r.id = e.risk_id where e.id = :id"
            ),
            {"id": identifier},
        ).scalar()
        if owner is None:
            raise HTTPException(status_code=404, detail="No such evidence.")
        company_or_404(conn, principal, str(owner))

        source = reporting.evidence_source(conn, identifier)
        if source is None:
            raise HTTPException(status_code=404, detail="No source line for this evidence.")

        # Reading a client's raw document is exactly the access an audit
        # trail exists to record.
        auth.record(
            conn,
            action="evidence_viewed",
            principal=principal,
            company_id=owner,
            object_type="risk_evidence",
            object_id=str(identifier),
            detail={"filename": source.get("filename"), "row": source.get("source_row")},
            ip=client_ip(request),
        )

    return _jsonable(source)


# ── writing ─────────────────────────────────────────────────────────────────


@app.post("/api/companies/{company_id}/documents")
async def upload_document(
    company_id: str,
    request: Request,
    kind: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    principal: auth.Principal = Depends(require_writer),
) -> dict:
    """Upload one export and read it into the typed tables.

    The file is streamed to a temporary path, then ingested inside one
    transaction and stored content-addressed by the ingester — so
    re-uploading the same export is a no-op rather than a duplicate.
    """
    if kind not in UPLOADABLE:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown kind {kind!r}. Known: {', '.join(sorted(UPLOADABLE))}.",
        )

    original = Path(file.filename or "upload").name or "upload"
    with tempfile.TemporaryDirectory() as workspace:
        staged = Path(workspace) / original
        written = 0
        with staged.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
                    )
                handle.write(chunk)

        with connect() as conn:
            identifier = company_or_404(conn, principal, company_id)
            company_name = conn.execute(
                text("select name from companies where id = :id"), {"id": identifier}
            ).scalar()

            try:
                result = ingest_upload(
                    conn,
                    company_id=identifier,
                    company_slug=str(identifier),
                    path=staged,
                    kind=kind,
                )
            except UnicodeDecodeError as error:
                # Tally on Windows writes cp1252 more often than not.
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"{original} is not UTF-8 text. Re-export it as UTF-8, or open "
                        "it in a spreadsheet and save as CSV UTF-8."
                    ),
                ) from error
            except json.JSONDecodeError as error:
                raise HTTPException(
                    status_code=422,
                    detail=f"{original} is not valid JSON: {error.msg} at line {error.lineno}.",
                ) from error
            except ParseError as error:
                raise HTTPException(
                    status_code=422,
                    detail=f"{original} has a value this reader cannot parse: {error}",
                ) from error
            except (UnreadableExport, UnsupportedUpload) as error:
                # These messages name the missing column, the file's own
                # headers and where to add a synonym. Passing them straight
                # through is the whole point of writing them that way.
                raise HTTPException(status_code=422, detail=str(error)) from error

            auth.record(
                conn,
                action="document_uploaded",
                principal=principal,
                company_id=identifier,
                object_type="document",
                object_id=result.filename,
                detail={
                    "kind": result.kind,
                    "rows": result.rows,
                    "periods": result.periods,
                    "already_present": result.already_present,
                    "company": company_name,
                },
                ip=client_ip(request),
            )

    return _jsonable(
        {
            "kind": result.kind,
            "filename": result.filename,
            "rows": result.rows,
            "periods": result.periods,
            "already_present": result.already_present,
            "unresolved_parties": result.unresolved_parties,
        }
    )


class StatusChange(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=2000)


RISK_STATUSES = (
    "open",
    "acknowledged",
    "resolved",
    "ignored",
    "claim",
    "reversed",
    "ineligible",
    "pending",
    "reset",
)


@app.post("/api/risks/{risk_id}/status")
def set_risk_status(
    risk_id: str,
    change: StatusChange,
    request: Request,
    principal: auth.Principal = Depends(require_writer),
) -> dict:
    """Record what the CA decided about a finding.

    §16: the tool flags exceptions and the CA decides. That decision has to
    be recordable, or the tool is asking someone to keep its state in their
    head — and it has to be attributable, which is why it is audited.
    """
    identifier = parse_uuid(risk_id, "risk_id")
    if change.status not in RISK_STATUSES:
        raise HTTPException(
            status_code=400, detail=f"Unknown status. Known: {', '.join(RISK_STATUSES)}."
        )

    with connect() as conn:
        owner = conn.execute(
            text("select company_id from risks where id = :id"), {"id": identifier}
        ).scalar()
        if owner is None:
            raise HTTPException(status_code=404, detail="No such finding.")
        company_or_404(conn, principal, str(owner))

        previous = conn.execute(
            text("select status from risks where id = :id"), {"id": identifier}
        ).scalar()
        conn.execute(
            text("update risks set status = :status where id = :id"),
            {"status": change.status, "id": identifier},
        )
        auth.record(
            conn,
            action="risk_status_changed",
            principal=principal,
            company_id=owner,
            object_type="risk",
            object_id=str(identifier),
            detail={"from": previous, "to": change.status, "note": change.note},
            ip=client_ip(request),
        )

    return {"risk_id": risk_id, "status": change.status, "previous": previous}


@app.post("/api/risks/{risk_id}/explain")
def explain_risk(
    risk_id: str,
    request: Request,
    principal: auth.Principal = Depends(require_writer),
) -> dict:
    """Generate the prose for a finished finding, and store it if it passes the check."""
    identifier = parse_uuid(risk_id, "risk_id")

    # Read, then call the model, then write. Three steps on purpose.
    #
    # Holding the connection open across the model call pinned a pooled
    # connection and an open write transaction for the whole round trip. The
    # SDK's default timeout is ten minutes and timeouts are retried, so a
    # slow or hung call could hold one for far longer — and the pool is
    # fifteen. Sixteen people clicking Explain, or one provider incident
    # where calls hang rather than fail, took down every endpoint including
    # the health check.
    with connect() as conn:
        detail = reporting.risk_detail(conn, identifier)
        if detail is None:
            raise HTTPException(status_code=404, detail="No such finding.")
        company_or_404(conn, principal, detail.risk["company_id"])

    result = explain(detail.risk)

    with connect() as conn:
        conn.execute(
            text("update risks set explanation = :text where id = :id"),
            {"text": result.text, "id": identifier},
        )
        auth.record(
            conn,
            action="explanation_generated",
            principal=principal,
            company_id=parse_uuid(detail.risk["company_id"], "company_id"),
            object_type="risk",
            object_id=str(identifier),
            detail={"source": result.source, "rejected_reason": result.rejected_reason},
            ip=client_ip(request),
        )

    return _jsonable(
        {
            "risk_id": risk_id,
            "explanation": result.text,
            "source": result.source,
            "model": result.model,
            "rejected_reason": result.rejected_reason,
        }
    )
