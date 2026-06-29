from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.validation import (
    MAX_OPTION_LOOKAHEAD_DAYS,
    normalize_ticker_symbol,
    validate_expiration_date,
    validate_strike_range,
)


def test_normalize_ticker_symbol_cleans_lowercase_and_spaces() -> None:
    assert normalize_ticker_symbol("  tsm  ") == "TSM"


def test_normalize_ticker_symbol_allows_common_symbol_formats() -> None:
    assert normalize_ticker_symbol("brk.b") == "BRK.B"
    assert normalize_ticker_symbol("bf-b") == "BF-B"


@pytest.mark.parametrize(
    "bad_symbol",
    [
        "",
        "   ",
        "AAPL$",
        "TSM/../",
        "TOO-LONG-123",
    ],
)
def test_normalize_ticker_symbol_rejects_bad_values(
    bad_symbol: str,
) -> None:
    with pytest.raises(ValueError):
        normalize_ticker_symbol(bad_symbol)


def test_validate_expiration_date_allows_today_and_future_dates() -> None:
    reference_date = date(2026, 6, 29)

    assert validate_expiration_date(
        reference_date,
        today=reference_date,
    ) == reference_date

    future_date = reference_date + timedelta(days=30)

    assert validate_expiration_date(
        future_date,
        today=reference_date,
    ) == future_date


def test_validate_expiration_date_rejects_past_dates() -> None:
    reference_date = date(2026, 6, 29)

    with pytest.raises(ValueError):
        validate_expiration_date(
            date(2026, 6, 28),
            today=reference_date,
        )


def test_validate_expiration_date_rejects_dates_too_far_away() -> None:
    reference_date = date(2026, 6, 29)

    too_far_away = reference_date + timedelta(
        days=MAX_OPTION_LOOKAHEAD_DAYS + 1
    )

    with pytest.raises(ValueError):
        validate_expiration_date(
            too_far_away,
            today=reference_date,
        )


def test_validate_strike_range_accepts_a_valid_range() -> None:
    minimum, maximum = validate_strike_range(
        Decimal("400"),
        Decimal("500"),
    )

    assert minimum == Decimal("400")
    assert maximum == Decimal("500")


@pytest.mark.parametrize(
    "minimum,maximum",
    [
        (Decimal("0"), Decimal("500")),
        (Decimal("-1"), Decimal("500")),
        (Decimal("500"), Decimal("0")),
        (Decimal("500"), Decimal("400")),
    ],
)
def test_validate_strike_range_rejects_bad_ranges(
    minimum: Decimal,
    maximum: Decimal,
) -> None:
    with pytest.raises(ValueError):
        validate_strike_range(minimum, maximum)