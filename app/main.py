from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Literal, Mapping, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.alpaca_client import AlpacaClient
from app.database import Base, database_is_available, engine, get_db

from app.validation import (
    normalize_ticker_symbol_for_api,
    validate_expiration_date,
    validate_strike_range,
)

from app.option_chain import (
    NormalizedOptionChainContract,
    normalize_chain_snapshot_mapping,
    normalize_option_type,
    validate_chain_limit,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables when OptionScope starts."""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="OptionScope API",
    description=(
        "Backend service for OptionScope: option-chain data, "
        "payoff analysis, watchlists, and theoretical pricing."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


def find_ticker_or_404(
    symbol: str,
    database: Session,
) -> models.Ticker:
    """Find one ticker card or explain that it does not exist."""

    normalized_symbol = normalize_ticker_symbol_for_api(symbol)

    ticker = database.scalar(
        select(models.Ticker).where(
            models.Ticker.symbol == normalized_symbol
        )
    )

    if ticker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticker '{normalized_symbol}' was not found.",
        )

    return ticker


def to_decimal_or_none(value: Any) -> Optional[Decimal]:
    """Turn Alpaca values into safe decimal numbers when possible."""

    if value is None:
        return None

    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def round_money_or_none(value: Optional[Decimal]) -> Optional[Decimal]:
    """Round a money value to four decimal places."""

    if value is None:
        return None

    return value.quantize(
        Decimal("0.0001"),
        rounding=ROUND_HALF_UP,
    )


@app.get("/")
def read_root() -> dict[str, str]:
    return {
        "message": "OptionScope API is running.",
        "docs": "/docs",
    }


@app.get("/health")
def health_check() -> dict[str, str]:
    if not database_is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable.",
        )

    return {
        "status": "healthy",
        "database": "connected",
    }


@app.post(
    "/tickers",
    response_model=schemas.TickerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_ticker(
    ticker: schemas.TickerCreate,
    database: Session = Depends(get_db),
) -> models.Ticker:
    """Add a stock or ETF ticker to OptionScope."""

    existing_ticker = database.scalar(
        select(models.Ticker).where(models.Ticker.symbol == ticker.symbol)
    )

    if existing_ticker:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ticker '{ticker.symbol}' already exists.",
        )

    new_ticker = models.Ticker(
        symbol=ticker.symbol,
        company_name=ticker.company_name,
    )

    database.add(new_ticker)

    try:
        database.commit()
    except IntegrityError:
        database.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ticker '{ticker.symbol}' already exists.",
        )

    database.refresh(new_ticker)

    return new_ticker


@app.get(
    "/tickers",
    response_model=list[schemas.TickerResponse],
)
def list_tickers(
    database: Session = Depends(get_db),
) -> list[models.Ticker]:
    """Return every ticker currently saved in OptionScope."""

    statement = select(models.Ticker).order_by(models.Ticker.symbol)

    return list(database.scalars(statement).all())


@app.get(
    "/tickers/{symbol}",
    response_model=schemas.TickerResponse,
)
def get_ticker(
    symbol: str,
    database: Session = Depends(get_db),
) -> models.Ticker:
    """Return one saved ticker by its stock symbol."""

    return find_ticker_or_404(symbol, database)


@app.get(
    "/market/stocks/{symbol}/quote",
    response_model=schemas.StockQuoteResponse,
)
def get_stock_quote(symbol: str) -> schemas.StockQuoteResponse:
    """Get the latest available Alpaca stock quote for one ticker."""

    normalized_symbol = normalize_ticker_symbol_for_api(symbol)

    alpaca = AlpacaClient()
    quote = alpaca.get_latest_stock_quote(normalized_symbol)

    return schemas.StockQuoteResponse(
        symbol=normalized_symbol,
        bid_price=quote["bp"],
        ask_price=quote["ap"],
        bid_size=quote["bs"],
        ask_size=quote["as"],
        timestamp=quote["t"],
        feed=alpaca.stock_feed,
    )


@app.get(
    "/market/stocks/{symbol}/snapshot",
    response_model=schemas.StockMarketSnapshotResponse,
)
def get_stock_market_snapshot(
    symbol: str,
) -> schemas.StockMarketSnapshotResponse:
    """Get a fuller Alpaca market snapshot for one ticker."""

    normalized_symbol = normalize_ticker_symbol_for_api(symbol)

    alpaca = AlpacaClient()
    snapshot = alpaca.get_stock_snapshot(normalized_symbol)

    latest_trade = snapshot.get("latestTrade") or {}
    latest_quote = snapshot.get("latestQuote") or {}
    daily_bar = snapshot.get("dailyBar") or {}
    previous_daily_bar = snapshot.get("prevDailyBar") or {}

    day_close = to_decimal_or_none(daily_bar.get("c"))
    previous_close = to_decimal_or_none(previous_daily_bar.get("c"))

    day_change: Optional[Decimal] = None
    day_change_percent: Optional[Decimal] = None

    if day_close is not None and previous_close not in (None, Decimal("0")):
        day_change = round_money_or_none(day_close - previous_close)

        day_change_percent = round_money_or_none(
            ((day_close - previous_close) / previous_close) * Decimal("100")
        )

    return schemas.StockMarketSnapshotResponse(
        symbol=normalized_symbol,
        last_trade_price=to_decimal_or_none(latest_trade.get("p")),
        last_trade_timestamp=latest_trade.get("t"),
        bid_price=to_decimal_or_none(latest_quote.get("bp")),
        ask_price=to_decimal_or_none(latest_quote.get("ap")),
        bid_size=latest_quote.get("bs"),
        ask_size=latest_quote.get("as"),
        quote_timestamp=latest_quote.get("t"),
        day_open=to_decimal_or_none(daily_bar.get("o")),
        day_high=to_decimal_or_none(daily_bar.get("h")),
        day_low=to_decimal_or_none(daily_bar.get("l")),
        day_close=day_close,
        day_volume=daily_bar.get("v"),
        previous_close=previous_close,
        day_change=day_change,
        day_change_percent=day_change_percent,
        feed=alpaca.stock_feed,
    )


@app.get(
    "/market/options/{symbol}/expirations",
    response_model=schemas.OptionExpirationsResponse,
)
def get_option_expirations(
    symbol: str,
    days_ahead: int = Query(
        default=365,
        ge=7,
        le=730,
        description="How far ahead to search for active option expirations.",
    ),
) -> schemas.OptionExpirationsResponse:
    """Return unique active option expiration dates for one ticker."""

    normalized_symbol = normalize_ticker_symbol_for_api(symbol)

    window_start = date.today()
    window_end = window_start + timedelta(days=days_ahead)

    alpaca = AlpacaClient()

    expiration_dates: set[date] = set()
    page_token: Optional[str] = None
    pages_checked = 0
    max_pages = 5

    for _ in range(max_pages):
        payload = alpaca.get_option_contract_page(
            symbol=normalized_symbol,
            start_date=window_start,
            end_date=window_end,
            page_token=page_token,
        )

        pages_checked += 1

        for contract in payload.get("option_contracts", []):
            expiration_value = contract.get("expiration_date")

            if not isinstance(expiration_value, str):
                continue

            try:
                expiration_dates.add(
                    date.fromisoformat(expiration_value)
                )
            except ValueError:
                continue

        page_token = payload.get("next_page_token")

        if not page_token:
            break

    sorted_expirations = sorted(expiration_dates)

    if not sorted_expirations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Alpaca did not return active option expirations "
                f"for '{normalized_symbol}'."
            ),
        )

    return schemas.OptionExpirationsResponse(
        symbol=normalized_symbol,
        expiration_dates=sorted_expirations,
        dates_returned=len(sorted_expirations),
        catalog_pages_checked=pages_checked,
        catalog_scan_incomplete=page_token is not None,
        window_start=window_start,
        window_end=window_end,
    )


def option_card_to_response(
    option_card: NormalizedOptionChainContract,
) -> schemas.OptionChainContractResponse:
    """Turn one validated internal option card into an API response card."""

    return schemas.OptionChainContractResponse(
        contract_symbol=option_card.contract_symbol,
        underlying_symbol=option_card.underlying_symbol,
        expiration_date=option_card.expiration_date,
        option_type=option_card.option_type,
        strike_price=option_card.strike_price,
        last_trade_price=option_card.last_trade_price,
        last_trade_size=option_card.last_trade_size,
        last_trade_timestamp=option_card.last_trade_timestamp,
        bid_price=option_card.bid_price,
        ask_price=option_card.ask_price,
        bid_size=option_card.bid_size,
        ask_size=option_card.ask_size,
        quote_timestamp=option_card.quote_timestamp,
        implied_volatility=option_card.implied_volatility,
        delta=option_card.delta,
        gamma=option_card.gamma,
        theta=option_card.theta,
        vega=option_card.vega,
        rho=option_card.rho,
    )


def empty_option_chain_side(
    option_type: Literal["call", "put"],
) -> schemas.OptionChainSideResponse:
    """Return an empty side when the user did not ask for it."""

    return schemas.OptionChainSideResponse(
        requested=False,
        option_type=option_type,
        contracts=[],
        contracts_returned=0,
        skipped_provider_contracts=0,
        provider_more_available=False,
        optionscope_truncated=False,
    )


def load_option_chain_side(
    alpaca: AlpacaClient,
    *,
    symbol: str,
    expiration_date: date,
    option_type: Literal["call", "put"],
    minimum_strike: Optional[Decimal],
    maximum_strike: Optional[Decimal],
    limit: int,
) -> schemas.OptionChainSideResponse:
    """Load, inspect, and clean one side of an option chain."""

    payload = alpaca.get_option_chain_page(
        symbol=symbol,
        expiration_date=expiration_date,
        option_type=option_type,
        limit=limit,
        minimum_strike=minimum_strike,
        maximum_strike=maximum_strike,
    )

    raw_snapshots = payload.get("snapshots", {})

    if not isinstance(raw_snapshots, Mapping):
        raw_snapshots = {}

    option_cards, skipped_contracts, optionscope_truncated = (
        normalize_chain_snapshot_mapping(
            raw_snapshots,
            underlying_symbol=symbol,
            expiration_date=expiration_date,
            option_type=option_type,
            limit=limit,
            minimum_strike=minimum_strike,
            maximum_strike=maximum_strike,
        )
    )

    return schemas.OptionChainSideResponse(
        requested=True,
        option_type=option_type,
        contracts=[
            option_card_to_response(option_card)
            for option_card in option_cards
        ],
        contracts_returned=len(option_cards),
        skipped_provider_contracts=skipped_contracts,
        provider_more_available=bool(
            payload.get("next_page_token")
        ),
        optionscope_truncated=optionscope_truncated,
    )


@app.get(
    "/market/options/{symbol}/chain",
    response_model=schemas.OptionChainResponse,
)
def get_option_chain(
    symbol: str,
    expiration_date: date = Query(
        ...,
        description="Required option expiration date in YYYY-MM-DD format.",
    ),
    option_type: Literal["call", "put", "all"] = Query(
        default="all",
        description="Return calls, puts, or both.",
    ),
    minimum_strike: Optional[Decimal] = Query(
        default=None,
        gt=0,
        description="Optional minimum strike price.",
    ),
    maximum_strike: Optional[Decimal] = Query(
        default=None,
        gt=0,
        description="Optional maximum strike price.",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
        description="Maximum contracts returned per requested side.",
    ),
) -> schemas.OptionChainResponse:
    """
    Return a validated, limited option chain for one ticker and expiration.

    The route never exposes Alpaca credentials, provider URLs, or page tokens.
    """

    normalized_symbol = normalize_ticker_symbol_for_api(symbol)

    try:
        safe_expiration_date = validate_expiration_date(
            expiration_date
        )

        safe_option_type = normalize_option_type(option_type)

        safe_minimum_strike, safe_maximum_strike = (
            validate_strike_range(
                minimum_strike,
                maximum_strike,
            )
        )

        safe_limit = validate_chain_limit(limit)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error

    alpaca = AlpacaClient()

    calls = empty_option_chain_side("call")
    puts = empty_option_chain_side("put")

    if safe_option_type in {"call", "all"}:
        calls = load_option_chain_side(
            alpaca,
            symbol=normalized_symbol,
            expiration_date=safe_expiration_date,
            option_type="call",
            minimum_strike=safe_minimum_strike,
            maximum_strike=safe_maximum_strike,
            limit=safe_limit,
        )

    if safe_option_type in {"put", "all"}:
        puts = load_option_chain_side(
            alpaca,
            symbol=normalized_symbol,
            expiration_date=safe_expiration_date,
            option_type="put",
            minimum_strike=safe_minimum_strike,
            maximum_strike=safe_maximum_strike,
            limit=safe_limit,
        )

    response_may_be_incomplete = (
        calls.provider_more_available
        or puts.provider_more_available
        or calls.optionscope_truncated
        or puts.optionscope_truncated
    )

    return schemas.OptionChainResponse(
        symbol=normalized_symbol,
        expiration_date=safe_expiration_date,
        requested_option_type=safe_option_type,
        minimum_strike=safe_minimum_strike,
        maximum_strike=safe_maximum_strike,
        limit_per_side=safe_limit,
        calls=calls,
        puts=puts,
        response_may_be_incomplete=response_may_be_incomplete,
        feed=alpaca.options_feed,
    )