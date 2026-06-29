import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal, Mapping, Optional
from app.validation import normalize_ticker_symbol, validate_strike_range


MAX_CHAIN_RESULT_LIMIT = 100

OptionType = Literal["call", "put", "all"]

OCC_OPTION_SYMBOL_PATTERN = re.compile(
    r"^(?P<root>[A-Z0-9.\-]+)"
    r"(?P<expiration>\d{6})"
    r"(?P<contract_type>[CP])"
    r"(?P<strike>\d{8})$"
)


@dataclass(frozen=True)
class ParsedOptionContract:
    """The important pieces read from an OCC-style option symbol."""

    contract_symbol: str
    underlying_symbol: str
    expiration_date: date
    option_type: Literal["call", "put"]
    strike_price: Decimal


@dataclass(frozen=True)
class NormalizedOptionChainContract:
    """
    A clean option-contract card built from Alpaca's raw snapshot data.

    Missing provider values stay as None instead of being invented.
    """

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


def normalize_option_type(value: str) -> OptionType:
    """Allow only call, put, or all for OptionScope chain requests."""

    if not isinstance(value, str):
        raise ValueError("Option type must be text.")

    normalized_value = value.strip().lower()

    if normalized_value == "call":
        return "call"

    if normalized_value == "put":
        return "put"

    if normalized_value == "all":
        return "all"

    raise ValueError(
        "Option type must be 'call', 'put', or 'all'."
    )


def validate_chain_limit(value: int) -> int:
    """Keep a single OptionScope chain response intentionally small."""

    if value < 1:
        raise ValueError("Result limit must be at least 1.")

    if value > MAX_CHAIN_RESULT_LIMIT:
        raise ValueError(
            f"Result limit cannot be greater than "
            f"{MAX_CHAIN_RESULT_LIMIT}."
        )

    return value


def to_decimal_or_none(value: Any) -> Optional[Decimal]:
    """Convert a provider number into Decimal without guessing."""

    if value is None:
        return None

    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def to_int_or_none(value: Any) -> Optional[int]:
    """Convert a provider whole-number value safely."""

    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def to_datetime_or_none(value: Any) -> Optional[datetime]:
    """Convert an ISO timestamp safely, or return None if it is invalid."""

    if not isinstance(value, str):
        return None

    cleaned_value = value.strip()

    if not cleaned_value:
        return None

    try:
        return datetime.fromisoformat(
            cleaned_value.replace("Z", "+00:00")
        )
    except ValueError:
        return None


def parse_occ_option_symbol(contract_symbol: str) -> ParsedOptionContract:
    """
    Parse an OCC-style option contract symbol.

    Example:
    TSM260717C00450000
    └─┬─┘└──┬──┘└┬┘└───┬───┘
      root  date  type   strike
    """

    normalized_symbol = contract_symbol.strip().upper()

    match = OCC_OPTION_SYMBOL_PATTERN.fullmatch(normalized_symbol)

    if match is None:
        raise ValueError(
            f"Unsupported option contract symbol: '{contract_symbol}'."
        )

    expiration_text = match.group("expiration")
    strike_text = match.group("strike")
    contract_type = match.group("contract_type")

    try:
        expiration_date = date(
            year=2000 + int(expiration_text[0:2]),
            month=int(expiration_text[2:4]),
            day=int(expiration_text[4:6]),
        )
    except ValueError as error:
        raise ValueError(
            f"Option contract has an invalid expiration date: "
            f"'{contract_symbol}'."
        ) from error

    option_type: Literal["call", "put"]

    if contract_type == "C":
        option_type = "call"
    else:
        option_type = "put"

    strike_price = Decimal(strike_text) / Decimal("1000")

    return ParsedOptionContract(
        contract_symbol=normalized_symbol,
        underlying_symbol=match.group("root"),
        expiration_date=expiration_date,
        option_type=option_type,
        strike_price=strike_price,
    )


def contract_matches_chain_request(
    contract: ParsedOptionContract,
    *,
    underlying_symbol: str,
    expiration_date: date,
    option_type: OptionType,
) -> bool:
    """
    Confirm that provider data matches the chain request we made.

    This stops us from showing a contract from a different stock,
    expiration date, or option type.
    """

    normalized_underlying_symbol = underlying_symbol.strip().upper()

    if contract.underlying_symbol != normalized_underlying_symbol:
        return False

    if contract.expiration_date != expiration_date:
        return False

    if option_type == "all":
        return True

    return contract.option_type == option_type


