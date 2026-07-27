// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ApiDecimal,
  OptionChainContract,
  OptionChainResponse,
  OptionChainSideResponse,
} from "../api";
import VerticalSpreadBuilder from "./VerticalSpreadBuilder";

interface ContractOverrides {
  contract_symbol?: string;
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
    contract_symbol:
      overrides.contract_symbol ??
      `TEST260731${contractType}${overrides.strike_price}`,
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

function makeSide(
  contracts: OptionChainContract[],
  optionType: "call" | "put",
  requested = true,
): OptionChainSideResponse {
  return {
    requested,
    option_type: optionType,
    contracts,
    contracts_returned: contracts.length,
    skipped_provider_contracts: 0,
    provider_more_available: false,
    optionscope_truncated: false,
  };
}

const CALL_95 = makeContract({
  option_type: "call",
  strike_price: "95",
  ask_price: "4.00",
  bid_price: "3.80",
});

const CALL_100 = makeContract({
  option_type: "call",
  strike_price: "100",
  ask_price: "3.00",
  bid_price: "2.80",
});

const CALL_105 = makeContract({
  option_type: "call",
  strike_price: "105",
  ask_price: "1.60",
  bid_price: "1.40",
});

const CALL_110 = makeContract({
  option_type: "call",
  strike_price: "110",
  ask_price: "0.90",
  bid_price: "0.70",
});

const PUT_105 = makeContract({
  option_type: "put",
  strike_price: "105",
  ask_price: "2.30",
  bid_price: "2.00",
});

const PUT_110 = makeContract({
  option_type: "put",
  strike_price: "110",
  ask_price: "4.50",
  bid_price: "4.20",
});

function makeChain(
  overrides: Partial<{
    calls: OptionChainContract[];
    puts: OptionChainContract[];
    callsRequested: boolean;
    putsRequested: boolean;
  }> = {},
): OptionChainResponse {
  return {
    symbol: "TEST",
    expiration_date: "2026-07-31",
    requested_option_type: "all",
    minimum_strike: null,
    maximum_strike: null,
    limit_per_side: 50,
    calls: makeSide(
      overrides.calls ?? [CALL_95, CALL_100, CALL_105, CALL_110],
      "call",
      overrides.callsRequested ?? true,
    ),
    puts: makeSide(
      overrides.puts ?? [PUT_105, PUT_110],
      "put",
      overrides.putsRequested ?? true,
    ),
    response_may_be_incomplete: false,
    feed: "test",
    provider: "test-provider",
    data_notice: "Test data notice.",
  };
}

function getLongSelect(): HTMLSelectElement {
  return screen.getByLabelText(/^Long leg/) as HTMLSelectElement;
}

function getShortSelect(): HTMLSelectElement {
  return screen.getByLabelText(/^Short leg/) as HTMLSelectElement;
}

describe("VerticalSpreadBuilder", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the default strategy with empty leg selectors and no analysis yet", () => {
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={vi.fn()} />);

    expect(screen.getByText("TEST · Bull Call Spread")).toBeInTheDocument();

    const bullCallTab = screen.getByRole("button", {
      name: /Bull Call Spread/,
    });
    expect(bullCallTab).toHaveAttribute("aria-pressed", "true");

    expect(getLongSelect().value).toBe("");
    expect(getShortSelect().value).toBe("");

