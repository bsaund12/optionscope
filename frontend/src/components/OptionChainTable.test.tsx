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
  OptionChainSideResponse,
} from "../api";
import OptionChainTable from "./OptionChainTable";

interface ContractOverrides {
  contract_symbol?: string;
  underlying_symbol?: string;
  expiration_date?: string;
  option_type: "call" | "put";
  strike_price: string;
  last_trade_price?: ApiDecimal;
  bid_price?: ApiDecimal;
  ask_price?: ApiDecimal;
  implied_volatility?: ApiDecimal;
  delta?: ApiDecimal;
  theta?: ApiDecimal;
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
    implied_volatility:
      overrides.implied_volatility !== undefined
        ? overrides.implied_volatility
        : "0.35",
    delta: overrides.delta !== undefined ? overrides.delta : "0.45",
    gamma: "0.02",
    theta: overrides.theta !== undefined ? overrides.theta : "-0.05",
    vega: "0.10",
    rho: "0.01",
  };
}

function makeSide(
  overrides: Partial<OptionChainSideResponse> & {
    contracts: OptionChainContract[];
  },
): OptionChainSideResponse {
  return {
    requested: true,
    option_type: "call",
    contracts_returned: overrides.contracts.length,
    skipped_provider_contracts: 0,
    provider_more_available: false,
    optionscope_truncated: false,
    ...overrides,
  };
}

