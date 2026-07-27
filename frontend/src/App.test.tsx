// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ApiDecimal,
  OptionChainContract,
  OptionChainResponse,
  OptionChainSideResponse,
  OptionExpirationsResponse,
  StockMarketSnapshot,
} from "./api";

vi.mock("./api", () => ({
  getStockSnapshot: vi.fn(),
  getOptionExpirations: vi.fn(),
  getOptionChain: vi.fn(),
}));

import { getOptionChain, getOptionExpirations, getStockSnapshot } from "./api";
import App from "./App";

const mockGetStockSnapshot = vi.mocked(getStockSnapshot);
const mockGetOptionExpirations = vi.mocked(getOptionExpirations);
const mockGetOptionChain = vi.mocked(getOptionChain);

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function makeSnapshot(
  overrides: Partial<StockMarketSnapshot> = {},
): StockMarketSnapshot {
  return {
    symbol: "TSM",
    last_trade_price: "100.00",
    last_trade_timestamp: "2026-07-27T15:30:00Z",
    bid_price: "99.90",
    ask_price: "100.10",
    bid_size: 5,
    ask_size: 7,
    quote_timestamp: "2026-07-27T15:30:00Z",
    day_open: "98.00",
    day_high: "101.50",
    day_low: "97.25",
    day_close: "99.00",
    day_volume: 1234567,
    previous_close: "97.80",
    day_change: "2.20",
    day_change_percent: "2.25",
    feed: "sip",
    ...overrides,
  };
}

function makeExpirations(
  overrides: Partial<OptionExpirationsResponse> = {},
): OptionExpirationsResponse {
  return {
    symbol: "TSM",
    expiration_dates: ["2026-08-21", "2026-09-18"],
    dates_returned: 2,
    catalog_pages_checked: 1,
    catalog_scan_incomplete: false,
    window_start: "2026-07-27",
    window_end: "2027-01-27",
    ...overrides,
  };
}

interface ContractOverrides {
  contract_symbol?: string;
  option_type: "call" | "put";
  strike_price: string;
  bid_price?: ApiDecimal;
  ask_price?: ApiDecimal;
}

function makeContract(overrides: ContractOverrides): OptionChainContract {
  const contractType = overrides.option_type === "call" ? "C" : "P";

  return {
    contract_symbol:
      overrides.contract_symbol ??
      `TSM260821${contractType}${overrides.strike_price}`,
    underlying_symbol: "TSM",
    expiration_date: "2026-08-21",
    option_type: overrides.option_type,
    strike_price: overrides.strike_price,
    last_trade_price: "2.40",
    last_trade_size: 3,
    last_trade_timestamp: "2026-07-27T15:00:00Z",
    bid_price: overrides.bid_price !== undefined ? overrides.bid_price : "2.25",
    ask_price: overrides.ask_price !== undefined ? overrides.ask_price : "2.50",
    bid_size: 4,
    ask_size: 6,
    quote_timestamp: "2026-07-27T15:00:00Z",
    implied_volatility: "0.35",
    delta: "0.45",
    gamma: "0.02",
    theta: "-0.05",
    vega: "0.10",
    rho: "0.01",
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
  ask_price: "1.10",
  bid_price: "0.95",
});

const CALL_100 = makeContract({
  option_type: "call",
  strike_price: "100",
  ask_price: "2.50",
  bid_price: "2.25",
});

const PUT_95 = makeContract({
  option_type: "put",
  strike_price: "95",
  ask_price: "1.05",
  bid_price: "0.90",
});

const PUT_100 = makeContract({
  option_type: "put",
  strike_price: "100",
  ask_price: "2.60",
  bid_price: "2.35",
});

