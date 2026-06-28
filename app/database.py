import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://optionscope_user:optionscope_local_password_2026@db:5432/optionscope",
)

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