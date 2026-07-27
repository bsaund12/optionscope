import { describe, expect, it } from "vitest";

import type { ApiDecimal, OptionChainContract } from "./api";
import {
  analyzeVerticalSpread,
  getVerticalSpreadRequirements,
} from "./verticalSpreads";

interface ContractOverrides {
  underlying_symbol?: string;
  expiration_date?: string;
  option_type: "call" | "put";
  strike_price: string;
  bid_price?: ApiDecimal;
  ask_price?: ApiDecimal;
  last_trade_price?: ApiDecimal;
}

function makeContract(overrides: ContractOverrides): OptionChainContract {
  const contractType = overrides.option_type === "call" ? "C" : "P";

  return {
    contract_symbol: `TEST260731${contractType}${overrides.strike_price}`,
    underlying_symbol: overrides.underlying_symbol ?? "TEST",
    expiration_date: overrides.expiration_date ?? "2026-07-31",
    option_type: overrides.option_type,
    strike_price: overrides.strike_price,
    last_trade_price:
      overrides.last_trade_price !== undefined
        ? overrides.last_trade_price
        : "2.40",
    last_trade_size: 1,
    last_trade_timestamp: "2026-07-01T15:00:00Z",
    bid_price: overrides.bid_price !== undefined ? overrides.bid_price : "2.25",
    ask_price: overrides.ask_price !== undefined ? overrides.ask_price : "2.50",
    bid_size: 1,
    ask_size: 1,
    quote_timestamp: "2026-07-01T15:00:00Z",
    implied_volatility: null,
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    rho: null,
  };
}