    expect(screen.queryByText("Break-even at expiration")).not.toBeInTheDocument();
  });

  it("switches strategy and updates the active tab and leg-role wording", () => {
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Bear Put Spread/ }));

    expect(
      screen.getByRole("button", { name: /Bear Put Spread/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Bull Call Spread/ }),
    ).toHaveAttribute("aria-pressed", "false");

    expect(
      screen.getByLabelText(/Long leg — buy the higher-strike put/),
    ).toBeInTheDocument();
  });

  it("selects a long leg", () => {
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={vi.fn()} />);

    fireEvent.change(getLongSelect(), {
      target: { value: CALL_100.contract_symbol },
    });

    expect(getLongSelect().value).toBe(CALL_100.contract_symbol);
  });

  it("selects a short leg", () => {
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={vi.fn()} />);

    fireEvent.change(getShortSelect(), {
      target: { value: CALL_105.contract_symbol },
    });

    expect(getShortSelect().value).toBe(CALL_105.contract_symbol);
  });

  it("disables incompatible strikes in the short-leg selector once a long leg is picked", () => {
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={vi.fn()} />);

    fireEvent.change(getLongSelect(), {
      target: { value: CALL_100.contract_symbol },
    });

    const shortOptions = within(getShortSelect()).getAllByRole("option");

    const option95 = shortOptions.find((option) =>
      option.textContent?.startsWith("$95.00"),
    );
    const option100 = shortOptions.find((option) =>
      option.textContent?.startsWith("$100.00"),
    );
    const option105 = shortOptions.find((option) =>
      option.textContent?.startsWith("$105.00"),
    );

    expect(option95).toBeDisabled();
    expect(option95?.textContent).toMatch(/must be higher than long leg \(\$100\.00\)/);

    expect(option100).toBeDisabled();
    expect(option105).toBeEnabled();
  });

  it("renders full spread metrics once both legs are valid", () => {
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={vi.fn()} />);

    fireEvent.change(getLongSelect(), {
      target: { value: CALL_100.contract_symbol },
    });
    fireEvent.change(getShortSelect(), {
      target: { value: CALL_105.contract_symbol },
    });

    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("$1.60")).toBeInTheDocument();
    // Net debit per contract and maximum loss are both $160.00 for this
    // debit spread, so the text legitimately appears twice.
    expect(screen.getAllByText("$160.00")).toHaveLength(2);
    expect(screen.getByText("$101.60")).toBeInTheDocument();
    expect(screen.getByText("$340.00")).toBeInTheDocument();
    expect(screen.getByText(/Bullish outlook/)).toBeInTheDocument();
    expect(screen.getByText(/net debit spread/)).toBeInTheDocument();
  });

  it("resets both legs and clears the analysis without closing", () => {
    const onClose = vi.fn();
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={onClose} />);

    fireEvent.change(getLongSelect(), {
      target: { value: CALL_100.contract_symbol },
    });
    fireEvent.change(getShortSelect(), {
      target: { value: CALL_105.contract_symbol },
    });

    expect(screen.getByText("$340.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset selections" }));

    expect(getLongSelect().value).toBe("");
    expect(getShortSelect().value).toBe("");
    expect(screen.queryByText("$340.00")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears both legs and the analysis when switching strategies", () => {
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={vi.fn()} />);

    fireEvent.change(getLongSelect(), {
      target: { value: CALL_100.contract_symbol },
    });
    fireEvent.change(getShortSelect(), {
      target: { value: CALL_105.contract_symbol },
    });

    expect(screen.getByText("$340.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Bear Call Spread/ }));

    expect(getLongSelect().value).toBe("");
    expect(getShortSelect().value).toBe("");
    expect(screen.queryByText("$340.00")).not.toBeInTheDocument();
  });

  it("shows the engine's caution and em dashes when a leg has no usable quote", () => {
    const noQuoteCall = makeContract({
      contract_symbol: "TEST260731C00120000",
      option_type: "call",
      strike_price: "120",
      ask_price: null,
      bid_price: null,
      last_trade_price: null,
    });

    render(
      <VerticalSpreadBuilder
        chain={makeChain({ calls: [CALL_100, noQuoteCall] })}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(getLongSelect(), {
      target: { value: CALL_100.contract_symbol },
    });
    fireEvent.change(getShortSelect(), {
      target: { value: noQuoteCall.contract_symbol },
    });

    expect(
      screen.getByText(/needs a usable bid, ask, or last-trade price/),
    ).toBeInTheDocument();

    const maxProfitLabel = screen.getByText("Maximum profit");
    expect(
      maxProfitLabel.parentElement?.querySelector("strong")?.textContent,
    ).toBe("—");
  });

  it("shows the engine's caution when quotes produce an inverted net debit", () => {
    const invertedLong = makeContract({
      contract_symbol: "TEST260731C00100000",
      option_type: "call",
      strike_price: "100",
      ask_price: "1.20",
      bid_price: "1.00",
    });
    const invertedShort = makeContract({
      contract_symbol: "TEST260731C00105000",
      option_type: "call",
      strike_price: "105",
      ask_price: "1.60",
      bid_price: "1.40",
    });

    render(
      <VerticalSpreadBuilder
        chain={makeChain({ calls: [invertedLong, invertedShort] })}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(getLongSelect(), {
      target: { value: invertedLong.contract_symbol },
    });
    fireEvent.change(getShortSelect(), {
      target: { value: invertedShort.contract_symbol },
    });

    expect(screen.getByText(/invalid or inverted/)).toBeInTheDocument();

    const maxLossLabel = screen.getByText("Maximum loss");
    expect(
      maxLossLabel.parentElement?.querySelector("strong")?.textContent,
    ).toBe("—");
  });

  it("invokes onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<VerticalSpreadBuilder chain={makeChain()} onClose={onClose} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Close spread builder" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a guidance message when the required option side has no loaded contracts", () => {
    render(
      <VerticalSpreadBuilder
        chain={makeChain({ calls: [], callsRequested: false })}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/needs call contracts\. Reload the option chain/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Long leg/)).not.toBeInTheDocument();
  });

  it("catches an unexpected engine validation error instead of crashing", () => {
    const duplicateStrikeA = makeContract({
      contract_symbol: "TEST260731C00100000A",
      option_type: "call",
      strike_price: "100",
      ask_price: "3.00",
      bid_price: "2.80",
    });
    const duplicateStrikeB = makeContract({
      contract_symbol: "TEST260731C00100000B",
      option_type: "call",
      strike_price: "100",
      ask_price: "3.10",
      bid_price: "2.90",
    });

    render(
      <VerticalSpreadBuilder
        chain={makeChain({ calls: [duplicateStrikeA, duplicateStrikeB] })}
        onClose={vi.fn()}
      />,
    );

    // Both options are mutually disabled by the UI's own filtering, but the
    // component must not crash even if a value is ever set programmatically.
    fireEvent.change(getLongSelect(), {
      target: { value: duplicateStrikeA.contract_symbol },
    });
    fireEvent.change(getShortSelect(), {
      target: { value: duplicateStrikeB.contract_symbol },
    });

    const errorRegion = screen.getByRole("alert");
    expect(errorRegion).toHaveTextContent("Could not analyze this spread.");
    expect(errorRegion).toHaveTextContent(/different strike prices/);

    expect(
      screen.getByRole("button", { name: /Bull Call Spread/ }),
    ).toBeInTheDocument();
  });
});
