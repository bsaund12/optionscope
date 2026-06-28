from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.alpaca_client import AlpacaClient
from app.database import Base, database_is_available, engine, get_db


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

    normalized_symbol = symbol.strip().upper()

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

    normalized_symbol = symbol.strip().upper()

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

    normalized_symbol = symbol.strip().upper()

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

    normalized_symbol = symbol.strip().upper()

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