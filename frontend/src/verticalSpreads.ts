import type { OptionChainContract } from "./api";
import {
  STANDARD_EQUITY_OPTION_MULTIPLIER,
  getContractStrike,
  getEntryReference,
  getMoneyOutcome,
  getUnavailableOutcome,
  type EntryReference,
  type PositionOutcome,
} from "./positionLens";

export type VerticalSpreadStrategy =
  | "bull_call_spread"
  | "bear_call_spread"
  | "bear_put_spread"
  | "bull_put_spread";

export interface VerticalSpreadLegs {
  longContract: OptionChainContract;
  shortContract: OptionChainContract;
}

export interface VerticalSpreadEntry {
  kind: "debit" | "credit";
  perShare: number | null;
  perContract: number | null;
  longLeg: EntryReference;
  shortLeg: EntryReference;
}

export interface VerticalSpreadAnalysis {
  strategy: VerticalSpreadStrategy;
  title: string;
  outlook: "bullish" | "bearish";
  strikeWidth: number;
  entry: VerticalSpreadEntry;
  breakEvenPrice: number | null;
  maximumProfit: PositionOutcome;
  maximumLoss: PositionOutcome;
  caution: string;
}

interface VerticalSpreadDefinition {
  title: string;
  optionType: "call" | "put";
  outlook: "bullish" | "bearish";
  entryKind: "debit" | "credit";
  longStrikePosition: "lower" | "higher";
  caution: string;
}

const VERTICAL_SPREAD_DEFINITIONS: Record<
  VerticalSpreadStrategy,
  VerticalSpreadDefinition
> = {
  bull_call_spread: {
    title: "Bull Call Spread",
    optionType: "call",
    outlook: "bullish",
    entryKind: "debit",
    longStrikePosition: "lower",
    caution:
      "This is an expiration-only estimate. It assumes both legs are " +
      "held to expiration and ignores time decay, volatility changes, " +
      "fees, and early assignment on the short leg.",
  },
  bear_call_spread: {
    title: "Bear Call Spread",
    optionType: "call",
    outlook: "bearish",
    entryKind: "credit",
    longStrikePosition: "higher",
    caution:
      "This is an expiration-only estimate. It assumes both legs are " +
      "held to expiration and ignores time decay, volatility changes, " +
      "fees, and early assignment on the short leg.",
  },
  bear_put_spread: {
    title: "Bear Put Spread",
    optionType: "put",
    outlook: "bearish",
    entryKind: "debit",
    longStrikePosition: "higher",
    caution:
      "This is an expiration-only estimate. It assumes both legs are " +
      "held to expiration and ignores time decay, volatility changes, " +
      "fees, and early assignment on the short leg.",
  },
  bull_put_spread: {
    title: "Bull Put Spread",
    optionType: "put",
    outlook: "bullish",
    entryKind: "credit",
    longStrikePosition: "lower",
    caution:
      "This is an expiration-only estimate. It assumes both legs are " +
      "held to expiration and ignores time decay, volatility changes, " +
      "fees, and early assignment on the short leg.",
  },
};

export function getVerticalSpreadLabel(
  strategy: VerticalSpreadStrategy,
): string {
  return VERTICAL_SPREAD_DEFINITIONS[strategy].title;
}

export interface VerticalSpreadRequirements {
  title: string;
  optionType: "call" | "put";
  outlook: "bullish" | "bearish";
  entryKind: "debit" | "credit";
  longStrikePosition: "lower" | "higher";
}

export function getVerticalSpreadRequirements(
  strategy: VerticalSpreadStrategy,
): VerticalSpreadRequirements {
  const definition = VERTICAL_SPREAD_DEFINITIONS[strategy];

  return {
    title: definition.title,
    optionType: definition.optionType,
    outlook: definition.outlook,
    entryKind: definition.entryKind,
    longStrikePosition: definition.longStrikePosition,
  };
}

function assertSameUnderlying(
  longContract: OptionChainContract,
  shortContract: OptionChainContract,
): void {
  if (longContract.underlying_symbol !== shortContract.underlying_symbol) {
    throw new Error(
      "Both legs of a vertical spread must share the same underlying " +
        `symbol. Received ${longContract.underlying_symbol} and ` +
        `${shortContract.underlying_symbol}.`,
    );
  }
}

function assertSameExpiration(
  longContract: OptionChainContract,
  shortContract: OptionChainContract,
): void {
  if (longContract.expiration_date !== shortContract.expiration_date) {
    throw new Error(
      "Both legs of a vertical spread must share the same expiration " +
        `date. Received ${longContract.expiration_date} and ` +
        `${shortContract.expiration_date}.`,
    );
  }
}

function assertSameOptionType(
  longContract: OptionChainContract,
  shortContract: OptionChainContract,
): void {
  if (longContract.option_type !== shortContract.option_type) {
    throw new Error(
      "Both legs of a vertical spread must be the same option type. " +
        `Received a ${longContract.option_type} and a ` +
        `${shortContract.option_type}.`,
    );
  }
}

