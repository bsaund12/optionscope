from datetime import date
from decimal import Decimal
from typing import Optional

import pytest
from fastapi import HTTPException

import app.main as main


def test_get_option_chain_returns_clean_calls_and_puts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created_clients = []

    class FakeAlpacaClient:
        options_feed = "indicative"

        def __init__(self) -> None:
            created_clients.append(self)
            self.requests = []

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

            if option_type == "call":
                return {
                    "snapshots": {
                        "TSM260717C00450000": {
                            "latestQuote": {
                                "bp": 10.10,
                                "ap": 10.50,
                            },
                            "impliedVolatility": 0.42,
                            "greeks": {
                                "delta": 0.55,
                                "theta": -0.08,
                            },
                        },
                        "NOT-A-REAL-CONTRACT": {},
                    },
                    "next_page_token": "provider-has-more",
                }

            return {
                "snapshots": {
                    "TSM260717P00400000": {
                        "latestQuote": {
                            "bp": 7.20,
                            "ap": 7.60,
                        },
                    },
                },
            }

    monkeypatch.setattr(main, "AlpacaClient", FakeAlpacaClient)

    response = main.get_option_chain(
        symbol=" tsm ",
        expiration_date=date(2026, 7, 17),
        option_type="all",
        minimum_strike=Decimal("350"),
        maximum_strike=Decimal("500"),
        limit=10,
    )

    assert response.symbol == "TSM"
    assert response.expiration_date == date(2026, 7, 17)
    assert response.feed == "indicative"

    assert response.calls.requested is True
    assert response.calls.contracts_returned == 1
    assert response.calls.contracts[0].contract_symbol == (
        "TSM260717C00450000"
    )
    assert response.calls.contracts[0].strike_price == Decimal("450")
    assert response.calls.skipped_provider_contracts == 1
    assert response.calls.provider_more_available is True

    assert response.puts.requested is True
    assert response.puts.contracts_returned == 1
    assert response.puts.contracts[0].option_type == "put"

    assert response.response_may_be_incomplete is True

    assert len(created_clients) == 1
    assert len(created_clients[0].requests) == 2


def test_get_option_chain_requests_only_calls_when_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_option_types = []

    class FakeAlpacaClient:
        options_feed = "indicative"

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
        expiration_date=date(2026, 7, 17),
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
            expiration_date=date(2020, 1, 1),
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
            expiration_date=date(2026, 7, 17),
            option_type="buy",  # type: ignore[arg-type]
            minimum_strike=None,
            maximum_strike=None,
            limit=10,
        )

    assert error.value.status_code == 422