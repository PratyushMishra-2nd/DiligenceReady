"""The downloadable examples have to be files this system actually reads.

A template is a promise about a format. An unchecked one is worse than none
at all: someone downloads it, fills it with a month of real invoices, uploads
it and is told the file cannot be read — having done exactly what they were
asked. So every template here is put through the same readers the upload path
uses, on the same code that would reject a customer's file.

What is deliberately not covered: the database write. `ingest_upload` needs a
connection, and gating this suite on Postgres would mean the one check that
keeps these files honest is the one that silently skips. Everything up to the
insert — header resolution, date parsing, period detection, and for the JSON
kinds the section walk that `source_row` counts — runs here with no database
at all.
"""

from __future__ import annotations

import json

import pytest

from diligence_engine.ingest.columns import UnreadableExport, resolve
from diligence_engine.ingest.gstr2b_shape import iter_entries
from diligence_engine.ingest.templates import TEMPLATES
from diligence_engine.ingest.upload import (
    CSV_KINDS,
    JSON_KINDS,
    UPLOADABLE,
    period_of_json,
    periods_in_csv,
)
from diligence_engine.normalise import parse_amount, parse_date


def write(tmp_path, kind: str):
    """The template on disk, named as the download names it."""
    template = TEMPLATES[kind]
    path = tmp_path / template.filename
    path.write_text(template.body, encoding="utf-8")
    return template, path


def test_every_uploadable_kind_has_a_template():
    """A kind the picker offers with no example is the gap this closes.

    Pinned against `UPLOADABLE` rather than a list repeated here, so adding a
    seventh kind fails this test until it has one.
    """
    assert set(TEMPLATES) == set(UPLOADABLE)


@pytest.mark.parametrize("kind", sorted(CSV_KINDS))
def test_csv_template_resolves_every_required_column(tmp_path, kind: str):
    """`resolve()` is what rejects a customer's file; it must accept ours.

    This is the check with teeth. The header row is generated from the same
    `Field.names` tuples `resolve()` matches against, so the two can only
    disagree if the generation is wrong — which is precisely the failure a
    template written by hand would have.
    """
    _, path = write(tmp_path, kind)

    with path.open(newline="", encoding="utf-8-sig") as handle:
        import csv

        reader = csv.DictReader(handle)
        headers = list(reader.fieldnames or [])
        rows = list(reader)

    # Raises UnreadableExport if a required column is missing.
    columns = resolve(headers, CSV_KINDS[kind])

    assert rows, f"{kind} template has a header and no rows, which teaches nothing"
    for entry in CSV_KINDS[kind].fields:
        if entry.required:
            assert columns.has(entry.key), f"{kind}: {entry.key} did not resolve"

    # Nothing in the file is a column the schema does not know: an example
    # carrying a column that is silently ignored is an example that implies
    # the system reads something it does not.
    assert columns.unmapped_headers == ()


@pytest.mark.parametrize("kind", sorted(CSV_KINDS))
def test_csv_template_values_parse(tmp_path, kind: str):
    """Dates and amounts in the example have to survive the normalisers.

    A template whose dates are unparseable ingests as zero rows and reports
    "no parseable dates", which reads as the reader's fault.
    """
    _, path = write(tmp_path, kind)
    schema = CSV_KINDS[kind]

    with path.open(newline="", encoding="utf-8-sig") as handle:
        import csv

        reader = csv.DictReader(handle)
        columns = resolve(list(reader.fieldnames or []), schema)
        rows = list(reader)

    money = {
        "total",
        "taxable",
        "cgst",
        "sgst",
        "igst",
        "cess",
        "tax",
        "debit",
        "credit",
        "balance",
    }

    for row in rows:
        parse_date(columns.get(row, "date"))
        for key in money:
            if not columns.has(key):
                continue
            raw = columns.get(row, key)
            if raw:
                parse_amount(raw)

    periods = periods_in_csv(path, kind)
    assert periods, f"{kind} template has no detectable period"
    assert all(len(period) == 7 and period[4] == "-" for period in periods)


@pytest.mark.parametrize("kind", sorted(JSON_KINDS))
def test_json_template_states_its_period(tmp_path, kind: str):
    """A 2B or IMS file is filed under the period it declares.

    `period_of_json` raises when it can find neither a return period in the
    payload nor a YYYY_MM in the filename. Both are present here, and the
    filename half matters as much: it is the one the download sets.
    """
    _, path = write(tmp_path, kind)
    assert period_of_json(path, kind) == "2026-04"


def test_gstr2b_template_walks_the_section_order(tmp_path):
    """The entries must be reachable by the walk `source_row` counts.

    Evidence drill-down finds an original entry by counting to its position in
    `iter_entries`. A template shaped so that walk yields nothing would ingest
    zero rows while looking like a full file.
    """
    _, path = write(tmp_path, "gstr2b")
    payload = json.loads(path.read_text(encoding="utf-8"))

    entries = list(iter_entries(payload))
    sections = [shape.section for shape, _, _ in entries]

    # B2B and a credit note, so the example shows the two shapes that differ:
    # one keys on `inum`, the other on `ntnum` and carries a direction.
    assert sections == ["B2B", "B2B", "CDNR"]

    for shape, block, entry in entries:
        assert block["ctin"]
        assert entry[shape.number_field]
        parse_date(entry[shape.date_field])
        parse_amount(entry["val"])


def test_ims_template_carries_what_the_recommender_needs(tmp_path):
    """A credit note without `orig_inum` is the record the engine cannot use.

    It is the field a reader is most likely to leave out, so the example
    carries one and this pins it there.
    """
    _, path = write(tmp_path, "ims")
    records = json.loads(path.read_text(encoding="utf-8"))["records"]

    notes = [record for record in records if record["doctype"] == "CN"]
    assert notes, "the IMS example should show a credit note"
    for note in notes:
        assert note["orig_inum"], "a credit note has to name the invoice it corrects"

    for record in records:
        parse_date(record["idt"])
        parse_amount(record["val"])
        assert record["ctin"]


def test_a_template_missing_a_required_column_would_fail(tmp_path):
    """The guard above is load-bearing, so prove it can fail.

    Without this, a `resolve()` that had stopped raising would leave every
    other test in this file passing vacuously.
    """
    header = TEMPLATES["purchase_register"].body.splitlines()[0]
    without_date = ",".join(header.split(",")[1:])

    with pytest.raises(UnreadableExport):
        resolve(without_date.split(","), CSV_KINDS["purchase_register"])
