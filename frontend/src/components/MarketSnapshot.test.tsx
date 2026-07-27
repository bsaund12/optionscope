// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { StockMarketSnapshot } from "../api";
import { formatTimestamp } from "../marketView";
import MarketSnapshot from "./MarketSnapshot";

function makeSnapshot(
  overrides: Partial<StockMarketSnapshot> = {},
): StockMarketSnapshot {
  return {
    symbol: "TSM",
    last_trade_price: "100.25",
    last_trade_timestamp: "2026-07-27T15:30:00Z",
    bid_price: "100.20",
    ask_price: "100.30",
    bid_size: 5,
    ask_size: 7,
    quote_timestamp: "2026-07-27T15:00:00Z",
    day_open: "98.50",
    day_high: "102.00",
    day_low: "98.00",
    day_close: "99.10",
    day_volume: 1234567,
    previous_close: "97.80",
    day_change: "2.45",
    day_change_percent: "2.25",
    feed: "sip",
    ...overrides,
  };
}

describe("MarketSnapshot", () => {
  afterEach(() => {
    cleanup();
  });

  describe("header and identity", () => {
    it("renders the feed value followed by MARKET DATA and the ticker symbol", () => {
      const snapshot = makeSnapshot({ feed: "sip", symbol: "TSM" });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      expect(screen.getByText("sip MARKET DATA")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "TSM" }),
      ).toBeInTheDocument();
    });

    it("renders the 'Last available update' label", () => {
      const snapshot = makeSnapshot();

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      expect(screen.getByText(/Last available update:/)).toBeInTheDocument();
    });
  });

  describe("timestamp behavior", () => {
    it("uses last_trade_timestamp when it is present", () => {
      const snapshot = makeSnapshot({
        last_trade_timestamp: "2026-07-27T15:30:00Z",
        quote_timestamp: "2026-07-27T10:00:00Z",
      });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const expected = formatTimestamp(snapshot.last_trade_timestamp);
      expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    });

    it("falls back to quote_timestamp when last_trade_timestamp is null", () => {
      const snapshot = makeSnapshot({
        last_trade_timestamp: null,
        quote_timestamp: "2026-07-27T10:00:00Z",
      });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const expected = formatTimestamp(snapshot.quote_timestamp);
      expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    });

    it("displays an em dash when both timestamps are null", () => {
      const snapshot = makeSnapshot({
        last_trade_timestamp: null,
        quote_timestamp: null,
      });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      expect(
        screen.getByText("Last available update: —"),
      ).toBeInTheDocument();
    });
  });

  describe("metrics", () => {
    const snapshot = makeSnapshot({
      bid_price: "100.20",
      ask_price: "100.30",
      day_low: "98.00",
      day_high: "102.00",
      day_volume: 1234567,
      day_change_percent: "2.25",
    });

    it("displays the supplied latestPrice as Last price", () => {
      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const lastPriceCard = screen.getByText("Last price").closest("article")!;
      expect(within(lastPriceCard).getByText("$100.25")).toBeInTheDocument();
    });

    it("displays day_change_percent as Day change", () => {
      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const dayChangeCard = screen.getByText("Day change").closest("article")!;
      expect(within(dayChangeCard).getByText("+2.25%")).toBeInTheDocument();
    });

    it("displays bid and ask in the existing combined format", () => {
      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const bidAskCard = screen.getByText("Bid / ask").closest("article")!;
      expect(
        within(bidAskCard).getByText("$100.20 / $100.30"),
      ).toBeInTheDocument();
    });

    it("displays day low and high in the existing range format", () => {
      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const dayRangeCard = screen.getByText("Day range").closest("article")!;
      expect(
        within(dayRangeCard).getByText("$98.00 – $102.00"),
      ).toBeInTheDocument();
    });

    it("displays volume using en-US grouping", () => {
      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const volumeCard = screen.getByText("Volume").closest("article")!;
      expect(within(volumeCard).getByText("1,234,567")).toBeInTheDocument();
    });

    it("displays em dashes for missing nullable values", () => {
      const missingValues = makeSnapshot({
        bid_price: null,
        ask_price: null,
        day_low: null,
        day_high: null,
        day_volume: null,
        day_change_percent: null,
      });

      render(<MarketSnapshot snapshot={missingValues} latestPrice={null} />);

      const lastPriceCard = screen.getByText("Last price").closest("article")!;
      expect(within(lastPriceCard).getByText("—")).toBeInTheDocument();

      const dayChangeCard = screen.getByText("Day change").closest("article")!;
      expect(within(dayChangeCard).getByText("—")).toBeInTheDocument();

      const bidAskCard = screen.getByText("Bid / ask").closest("article")!;
      expect(within(bidAskCard).getByText("— / —")).toBeInTheDocument();

      const dayRangeCard = screen.getByText("Day range").closest("article")!;
      expect(within(dayRangeCard).getByText("— – —")).toBeInTheDocument();

      const volumeCard = screen.getByText("Volume").closest("article")!;
      expect(within(volumeCard).getByText("—")).toBeInTheDocument();
    });
  });

  describe("directional styling", () => {
    it("applies metric-value--positive for a positive day change", () => {
      const snapshot = makeSnapshot({ day_change_percent: "1.5" });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const dayChangeCard = screen.getByText("Day change").closest("article")!;
      expect(within(dayChangeCard).getByText("+1.50%")).toHaveClass(
        "metric-value--positive",
      );
    });

    it("applies metric-value--negative for a negative day change", () => {
      const snapshot = makeSnapshot({ day_change_percent: "-1.5" });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const dayChangeCard = screen.getByText("Day change").closest("article")!;
      expect(within(dayChangeCard).getByText("-1.50%")).toHaveClass(
        "metric-value--negative",
      );
    });

    it("applies metric-value--neutral for a zero day change", () => {
      const snapshot = makeSnapshot({ day_change_percent: "0" });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const dayChangeCard = screen.getByText("Day change").closest("article")!;
      expect(within(dayChangeCard).getByText("0.00%")).toHaveClass(
        "metric-value--neutral",
      );
    });

    it("applies metric-value--neutral when day change is missing", () => {
      const snapshot = makeSnapshot({ day_change_percent: null });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="100.25" />);

      const dayChangeCard = screen.getByText("Day change").closest("article")!;
      expect(within(dayChangeCard).getByText("—")).toHaveClass(
        "metric-value--neutral",
      );
    });
  });

  describe("prop-boundary behavior", () => {
    it("renders the supplied latestPrice prop rather than deriving it from the snapshot", () => {
      const snapshot = makeSnapshot({
        last_trade_price: "111.11",
        day_close: "222.22",
      });

      render(<MarketSnapshot snapshot={snapshot} latestPrice="333.33" />);

      const lastPriceCard = screen.getByText("Last price").closest("article")!;
      expect(within(lastPriceCard).getByText("$333.33")).toBeInTheDocument();
      expect(within(lastPriceCard).queryByText("$111.11")).not.toBeInTheDocument();
      expect(within(lastPriceCard).queryByText("$222.22")).not.toBeInTheDocument();
    });
  });
});
