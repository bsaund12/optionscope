import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

def require_database_url() -> str:
    """Return DATABASE_URL from the environment, failing fast if it is unusable."""
    database_url = os.getenv("DATABASE_URL")
    if database_url is None or not database_url.strip():
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. Set it in your "
            "environment, or in .env for Docker Compose, before starting OptionScope."
        )
    return database_url.strip()


DATABASE_URL = require_database_url()

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """The parent blueprint used to create OptionScope database tables."""


def get_db() -> Generator[Session, None, None]:
    """
    Give an API request a temporary connection to the database,
    then close it when the request is finished.
    """
    database = SessionLocal()

    try:
        yield database
    finally:
        database.close()


def database_is_available() -> bool:
    """Return True only when the PostgreSQL connection is healthy."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False