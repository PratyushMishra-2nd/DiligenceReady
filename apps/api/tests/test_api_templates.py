"""The format examples the upload panel hands out.

`packages/engine/tests/test_templates.py` proves each example is a file the
readers accept. What is left to check here is the delivery: that the endpoints
are reachable without a session, that the file comes back as a download rather
than as something a browser renders, and that the required-column list the
panel prints beside the file picker is the engine's list and not a copy.

No database is needed for any of it, which is the point of these routes
holding no client data.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from diligence_api.main import app
from diligence_engine.ingest.columns import PURCHASE_REGISTER
from diligence_engine.ingest.templates import TEMPLATES
from diligence_engine.ingest.upload import UPLOADABLE


def test_listing_needs_no_session() -> None:
    """The reader who most needs this has not signed in yet.

    A blank purchase register carries two invented suppliers and no firm's
    data. Behind a session it would be invisible to exactly the person
    deciding whether the product can read their exports at all.
    """
    with TestClient(app) as bare:
        response = bare.get("/api/templates")

    assert response.status_code == 200, response.text
    kinds = {entry["kind"] for entry in response.json()["templates"]}
    assert kinds == set(UPLOADABLE)


def test_required_columns_come_from_the_schema() -> None:
    """The panel prints this list; it has to be the one `resolve()` uses.

    Pinned against `columns.py` directly, so a synonym promoted to the
    canonical spelling there shows up in the interface without an edit
    anywhere else — and a hand-written copy of the list would fail here.
    """
    with TestClient(app) as bare:
        body = bare.get("/api/templates").json()

    entry = next(item for item in body["templates"] if item["kind"] == "purchase_register")
    expected = [field.names[0] for field in PURCHASE_REGISTER.fields if field.required]
    assert entry["required"] == expected


def test_download_is_a_file_not_a_page() -> None:
    """Content-Disposition, or the browser shows a CSV as a wall of text.

    The filename matters beyond tidiness for the JSON kinds: a 2B whose
    payload states no return period is filed by the YYYY_MM in its name, so
    the name the download suggests is part of the format.
    """
    with TestClient(app) as bare:
        response = bare.get("/api/templates/gstr2b/file")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert "attachment" in response.headers["content-disposition"]
    assert "gstr2b_2026_04_template.json" in response.headers["content-disposition"]
    assert response.text == TEMPLATES["gstr2b"].body


def test_csv_download_is_served_as_csv() -> None:
    with TestClient(app) as bare:
        response = bare.get("/api/templates/purchase_register/file")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.text.splitlines()[0].startswith("Date,Particulars")


def test_an_unknown_kind_says_which_kinds_exist() -> None:
    """A 404 that names the alternatives, because the caller is guessing."""
    with TestClient(app) as bare:
        response = bare.get("/api/templates/purchase-register/file")

    assert response.status_code == 404
    assert "purchase_register" in response.json()["detail"]
