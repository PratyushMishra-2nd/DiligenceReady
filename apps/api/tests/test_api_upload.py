"""Uploading an export, which is how anyone other than the seeder gets data in.

The cases worth pinning are the unhappy ones. A CA's first upload will be
the wrong file, or the right file from the wrong package, or the same file
twice — and what the system says back in each case decides whether they try
again or close the tab.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from .conftest import OTHER_PASSWORD, PASSWORD, headers, needs_data

BUSY_HEADER = (
    "Date,Party Name,Vch Type,Vch No,Taxable Amount,CGST,SGST,IGST,Cess,Bill Amount,Remarks"
)


def busy_register(marker: str | None = None) -> bytes:
    """A Busy-shaped register: different header spellings, same logical columns.

    The marker rides in the remarks column so each run produces distinct
    bytes. Documents are content-addressed, so a fixed fixture would come
    back "already ingested" on the suite's second run and the happy path
    would quietly stop being tested — which is exactly what happened the
    first time this ran twice.
    """
    tag = marker or uuid.uuid4().hex
    return (
        f"{BUSY_HEADER}\n"
        f"05-Aug-2026,Uploaded Traders,Purchase,BILL9001,10000.00,900.00,900.00,"
        f"0.00,0.00,11800.00,{tag}\n"
        f"06-Aug-2026,Uploaded Traders,Purchase,BILL9002,20000.00,1800.00,1800.00,"
        f"0.00,0.00,23600.00,{tag}\n"
    ).encode()


@pytest.fixture(scope="session")
def session(client: TestClient, tenants: dict) -> dict:
    response = client.post("/api/session", json={"email": "ca@mehta.example", "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {
        "headers": headers(response.json()["token"]),
        "company": tenants["home_company"],
    }


def upload(client: TestClient, session: dict, name: str, body: bytes, kind: str):
    return client.post(
        f"/api/companies/{session['company']}/documents",
        headers=session["headers"],
        data={"kind": kind},
        files={"file": (name, body, "text/csv")},
    )


@needs_data
def test_a_register_from_a_different_package_is_accepted(client: TestClient, session: dict) -> None:
    """Busy spells every column differently. The column layer is what makes it work."""
    response = upload(client, session, "busy_register.csv", busy_register(), "purchase_register")
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["rows"] == 2
    assert body["periods"] == ["2026-08"]
    assert body["already_present"] is False


@needs_data
def test_the_same_file_twice_is_a_no_op(client: TestClient, session: dict) -> None:
    """Documents are keyed by content hash, so a nervous second click costs nothing."""
    body = busy_register()
    upload(client, session, "twice.csv", body, "purchase_register")
    again = upload(client, session, "twice.csv", body, "purchase_register")

    assert again.status_code == 200
    assert again.json()["already_present"] is True
    assert again.json()["rows"] == 0


@needs_data
def test_an_unreadable_file_says_what_was_missing_and_where_to_fix_it(
    client: TestClient, session: dict
) -> None:
    """The error is the product surface for anyone whose export is unusual."""
    response = upload(
        client,
        session,
        "mystery.csv",
        b"Dt,Pty,Amt\n01-Aug-2026,Someone,100.00\n",
        "purchase_register",
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "purchase register" in detail
    assert "'Dt'" in detail  # the file's own headers, quoted back
    assert "ingest/columns.py" in detail  # and where a synonym goes


@needs_data
def test_a_file_with_no_parseable_dates_is_refused(client: TestClient, session: dict) -> None:
    response = upload(
        client,
        session,
        "undated.csv",
        b"Date,Particulars,Voucher No,Invoice Value\nnot-a-date,Someone,1,100.00\n",
        "purchase_register",
    )
    assert response.status_code == 422
    assert "nothing to file it under" in response.json()["detail"]


@needs_data
def test_an_unknown_kind_is_refused_with_the_known_ones(client: TestClient, session: dict) -> None:
    response = upload(client, session, "x.csv", busy_register(), "tax_return")
    assert response.status_code == 400
    assert "purchase_register" in response.json()["detail"]


@needs_data
def test_uploading_writes_an_audit_line(client: TestClient, session: dict) -> None:
    upload(client, session, "audited.csv", busy_register(), "purchase_register")
    activity = client.get("/api/firm/activity", headers=session["headers"]).json()["activity"]

    uploads = [entry for entry in activity if entry["action"] == "document_uploaded"]
    assert uploads, "an upload must be recorded"
    assert uploads[0]["by"] == "Priya Mehta"
    assert uploads[0]["detail"]["kind"] == "purchase_register"


@needs_data
def test_an_upload_cannot_be_aimed_at_another_firms_company(
    client: TestClient, tenants: dict
) -> None:
    """The tenant boundary holds on writes, not just reads.

    This used to skip when run alone, because it depended on another test
    module having created the second firm. The one test that would notice a
    cross-tenant write leak is the last one that should quietly not run.
    """
    response = client.post(
        "/api/session", json={"email": "ca@rival.example", "password": OTHER_PASSWORD}
    )
    assert response.status_code == 200, response.text
    rival_headers = {"Authorization": f"Bearer {response.json()['token']}"}

    blocked = client.post(
        f"/api/companies/{tenants['home_company']}/documents",
        headers=rival_headers,
        data={"kind": "purchase_register"},
        files={"file": ("x.csv", busy_register(), "text/csv")},
    )
    assert blocked.status_code == 404
