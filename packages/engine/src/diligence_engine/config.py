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


def _secret_password() -> str:
    """Read the database password out of Secrets Manager, once.

    RDS was created with `ManageMasterUserPassword`, so AWS owns the
    password and nothing has to template it into a task definition or a
    parameter. One mechanism serves both compute surfaces: the API instance
    and the pipeline Lambdas each get `DB_SECRET_ARN`, and neither gets a
    password.

    Read once per process. The trade is explicit: a rotation while a process
    is alive is not picked up until it restarts. For a deployment that
    redeploys on every image push that is the right side of the trade, and
    the alternative — a Secrets Manager call on every connection — turns a
    rotation window into a per-request dependency.
    """
    arn = os.environ.get("DB_SECRET_ARN")
    if not arn:
        return ""

    import json

    import boto3

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    client = boto3.client("secretsmanager", region_name=region or None)
    payload = json.loads(client.get_secret_value(SecretId=arn)["SecretString"])
    return payload.get("password", "")


def _url_from_parts() -> str | None:
    """Build the connection string from the pieces RDS hands out.

    An RDS instance created with `ManageMasterUserPassword` stores its
    credentials in a Secrets Manager secret that AWS rotates. The host, the
    database name and the user are not secret and travel as plain
    configuration; only DB_PASSWORD is injected from the secret. Composing
    the URL here means no deployment has to template a connection string
    with a live password inside it — the password reaches one environment
    variable and goes no further.

    The password is percent-encoded. A generated password containing a
    character that is structural in a URL would otherwise silently truncate
    the connection string and produce an authentication error nobody can
    explain.
    """
    host = os.environ.get("DB_HOST")
    if not host:
        return None

    from urllib.parse import quote_plus

    user = quote_plus(os.environ.get("DB_USER", "diligence"))
    password = quote_plus(os.environ.get("DB_PASSWORD") or _secret_password())
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "diligence")
    credentials = f"{user}:{password}@" if password else f"{user}@"
    # sslmode=require, because the hop to RDS crosses a subnet boundary even
    # inside a VPC and the data on it is somebody's books.
    return f"postgresql+psycopg://{credentials}{host}:{port}/{name}?sslmode=require"


@dataclass(frozen=True)
class Settings:
    database_url: str
    storage_backend: str
    storage_local_path: Path
    migrations_dir: Path
    seed_dir: Path

    # AWS. Empty strings rather than None so a caller never has to guard the
    # type before calling .strip() on one; "unset" and "set to blank" are the
    # same thing for every one of these.
    aws_region: str
    s3_bucket: str
    s3_prefix: str
    bedrock_region: str
    bedrock_model_id: str


@lru_cache(maxsize=1)
def settings() -> Settings:
    root = project_root()
    load_dotenv(root / ".env")

    url = (
        os.environ.get("DATABASE_URL")
        or _url_from_parts()
        or ("postgresql+psycopg://diligence:diligence@localhost:5544/diligence")
    )
    # One region setting, two consumers. Bedrock is allowed its own because
    # the Claude models are not in every region the rest of the stack runs
    # in, and moving the whole deployment to reach a model is the wrong
    # trade.
    region = os.environ.get("AWS_REGION", "") or os.environ.get("AWS_DEFAULT_REGION", "")

    return Settings(
        database_url=url,
        storage_backend=os.environ.get("STORAGE_BACKEND", "local"),
        storage_local_path=root / os.environ.get("STORAGE_LOCAL_PATH", "./storage"),
        migrations_dir=root / "migrations" / "sql",
        # Overridable because Lambda's filesystem is read-only except
        # for /tmp, and the demo bootstrap generates its feeds before
        # it ingests them.
        seed_dir=Path(os.environ["SEED_DIR"]) if os.environ.get("SEED_DIR") else root / "seed",
        aws_region=region,
        s3_bucket=os.environ.get("S3_BUCKET", ""),
        s3_prefix=os.environ.get("S3_PREFIX", "documents"),
        bedrock_region=os.environ.get("BEDROCK_REGION", "") or region,
        bedrock_model_id=os.environ.get("BEDROCK_MODEL_ID", ""),
    )