function makeChain(
  overrides: Partial<{
    calls: OptionChainSideResponse;
    puts: OptionChainSideResponse;
  }> = {},
): OptionChainResponse {
  return {
    symbol: "TSM",
    expiration_date: "2026-08-21",
    requested_option_type: "all",
    minimum_strike: "90",
    maximum_strike: "110",
    limit_per_side: 12,
    calls: overrides.calls ?? makeSide([CALL_95, CALL_100], "call"),
    puts: overrides.puts ?? makeSide([PUT_95, PUT_100], "put"),
    response_may_be_incomplete: false,
    feed: "sip",
    provider: "alpaca",
    data_notice: "Quotes may be delayed. Verify before trading.",
    ...overrides,
  };
}

const DEFAULT_CHAIN = makeChain();

async function searchDefault(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await screen.findByRole("heading", { name: "TSM" });
}

async function searchAndOpenChainForm(): Promise<void> {
  await searchDefault();
  await screen.findByRole("button", { name: "Load option chain" });
}

async function loadSingleCallChain(): Promise<void> {
  mockGetOptionChain.mockResolvedValueOnce(
    makeChain({
      calls: makeSide([CALL_100], "call"),
      puts: makeSide([], "put", false),
    }),
  );

  await searchAndOpenChainForm();
  fireEvent.click(screen.getByRole("button", { name: "Load option chain" }));
  await screen.findByRole("button", { name: "Analyze" });
}

