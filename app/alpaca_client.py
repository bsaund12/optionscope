import os
from typing import Any

import httpx
from fastapi import HTTPException, status


class AlpacaClient:
    """Small helper responsible for safely requesting Alpaca market data."""

    def __init__(self) -> None:
        self.base_url = os.getenv(
            "ALPACA_DATA_BASE_URL",
            "https://data.alpaca.markets",
        ).rstrip("/")

        self.api_key = os.getenv("ALPACA_API_KEY")
        self.secret_key = os.getenv("ALPACA_SECRET_KEY")
        self.stock_feed = os.getenv("ALPACA_STOCK_FEED", "iex")

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

    def _get(
        self,
        path: str,
        params: dict[str, str],
    ) -> dict[str, Any]:
        """Make one safe GET request to Alpaca."""

        try:
            response = httpx.get(
                f"{self.base_url}{path}",
                headers=self._headers(),
                params=params,
                timeout=10.0,
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
                detail=(
                    "Alpaca could not provide market data right now."
                ),
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

        payload = self._get(
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
        """Ask Alpaca for the full market snapshot for one stock."""

        normalized_symbol = symbol.strip().upper()

        return self._get(
            f"/v2/stocks/{normalized_symbol}/snapshot",
            params={
                "feed": self.stock_feed,
            },
        )