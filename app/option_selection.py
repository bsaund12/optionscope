from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Mapping, Optional

from app.option_chain import (
    NormalizedOptionChainContract,
    validate_chain_limit,
)


def positive_decimal_or_none(value: Any) -> Optional[Decimal]:
    """Convert a provider value into a positive Decimal when possible."""

    if value is None:
        return None

    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None

    if decimal_value <= Decimal("0"):
        return None

    return decimal_value


def resolve_reference_price_from_snapshot(
    snapshot: Mapping[str, Any],
) -> Decimal:
    """
    Choose the best available stock price for centering an option chain.

    Preference order:
    1. Latest trade price
    2. Midpoint of the latest bid and ask
    3. Current daily close
    4. Previous daily close
    """

    latest_trade = snapshot.get("latestTrade")
    if not isinstance(latest_trade, Mapping):
        latest_trade = {}

    latest_trade_price = positive_decimal_or_none(
        latest_trade.get("p")
    )
    if latest_trade_price is not None:
        return latest_trade_price

    latest_quote = snapshot.get("latestQuote")
    if not isinstance(latest_quote, Mapping):
        latest_quote = {}

    bid_price = positive_decimal_or_none(latest_quote.get("bp"))
    ask_price = positive_decimal_or_none(latest_quote.get("ap"))

    if bid_price is not None and ask_price is not None:
        return (bid_price + ask_price) / Decimal("2")

    daily_bar = snapshot.get("dailyBar")
    if not isinstance(daily_bar, Mapping):
        daily_bar = {}

    daily_close = positive_decimal_or_none(daily_bar.get("c"))
    if daily_close is not None:
        return daily_close

    previous_daily_bar = snapshot.get("prevDailyBar")
    if not isinstance(previous_daily_bar, Mapping):
        previous_daily_bar = {}

    previous_close = positive_decimal_or_none(
        previous_daily_bar.get("c")
    )
    if previous_close is not None:
        return previous_close

    raise ValueError(
        "Stock snapshot did not contain a usable reference price."
    )


def select_nearest_option_contracts(
    contracts: list[NormalizedOptionChainContract],
    *,
    reference_price: Decimal,
    limit: int,
) -> list[NormalizedOptionChainContract]:
    """
    Select the contracts whose strikes are closest to a reference price.

    Contracts are ranked by distance from the reference price. Ties prefer
    the lower strike, then the contract symbol, so results stay predictable.
    The selected contracts are returned in normal ascending strike order for
    an options-chain table.
    """

    if reference_price <= Decimal("0"):
        raise ValueError("Reference price must be greater than zero.")

    safe_limit = validate_chain_limit(limit)

    nearest_contracts = sorted(
        contracts,
        key=lambda contract: (
            abs(contract.strike_price - reference_price),
            contract.strike_price,
            contract.contract_symbol,
        ),
    )[:safe_limit]

    return sorted(
        nearest_contracts,
        key=lambda contract: (
            contract.strike_price,
            contract.contract_symbol,
        ),
    )
