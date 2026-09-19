"""Shared fixtures for the API tests.

The two firms live here rather than in one test module, because a test that
depends on another file having run first is a test that skips silently under
`-k`, reorders badly, and passes for the wrong reason. The cross-firm
isolation test in particular has to be able to run alone — it is the one
that would notice a tenant leak.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from diligence_api.main import app
from diligence_engine import auth
from diligence_engine.db import connect
from diligence_engine.ingest.documents import ensure_company, ensure_firm

PASSWORD = "reconcile-every-month"
OTHER_PASSWORD = "a-different-long-password"

HOME_FIRM = "Mehta & Associates"
RIVAL_FIRM = "Rival & Co"


def database_ready() -> bool:
    try:
        with connect() as conn:
            return conn.execute(text("select count(*) from companies")).scalar_one() > 0
    except Exception:  # noqa: BLE001 - no database is a skip, not a failure
        return False


needs_data = pytest.mark.skipif(
    not database_ready(),
    reason="no ingested company; run `uv run diligence pipeline` first",
)


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="session")
def tenants() -> dict:
    """Two firms, so "scoped correctly" can be told from "not scoped at all".

    A suite that only ever sees one firm cannot distinguish the two, which is
    the whole reason the rival exists.
    """
    with connect() as conn:
        home_firm = conn.execute(
            text("select id from firms where name = :name"), {"name": HOME_FIRM}
        ).scalar()
        home_company = conn.execute(
            text("select id from companies where firm_id = :f order by name limit 1"),
            {"f": home_firm},
        ).scalar()

        rival_firm = ensure_firm(conn, RIVAL_FIRM)
        rival_company = ensure_company(
            conn,
            rival_firm,
            name="Someone Else Pvt Ltd",
            slug="someone-else",
            gstin="27AAPFU0939F1ZV",
            pan="AAPFU0939F",
            fy_start="2026-04-01",
        )

        for email, name, role, firm, password in (
            ("ca@mehta.example", "Priya Mehta", "owner", home_firm, PASSWORD),
            ("clerk@mehta.example", "Reader", "readonly", home_firm, PASSWORD),
            ("ca@rival.example", "Rival", "owner", rival_firm, OTHER_PASSWORD),
        ):
            auth.create_user(
                conn,
                firm_id=firm,
                email=email,
                password=password,
                display_name=name,
                role=role,
            )

    return {
        "home_company": str(home_company),
        "rival_company": str(rival_company),
    }


def sign_in(client: TestClient, email: str, password: str) -> str:
    response = client.post("/api/session", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["token"]


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
