from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.option_chain import (
    MAX_CHAIN_RESULT_LIMIT,
    contract_matches_chain_request,
    normalize_option_chain_snapshot,
    normalize_option_type,
    parse_occ_option_symbol,
    validate_chain_limit,
)


def test_parse_occ_option_symbol_parses_a_call_contract() -> None:
    contract = parse_occ_option_symbol(
        "TSM260717C00450000"
    )

    assert contract.contract_symbol == "TSM260717C00450000"
    assert contract.underlying_symbol == "TSM"
    assert contract.expiration_date == date(2026, 7, 17)
    assert contract.option_type == "call"
    assert contract.strike_price == Decimal("450")


def test_parse_occ_option_symbol_parses_a_put_contract() -> None:
    contract = parse_occ_option_symbol(
        "NVDA260821P00180000"
    )

    assert contract.underlying_symbol == "NVDA"
    assert contract.expiration_date == date(2026, 8, 21)
    assert contract.option_type == "put"
    assert contract.strike_price == Decimal("180")


@pytest.mark.parametrize(
    "bad_symbol",
    [
        "",
        "TSM260717X00450000",
        "TSM261332C00450000",
        "TSM260717CNOTASTRIKE",
        "NOT-AN-OPTION",
    ],
)
def test_parse_occ_option_symbol_rejects_bad_contracts(
    bad_symbol: str,
) -> None:
    with pytest.raises(ValueError):
        parse_occ_option_symbol(bad_symbol)


@pytest.mark.parametrize(
    ("input_value", "expected_value"),
    [
        ("call", "call"),
        (" PUT ", "put"),
        ("all", "all"),
    ],
)
def test_normalize_option_type_accepts_allowed_values(
    input_value: str,
    expected_value: str,
) -> None:
    assert normalize_option_type(input_value) == expected_value


@pytest.mark.parametrize(
    "bad_option_type",
    [
        "",
        "buy",
        "sell",
        "calls",
        "anything",
    ],
)
def test_normalize_option_type_rejects_bad_values(
    bad_option_type: str,
) -> None:
    with pytest.raises(ValueError):
        normalize_option_type(bad_option_type)


def test_validate_chain_limit_accepts_safe_values() -> None:
    assert validate_chain_limit(1) == 1
    assert validate_chain_limit(50) == 50
    assert validate_chain_limit(MAX_CHAIN_RESULT_LIMIT) == 100


@pytest.mark.parametrize(
    "bad_limit",
    [
        0,
        -1,
        MAX_CHAIN_RESULT_LIMIT + 1,
    ],
)
def test_validate_chain_limit_rejects_bad_values(
    bad_limit: int,
) -> None:
    with pytest.raises(ValueError):
        validate_chain_limit(bad_limit)


def test_contract_matches_chain_request_for_the_right_contract() -> None:
    contract = parse_occ_option_symbol(
        "TSM260717C00450000"
    )

    assert contract_matches_chain_request(
        contract,
        underlying_symbol="tsm",
        expiration_date=date(2026, 7, 17),
        option_type="call",
    )


def test_contract_matches_chain_request_rejects_wrong_details() -> None:
    contract = parse_occ_option_symbol(
        "TSM260717C00450000"
    )

    assert not contract_matches_chain_request(
        contract,
        underlying_symbol="NVDA",
        expiration_date=date(2026, 7, 17),
        option_type="all",
    )

    assert not contract_matches_chain_request(
        contract,
        underlying_symbol="TSM",
        expiration_date=date(2026, 7, 24),
        option_type="all",
    )

    assert not contract_matches_chain_request(
        contract,
        underlying_symbol="TSM",
        expiration_date=date(2026, 7, 17),
        option_type="put",
    )


def test_normalize_option_chain_snapshot_reads_provider_data() -> None:
    contract = parse_occ_option_symbol(
        "TSM260717C00450000"
    )

    raw_snapshot = {
        "latestTrade": {
            "p": 12.34,
            "s": 5,
            "t": "2026-07-01T14:30:00Z",
        },
        "latestQuote": {
            "bp": 12.10,
            "ap": 12.55,
            "bs": 10,
            "as": 20,
            "t": "2026-07-01T14:30:01Z",
        },
        "impliedVolatility": 0.42,
        "greeks": {
            "delta": 0.55,
            "gamma": 0.01,
            "theta": -0.08,
            "vega": 0.12,
            "rho": 0.03,
        },
    }

    option_card = normalize_option_chain_snapshot(
        contract,
        raw_snapshot,
    )

    assert option_card.last_trade_price == Decimal("12.34")
    assert option_card.last_trade_size == 5
    assert option_card.last_trade_timestamp == datetime(
        2026,
        7,
        1,
        14,
        30,
        tzinfo=timezone.utc,
    )

    assert option_card.bid_price == Decimal("12.1")
    assert option_card.ask_price == Decimal("12.55")
    assert option_card.bid_size == 10
    assert option_card.ask_size == 20

    assert option_card.implied_volatility == Decimal("0.42")
    assert option_card.delta == Decimal("0.55")
    assert option_card.gamma == Decimal("0.01")
    assert option_card.theta == Decimal("-0.08")
    assert option_card.vega == Decimal("0.12")
    assert option_card.rho == Decimal("0.03")


def test_normalize_option_chain_snapshot_keeps_bad_provider_values_empty() -> None:
    contract = parse_occ_option_symbol(
        "TSM260717P00400000"
    )

    option_card = normalize_option_chain_snapshot(
        contract,
        {
            "latestTrade": {
                "p": "not-a-price",
                "s": "not-a-size",
                "t": "not-a-timestamp",
            },
            "latestQuote": {},
            "impliedVolatility": "not-a-number",
            "greeks": {
                "delta": "bad",
            },
        },
    )

    assert option_card.last_trade_price is None
    assert option_card.last_trade_size is None
    assert option_card.last_trade_timestamp is None
    assert option_card.bid_price is None
    assert option_card.ask_price is None
    assert option_card.implied_volatility is None
    assert option_card.delta is None