describe("App", () => {
  beforeEach(() => {
    mockGetStockSnapshot.mockReset();
    mockGetOptionExpirations.mockReset();
    mockGetOptionChain.mockReset();

    mockGetStockSnapshot.mockResolvedValue(makeSnapshot());
    mockGetOptionExpirations.mockResolvedValue(makeExpirations());
    mockGetOptionChain.mockResolvedValue(makeChain());

    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    // jsdom does not implement scrollIntoView; remove the stub between tests.
    // @ts-expect-error -- intentionally deleting a test-only stub.
    delete Element.prototype.scrollIntoView;
  });

  describe("initial state", () => {
    it("renders the empty state without a snapshot or option chain", () => {
      render(<App />);

      expect(
        screen.getByRole("heading", { name: "Search a ticker to begin." }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "TSM" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Expiration")).not.toBeInTheDocument();
    });

    it("uses TSM as the initial ticker input value", () => {
      render(<App />);

      expect(
        (screen.getByLabelText("Ticker symbol") as HTMLInputElement).value,
      ).toBe("TSM");
    });
  });

  describe("successful market search", () => {
    it("calls both market APIs with the trimmed, uppercased ticker", async () => {
      render(<App />);

      fireEvent.change(screen.getByLabelText("Ticker symbol"), {
        target: { value: "  nvda  " },
      });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));

      await waitFor(() => {
        expect(mockGetStockSnapshot).toHaveBeenCalledWith("NVDA");
        expect(mockGetOptionExpirations).toHaveBeenCalledWith("NVDA");
      });
    });

    it("disables the search button and shows the loading label while pending", async () => {
      const snapshotDeferred = createDeferred<StockMarketSnapshot>();
      mockGetStockSnapshot.mockReturnValueOnce(snapshotDeferred.promise);

      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Search" }));

      const loadingButton = await screen.findByRole("button", {
        name: "Loading…",
      });
      expect(loadingButton).toBeDisabled();

      await act(async () => {
        snapshotDeferred.resolve(makeSnapshot());
        await Promise.resolve();
      });

      expect(
        await screen.findByRole("button", { name: "Search" }),
      ).toBeEnabled();
    });

    it("renders snapshot metrics, expirations, and the default strike window", async () => {
      render(<App />);
      await searchDefault();

      const lastPriceCard = screen.getByText("Last price").closest("article")!;
      expect(within(lastPriceCard).getByText("$100.00")).toBeInTheDocument();

      const dayChangeCard = screen.getByText("Day change").closest("article")!;
      expect(within(dayChangeCard).getByText("+2.25%")).toBeInTheDocument();

      const bidAskCard = screen.getByText("Bid / ask").closest("article")!;
      expect(
        within(bidAskCard).getByText("$99.90 / $100.10"),
      ).toBeInTheDocument();

      const dayRangeCard = screen.getByText("Day range").closest("article")!;
      expect(
        within(dayRangeCard).getByText("$97.25 – $101.50"),
      ).toBeInTheDocument();

      const volumeCard = screen.getByText("Volume").closest("article")!;
      expect(within(volumeCard).getByText("1,234,567")).toBeInTheDocument();

      const expirationSelect = screen.getByLabelText(
        "Expiration",
      ) as HTMLSelectElement;
      expect(expirationSelect.value).toBe("2026-08-21");
      expect(
        within(expirationSelect).getByText("Aug 21, 2026"),
      ).toBeInTheDocument();
      expect(
        within(expirationSelect).getByText("Sep 18, 2026"),
      ).toBeInTheDocument();

      expect(
        (screen.getByLabelText("Minimum strike") as HTMLInputElement).value,
      ).toBe("90");
      // 100 * 1.1 is not exactly representable in floating point (it's
      // 110.00000000000001), so Math.ceil pushes the /5 window rounding up
      // one extra strike step to 115 rather than the mathematically "clean"
      // 110. This is App.tsx's existing behavior, not a test error.
      expect(
        (screen.getByLabelText("Maximum strike") as HTMLInputElement).value,
      ).toBe("115");
    });
  });

  describe("market-search validation and errors", () => {
    it("does not call the market APIs for a whitespace-only ticker", async () => {
      render(<App />);

      fireEvent.change(screen.getByLabelText("Ticker symbol"), {
        target: { value: "   " },
      });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));

      expect(
        await screen.findByText("Enter a ticker symbol first."),
      ).toBeInTheDocument();
      expect(mockGetStockSnapshot).not.toHaveBeenCalled();
      expect(mockGetOptionExpirations).not.toHaveBeenCalled();
    });

    it("shows the market error banner and no stale snapshot on a rejected request", async () => {
      mockGetStockSnapshot.mockRejectedValueOnce(
        new Error("Alpaca is unavailable."),
      );

      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Search" }));

      expect(
        await screen.findByText("Could not load market data."),
      ).toBeInTheDocument();
      expect(screen.getByText("Alpaca is unavailable.")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "TSM" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("successful option-chain loading", () => {
    it("requests the option chain using the exact current form values", async () => {
      render(<App />);
      await searchAndOpenChainForm();

      fireEvent.change(screen.getByLabelText("Chain side"), {
        target: { value: "call" },
      });
      fireEvent.change(screen.getByLabelText("Minimum strike"), {
        target: { value: "92" },
      });
      fireEvent.change(screen.getByLabelText("Maximum strike"), {
        target: { value: "108" },
      });
      fireEvent.change(screen.getByLabelText("Limit per side"), {
        target: { value: "25" },
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      await waitFor(() => {
        expect(mockGetOptionChain).toHaveBeenCalledWith({
          symbol: "TSM",
          expirationDate: "2026-08-21",
          optionType: "call",
          minimumStrike: "92",
          maximumStrike: "108",
          limit: 25,
        });
      });
    });

    it("disables the chain-load button and shows the loading label while pending", async () => {
      render(<App />);
      await searchAndOpenChainForm();

      const chainDeferred = createDeferred<OptionChainResponse>();
      mockGetOptionChain.mockReturnValueOnce(chainDeferred.promise);

      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      const loadingButton = await screen.findByRole("button", {
        name: "Loading chain…",
      });
      expect(loadingButton).toBeDisabled();

      await act(async () => {
        chainDeferred.resolve(makeChain());
        await Promise.resolve();
      });

      expect(
        await screen.findByRole("button", { name: "Load option chain" }),
      ).toBeEnabled();
    });

    it("renders the data notice, contract counts, and contract rows for both sides", async () => {
      render(<App />);
      await searchAndOpenChainForm();
      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      expect(
        await screen.findByText(DEFAULT_CHAIN.data_notice),
      ).toBeInTheDocument();

      const callsSection = screen
        .getByRole("heading", { name: "Calls" })
        .closest("section")!;
      expect(within(callsSection).getByText("2 returned")).toBeInTheDocument();
      expect(within(callsSection).getByText("$95.00")).toBeInTheDocument();
      expect(within(callsSection).getByText("$100.00")).toBeInTheDocument();

      const putsSection = screen
        .getByRole("heading", { name: "Puts" })
        .closest("section")!;
      expect(within(putsSection).getByText("2 returned")).toBeInTheDocument();
      expect(within(putsSection).getByText("$95.00")).toBeInTheDocument();
      expect(within(putsSection).getByText("$100.00")).toBeInTheDocument();
    });

    it("shows the puts side as not requested for a calls-only chain", async () => {
      mockGetOptionChain.mockResolvedValueOnce(
        makeChain({ puts: makeSide([], "put", false) }),
      );

      render(<App />);
      await searchAndOpenChainForm();
      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      const putsSection = (
        await screen.findByRole("heading", { name: "Puts" })
      ).closest("section")!;
      expect(within(putsSection).getByText("Not requested")).toBeInTheDocument();

      const callsSection = screen
        .getByRole("heading", { name: "Calls" })
        .closest("section")!;
      expect(
        within(callsSection).queryByText("Not requested"),
      ).not.toBeInTheDocument();
    });

    it("shows the calls side as not requested for a puts-only chain", async () => {
      mockGetOptionChain.mockResolvedValueOnce(
        makeChain({ calls: makeSide([], "call", false) }),
      );

      render(<App />);
      await searchAndOpenChainForm();
      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      const callsSection = (
        await screen.findByRole("heading", { name: "Calls" })
      ).closest("section")!;
      expect(
        within(callsSection).getByText("Not requested"),
      ).toBeInTheDocument();

      const putsSection = screen
        .getByRole("heading", { name: "Puts" })
        .closest("section")!;
      expect(
        within(putsSection).queryByText("Not requested"),
      ).not.toBeInTheDocument();
    });

    it("shows the no-contracts message for a requested side with zero contracts", async () => {
      mockGetOptionChain.mockResolvedValueOnce(
        makeChain({ calls: makeSide([], "call", true) }),
      );

      render(<App />);
      await searchAndOpenChainForm();
      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      const callsSection = (
        await screen.findByRole("heading", { name: "Calls" })
      ).closest("section")!;
      expect(
        within(callsSection).getByText(
          "No contracts matched the current expiration and strike filters.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("chain validation and errors", () => {
    it.each([
      ["0"],
      ["101"],
      ["1.5"],
    ])(
      "rejects a result limit of %s without calling getOptionChain",
      async (limitValue) => {
        render(<App />);
        await searchAndOpenChainForm();

        const limitInput = screen.getByLabelText("Limit per side");
        fireEvent.change(limitInput, { target: { value: limitValue } });

        // These values also violate the input's own min/max/step
        // attributes, which makes jsdom (like a real browser) block a
        // click-triggered submit before React's onSubmit ever runs.
        // Dispatching submit on the form directly exercises App.tsx's own
        // JS-level validation, the behavior under test here.
        fireEvent.submit(limitInput.closest("form")!);

        expect(
          await screen.findByText(
            "Result limit must be a whole number from 1 to 100.",
          ),
        ).toBeInTheDocument();
        expect(mockGetOptionChain).not.toHaveBeenCalled();
      },
    );

    it("displays the option-chain error banner when the request is rejected", async () => {
      mockGetOptionChain.mockRejectedValueOnce(
        new Error("Chain provider unavailable."),
      );

      render(<App />);
      await searchAndOpenChainForm();
      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      expect(
        await screen.findByText("Could not load option chain."),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Chain provider unavailable."),
      ).toBeInTheDocument();
    });
  });

  describe("Position Lens", () => {
    it("opens with the selected contract and first position mode, then scrolls to it", async () => {
      render(<App />);
      await loadSingleCallChain();

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

      expect(
        await screen.findByText("TSM · $100.00 Call"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Long Call" })).toHaveClass(
        "position-tab--active",
      );
      expect(screen.getByText("Estimated debit")).toBeInTheDocument();

      await waitFor(() => {
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      });
    });

    it("updates the analysis when switching between long and short position modes", async () => {
      render(<App />);
      await loadSingleCallChain();
      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
      await screen.findByText("TSM · $100.00 Call");

      expect(screen.getByText("$102.50")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Short Call" }));

      expect(screen.getByRole("button", { name: "Short Call" })).toHaveClass(
        "position-tab--active",
      );
      expect(screen.getByText("Estimated credit")).toBeInTheDocument();
      expect(screen.getByText("$102.25")).toBeInTheDocument();
      expect(screen.queryByText("$102.50")).not.toBeInTheDocument();
    });

    it("closes when Close is clicked", async () => {
      render(<App />);
      await loadSingleCallChain();
      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
      await screen.findByText("TSM · $100.00 Call");

      fireEvent.click(
        screen.getByRole("button", { name: "Close Position Lens" }),
      );

      expect(
        screen.queryByText("TSM · $100.00 Call"),
      ).not.toBeInTheDocument();
    });

    it("marks the analyzed row as selected", async () => {
      render(<App />);
      await loadSingleCallChain();

      const analyzeButton = screen.getByRole("button", { name: "Analyze" });
      const row = analyzeButton.closest("tr")!;
      expect(row).not.toHaveClass("chain-row--selected");

      fireEvent.click(analyzeButton);

      expect(
        await screen.findByRole("button", { name: "Selected" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(row).toHaveClass("chain-row--selected");
    });
  });

  describe("Vertical Spread Builder", () => {
    async function loadDefaultChain(): Promise<void> {
      render(<App />);
      await searchAndOpenChainForm();
      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );
      await screen.findByText(DEFAULT_CHAIN.data_notice);
    }

    it("shows the control to open the builder once a chain is loaded", async () => {
      await loadDefaultChain();

      expect(
        screen.getByRole("button", { name: "Build a vertical spread" }),
      ).toBeInTheDocument();
    });

    it("opens the builder", async () => {
      await loadDefaultChain();

      fireEvent.click(
        screen.getByRole("button", { name: "Build a vertical spread" }),
      );

      expect(screen.getByText("VERTICAL SPREAD BUILDER")).toBeInTheDocument();
    });

    it("closes the builder while keeping the loaded chain", async () => {
      await loadDefaultChain();
      fireEvent.click(
        screen.getByRole("button", { name: "Build a vertical spread" }),
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Close spread builder" }),
      );

      expect(
        screen.queryByText("VERTICAL SPREAD BUILDER"),
      ).not.toBeInTheDocument();
      expect(screen.getByText(DEFAULT_CHAIN.data_notice)).toBeInTheDocument();
    });
  });

  describe("stale-state clearing", () => {
    it("clears the loaded chain, Position Lens, and Vertical Spread Builder on a new market search", async () => {
      render(<App />);
      await loadSingleCallChain();

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
      await screen.findByText("TSM · $100.00 Call");
      fireEvent.click(
        screen.getByRole("button", { name: "Build a vertical spread" }),
      );
      expect(screen.getByText("VERTICAL SPREAD BUILDER")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Search" }));

      expect(
        screen.queryByText("TSM · $100.00 Call"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("VERTICAL SPREAD BUILDER"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Build a vertical spread" }),
      ).not.toBeInTheDocument();

      await screen.findByRole("button", { name: "Load option chain" });
    });

    it("clears an open Position Lens and Vertical Spread Builder when the chain is reloaded", async () => {
      render(<App />);
      await loadSingleCallChain();

      fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
      await screen.findByText("TSM · $100.00 Call");
      fireEvent.click(
        screen.getByRole("button", { name: "Build a vertical spread" }),
      );
      expect(screen.getByText("VERTICAL SPREAD BUILDER")).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      expect(
        screen.queryByText("TSM · $100.00 Call"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("VERTICAL SPREAD BUILDER"),
      ).not.toBeInTheDocument();

      await waitFor(() => {
        expect(mockGetOptionChain).toHaveBeenCalledTimes(2);
      });
    });
  });
});
