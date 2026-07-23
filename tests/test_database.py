import pytest

from app.database import require_database_url


def test_require_database_url_raises_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        require_database_url()


def test_require_database_url_raises_when_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "")

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        require_database_url()


def test_require_database_url_raises_when_whitespace_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "   ")

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        require_database_url()


def test_require_database_url_returns_configured_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configured_url = "postgresql+psycopg://user:pass@localhost:5432/db"
    monkeypatch.setenv("DATABASE_URL", configured_url)

    assert require_database_url() == configured_url


def test_require_database_url_strips_surrounding_whitespace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configured_url = "postgresql+psycopg://user:pass@localhost:5432/db"
    monkeypatch.setenv("DATABASE_URL", f"  {configured_url}  ")

    assert require_database_url() == configured_url
