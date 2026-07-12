from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import pytest
from fastapi import HTTPException

import app.main as main


TEST_EXPIRATION = date.today() + timedelta(days=30)


def make_contract_symbol(
    option_type: str,
    strike_price: Decimal,
) -> str:
    contract_type = "C" if option_type == "call" else "P"

    strike_in_thousandths = int(strike_price * Decimal("1000"))

    return (
        f"TSM{TEST_EXPIRATION.strftime('%y%m%d')}"
        f"{contract_type}{strike_in_thousandths:08d}"
    )


def test_get_option_chain_centers_results_near_reference_price(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created_clients = []

    class FakeAlpacaClient:
        options_feed = "indicative"

        def __init__(self) -> None:
            created_clients.append(self)
            self.requests = []

        def get_stock_snapshot(self, symbol: str) -> dict:
            assert symbol == "TSM"

            return {
                "latestTrade": {
                    "p": "431.91",
                },
                "dailyBar": {
                    "c": "430.00",
                },
            }

        def get_option_chain_page(
            self,
            *,
            symbol: str,
            expiration_date: date,
            option_type: str,
            limit: int,
            minimum_strike: Optional[Decimal] = None,
            maximum_strike: Optional[Decimal] = None,
        ) -> dict:
            self.requests.append(
                {
                    "symbol": symbol,
                    "expiration_date": expiration_date,
                    "option_type": option_type,
                    "limit": limit,
                    "minimum_strike": minimum_strike,
                    "maximum_strike": maximum_strike,
                }
            )

            strikes = [
                Decimal("400"),
                Decimal("427.5"),
                Decimal("430"),
                Decimal("432.5"),
                Decimal("435"),
                Decimal("440"),
                Decimal("470"),
            ]

            snapshots = {
                make_contract_symbol(option_type, strike_price): {
                    "latestQuote": {
                        "bp": "10.10",
                        "ap": "10.50",
                    },
                }
                for strike_price in strikes
            }

            if option_type == "call":
                snapshots["NOT-A-REAL-CONTRACT"] = {}

                return {
                    "snapshots": snapshots,
                    "next_page_token": "provider-has-more",
                }

            return {
                "snapshots": snapshots,
            }

    monkeypatch.setattr(main, "AlpacaClient", FakeAlpacaClient)

    response = main.get_option_chain(
        symbol=" tsm ",
        expiration_date=TEST_EXPIRATION,
        option_type="all",
        minimum_strike=Decimal("350"),
        maximum_strike=Decimal("500"),
        limit=3,
    )

    expected_strikes = [
        Decimal("430"),
        Decimal("432.5"),
        Decimal("435"),
    ]

    assert response.symbol == "TSM"
    assert response.feed == "indicative"

    assert [
        contract.strike_price
        for contract in response.calls.contracts
    ] == expected_strikes

    assert [
        contract.strike_price
        for contract in response.puts.contracts
    ] == expected_strikes

    assert response.calls.skipped_provider_contracts == 1
    assert response.calls.optionscope_truncated is True
    assert response.calls.provider_more_available is True

    assert response.response_may_be_incomplete is True

    assert len(created_clients) == 1

    assert [
        request["limit"]
        for request in created_clients[0].requests
    ] == [1000, 1000]


def test_get_option_chain_requests_only_calls_when_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_option_types = []

    class FakeAlpacaClient:
        options_feed = "indicative"

        def get_stock_snapshot(self, symbol: str) -> dict:
            return {
                "latestTrade": {
                    "p": "431.91",
                },
            }

        def get_option_chain_page(
            self,
            *,
            symbol: str,
            expiration_date: date,
            option_type: str,
            limit: int,
            minimum_strike: Optional[Decimal] = None,
            maximum_strike: Optional[Decimal] = None,
        ) -> dict:
            requested_option_types.append(option_type)

            return {
                "snapshots": {},
            }

    monkeypatch.setattr(main, "AlpacaClient", FakeAlpacaClient)

    response = main.get_option_chain(
        symbol="TSM",
        expiration_date=TEST_EXPIRATION,
        option_type="call",
        minimum_strike=None,
        maximum_strike=None,
        limit=10,
    )

    assert requested_option_types == ["call"]
    assert response.calls.requested is True
    assert response.puts.requested is False


def test_get_option_chain_rejects_a_past_expiration_date() -> None:
    with pytest.raises(HTTPException) as error:
        main.get_option_chain(
            symbol="TSM",
            expiration_date=date.today() - timedelta(days=1),
            option_type="call",
            minimum_strike=None,
            maximum_strike=None,
            limit=10,
        )

    assert error.value.status_code == 422


def test_get_option_chain_rejects_a_bad_option_type() -> None:
    with pytest.raises(HTTPException) as error:
        main.get_option_chain(
            symbol="TSM",
            expiration_date=TEST_EXPIRATION,
            option_type="buy",  # type: ignore[arg-type]
            minimum_strike=None,
            maximum_strike=None,
            limit=10,
        )

    assert error.value.status_code == 422