function assertMatchesStrategyOptionType(
  definition: VerticalSpreadDefinition,
  longContract: OptionChainContract,
): void {
  if (longContract.option_type !== definition.optionType) {
    throw new Error(
      `${definition.title} requires ${definition.optionType} contracts, ` +
        `but ${longContract.option_type} contracts were provided.`,
    );
  }
}

interface ValidatedStrikes {
  lowerStrike: number;
  higherStrike: number;
}

function assertValidStrikeArrangement(
  definition: VerticalSpreadDefinition,
  longContract: OptionChainContract,
  shortContract: OptionChainContract,
): ValidatedStrikes {
  const longStrike = getContractStrike(longContract);
  const shortStrike = getContractStrike(shortContract);

  if (longStrike === null || shortStrike === null) {
    throw new Error(
      "Both legs of a vertical spread must have a valid strike price.",
    );
  }

  if (longStrike === shortStrike) {
    throw new Error(
      "The two legs must have different strike prices to form a " +
        "vertical spread.",
    );
  }

  const lowerStrike = Math.min(longStrike, shortStrike);
  const higherStrike = Math.max(longStrike, shortStrike);
  const longIsLowerStrike = longStrike === lowerStrike;
  const expectsLongAsLowerStrike = definition.longStrikePosition === "lower";

  if (longIsLowerStrike !== expectsLongAsLowerStrike) {
    throw new Error(
      `${definition.title} requires the long leg to be the ` +
        `${definition.longStrikePosition}-strike contract.`,
    );
  }

  return { lowerStrike, higherStrike };
}

export function analyzeVerticalSpread(
  strategy: VerticalSpreadStrategy,
  legs: VerticalSpreadLegs,
): VerticalSpreadAnalysis {
  const definition = VERTICAL_SPREAD_DEFINITIONS[strategy];
  const { longContract, shortContract } = legs;

  assertSameUnderlying(longContract, shortContract);
  assertSameExpiration(longContract, shortContract);
  assertSameOptionType(longContract, shortContract);
  assertMatchesStrategyOptionType(definition, longContract);

  const { lowerStrike, higherStrike } = assertValidStrikeArrangement(
    definition,
    longContract,
    shortContract,
  );
  const strikeWidth = higherStrike - lowerStrike;

  const longPositionMode =
    definition.optionType === "call" ? "long_call" : "long_put";
  const shortPositionMode =
    definition.optionType === "call" ? "short_call" : "short_put";

  const longLeg = getEntryReference(longContract, longPositionMode);
  const shortLeg = getEntryReference(shortContract, shortPositionMode);

  if (
    longLeg.pricePerShare === null ||
    shortLeg.pricePerShare === null ||
    longLeg.amountPerContract === null ||
    shortLeg.amountPerContract === null
  ) {
    return {
      strategy,
      title: definition.title,
      outlook: definition.outlook,
      strikeWidth,
      entry: {
        kind: definition.entryKind,
        perShare: null,
        perContract: null,
        longLeg,
        shortLeg,
      },
      breakEvenPrice: null,
      maximumProfit: getUnavailableOutcome(),
      maximumLoss: getUnavailableOutcome(),
      caution:
        "OptionScope needs a usable bid, ask, or last-trade price on " +
        "both legs before it can estimate this spread.",
    };
  }

  const netPerShare =
    definition.entryKind === "debit"
      ? longLeg.pricePerShare - shortLeg.pricePerShare
      : shortLeg.pricePerShare - longLeg.pricePerShare;

  if (netPerShare <= 0) {
    return {
      strategy,
      title: definition.title,
      outlook: definition.outlook,
      strikeWidth,
      entry: {
        kind: definition.entryKind,
        perShare: null,
        perContract: null,
        longLeg,
        shortLeg,
      },
      breakEvenPrice: null,
      maximumProfit: getUnavailableOutcome(),
      maximumLoss: getUnavailableOutcome(),
      caution:
        `The available leg quotes produced a net ${definition.entryKind} ` +
        `of $${netPerShare.toFixed(2)} per share, which is an invalid or ` +
        `inverted price for a ${definition.title}. OptionScope will not ` +
        "estimate break-even, maximum profit, or maximum loss from " +
        "quotes like this.",
    };
  }

  const netPerContract = netPerShare * STANDARD_EQUITY_OPTION_MULTIPLIER;

  const breakEvenPrice =
    definition.optionType === "call"
      ? lowerStrike + netPerShare
      : higherStrike - netPerShare;

  const maximumProfitPerShare =
    definition.entryKind === "debit" ? strikeWidth - netPerShare : netPerShare;
  const maximumLossPerShare =
    definition.entryKind === "debit" ? netPerShare : strikeWidth - netPerShare;

  return {
    strategy,
    title: definition.title,
    outlook: definition.outlook,
    strikeWidth,
    entry: {
      kind: definition.entryKind,
      perShare: netPerShare,
      perContract: netPerContract,
      longLeg,
      shortLeg,
    },
    breakEvenPrice,
    maximumProfit: getMoneyOutcome(
      maximumProfitPerShare * STANDARD_EQUITY_OPTION_MULTIPLIER,
    ),
    maximumLoss: getMoneyOutcome(
      maximumLossPerShare * STANDARD_EQUITY_OPTION_MULTIPLIER,
    ),
    caution: definition.caution,
  };
}
