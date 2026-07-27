import type { ApiDecimal, OptionChainContract } from "./api";

export const STANDARD_EQUITY_OPTION_MULTIPLIER = 100;

export type PositionMode =
  | "long_call"
  | "short_call"
  | "long_put"
  | "short_put";

export type EntryQuoteSource =
  | "ask"
  | "bid"
  | "last_trade"
  | "unavailable";

export type PositionOutcome =
  | {
      kind: "money";
      amount: number;
    }
  | {
      kind: "unlimited";
    }
  | {
      kind: "unavailable";
    };

export interface EntryReference {
  kind: "debit" | "credit";
  quoteSource: EntryQuoteSource;
  pricePerShare: number | null;
  amountPerContract: number | null;
}

export interface PositionAnalysis {
  position: PositionMode;
  title: string;
  outlook: string;
  entry: EntryReference;
  breakEvenPrice: number | null;
  maximumProfit: PositionOutcome;
  maximumLoss: PositionOutcome;
  caution: string;
}

export function parsePositivePrice(value: ApiDecimal): number | null {
  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

export function getContractStrike(
  contract: OptionChainContract,
): number | null {
  return parsePositivePrice(contract.strike_price);
}

function isLongPosition(position: PositionMode): boolean {
  return position === "long_call" || position === "long_put";
}

function getExpectedOptionType(
  position: PositionMode,
): "call" | "put" {
  return position.endsWith("call") ? "call" : "put";
}

export function getUnavailableOutcome(): PositionOutcome {
  return {
    kind: "unavailable",
  };
}

export function getMoneyOutcome(amount: number): PositionOutcome {
  return {
    kind: "money",
    amount,
  };
}

export function getPositionLabel(position: PositionMode): string {
  const labels: Record<PositionMode, string> = {
    long_call: "Long Call",
    short_call: "Short Call",
    long_put: "Long Put",
    short_put: "Short Put",
  };

  return labels[position];
}

export function getPositionModesForContract(
  optionType: "call" | "put",
): PositionMode[] {
  if (optionType === "call") {
    return ["long_call", "short_call"];
  }

  return ["long_put", "short_put"];
}

export function getEntryReference(
  contract: OptionChainContract,
  position: PositionMode,
): EntryReference {
  const kind = isLongPosition(position) ? "debit" : "credit";

  const preferredQuote = isLongPosition(position)
    ? parsePositivePrice(contract.ask_price)
    : parsePositivePrice(contract.bid_price);

  if (preferredQuote !== null) {
    return {
      kind,
      quoteSource: isLongPosition(position) ? "ask" : "bid",
      pricePerShare: preferredQuote,
      amountPerContract:
        preferredQuote * STANDARD_EQUITY_OPTION_MULTIPLIER,
    };
  }

  const lastTradePrice = parsePositivePrice(
    contract.last_trade_price,
  );

  if (lastTradePrice !== null) {
    return {
      kind,
      quoteSource: "last_trade",
      pricePerShare: lastTradePrice,
      amountPerContract:
        lastTradePrice * STANDARD_EQUITY_OPTION_MULTIPLIER,
    };
  }

  return {
    kind,
    quoteSource: "unavailable",
    pricePerShare: null,
    amountPerContract: null,
  };
}

export function analyzeSingleOptionPosition(
  contract: OptionChainContract,
  position: PositionMode,
): PositionAnalysis {
  const expectedOptionType = getExpectedOptionType(position);

  if (contract.option_type !== expectedOptionType) {
    throw new Error(
      `${getPositionLabel(position)} does not match this ` +
        `${contract.option_type} contract.`,
    );
  }

  const strikePrice = getContractStrike(contract);
  const entry = getEntryReference(contract, position);

  if (
    strikePrice === null ||
    entry.pricePerShare === null ||
    entry.amountPerContract === null
  ) {
    return {
      position,
      title: getPositionLabel(position),
      outlook: "Unavailable until a usable option quote is available.",
      entry,
      breakEvenPrice: null,
      maximumProfit: getUnavailableOutcome(),
      maximumLoss:
        position === "short_call"
          ? {
              kind: "unlimited",
            }
          : getUnavailableOutcome(),
      caution:
        "OptionScope needs a usable bid, ask, or last-trade price " +
        "before it can estimate this position.",
    };
  }

  const premium = entry.pricePerShare;
  const entryAmount = entry.amountPerContract;

  if (position === "long_call") {
    return {
      position,
      title: "Long Call",
      outlook:
        "Bullish expiration outlook. This position benefits when " +
        "the underlying rises above the break-even price.",
      entry,
      breakEvenPrice: strikePrice + premium,
      maximumProfit: {
        kind: "unlimited",
      },
      maximumLoss: getMoneyOutcome(entryAmount),
      caution:
        "At expiration, the entire debit can be lost if the stock " +
        "finishes at or below the strike. Time decay, volatility, " +
        "fees, and early exercise are not modeled here.",
    };
  }

  if (position === "short_call") {
    return {
      position,
      title: "Short Call",
      outlook:
        "Neutral-to-bearish expiration outlook. This position keeps " +
        "its best result when the stock remains at or below the strike.",
      entry,
      breakEvenPrice: strikePrice + premium,
      maximumProfit: getMoneyOutcome(entryAmount),
      maximumLoss: {
        kind: "unlimited",
      },
      caution:
        "This is uncovered-short-call payoff analysis. Loss can be " +
        "unlimited if the stock rises. Assignment may occur before " +
        "expiration and account requirements are not modeled.",
    };
  }

  if (position === "long_put") {
    return {
      position,
      title: "Long Put",
      outlook:
        "Bearish expiration outlook. This position benefits when " +
        "the underlying falls below the break-even price.",
      entry,
      breakEvenPrice: strikePrice - premium,
      maximumProfit: getMoneyOutcome(
        Math.max(0, strikePrice - premium) *
          STANDARD_EQUITY_OPTION_MULTIPLIER,
      ),
      maximumLoss: getMoneyOutcome(entryAmount),
      caution:
        "Maximum profit assumes the underlying falls to zero at " +
        "expiration. Time decay, volatility, fees, and early exercise " +
        "are not modeled here.",
    };
  }

  return {
    position,
    title: "Short Put",
    outlook:
      "Neutral-to-bullish expiration outlook. This position keeps " +
      "its best result when the stock remains at or above the strike.",
    entry,
    breakEvenPrice: strikePrice - premium,
    maximumProfit: getMoneyOutcome(entryAmount),
    maximumLoss: getMoneyOutcome(
      Math.max(0, strikePrice - premium) *
        STANDARD_EQUITY_OPTION_MULTIPLIER,
    ),
    caution:
      "This is cash-secured-style expiration payoff analysis. The " +
      "maximum-loss estimate assumes the stock falls to zero, before " +
      "fees or other positions. Assignment may occur before expiration.",
  };
}