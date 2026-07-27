import type { ApiDecimal } from "./api";
import type { EntryQuoteSource, PositionOutcome } from "./positionLens";

export function numberFromApiValue(value: ApiDecimal): number | null {
  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function formatCurrency(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsedValue);
}

export function formatCurrencyNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatOutcome(outcome: PositionOutcome): string {
  if (outcome.kind === "unlimited") {
    return "Unlimited";
  }

  if (outcome.kind === "unavailable") {
    return "—";
  }

  return formatCurrencyNumber(outcome.amount);
}

export function getQuoteSourceLabel(
  quoteSource: EntryQuoteSource,
): string {
  if (quoteSource === "ask") {
    return "using ask";
  }

  if (quoteSource === "bid") {
    return "using bid";
  }

  if (quoteSource === "last_trade") {
    return "using last trade";
  }

  return "quote unavailable";
}
