from datetime import date
from decimal import Decimal

import pytest

from app.alpaca_client import AlpacaClient


def test_get_option_chain_page_builds_a_safe_call_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = AlpacaClient()
    captured_request: dict[str, object] = {}

    def fake_get_json(
        base_url: str,
        path: str,
        params: dict[str, str],
    ) -> dict[str, object]:
        captured_request["base_url"] = base_url
        captured_request["path"] = path
        captured_request["params"] = params

        return {
            "snapshots": {},
        }

    monkeypatch.setattr(client, "_get_json", fake_get_json)

    response = client.get_option_chain_page(
        symbol="  tsm  ",
        expiration_date=date(2026, 7, 17),
        option_type="call",
        limit=25,
        minimum_strike=Decimal("400"),
        maximum_strike=Decimal("500"),
    )

    assert response == {"snapshots": {}}

    assert captured_request["base_url"] == client.data_base_url
    assert captured_request["path"] == "/v1beta1/options/snapshots/TSM"

    params = captured_request["params"]

    assert params == {
        "feed": client.options_feed,
        "expiration_date": "2026-07-17",
        "type": "call",
        "limit": "25",
        "strike_price_gte": "400",
        "strike_price_lte": "500",
    }


def test_get_option_chain_page_allows_a_put_without_strike_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = AlpacaClient()
    captured_params: dict[str, str] = {}

    def fake_get_json(
        base_url: str,
        path: str,
        params: dict[str, str],
    ) -> dict[str, object]:
        captured_params.update(params)

        return {
            "snapshots": {},
        }

    monkeypatch.setattr(client, "_get_json", fake_get_json)

    client.get_option_chain_page(
        symbol="NVDA",
        expiration_date=date(2026, 8, 21),
        option_type="put",
        limit=10,
    )

    assert captured_params == {
        "feed": client.options_feed,
        "expiration_date": "2026-08-21",
        "type": "put",
        "limit": "10",
    }


@pytest.mark.parametrize(
    "bad_option_type",
    [
        "all",
        "buy",
        "sell",
        "",
    ],
)
def test_get_option_chain_page_rejects_bad_option_types(
    bad_option_type: str,
) -> None:
    client = AlpacaClient()

    with pytest.raises(ValueError):
        client.get_option_chain_page(
            symbol="TSM",
            expiration_date=date(2026, 7, 17),
            option_type=bad_option_type,  # type: ignore[arg-type]
            limit=25,
        )


@pytest.mark.parametrize(
    "bad_limit",
    [
        0,
        -1,
        101,
    ],
)
def test_get_option_chain_page_rejects_bad_limits(
    bad_limit: int,
) -> None:
    client = AlpacaClient()

    with pytest.raises(ValueError):
        client.get_option_chain_page(
            symbol="TSM",
            expiration_date=date(2026, 7, 17),
            option_type="call",
            limit=bad_limit,
        )