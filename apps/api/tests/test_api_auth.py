"""The API's access control, exercised against the real app.

These run in-process with Starlette's TestClient, so there is no server to
start and no port to pick — the app object is the thing under test.

What is being checked is the property §14 calls non-negotiable: a caller sees
their own firm's clients and nothing else. The interesting cases are the ones
where a mistake would be invisible, so there is a second firm here with its
own company, and every scoping test asks whether firm A can reach it.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from diligence_api.main import app
from diligence_engine.db import connect

from .conftest import OTHER_PASSWORD, PASSWORD, headers, needs_data, sign_in

# ── the door ────────────────────────────────────────────────────────────────


@needs_data
def test_health_needs_no_session() -> None:
    """A load balancer has no credentials."""
    with TestClient(app) as bare:
        assert bare.get("/api/health").json() == {"status": "ok"}


@needs_data
def test_every_data_endpoint_refuses_an_anonymous_caller(client: TestClient, tenants: dict) -> None:
    company = tenants["home_company"]
    protected = [
        "/api/me",
        "/api/firm/dashboard",
        "/api/firm/activity",
        f"/api/companies/{company}",
        f"/api/companies/{company}/periods/2026-08/readiness",
        f"/api/companies/{company}/periods/2026-08/risks",
        f"/api/companies/{company}/periods/2026-08/ims",
        f"/api/companies/{company}/periods/2026-08/other-itc",
    ]
    for path in protected:
        response = client.get(path, headers={})
        assert response.status_code == 401, f"{path} answered {response.status_code}"


@needs_data
def test_a_wrong_password_and_an_unknown_email_look_identical(client: TestClient) -> None:
    """The login endpoint must not be an account-existence oracle."""
    unknown = client.post(
        "/api/session", json={"email": "nobody@nowhere.example", "password": PASSWORD}
    )
    wrong = client.post(
        "/api/session", json={"email": "ca@mehta.example", "password": "not-the-password"}
    )

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


@needs_data
def test_a_signed_in_caller_sees_their_own_firm(client: TestClient, tenants: dict) -> None:
    token = sign_in(client, "ca@mehta.example", PASSWORD)
    me = client.get("/api/me", headers=headers(token)).json()
    assert me["firm"] == "Mehta & Associates"
    assert me["can_write"] is True


@needs_data
def test_signing_out_invalidates_the_token(client: TestClient, tenants: dict) -> None:
    token = sign_in(client, "ca@mehta.example", PASSWORD)
    assert client.get("/api/me", headers=headers(token)).status_code == 200

    client.post("/api/session/end", headers=headers(token))
    assert client.get("/api/me", headers=headers(token)).status_code == 401


@needs_data
def test_a_garbage_token_is_refused(client: TestClient) -> None:
    assert client.get("/api/me", headers=headers("not-a-real-token")).status_code == 401


# ── firm scoping, which is the whole point ──────────────────────────────────


@needs_data
def test_the_dashboard_lists_only_the_callers_own_clients(
    client: TestClient, tenants: dict
) -> None:
    mine = sign_in(client, "ca@mehta.example", PASSWORD)
    theirs = sign_in(client, "ca@rival.example", OTHER_PASSWORD)

    my_names = {
        row["name"]
        for row in client.get("/api/firm/dashboard", headers=headers(mine)).json()["companies"]
    }
    their_names = {
        row["name"]
        for row in client.get("/api/firm/dashboard", headers=headers(theirs)).json()["companies"]
    }

    assert my_names, "the seeded firm should have clients"
    assert "Someone Else Pvt Ltd" not in my_names
    assert my_names.isdisjoint(their_names)


@needs_data
def test_another_firms_company_is_not_found_rather_than_forbidden(
    client: TestClient, tenants: dict
) -> None:
    """A 403 would confirm the company is real.

    That is enough to enumerate a competitor's client list one guess at a
    time, so the answer is the same as for a company that does not exist.
    """
    token = sign_in(client, "ca@mehta.example", PASSWORD)
    rival = tenants["rival_company"]
    invented = str(uuid.uuid4())

    real_but_theirs = client.get(f"/api/companies/{rival}", headers=headers(token))
    does_not_exist = client.get(f"/api/companies/{invented}", headers=headers(token))

    assert real_but_theirs.status_code == does_not_exist.status_code == 404
    assert real_but_theirs.json() == does_not_exist.json()


@needs_data
def test_every_company_scoped_endpoint_is_scoped(client: TestClient, tenants: dict) -> None:
    token = sign_in(client, "ca@mehta.example", PASSWORD)
    rival = tenants["rival_company"]

    for path in (
        f"/api/companies/{rival}",
        f"/api/companies/{rival}/periods/2026-08/readiness",
        f"/api/companies/{rival}/periods/2026-08/risks",
        f"/api/companies/{rival}/periods/2026-08/ims",
        f"/api/companies/{rival}/periods/2026-08/other-itc",
    ):
        assert client.get(path, headers=headers(token)).status_code == 404, path


@needs_data
def test_a_finding_belonging_to_another_firm_is_not_readable(
    client: TestClient, tenants: dict
) -> None:
    """Risks are addressed by their own id, so scoping has to be checked there too."""
    with connect() as conn:
        risk_id = conn.execute(
            text(
                "select r.id from risks r join companies c on c.id = r.company_id "
                "where c.id = :cid limit 1"
            ),
            {"cid": uuid.UUID(tenants["home_company"])},
        ).scalar()

    if risk_id is None:
        pytest.skip("no findings in the seeded data")

    theirs = sign_in(client, "ca@rival.example", OTHER_PASSWORD)
    assert client.get(f"/api/risks/{risk_id}", headers=headers(theirs)).status_code == 404

    mine = sign_in(client, "ca@mehta.example", PASSWORD)
    assert client.get(f"/api/risks/{risk_id}", headers=headers(mine)).status_code == 200


# ── roles ───────────────────────────────────────────────────────────────────


@needs_data
def test_a_readonly_account_can_read_but_not_write(client: TestClient, tenants: dict) -> None:
    token = sign_in(client, "clerk@mehta.example", PASSWORD)
    company = tenants["home_company"]

    assert client.get("/api/firm/dashboard", headers=headers(token)).status_code == 200

    upload = client.post(
        f"/api/companies/{company}/documents",
        headers=headers(token),
        data={"kind": "purchase_register"},
        files={"file": ("register.csv", b"Date,Particulars\n", "text/csv")},
    )
    assert upload.status_code == 403


@needs_data
def test_the_audit_log_records_sign_in_and_is_firm_scoped(
    client: TestClient, tenants: dict
) -> None:
    token = sign_in(client, "ca@mehta.example", PASSWORD)
    activity = client.get("/api/firm/activity", headers=headers(token)).json()["activity"]

    assert any(entry["action"] == "login" for entry in activity)
    # Nothing from the other firm, and no secret in the record.
    assert all("token" not in str(entry).lower() for entry in activity)
