"""Database access. SQLAlchemy Core only — no ORM, no lazy loading.

Every headline figure is a SQL aggregate the reader can point at. Hiding that
behind an ORM identity map would undercut the one claim the product makes.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import Connection

from diligence_engine.config import settings


@lru_cache(maxsize=1)
def engine() -> Engine:
    return create_engine(settings().database_url, future=True, pool_pre_ping=True)


@contextmanager
def connect() -> Iterator[Connection]:
    """A connection in an explicit transaction. Commits on clean exit."""
    with engine().begin() as conn:
        yield conn
