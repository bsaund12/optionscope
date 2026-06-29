import os
from datetime import date
from decimal import Decimal
from typing import Any, Literal, Optional

import httpx
from fastapi import HTTPException, status


class AlpacaClient:
    """Small helper responsible for safely requesting Alpaca market data."""

    def __init__(self) -> None:
        self.data_base_url = os.getenv(
            "ALPACA_DATA_BASE_URL",
            "https://data.alpaca.markets",
        ).rstrip("/")

        self.trading_base_url = os.getenv(
            "ALPACA_TRADING_BASE_URL",
            "https://paper-api.alpaca.markets",
        ).rstrip("/")

        self.api_key = os.getenv("ALPACA_API_KEY")
        self.secret_key = os.getenv("ALPACA_SECRET_KEY")

        self.stock_feed = os.getenv("ALPACA_STOCK_FEED", "iex")
        self.options_feed = os.getenv(
            "ALPACA_OPTIONS_FEED",
            "indicative",
        )

    def _headers(self) -> dict[str, str]:
        """Build the private authentication headers Alpaca requires."""

        if not self.api_key or not self.secret_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Alpaca credentials are missing. "
                    "Add them to the local .env file, then restart Docker."
                ),
            )

        return {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
        }

    def _get_json(
        self,
        base_url: str,
        path: str,
        params: dict[str, str],
    ) -> dict[str, Any]:
        """Make one safe GET request to an Alpaca API."""

        try:
            response = httpx.get(
                f"{base_url}{path}",
                headers=self._headers(),
                params=params,
                timeout=15.0,
            )
        except httpx.RequestError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "OptionScope could not reach Alpaca market data. "
                    "Please try again shortly."
                ),
            )

        if response.status_code == status.HTTP_401_UNAUTHORIZED:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Alpaca rejected the API credentials. "
                    "Check the local .env values and restart Docker."
                ),
            )

        if response.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your Alpaca account does not have access to this "
                    "market-data request."
                ),
            )

        if response.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alpaca did not find the requested market data.",
            )

        if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Alpaca rate limit reached. "
                    "Wait a moment, then try again."
                ),
            )

        if response.is_error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Alpaca could not provide market data right now.",
            )

        try:
            return response.json()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Alpaca returned an unreadable market-data response.",
            )

    def get_latest_stock_quote(self, symbol: str) -> dict[str, Any]:
        """Ask Alpaca for the latest bid and ask quote for one stock."""

        normalized_symbol = symbol.strip().upper()

        payload = self._get_json(
            self.data_base_url,
            "/v2/stocks/quotes/latest",
            params={
                "symbols": normalized_symbol,
                "feed": self.stock_feed,
            },
        )

        quote = payload.get("quotes", {}).get(normalized_symbol)

        if quote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Alpaca did not return a quote for '{normalized_symbol}'."
                ),
            )

        return quote

    def get_stock_snapshot(self, symbol: str) -> dict[str, Any]:
        """Ask Alpaca for the fuller market snapshot for one stock."""

        normalized_symbol = symbol.strip().upper()

        return self._get_json(
            self.data_base_url,
            f"/v2/stocks/{normalized_symbol}/snapshot",
            params={
                "feed": self.stock_feed,
            },
        )

    def get_option_contract_page(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
        page_token: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get one page of active option contracts for a stock symbol."""

        normalized_symbol = symbol.strip().upper()

        params = {
            "underlying_symbols": normalized_symbol,
            "status": "active",
            "expiration_date_gte": start_date.isoformat(),
            "expiration_date_lte": end_date.isoformat(),
            "limit": "1000",
        }

        if page_token:
            params["page_token"] = page_token

        return self._get_json(
            self.trading_base_url,
            "/v2/options/contracts",
            params=params,
        )

    def get_option_chain_page(
        self,
        symbol: str,
        expiration_date: date,
        option_type: Literal["call", "put"],
        limit: int,
        minimum_strike: Optional[Decimal] = None,
        maximum_strike: Optional[Decimal] = None,
    ) -> dict[str, Any]:
        """
        Get one tightly filtered page of option snapshots.

        This method intentionally accepts only OptionScope-approved
        filters. It does not expose provider URLs, feeds, or page tokens
        to a browser user.
        """

        if option_type not in {"call", "put"}:
            raise ValueError("Option type must be 'call' or 'put'.")

        if limit < 1 or limit > 100:
            raise ValueError("Option-chain limit must be between 1 and 100.")

        normalized_symbol = symbol.strip().upper()

        params = {
            "feed": self.options_feed,
            "expiration_date": expiration_date.isoformat(),
            "type": option_type,
            "limit": str(limit),
        }

        if minimum_strike is not None:
            params["strike_price_gte"] = str(minimum_strike)

        if maximum_strike is not None:
            params["strike_price_lte"] = str(maximum_strike)

        return self._get_json(
            self.data_base_url,
            f"/v1beta1/options/snapshots/{normalized_symbol}",
            params=params,
        )