def normalize_option_chain_snapshot(
    contract: ParsedOptionContract,
    raw_snapshot: Mapping[str, Any],
) -> NormalizedOptionChainContract:
    """
    Turn one raw Alpaca contract snapshot into a clean OptionScope card.
    """

    latest_trade = raw_snapshot.get("latestTrade")

    if not isinstance(latest_trade, Mapping):
        latest_trade = {}

    latest_quote = raw_snapshot.get("latestQuote")

    if not isinstance(latest_quote, Mapping):
        latest_quote = {}

    greeks = raw_snapshot.get("greeks")

    if not isinstance(greeks, Mapping):
        greeks = {}

    return NormalizedOptionChainContract(
        contract_symbol=contract.contract_symbol,
        underlying_symbol=contract.underlying_symbol,
        expiration_date=contract.expiration_date,
        option_type=contract.option_type,
        strike_price=contract.strike_price,

        last_trade_price=to_decimal_or_none(latest_trade.get("p")),
        last_trade_size=to_int_or_none(latest_trade.get("s")),
        last_trade_timestamp=to_datetime_or_none(latest_trade.get("t")),

        bid_price=to_decimal_or_none(latest_quote.get("bp")),
        ask_price=to_decimal_or_none(latest_quote.get("ap")),
        bid_size=to_int_or_none(latest_quote.get("bs")),
        ask_size=to_int_or_none(latest_quote.get("as")),
        quote_timestamp=to_datetime_or_none(latest_quote.get("t")),

        implied_volatility=to_decimal_or_none(
            raw_snapshot.get("impliedVolatility")
        ),

        delta=to_decimal_or_none(greeks.get("delta")),
        gamma=to_decimal_or_none(greeks.get("gamma")),
        theta=to_decimal_or_none(greeks.get("theta")),
        vega=to_decimal_or_none(greeks.get("vega")),
        rho=to_decimal_or_none(greeks.get("rho")),
    )

def normalize_chain_snapshot_mapping(
    raw_snapshots: Mapping[str, Any],
    *,
    underlying_symbol: str,
    expiration_date: date,
    option_type: Literal["call", "put"],
    limit: int,
    minimum_strike: Optional[Decimal] = None,
    maximum_strike: Optional[Decimal] = None,
) -> tuple[list[NormalizedOptionChainContract], int, bool]:
    """
    Inspect and normalize raw provider contracts before returning them.

    Returns:
    - clean option cards
    - number of contracts skipped as invalid or mismatched
    - whether OptionScope applied its own result cap
    """

    if option_type not in {"call", "put"}:
        raise ValueError(
            "Option type must be 'call' or 'put' for one chain side."
        )

    normalized_underlying_symbol = normalize_ticker_symbol(
        underlying_symbol
    )

    minimum_strike, maximum_strike = validate_strike_range(
        minimum_strike,
        maximum_strike,
    )

    safe_limit = validate_chain_limit(limit)

    option_cards: list[NormalizedOptionChainContract] = []
    skipped_contracts = 0

    for raw_contract_symbol, raw_snapshot in raw_snapshots.items():
        if not isinstance(raw_contract_symbol, str):
            skipped_contracts += 1
            continue

        if not isinstance(raw_snapshot, Mapping):
            skipped_contracts += 1
            continue

        try:
            contract = parse_occ_option_symbol(raw_contract_symbol)
        except ValueError:
            skipped_contracts += 1
            continue

        if not contract_matches_chain_request(
            contract,
            underlying_symbol=normalized_underlying_symbol,
            expiration_date=expiration_date,
            option_type=option_type,
        ):
            skipped_contracts += 1
            continue

        if (
            minimum_strike is not None
            and contract.strike_price < minimum_strike
        ):
            skipped_contracts += 1
            continue

        if (
            maximum_strike is not None
            and contract.strike_price > maximum_strike
        ):
            skipped_contracts += 1
            continue

        option_cards.append(
            normalize_option_chain_snapshot(
                contract,
                raw_snapshot,
            )
        )

    option_cards.sort(
        key=lambda option_card: (
            option_card.strike_price,
            option_card.contract_symbol,
        )
    )

    truncated_by_optionscope = len(option_cards) > safe_limit

    return (
        option_cards[:safe_limit],
        skipped_contracts,
        truncated_by_optionscope,
    )