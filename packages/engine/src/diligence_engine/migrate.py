"""Migration runner.

Plain .sql files applied in filename order, each in its own transaction, each
recorded with the sha256 of the text that was applied. Two consequences worth
having: re-running is a no-op, and editing a migration after it has been
applied is detected rather than silently ignored.

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


@dataclass(frozen=True)
class Migration:
    path: Path
    sha256: str

    @property
    def filename(self) -> str:
        return self.path.name


class MigrationDrift(RuntimeError):
    """An already-applied migration file no longer matches what was applied."""


def discover(migrations_dir: Path | None = None) -> list[Migration]:
    directory = migrations_dir or settings().migrations_dir
    found = []
    for path in sorted(directory.glob("*.sql")):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        found.append(Migration(path=path, sha256=digest))
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