describe("analyzeVerticalSpread", () => {
  it("calculates a bull call spread (long lower strike, short higher strike)", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "100",
      ask_price: "3.00",
      bid_price: "2.80",
    });
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "105",
      ask_price: "1.60",
      bid_price: "1.40",
    });

    const analysis = analyzeVerticalSpread("bull_call_spread", {
      longContract,
      shortContract,
    });

    expect(analysis.title).toBe("Bull Call Spread");
    expect(analysis.outlook).toBe("bullish");
    expect(analysis.strikeWidth).toBe(5);
    expect(analysis.entry.kind).toBe("debit");
    expect(analysis.entry.perShare).toBeCloseTo(1.6);
    expect(analysis.entry.perContract).toBeCloseTo(160);
    expect(analysis.breakEvenPrice).toBeCloseTo(101.6);
    expect(analysis.maximumProfit).toEqual({ kind: "money", amount: 340 });
    expect(analysis.maximumLoss).toEqual({ kind: "money", amount: 160 });
  });

  it("calculates a bear call spread (short lower strike, long higher strike)", () => {
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "100",
      ask_price: "3.00",
      bid_price: "2.80",
    });
    const longContract = makeContract({
      option_type: "call",
      strike_price: "105",
      ask_price: "1.60",
      bid_price: "1.40",
    });

    const analysis = analyzeVerticalSpread("bear_call_spread", {
      longContract,
      shortContract,
    });

    expect(analysis.title).toBe("Bear Call Spread");
    expect(analysis.outlook).toBe("bearish");
    expect(analysis.strikeWidth).toBe(5);
    expect(analysis.entry.kind).toBe("credit");
    expect(analysis.entry.perShare).toBeCloseTo(1.2);
    expect(analysis.entry.perContract).toBeCloseTo(120);
    expect(analysis.breakEvenPrice).toBeCloseTo(101.2);
    expect(analysis.maximumProfit.kind).toBe("money");
    expect(
      (analysis.maximumProfit as { kind: "money"; amount: number }).amount,
    ).toBeCloseTo(120);
    expect(analysis.maximumLoss.kind).toBe("money");
    expect(
      (analysis.maximumLoss as { kind: "money"; amount: number }).amount,
    ).toBeCloseTo(380);
  });

  it("calculates a bear put spread (long higher strike, short lower strike)", () => {
    const longContract = makeContract({
      option_type: "put",
      strike_price: "110",
      ask_price: "4.50",
      bid_price: "4.20",
    });
    const shortContract = makeContract({
      option_type: "put",
      strike_price: "105",
      ask_price: "2.30",
      bid_price: "2.00",
    });

    const analysis = analyzeVerticalSpread("bear_put_spread", {
      longContract,
      shortContract,
    });

    expect(analysis.title).toBe("Bear Put Spread");
    expect(analysis.outlook).toBe("bearish");
    expect(analysis.strikeWidth).toBe(5);
    expect(analysis.entry.kind).toBe("debit");
    expect(analysis.entry.perShare).toBeCloseTo(2.5);
    expect(analysis.entry.perContract).toBeCloseTo(250);
    expect(analysis.breakEvenPrice).toBeCloseTo(107.5);
    expect(analysis.maximumProfit).toEqual({ kind: "money", amount: 250 });
    expect(analysis.maximumLoss).toEqual({ kind: "money", amount: 250 });
  });

  it("calculates a bull put spread (short higher strike, long lower strike)", () => {
    const shortContract = makeContract({
      option_type: "put",
      strike_price: "110",
      ask_price: "4.50",
      bid_price: "4.20",
    });
    const longContract = makeContract({
      option_type: "put",
      strike_price: "105",
      ask_price: "2.30",
      bid_price: "2.00",
    });

    const analysis = analyzeVerticalSpread("bull_put_spread", {
      longContract,
      shortContract,
    });

    expect(analysis.title).toBe("Bull Put Spread");
    expect(analysis.outlook).toBe("bullish");
    expect(analysis.strikeWidth).toBe(5);
    expect(analysis.entry.kind).toBe("credit");
    expect(analysis.entry.perShare).toBeCloseTo(1.9);
    expect(analysis.entry.perContract).toBeCloseTo(190);
    expect(analysis.breakEvenPrice).toBeCloseTo(108.1);
    expect(analysis.maximumProfit.kind).toBe("money");
    expect(
      (analysis.maximumProfit as { kind: "money"; amount: number }).amount,
    ).toBeCloseTo(190);
    expect(analysis.maximumLoss.kind).toBe("money");
    expect(
      (analysis.maximumLoss as { kind: "money"; amount: number }).amount,
    ).toBeCloseTo(310);
  });

  it("rejects legs with the same strike price", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "100",
    });
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "100",
    });

    expect(() =>
      analyzeVerticalSpread("bull_call_spread", {
        longContract,
        shortContract,
      }),
    ).toThrow("different strike prices");
  });

  it("rejects legs with different expiration dates", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "100",
      expiration_date: "2026-07-31",
    });
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "105",
      expiration_date: "2026-08-21",
    });

    expect(() =>
      analyzeVerticalSpread("bull_call_spread", {
        longContract,
        shortContract,
      }),
    ).toThrow("expiration date");
  });

  it("rejects legs with different underlying symbols", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "100",
      underlying_symbol: "AAA",
    });
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "105",
      underlying_symbol: "BBB",
    });

    expect(() =>
      analyzeVerticalSpread("bull_call_spread", {
        longContract,
        shortContract,
      }),
    ).toThrow("underlying symbol");
  });

  it("rejects a call-and-put leg mismatch", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "100",
    });
    const shortContract = makeContract({
      option_type: "put",
      strike_price: "105",
    });

    expect(() =>
      analyzeVerticalSpread("bull_call_spread", {
        longContract,
        shortContract,
      }),
    ).toThrow("same option type");
  });

  it("rejects invalid leg ordering for the selected strategy", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "105",
    });
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "100",
    });

    expect(() =>
      analyzeVerticalSpread("bull_call_spread", {
        longContract,
        shortContract,
      }),
    ).toThrow("requires the long leg to be the lower-strike contract");
  });

  it("returns an unavailable analysis when a leg has no usable quote", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "100",
      ask_price: null,
      bid_price: null,
      last_trade_price: null,
    });
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "105",
      ask_price: "1.60",
      bid_price: "1.40",
    });

    const analysis = analyzeVerticalSpread("bull_call_spread", {
      longContract,
      shortContract,
    });

    expect(analysis.entry.perShare).toBeNull();
    expect(analysis.entry.perContract).toBeNull();
    expect(analysis.entry.longLeg.quoteSource).toBe("unavailable");
    expect(analysis.breakEvenPrice).toBeNull();
    expect(analysis.maximumProfit).toEqual({ kind: "unavailable" });
    expect(analysis.maximumLoss).toEqual({ kind: "unavailable" });
    expect(analysis.strikeWidth).toBe(5);
  });

  it("returns an unavailable analysis when debit-spread quotes produce a zero or negative net debit", () => {
    const longContract = makeContract({
      option_type: "call",
      strike_price: "100",
      ask_price: "1.20",
      bid_price: "1.00",
    });
    const shortContract = makeContract({
      option_type: "call",
      strike_price: "105",
      ask_price: "1.60",
      bid_price: "1.40",
    });

    const analysis = analyzeVerticalSpread("bull_call_spread", {
      longContract,
      shortContract,
    });

    expect(analysis.entry.perShare).toBeNull();
    expect(analysis.entry.perContract).toBeNull();
    expect(analysis.breakEvenPrice).toBeNull();
    expect(analysis.maximumProfit).toEqual({ kind: "unavailable" });
    expect(analysis.maximumLoss).toEqual({ kind: "unavailable" });
    expect(analysis.caution).toMatch(/invalid or inverted/);
    expect(analysis.strikeWidth).toBe(5);
  });

  it("returns an unavailable analysis when credit-spread quotes produce a zero or negative net credit", () => {
    const shortContract = makeContract({
      option_type: "put",
      strike_price: "110",
      ask_price: "2.00",
      bid_price: "1.80",
    });
    const longContract = makeContract({
      option_type: "put",
      strike_price: "105",
      ask_price: "2.30",
      bid_price: "2.00",
    });

    const analysis = analyzeVerticalSpread("bull_put_spread", {
      longContract,
      shortContract,
    });

    expect(analysis.entry.perShare).toBeNull();
    expect(analysis.entry.perContract).toBeNull();
    expect(analysis.breakEvenPrice).toBeNull();
    expect(analysis.maximumProfit).toEqual({ kind: "unavailable" });
    expect(analysis.maximumLoss).toEqual({ kind: "unavailable" });
    expect(analysis.caution).toMatch(/invalid or inverted/);
    expect(analysis.strikeWidth).toBe(5);
  });
});

