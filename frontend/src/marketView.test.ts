import { describe, expect, it } from "vitest";

import type { OptionChainContract } from "./api";
import {
  classifyMoneyness,
  formatDate,
  formatGreek,
  formatImpliedVolatility,
  formatNumber,
  formatPercent,
  formatTimestamp,
  getDefaultStrikeWindow,
  getDirectionalClass,
  getMoneynessLabel,
} from "./marketView";

function makeContract(overrides: {
  option_type: "call" | "put";
  strike_price: string;
}): OptionChainContract {
  const contractType = overrides.option_type === "call" ? "C" : "P";

  return {
    contract_symbol: `TEST260731${contractType}${overrides.strike_price}`,
    underlying_symbol: "TEST",
    expiration_date: "2026-07-31",
    option_type: overrides.option_type,
    strike_price: overrides.strike_price,
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

describe("formatNumber", () => {
  it("returns an em dash for null", () => {
    expect(formatNumber(null)).toBe("—");
  });

  it("formats an integer with en-US thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("formatPercent", () => {
  it("returns an em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("prefixes a plus sign for a positive value", () => {
    expect(formatPercent("2.25")).toBe("+2.25%");
  });

  it("retains the negative sign for a negative value", () => {
    expect(formatPercent("-1.5")).toBe("-1.50%");
  });

  it("has no plus sign for zero", () => {
    expect(formatPercent("0")).toBe("0.00%");
  });
});

describe("formatImpliedVolatility", () => {
  it("returns an em dash for null", () => {
    expect(formatImpliedVolatility(null)).toBe("—");
  });

  it("converts a decimal value to a percentage", () => {
    expect(formatImpliedVolatility("0.35")).toBe("35.00%");
  });
});

describe("formatGreek", () => {
  it("returns an em dash for null", () => {
    expect(formatGreek(null)).toBe("—");
  });

  it("displays values to four decimal places", () => {
    expect(formatGreek("-0.05")).toBe("-0.0500");
  });
});

describe("formatDate", () => {
  it("formats a YYYY-MM-DD value as an en-US date", () => {
    expect(formatDate("2026-08-21")).toBe("Aug 21, 2026");
  });
});

describe("formatTimestamp", () => {
  it("returns an em dash for null", () => {
    expect(formatTimestamp(null)).toBe("—");
  });

  it("formats a non-null timestamp as a month, day, and time", () => {
    // Avoids a timezone-brittle assertion: the exact hour depends on the
    // machine running the test, so this only pins the stable shape (month
    // abbreviation, day, and a 12-hour time with AM/PM).
    const result = formatTimestamp("2026-07-27T15:30:00Z");

    expect(result).toMatch(/^[A-Za-z]{3} \d{1,2}, \d{1,2}:\d{2}\s?[AP]M$/);
    expect(result).toContain("Jul 27");
  });
});

describe("getDefaultStrikeWindow", () => {
  it("returns empty strikes for a null reference price", () => {
    expect(getDefaultStrikeWindow(null)).toEqual({
      minimumStrike: "",
      maximumStrike: "",
    });
  });

  it("returns empty strikes for a zero or negative reference price", () => {
    expect(getDefaultStrikeWindow("0")).toEqual({
      minimumStrike: "",
      maximumStrike: "",
    });
    expect(getDefaultStrikeWindow("-10")).toEqual({
      minimumStrike: "",
      maximumStrike: "",
    });
  });

  it("uses a $1 strike step below $20", () => {
    expect(getDefaultStrikeWindow("15")).toEqual({
      minimumStrike: "13",
      maximumStrike: "17",
    });
  });

  it("uses a $2.50 strike step between $20 and $100", () => {
    // 50 * 1.1 is not exactly representable in floating point, so the
    // maximum strike rounds up one extra step to 57.5 rather than the
    // mathematically "clean" 55. This characterizes existing behavior.
    expect(getDefaultStrikeWindow("50")).toEqual({
      minimumStrike: "45",
      maximumStrike: "57.5",
    });
  });

  it("uses a $5 strike step at or above $100", () => {
    // 100 * 1.1 is 110.00000000000001 in floating point, so Math.ceil
    // pushes the window rounding up one extra strike step to 115 rather
    // than the mathematically "clean" 110. This is existing App behavior,
    // intentionally not corrected during this refactor.
    expect(getDefaultStrikeWindow("100")).toEqual({
      minimumStrike: "90",
      maximumStrike: "115",
    });
  });
});

describe("getDirectionalClass", () => {
  it("returns the neutral class for null", () => {
    expect(getDirectionalClass(null)).toBe("metric-value--neutral");
  });

  it("returns the neutral class for zero", () => {
    expect(getDirectionalClass("0")).toBe("metric-value--neutral");
  });

  it("returns the positive class for a positive value", () => {
    expect(getDirectionalClass("1.5")).toBe("metric-value--positive");
  });

  it("returns the negative class for a negative value", () => {
    expect(getDirectionalClass("-1.5")).toBe("metric-value--negative");
  });
});

describe("classifyMoneyness", () => {
  it("classifies a call with a strike well below the underlying as ITM", () => {
    const contract = makeContract({ option_type: "call", strike_price: "90" });
    expect(classifyMoneyness(contract, "100")).toBe("itm");
  });

  it("classifies a call with a strike equal to the underlying as ATM", () => {
    const contract = makeContract({ option_type: "call", strike_price: "100" });
    expect(classifyMoneyness(contract, "100")).toBe("atm");
  });

  it("classifies a call with a strike well above the underlying as OTM", () => {
    const contract = makeContract({ option_type: "call", strike_price: "110" });
    expect(classifyMoneyness(contract, "100")).toBe("otm");
  });

  it("classifies a put with a strike well above the underlying as ITM", () => {
    const contract = makeContract({ option_type: "put", strike_price: "110" });
    expect(classifyMoneyness(contract, "100")).toBe("itm");
  });

  it("classifies a put with a strike equal to the underlying as ATM", () => {
    const contract = makeContract({ option_type: "put", strike_price: "100" });
    expect(classifyMoneyness(contract, "100")).toBe("atm");
  });

  it("classifies a put with a strike well below the underlying as OTM", () => {
    const contract = makeContract({ option_type: "put", strike_price: "90" });
    expect(classifyMoneyness(contract, "100")).toBe("otm");
  });

  it("returns unknown when the underlying price is missing", () => {
    const contract = makeContract({ option_type: "call", strike_price: "100" });
    expect(classifyMoneyness(contract, null)).toBe("unknown");
  });

  it("returns unknown when the underlying price is non-positive", () => {
    const contract = makeContract({ option_type: "call", strike_price: "100" });
    expect(classifyMoneyness(contract, "0")).toBe("unknown");
    expect(classifyMoneyness(contract, "-5")).toBe("unknown");
  });

  it("returns unknown when the strike value is missing or invalid", () => {
    const contract = makeContract({
      option_type: "call",
      strike_price: "not-a-number",
    });
    expect(classifyMoneyness(contract, "100")).toBe("unknown");
  });
});

describe("getMoneynessLabel", () => {
  it("labels itm as ITM", () => {
    expect(getMoneynessLabel("itm")).toBe("ITM");
  });

  it("labels atm as ATM", () => {
    expect(getMoneynessLabel("atm")).toBe("ATM");
  });

  it("labels otm as OTM", () => {
    expect(getMoneynessLabel("otm")).toBe("OTM");
  });

  it("labels unknown as an em dash", () => {
    expect(getMoneynessLabel("unknown")).toBe("—");
  });
});
