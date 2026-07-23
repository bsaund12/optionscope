import { describe, expect, it } from "vitest";

import type { OptionChainContract } from "./api";
import {
  analyzeSingleOptionPosition,
  STANDARD_EQUITY_OPTION_MULTIPLIER,
} from "./positionLens";

function makeContract(
  optionType: "call" | "put",
): OptionChainContract {
  const contractType = optionType === "call" ? "C" : "P";

  return {
    contract_symbol: `TEST260731${contractType}00100000`,
    underlying_symbol: "TEST",
    expiration_date: "2026-07-31",
    option_type: optionType,
    strike_price: "100",
    last_trade_price: "2.40",
    last_trade_size: 1,
    last_trade_timestamp: "2026-07-01T15:00:00Z",
    bid_price: "2.25",
    ask_price: "2.50",
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

describe("analyzeSingleOptionPosition", () => {
  it("calculates a long call using the ask as a debit reference", () => {
    const analysis = analyzeSingleOptionPosition(
      makeContract("call"),
      "long_call",
    );

    expect(analysis.entry.quoteSource).toBe("ask");
    expect(analysis.entry.amountPerContract).toBe(
      2.5 * STANDARD_EQUITY_OPTION_MULTIPLIER,
    );
    expect(analysis.breakEvenPrice).toBe(102.5);
    expect(analysis.maximumProfit).toEqual({
      kind: "unlimited",
    });
    expect(analysis.maximumLoss).toEqual({
      kind: "money",
      amount: 250,
    });
  });

  it("calculates a short call using the bid as a credit reference", () => {
    const analysis = analyzeSingleOptionPosition(
      makeContract("call"),
      "short_call",
    );

    expect(analysis.entry.quoteSource).toBe("bid");
    expect(analysis.breakEvenPrice).toBe(102.25);
    expect(analysis.maximumProfit).toEqual({
      kind: "money",
      amount: 225,
    });
    expect(analysis.maximumLoss).toEqual({
      kind: "unlimited",
    });
  });

  it("calculates long-put payoff limits at expiration", () => {
    const analysis = analyzeSingleOptionPosition(
      makeContract("put"),
      "long_put",
    );

    expect(analysis.breakEvenPrice).toBe(97.5);
    expect(analysis.maximumProfit).toEqual({
      kind: "money",
      amount: 9750,
    });
    expect(analysis.maximumLoss).toEqual({
      kind: "money",
      amount: 250,
    });
  });

  it("calculates short-put payoff limits at expiration", () => {
    const analysis = analyzeSingleOptionPosition(
      makeContract("put"),
      "short_put",
    );

    expect(analysis.breakEvenPrice).toBe(97.75);
    expect(analysis.maximumProfit).toEqual({
      kind: "money",
      amount: 225,
    });
    expect(analysis.maximumLoss).toEqual({
      kind: "money",
      amount: 9775,
    });
  });

  it("rejects a position that does not match the selected contract", () => {
    expect(() =>
      analyzeSingleOptionPosition(
        makeContract("call"),
        "long_put",
      ),
    ).toThrow("does not match");
  });
});