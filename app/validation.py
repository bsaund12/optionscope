import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, Tuple

from fastapi import HTTPException, status


MAX_TICKER_LENGTH = 10
MAX_OPTION_LOOKAHEAD_DAYS = 730

# Allows normal U.S.-style symbols such as:
# TSM, NVDA, SPY, BRK.B, and BF-B
TICKER_SYMBOL_PATTERN = re.compile(
    r"^[A-Z][A-Z0-9.-]{0,9}$"
)


def normalize_ticker_symbol(value: str) -> str:
    """
    Clean and validate a ticker symbol before using it anywhere else.

    Raises ValueError so Pydantic can turn bad request-body input
    into a normal validation response.
    """
    if not isinstance(value, str):
        raise ValueError("Ticker symbol must be text.")

    normalized_symbol = value.strip().upper()

    if not normalized_symbol:
        raise ValueError("Ticker symbol cannot be blank.")

    if len(normalized_symbol) > MAX_TICKER_LENGTH:
        raise ValueError(
            f"Ticker symbol cannot be longer than "
            f"{MAX_TICKER_LENGTH} characters."
        )

    if not TICKER_SYMBOL_PATTERN.fullmatch(normalized_symbol):
        raise ValueError(
            "Ticker symbol may contain only letters, numbers, "
            "periods, and hyphens."
        )

    return normalized_symbol


def normalize_ticker_symbol_for_api(value: str) -> str:
    """
    Use the same ticker rules for URL path values.

    FastAPI routes need an HTTP error instead of a raw ValueError.
    """
    try:
        return normalize_ticker_symbol(value)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        )


def validate_expiration_date(
    expiration_date: date,
    *,
    today: Optional[date] = None,
) -> date:
    """
    Reject dates in the past or absurdly far in the future.

    Same-day expiration is allowed because zero-days-to-expiration
    contracts can exist.
    """
    reference_date = today or date.today()
    latest_allowed_date = reference_date + timedelta(
        days=MAX_OPTION_LOOKAHEAD_DAYS
    )

    if expiration_date < reference_date:
        raise ValueError("Expiration date cannot be in the past.")

    if expiration_date > latest_allowed_date:
        raise ValueError(
            "Expiration date is outside OptionScope's allowed range."
        )

    return expiration_date


def validate_strike_range(
    minimum_strike: Optional[Decimal],
    maximum_strike: Optional[Decimal],
) -> Tuple[Optional[Decimal], Optional[Decimal]]:
    """
    Make sure a requested strike-price range makes financial sense.
    """
    if minimum_strike is not None and minimum_strike <= 0:
        raise ValueError("Minimum strike must be greater than zero.")

    if maximum_strike is not None and maximum_strike <= 0:
        raise ValueError("Maximum strike must be greater than zero.")

    if (
        minimum_strike is not None
        and maximum_strike is not None
        and minimum_strike > maximum_strike
    ):
        raise ValueError(
            "Minimum strike cannot be greater than maximum strike."
        )

    return minimum_strike, maximum_strike