describe("OptionChainTable", () => {
  afterEach(() => {
    cleanup();
  });

  describe("not-requested side", () => {
    it("renders the title, the not-requested state, and no table for calls", () => {
      const side = makeSide({
        requested: false,
        option_type: "call",
        contracts: [],
      });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Calls" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Not requested")).toBeInTheDocument();
      expect(
        screen.getByText(
          (content) =>
            content.includes("Select") && content.includes("to load this side"),
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("references the put side in the instruction wording for puts", () => {
      const side = makeSide({
        requested: false,
        option_type: "put",
        contracts: [],
      });

      render(
        <OptionChainTable
          title="Puts"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      expect(
        screen.getByText(
          (content) =>
            content.includes("put") && content.includes("to load this side"),
        ),
      ).toBeInTheDocument();
    });
  });

  describe("requested but empty side", () => {
    it("shows zero contracts and the no-contracts message without a table", () => {
      const side = makeSide({ requested: true, contracts: [] });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      expect(screen.getByText("0 contracts")).toBeInTheDocument();
      expect(
        screen.getByText(
          "No contracts matched the current expiration and strike filters.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("populated side", () => {
    const CALL_95 = makeContract({
      option_type: "call",
      strike_price: "95",
      last_trade_price: "5.10",
      bid_price: "4.90",
      ask_price: "5.20",
      implied_volatility: "0.42",
      delta: "0.61",
      theta: "-0.08",
    });

    it("shows the returned count without 'more available' when false", () => {
      const side = makeSide({
        contracts: [CALL_95],
        contracts_returned: 1,
        provider_more_available: false,
      });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      expect(screen.getByText("1 returned")).toBeInTheDocument();
      expect(screen.queryByText(/more available/)).not.toBeInTheDocument();
    });

    it("shows 'more available' when provider_more_available is true", () => {
      const side = makeSide({
        contracts: [CALL_95],
        contracts_returned: 1,
        provider_more_available: true,
      });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      expect(
        screen.getByText("1 returned · more available"),
      ).toBeInTheDocument();
    });

    it("displays the side's option-type label and column headings", () => {
      const side = makeSide({ contracts: [CALL_95], option_type: "call" });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      expect(screen.getByText("call")).toBeInTheDocument();

      const headings = [
        "Strike",
        "Mny.",
        "Last",
        "Bid",
        "Ask",
        "IV",
        "Delta",
        "Theta",
        "Lens",
      ];

      for (const heading of headings) {
        expect(
          screen.getByRole("columnheader", { name: heading }),
        ).toBeInTheDocument();
      }
    });

    it("renders the contract's strike, last, bid, ask, IV, delta, and theta", () => {
      const side = makeSide({ contracts: [CALL_95] });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      const row = screen.getByRole("button", { name: "Analyze" }).closest(
        "tr",
      )!;
      const cells = within(row).getAllByRole("cell");

      expect(cells[0]).toHaveTextContent("$95.00");
      expect(cells[2]).toHaveTextContent("$5.10");
      expect(cells[3]).toHaveTextContent("$4.90");
      expect(cells[4]).toHaveTextContent("$5.20");
      expect(cells[5]).toHaveTextContent("42.00%");
      expect(cells[6]).toHaveTextContent("0.6100");
      expect(cells[7]).toHaveTextContent("-0.0800");
    });
  });

  describe("moneyness presentation", () => {
    function renderSingleContract(
      contract: OptionChainContract,
      underlyingPrice: ApiDecimal,
    ) {
      const side = makeSide({
        contracts: [contract],
        option_type: contract.option_type,
      });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice={underlyingPrice}
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );
    }

    function getRow() {
      return screen.getByRole("button", { name: "Analyze" }).closest("tr")!;
    }

    it("classifies a call strike below the underlying as ITM", () => {
      renderSingleContract(
        makeContract({ option_type: "call", strike_price: "90" }),
        "100",
      );

      expect(getRow()).toHaveClass("chain-row--itm");
      expect(screen.getByText("ITM")).toBeInTheDocument();
    });

    it("classifies a call strike equal to the underlying as ATM", () => {
      renderSingleContract(
        makeContract({ option_type: "call", strike_price: "100" }),
        "100",
      );

      expect(getRow()).toHaveClass("chain-row--atm");
      expect(screen.getByText("ATM")).toBeInTheDocument();
    });

    it("classifies a call strike above the underlying as OTM", () => {
      renderSingleContract(
        makeContract({ option_type: "call", strike_price: "110" }),
        "100",
      );

      expect(getRow()).toHaveClass("chain-row--otm");
      expect(screen.getByText("OTM")).toBeInTheDocument();
    });

    it("classifies a put strike above the underlying as ITM", () => {
      renderSingleContract(
        makeContract({ option_type: "put", strike_price: "110" }),
        "100",
      );

      expect(getRow()).toHaveClass("chain-row--itm");
      expect(screen.getByText("ITM")).toBeInTheDocument();
    });

    it("classifies a put strike equal to the underlying as ATM", () => {
      renderSingleContract(
        makeContract({ option_type: "put", strike_price: "100" }),
        "100",
      );

      expect(getRow()).toHaveClass("chain-row--atm");
      expect(screen.getByText("ATM")).toBeInTheDocument();
    });

    it("classifies a put strike below the underlying as OTM", () => {
      renderSingleContract(
        makeContract({ option_type: "put", strike_price: "90" }),
        "100",
      );

      expect(getRow()).toHaveClass("chain-row--otm");
      expect(screen.getByText("OTM")).toBeInTheDocument();
    });

    it("shows unknown moneyness when the underlying price is unavailable", () => {
      renderSingleContract(
        makeContract({ option_type: "call", strike_price: "100" }),
        null,
      );

      expect(getRow()).toHaveClass("chain-row--unknown");
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  describe("selection behavior", () => {
    const CALL_95 = makeContract({ option_type: "call", strike_price: "95" });
    const CALL_100 = makeContract({ option_type: "call", strike_price: "100" });

    it("renders an unselected contract as Analyze with aria-pressed false", () => {
      const side = makeSide({ contracts: [CALL_95] });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={vi.fn()}
        />,
      );

      const button = screen.getByRole("button", { name: "Analyze" });
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button.closest("tr")).not.toHaveClass("chain-row--selected");
    });

    it("marks only the matching contract as selected among multiple rows", () => {
      const side = makeSide({ contracts: [CALL_95, CALL_100] });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={CALL_100.contract_symbol}
          onAnalyze={vi.fn()}
        />,
      );

      const selectedButton = screen.getByRole("button", { name: "Selected" });
      expect(selectedButton).toHaveAttribute("aria-pressed", "true");
      expect(selectedButton.closest("tr")).toHaveClass("chain-row--selected");

      const analyzeButtons = screen.getAllByRole("button", {
        name: "Analyze",
      });
      expect(analyzeButtons).toHaveLength(1);
      expect(analyzeButtons[0]).toHaveAttribute("aria-pressed", "false");
      expect(analyzeButtons[0].closest("tr")).not.toHaveClass(
        "chain-row--selected",
      );
    });
  });

  describe("callback behavior", () => {
    const CALL_95 = makeContract({ option_type: "call", strike_price: "95" });
    const CALL_100 = makeContract({ option_type: "call", strike_price: "100" });

    it("invokes onAnalyze exactly once with the clicked row's exact contract", () => {
      const onAnalyze = vi.fn();
      const side = makeSide({ contracts: [CALL_95, CALL_100] });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={onAnalyze}
        />,
      );

      const rows = screen.getAllByRole("button", { name: "Analyze" });
      fireEvent.click(rows[0]);

      expect(onAnalyze).toHaveBeenCalledTimes(1);
      expect(onAnalyze).toHaveBeenCalledWith(CALL_95);
    });

    it("passes the second row's contract when that row is clicked instead", () => {
      const onAnalyze = vi.fn();
      const side = makeSide({ contracts: [CALL_95, CALL_100] });

      render(
        <OptionChainTable
          title="Calls"
          side={side}
          underlyingPrice="100"
          selectedContractSymbol={null}
          onAnalyze={onAnalyze}
        />,
      );

      const rows = screen.getAllByRole("button", { name: "Analyze" });
      fireEvent.click(rows[1]);

      expect(onAnalyze).toHaveBeenCalledTimes(1);
      expect(onAnalyze).toHaveBeenCalledWith(CALL_100);
    });
  });
});
