"""Runtime configuration, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


def project_root() -> Path:
    """Walk up from this file until the repo root (the directory holding migrations/)."""
    here = Path(__file__).resolve()
    for candidate in here.parents:
        if (candidate / "migrations" / "sql").is_dir():
            return candidate
    raise RuntimeError(
        "Could not locate the project root: no ancestor directory contains migrations/sql. "
        f"Searched upward from {here}."
    )


@dataclass(frozen=True)
class Settings:
    database_url: str
    storage_backend: str
    storage_local_path: Path
    migrations_dir: Path
    seed_dir: Path


@lru_cache(maxsize=1)
def settings() -> Settings:
    root = project_root()
    load_dotenv(root / ".env")

    url = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://diligence:diligence@localhost:5544/diligence",
    )
    return Settings(
        database_url=url,
        storage_backend=os.environ.get("STORAGE_BACKEND", "local"),
        storage_local_path=root / os.environ.get("STORAGE_LOCAL_PATH", "./storage"),
        migrations_dir=root / "migrations" / "sql",
        seed_dir=root / "seed",
    )
