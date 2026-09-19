"""Content-addressed document storage.

A document is identified by the sha256 of its bytes, which is what makes
re-uploading the same export a no-op rather than a duplicate. `documents` has
a unique constraint on (company_id, sha256); this module is the other half of
that guarantee — the bytes are kept, so any figure can still be traced to the
file that produced it after the CA has deleted their local copy.

S3 in deployment, local disk in development, same interface either way.
"""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from diligence_engine.config import settings


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def storage_key(company_slug: str, sha256: str, filename: str) -> str:
    return f"{company_slug}/{sha256[:2]}/{sha256}/{filename}"


def put(path: Path, key: str) -> str:
    """Copy the file into the object store. Returns the key it was stored under."""
    if settings().storage_backend != "local":
        raise NotImplementedError(
            f"storage backend {settings().storage_backend!r} is not wired up yet"
        )
    destination = settings().storage_local_path / key
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        shutil.copy2(path, destination)
    return key


def resolve(key: str) -> Path:
    """The local path for a stored key. Used by evidence drill-down."""
    return settings().storage_local_path / key
