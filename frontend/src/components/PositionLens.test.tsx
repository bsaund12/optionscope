// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OptionChainContract } from "../api";
import PositionLens from "./PositionLens";

function makeContract(optionType: "call" | "put"): OptionChainContract {
  const contractType = optionType === "call" ? "C" : "P";

  return {
    contract_symbol: `TSM260821${contractType}00100000`,
    underlying_symbol: "TSM",
    expiration_date: "2026-08-21",
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

const CALL_CONTRACT = makeContract("call");
const PUT_CONTRACT = makeContract("put");

describe("PositionLens", () => {
  afterEach(() => {
    cleanup();
  });

  describe("header and contract identity", () => {
    it("renders the eyebrow, symbol, strike, Call label, expiration, and contract symbol", () => {
      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("POSITION LENS")).toBeInTheDocument();
      expect(screen.getByText("TSM · $100.00 Call")).toBeInTheDocument();
      expect(
        screen.getByText("Expires Aug 21, 2026 · TSM260821C00100000"),
      ).toBeInTheDocument();
    });

    it("renders the Put label for a put contract", () => {
      render(
        <PositionLens
          contract={PUT_CONTRACT}
          position="long_put"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("TSM · $100.00 Put")).toBeInTheDocument();
    });

    it("renders the section with id position-lens", () => {
      const { container } = render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(container.querySelector("#position-lens")).toBeInTheDocument();
    });
  });

  describe("position-mode tabs", () => {
    it("renders Long Call and Short Call for a call contract, not put modes", () => {
      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Long Call" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Short Call" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Long Put" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Short Put" }),
      ).not.toBeInTheDocument();
    });

    it("marks the current mode's tab as active", () => {
      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: "Long Call" })).toHaveClass(
        "position-tab--active",
      );
      expect(
        screen.getByRole("button", { name: "Short Call" }),
      ).not.toHaveClass("position-tab--active");
    });

    it("invokes onPositionChange with short_call when Short Call is clicked", () => {
      const onPositionChange = vi.fn();

      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={onPositionChange}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Short Call" }));

      expect(onPositionChange).toHaveBeenCalledTimes(1);
      expect(onPositionChange).toHaveBeenCalledWith("short_call");
    });

    it("invokes onPositionChange with long_call when Long Call is clicked", () => {
      const onPositionChange = vi.fn();

      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="short_call"
          onPositionChange={onPositionChange}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Long Call" }));

      expect(onPositionChange).toHaveBeenCalledTimes(1);
      expect(onPositionChange).toHaveBeenCalledWith("long_call");
    });

    it("renders Long Put and Short Put for a put contract, not call modes", () => {
      render(
        <PositionLens
          contract={PUT_CONTRACT}
          position="long_put"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Long Put" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Short Put" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Long Call" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Short Call" }),
      ).not.toBeInTheDocument();
    });

    it("invokes onPositionChange with short_put when Short Put is clicked", () => {
      const onPositionChange = vi.fn();

      render(
        <PositionLens
          contract={PUT_CONTRACT}
          position="long_put"
          onPositionChange={onPositionChange}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Short Put" }));

      expect(onPositionChange).toHaveBeenCalledTimes(1);
      expect(onPositionChange).toHaveBeenCalledWith("short_put");
    });
  });

  describe("analysis rendering", () => {
    it("renders a long call (debit) with correct title, outlook, entry, break-even, unlimited profit, and loss", () => {
      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Long Call", { selector: ".position-lens__label" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Bullish expiration outlook. This position benefits when the underlying rises above the break-even price.",
        ),
      ).toBeInTheDocument();

      expect(screen.getByText("Estimated debit")).toBeInTheDocument();
      // The entry debit and the maximum loss are both $250.00 for a long
      // call (the entire premium is the maximum loss), so this
      // legitimately appears twice.
      expect(screen.getAllByText("$250.00")).toHaveLength(2);
      expect(
        screen.getByText("$2.50 per share · using ask"),
      ).toBeInTheDocument();

      expect(screen.getByText("$102.50")).toBeInTheDocument();
      expect(screen.getByText("Unlimited")).toBeInTheDocument();

      expect(
        screen.getByText(
          "At expiration, the entire debit can be lost if the stock finishes at or below the strike. Time decay, volatility, fees, and early exercise are not modeled here.",
        ),
      ).toBeInTheDocument();
    });

    it("renders a short call (credit) with correct title, outlook, entry, break-even, profit, and unlimited loss", () => {
      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="short_call"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Short Call", { selector: ".position-lens__label" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Neutral-to-bearish expiration outlook. This position keeps its best result when the stock remains at or below the strike.",
        ),
      ).toBeInTheDocument();

      expect(screen.getByText("Estimated credit")).toBeInTheDocument();
      // The entry credit and the maximum profit are both $225.00 for a
      // short call (the entire premium is the maximum profit), so this
      // legitimately appears twice.
      expect(screen.getAllByText("$225.00")).toHaveLength(2);
      expect(
        screen.getByText("$2.25 per share · using bid"),
      ).toBeInTheDocument();

      expect(screen.getByText("$102.25")).toBeInTheDocument();
      expect(screen.getByText("Unlimited")).toBeInTheDocument();

      expect(
        screen.getByText(
          "This is uncovered-short-call payoff analysis. Loss can be unlimited if the stock rises. Assignment may occur before expiration and account requirements are not modeled.",
        ),
      ).toBeInTheDocument();
    });

    it("renders a long put (debit) with correct break-even and finite profit/loss", () => {
      render(
        <PositionLens
          contract={PUT_CONTRACT}
          position="long_put"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Long Put", { selector: ".position-lens__label" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Bearish expiration outlook. This position benefits when the underlying falls below the break-even price.",
        ),
      ).toBeInTheDocument();

      expect(screen.getByText("Estimated debit")).toBeInTheDocument();
      expect(screen.getByText("$97.50")).toBeInTheDocument();
      expect(screen.getByText("$9,750.00")).toBeInTheDocument();
      // The entry debit and the maximum loss are both $250.00 for a long
      // put (the entire premium is the maximum loss), so this legitimately
      // appears twice.
      expect(screen.getAllByText("$250.00")).toHaveLength(2);

      expect(
        screen.getByText(
          "Maximum profit assumes the underlying falls to zero at expiration. Time decay, volatility, fees, and early exercise are not modeled here.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("close behavior", () => {
    it("exposes Close through its aria-label and calls onClose exactly once, without changing position", () => {
      const onClose = vi.fn();
      const onPositionChange = vi.fn();

      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={onPositionChange}
          onClose={onClose}
        />,
      );

      const closeButton = screen.getByRole("button", {
        name: "Close Position Lens",
      });
      expect(closeButton).toHaveTextContent("Close");

      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onPositionChange).not.toHaveBeenCalled();
    });
  });

  describe("assumptions and disclaimer", () => {
    it("renders the expiration-only assumption and the full disclaimer", () => {
      render(
        <PositionLens
          contract={CALL_CONTRACT}
          position="long_call"
          onPositionChange={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(
        screen.getByText(
          "Expiration-only estimate · one standard 100-share equity option contract",
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          "Analysis only. This is not an order ticket, does not include fees, taxes, margin requirements, assignment timing, or adjusted-contract deliverables.",
        ),
      ).toBeInTheDocument();
    });
  });
});
