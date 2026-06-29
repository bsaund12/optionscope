from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.validation import normalize_ticker_symbol


class TickerCreate(BaseModel):
    """The information OptionScope needs when adding a ticker."""

    symbol: str = Field(
        min_length=1,
        max_length=10,
        examples=["TSM"],
    )

    company_name: str = Field(
        min_length=1,
        max_length=255,
        examples=["Taiwan Semiconductor Manufacturing Company"],
    )

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return normalize_ticker_symbol(value)

    @field_validator("company_name")
    @classmethod
    def clean_company_name(cls, value: str) -> str:
        return value.strip()


class TickerResponse(BaseModel):
    """The ticker information OptionScope sends back to the user."""

    id: int
    symbol: str
    company_name: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StockQuoteResponse(BaseModel):
    """A clean stock quote OptionScope sends to the frontend."""

    symbol: str
    bid_price: Decimal
    ask_price: Decimal
    bid_size: int
    ask_size: int
    timestamp: datetime
    feed: str
    provider: str = "alpaca"
    data_notice: str = (
        "IEX market-data feed. Informational only; not for trade execution."
    )


class StockMarketSnapshotResponse(BaseModel):
    """A fuller market summary for one stock symbol."""

    symbol: str

    last_trade_price: Optional[Decimal]
    last_trade_timestamp: Optional[datetime]

    bid_price: Optional[Decimal]
    ask_price: Optional[Decimal]
    bid_size: Optional[int]
    ask_size: Optional[int]
    quote_timestamp: Optional[datetime]

    day_open: Optional[Decimal]
    day_high: Optional[Decimal]
    day_low: Optional[Decimal]
    day_close: Optional[Decimal]
    day_volume: Optional[int]

    previous_close: Optional[Decimal]
    day_change: Optional[Decimal]
    day_change_percent: Optional[Decimal]

    feed: str
    provider: str = "alpaca"
    data_notice: str = (
        "IEX market-data feed. The latest available data may be stale when "
        "the market is closed. Informational only; not for trade execution."
    )


class OptionExpirationsResponse(BaseModel):
    """A clean list of option expiration dates for one stock."""

    symbol: str
    expiration_dates: list[date]
    dates_returned: int
    catalog_pages_checked: int
    catalog_scan_incomplete: bool
    window_start: date
    window_end: date
    provider: str = "alpaca"
    data_notice: str = (
        "Option-contract catalog data. Option quotes and Greeks will be "
        "loaded separately and labeled with their market-data feed."
    )

class OptionChainContractResponse(BaseModel):
    """One clean option contract returned by OptionScope."""

    contract_symbol: str
    underlying_symbol: str
    expiration_date: date
    option_type: Literal["call", "put"]
    strike_price: Decimal

    last_trade_price: Optional[Decimal]
    last_trade_size: Optional[int]
    last_trade_timestamp: Optional[datetime]

    bid_price: Optional[Decimal]
    ask_price: Optional[Decimal]
    bid_size: Optional[int]
    ask_size: Optional[int]
    quote_timestamp: Optional[datetime]

    implied_volatility: Optional[Decimal]

    delta: Optional[Decimal]
    gamma: Optional[Decimal]
    theta: Optional[Decimal]
    vega: Optional[Decimal]
    rho: Optional[Decimal]


class OptionChainSideResponse(BaseModel):
    """One side of an option chain: calls or puts."""

    requested: bool
    option_type: Literal["call", "put"]
    contracts: list[OptionChainContractResponse]
    contracts_returned: int
    skipped_provider_contracts: int
    provider_more_available: bool
    optionscope_truncated: bool


class OptionChainResponse(BaseModel):
    """A guarded option-chain response for one ticker and expiration date."""

    symbol: str
    expiration_date: date
    requested_option_type: Literal["call", "put", "all"]

    minimum_strike: Optional[Decimal]
    maximum_strike: Optional[Decimal]
    limit_per_side: int

    calls: OptionChainSideResponse
    puts: OptionChainSideResponse

    response_may_be_incomplete: bool

    feed: str
    provider: str = "alpaca"
    data_notice: str = (
        "Indicative options feed. Trades may be delayed and quotes may be "
        "modified. Informational only; not for trade execution."
    )