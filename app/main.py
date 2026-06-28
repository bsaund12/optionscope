from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
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