describe("getVerticalSpreadRequirements", () => {
  it("describes a bull call spread as a debit call strategy with a lower-strike long leg", () => {
    expect(getVerticalSpreadRequirements("bull_call_spread")).toEqual({
      title: "Bull Call Spread",
      optionType: "call",
      outlook: "bullish",
      entryKind: "debit",
      longStrikePosition: "lower",
    });
  });

  it("describes a bear call spread as a credit call strategy with a higher-strike long leg", () => {
    expect(getVerticalSpreadRequirements("bear_call_spread")).toEqual({
      title: "Bear Call Spread",
      optionType: "call",
      outlook: "bearish",
      entryKind: "credit",
      longStrikePosition: "higher",
    });
  });

  it("describes a bear put spread as a debit put strategy with a higher-strike long leg", () => {
    expect(getVerticalSpreadRequirements("bear_put_spread")).toEqual({
      title: "Bear Put Spread",
      optionType: "put",
      outlook: "bearish",
      entryKind: "debit",
      longStrikePosition: "higher",
    });
  });

  it("describes a bull put spread as a credit put strategy with a lower-strike long leg", () => {
    expect(getVerticalSpreadRequirements("bull_put_spread")).toEqual({
      title: "Bull Put Spread",
      optionType: "put",
      outlook: "bullish",
      entryKind: "credit",
      longStrikePosition: "lower",
    });
  });
});
