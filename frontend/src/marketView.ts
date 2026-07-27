import type { ApiDecimal, OptionChainContract } from "./api";
import { numberFromApiValue } from "./format";

export function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  const sign = parsedValue > 0 ? "+" : "";

  return `${sign}${parsedValue.toFixed(2)}%`;
}

export function formatImpliedVolatility(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  return `${(parsedValue * 100).toFixed(2)}%`;
}

export function formatGreek(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  return parsedValue.toFixed(4);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getDefaultStrikeWindow(referencePrice: ApiDecimal): {
  minimumStrike: string;
  maximumStrike: string;
} {
  const price = numberFromApiValue(referencePrice);

  if (price === null || price <= 0) {
    return {
      minimumStrike: "",
      maximumStrike: "",
    };
  }

  const strikeStep = price < 20 ? 1 : price < 100 ? 2.5 : 5;

  const minimumStrike = Math.max(
    strikeStep,
    Math.floor((price * 0.9) / strikeStep) * strikeStep,
  );

  const maximumStrike =
    Math.ceil((price * 1.1) / strikeStep) * strikeStep;

  return {
    minimumStrike: String(minimumStrike),
    maximumStrike: String(maximumStrike),
  };
}

export type Moneyness = "itm" | "atm" | "otm" | "unknown";

export function getDirectionalClass(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null || parsedValue === 0) {
    return "metric-value--neutral";
  }

  return parsedValue > 0
    ? "metric-value--positive"
    : "metric-value--negative";
}

export function classifyMoneyness(
  contract: OptionChainContract,
  underlyingPrice: ApiDecimal,
): Moneyness {
  const currentPrice = numberFromApiValue(underlyingPrice);
  const strikePrice = numberFromApiValue(contract.strike_price);

  if (
    currentPrice === null ||
    currentPrice <= 0 ||
    strikePrice === null
  ) {
    return "unknown";
  }

  const atmTolerance = Math.max(0.5, currentPrice * 0.003);

  if (Math.abs(strikePrice - currentPrice) <= atmTolerance) {
    return "atm";
  }

  if (contract.option_type === "call") {
    return strikePrice < currentPrice ? "itm" : "otm";
  }

  return strikePrice > currentPrice ? "itm" : "otm";
}

export function getMoneynessLabel(moneyness: Moneyness): string {
  if (moneyness === "itm") {
    return "ITM";
  }

  if (moneyness === "atm") {
    return "ATM";
  }

  if (moneyness === "otm") {
    return "OTM";
  }

  return "—";
}
