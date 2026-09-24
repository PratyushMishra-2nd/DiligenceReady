"""Migration runner.

Plain .sql files applied in filename order, each in its own transaction, each
recorded with the sha256 of the text that was applied. Two consequences worth
having: re-running is a no-op, and editing a migration after it has been
applied is detected rather than silently ignored.

The recorded digest is of the file with its line endings normalised to LF.
Hashing the raw bytes made the guard machine-dependent rather than
content-dependent: this repository is developed on Windows and deployed on
Linux, `.gitattributes` normalises `.sh`, `.yaml`, `.yml` and the Dockerfile
but not `.sql`, and so an image built from a CRLF working tree recorded one
digest for `001_schema.sql` while the next image, built from an LF one,
hashed the identical SQL differently and refused to run. Statements are what
Postgres executes; a carriage return is not one.

Raw SQL rather than a migration DSL because the schema in Blueprint §07 is the
specification. Round-tripping it through Python model classes would introduce a
second source of truth and, eventually, a disagreement between them.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text

from diligence_engine.config import settings
from diligence_engine.db import connect

_TRACKING_TABLE = """
create table if not exists schema_migrations (
    filename   text primary key,
    sha256     text        not null,
    applied_at timestamptz not null default now()
)
"""


def _normalise(raw: bytes) -> bytes:
    """The file's bytes, with CRLF and lone CR line endings reduced to LF."""
    return raw.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


@dataclass(frozen=True)
class Migration:
    path: Path
    sha256: str
    legacy_sha256: frozenset[str] = frozenset()

    @property
    def filename(self) -> str:
        return self.path.name

    def matches(self, recorded: str) -> bool:
        """Is `recorded` a digest this same file could have produced before?"""
        return recorded == self.sha256 or recorded in self.legacy_sha256


class MigrationDrift(RuntimeError):
    """An already-applied migration file no longer matches what was applied."""


def discover(migrations_dir: Path | None = None) -> list[Migration]:
    directory = migrations_dir or settings().migrations_dir
    found = []
    for path in sorted(directory.glob("*.sql")):
        raw = path.read_bytes()
        normalised = _normalise(raw)
        digest = _digest(normalised)
        # What a row written before normalisation could hold for this same
        # content: the raw bytes as checked out here, and their CRLF
        # rendering, which is what a Windows working tree produced.
        legacy = {_digest(raw), _digest(normalised.replace(b"\n", b"\r\n"))}
        found.append(
            Migration(
                path=path,
                sha256=digest,
                legacy_sha256=frozenset(legacy - {digest}),
            )
        )
    return found


def applied() -> dict[str, str]:
    with connect() as conn:
        conn.execute(text(_TRACKING_TABLE))
        rows = conn.execute(text("select filename, sha256 from schema_migrations")).all()
    return {row.filename: row.sha256 for row in rows}


def run(migrations_dir: Path | None = None) -> list[str]:
    """Apply every pending migration. Returns the filenames applied this run."""
    already = applied()
    newly_applied: list[str] = []

    for migration in discover(migrations_dir):
        previous = already.get(migration.filename)
        if previous == migration.sha256:
            continue
        if previous is not None and migration.matches(previous):
            # The same SQL, recorded under a pre-normalisation digest.
            # Re-applying it would be wrong and refusing to start would be
            # worse, so restate what is already true of this database.
            with connect() as conn:
                conn.execute(
                    text(
                        "update schema_migrations set sha256 = :sha256 "
                        "where filename = :filename"
                    ),
                    {"filename": migration.filename, "sha256": migration.sha256},
                )
            continue
        if previous is not None:
            raise MigrationDrift(
                f"{migration.filename} was applied with sha256 {previous[:12]} but now "
                f"hashes to {migration.sha256[:12]}. Write a new migration rather than "
                f"editing an applied one."
            )

        sql = migration.path.read_text(encoding="utf-8")
        with connect() as conn:
            conn.execute(text(sql))
            conn.execute(
                text(
                    "insert into schema_migrations (filename, sha256) values (:filename, :sha256)"
                ),
                {"filename": migration.filename, "sha256": migration.sha256},
            )
        newly_applied.append(migration.filename)

    return newly_applied


def tables() -> list[tuple[str, int]]:
    r"""Every table in the public schema with its live row count. The `\dt` check."""
    with connect() as conn:
        names = [
            row.tablename
            for row in conn.execute(
                text(
                    "select tablename from pg_tables where schemaname = 'public' order by tablename"
                )
            ).all()
        ]
        counts = []
        for name in names:
            # Identifiers come from pg_tables, not user input.
            count = conn.execute(text(f'select count(*) from "{name}"')).scalar_one()
            counts.append((name, count))
    return counts
