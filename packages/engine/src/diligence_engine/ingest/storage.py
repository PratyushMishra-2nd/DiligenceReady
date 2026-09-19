"""Content-addressed document storage.

A document is identified by the sha256 of its bytes, which is what makes
re-uploading the same export a no-op rather than a duplicate. `documents` has
a unique constraint on (company_id, sha256); this module is the other half of
that guarantee — the bytes are kept, so any figure can still be traced to the
file that produced it after the CA has deleted their local copy.

Two backends, one interface: local disk in development, Amazon S3 in the
deployed stack. The interface is deliberately `read_text(key)` rather than
`resolve(key) -> Path`, because a path is a local-disk assumption that leaks
into every caller — the evidence drill-down used to call `path.exists()` and
`path.read_text()`, neither of which an object store has. Callers ask for
bytes or text; where those live is this module's business.

S3 specifics worth knowing:

*   The key is the same string in both backends, so a database row written
    against local disk resolves unchanged against a bucket.
*   Uploads are conditional on the object not already existing. The content
    hash is in the key, so a second upload of identical bytes is a no-op
    rather than a rewrite, and the object store inherits the immutability the
    hash already promised.
*   Server-side encryption is requested explicitly (AES256) rather than left
    to the bucket default, so the object is encrypted even if the stack is
    deployed into a bucket someone else created.
"""

from __future__ import annotations

import functools
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


# ── S3 ──────────────────────────────────────────────────────────────────────


@functools.lru_cache(maxsize=1)
def _s3():
    """The S3 client, built once.

    boto3 clients are thread-safe for calls and expensive to construct, so
    one per process is both correct and the documented pattern. Credentials
    come from the instance role in the deployed stack and from the ambient
    profile locally; nothing here reads a key out of the environment itself.
    """
    import boto3  # imported lazily so the local backend needs no AWS SDK

    return boto3.client("s3", region_name=settings().aws_region or None)


def _bucket() -> str:
    bucket = settings().s3_bucket
    if not bucket:
        raise RuntimeError(
            "STORAGE_BACKEND=s3 but S3_BUCKET is unset. The bucket cannot be "
            "guessed: writing documents to the wrong one would scatter a "
            "firm's evidence across accounts."
        )
    return bucket


def _prefixed(key: str) -> str:
    prefix = settings().s3_prefix.strip("/")
    return f"{prefix}/{key}" if prefix else key


# ── the interface ───────────────────────────────────────────────────────────


def put(path: Path, key: str) -> str:
    """Copy the file into the object store. Returns the key it was stored under."""
    backend = settings().storage_backend
    if backend == "local":
        destination = settings().storage_local_path / key
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            shutil.copy2(path, destination)
        return key

    if backend == "s3":
        from botocore.exceptions import ClientError

        client = _s3()
        full = _prefixed(key)
        try:
            client.head_object(Bucket=_bucket(), Key=full)
            return key  # identical bytes already stored; the hash says so
        except ClientError as error:
            if error.response["Error"]["Code"] not in ("404", "NoSuchKey", "NotFound"):
                raise
        client.upload_file(
            str(path),
            _bucket(),
            full,
            ExtraArgs={"ServerSideEncryption": "AES256"},
        )
        return key

    raise RuntimeError(f"unknown STORAGE_BACKEND {backend!r}; expected 'local' or 's3'")


def exists(key: str) -> bool:
    """Whether the stored document is still there.

    The drill-down distinguishes "no evidence row" from "evidence row whose
    document has gone missing", and tells the CA which it is.
    """
    backend = settings().storage_backend
    if backend == "local":
        return (settings().storage_local_path / key).exists()

    if backend == "s3":
        from botocore.exceptions import ClientError

        try:
            _s3().head_object(Bucket=_bucket(), Key=_prefixed(key))
            return True
        except ClientError as error:
            if error.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    raise RuntimeError(f"unknown STORAGE_BACKEND {backend!r}; expected 'local' or 's3'")


def read_bytes(key: str) -> bytes:
    backend = settings().storage_backend
    if backend == "local":
        return (settings().storage_local_path / key).read_bytes()
    if backend == "s3":
        return _s3().get_object(Bucket=_bucket(), Key=_prefixed(key))["Body"].read()
    raise RuntimeError(f"unknown STORAGE_BACKEND {backend!r}; expected 'local' or 's3'")


def read_text(key: str, encoding: str = "utf-8") -> str:
    return read_bytes(key).decode(encoding)


def resolve(key: str) -> Path:
    """The local path for a stored key.

    Local backend only, and it stays that way: a caller that needs a real
    path is a caller that cannot run against S3. Everything on the request
    path uses `read_text`.
    """
    if settings().storage_backend != "local":
        raise RuntimeError(
            "storage.resolve() is a local-disk path and there is none under "
            f"STORAGE_BACKEND={settings().storage_backend!r}. Use read_text()."
        )
    return settings().storage_local_path / key
