from datetime import date
from decimal import Decimal

import pytest

from app.option_chain import (
    MAX_CHAIN_RESULT_LIMIT,
    NormalizedOptionChainContract,
)
from app.option_selection import (
    resolve_reference_price_from_snapshot,
    select_nearest_option_contracts,
)


def make_contract(
    strike_price: str,
    *,
    contract_symbol: str | None = None,
) -> NormalizedOptionChainContract:
    strike = Decimal(strike_price)
    symbol = contract_symbol or (
        f"TEST260717C{int(strike * Decimal('1000')):08d}"
    )

    return NormalizedOptionChainContract(
        contract_symbol=symbol,
        underlying_symbol="TEST",
        expiration_date=date(2026, 7, 17),
        option_type="call",
        strike_price=strike,
        last_trade_price=None,
        last_trade_size=None,
        last_trade_timestamp=None,
        bid_price=None,
        ask_price=None,
        bid_size=None,
        ask_size=None,
        quote_timestamp=None,
        implied_volatility=None,
        delta=None,
        gamma=None,
        theta=None,
        vega=None,
        rho=None,
    )


def test_resolve_reference_price_prefers_latest_trade() -> None:
    snapshot = {
        "latestTrade": {"p": 101.25},
        "latestQuote": {"bp": 100, "ap": 102},
        "dailyBar": {"c": 99},
        "prevDailyBar": {"c": 98},
    }

    assert resolve_reference_price_from_snapshot(snapshot) == Decimal(
        "101.25"
    )


def test_resolve_reference_price_uses_quote_midpoint() -> None:
    snapshot = {
        "latestTrade": {},
        "latestQuote": {"bp": 100, "ap": 102},
        "dailyBar": {"c": 99},
    }

    assert resolve_reference_price_from_snapshot(snapshot) == Decimal(
        "101"
    )


def test_resolve_reference_price_uses_daily_close() -> None:
    snapshot = {
        "latestTrade": {"p": None},
        "latestQuote": {"bp": 100, "ap": None},
        "dailyBar": {"c": 99.5},
        "prevDailyBar": {"c": 98},
    }

    assert resolve_reference_price_from_snapshot(snapshot) == Decimal(
        "99.5"
    )


def test_resolve_reference_price_uses_previous_close() -> None:
    snapshot = {
        "latestTrade": {"p": 0},
        "latestQuote": {"bp": -1, "ap": "bad-data"},
        "dailyBar": {"c": None},
        "prevDailyBar": {"c": 98},
    }

    assert resolve_reference_price_from_snapshot(snapshot) == Decimal(
        "98"
    )


def test_resolve_reference_price_rejects_unusable_snapshot() -> None:
    with pytest.raises(
        ValueError,
        match="Stock snapshot did not contain a usable reference price.",
    ):
        resolve_reference_price_from_snapshot(
            {
                "latestTrade": {"p": 0},
                "latestQuote": {"bp": None, "ap": None},
                "dailyBar": {"c": "not-a-number"},
                "prevDailyBar": {},
            }
        )


def test_select_nearest_option_contracts_returns_closest_strikes() -> None:
    contracts = [
        make_contract("120"),
        make_contract("95"),
        make_contract("105"),
        make_contract("80"),
        make_contract("100"),
    ]

    selected = select_nearest_option_contracts(
        contracts,
        reference_price=Decimal("102"),
        limit=3,
    )

    assert [contract.strike_price for contract in selected] == [
        Decimal("95"),
        Decimal("100"),
        Decimal("105"),
    ]


def test_select_nearest_option_contracts_prefers_lower_strike_on_tie() -> None:
    contracts = [
        make_contract("105"),
        make_contract("95"),
    ]

    selected = select_nearest_option_contracts(
        contracts,
        reference_price=Decimal("100"),
        limit=1,
    )

    assert [contract.strike_price for contract in selected] == [
        Decimal("95")
    ]


def test_select_nearest_option_contracts_returns_selected_rows_sorted() -> None:
    contracts = [
        make_contract("110"),
        make_contract("90"),
        make_contract("100"),
    ]

    selected = select_nearest_option_contracts(
        contracts,
        reference_price=Decimal("100"),
        limit=3,
    )

    assert [contract.strike_price for contract in selected] == [
        Decimal("90"),
        Decimal("100"),
        Decimal("110"),
    ]


def test_select_nearest_option_contracts_returns_all_when_under_limit() -> None:
    contracts = [
        make_contract("105"),
        make_contract("100"),
    ]

    selected = select_nearest_option_contracts(
        contracts,
        reference_price=Decimal("101"),
        limit=10,
    )

    assert [contract.strike_price for contract in selected] == [
        Decimal("100"),
        Decimal("105"),
    ]


@pytest.mark.parametrize(
    "bad_reference_price",
    [Decimal("0"), Decimal("-1")],
)
def test_select_nearest_option_contracts_rejects_bad_reference_price(
    bad_reference_price: Decimal,
) -> None:
    with pytest.raises(
        ValueError,
        match="Reference price must be greater than zero.",
    ):
        select_nearest_option_contracts(
            [make_contract("100")],
            reference_price=bad_reference_price,
            limit=1,
        )


@pytest.mark.parametrize(
    "bad_limit",
    [0, MAX_CHAIN_RESULT_LIMIT + 1],
)
def test_select_nearest_option_contracts_reuses_chain_limit_validation(
    bad_limit: int,
) -> None:
    with pytest.raises(ValueError):
        select_nearest_option_contracts(
            [make_contract("100")],
            reference_price=Decimal("100"),
            limit=bad_limit,
        )
