// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MarketSearchForm from "./MarketSearchForm";

describe("MarketSearchForm", () => {
  afterEach(() => {
    cleanup();
  });

  describe("structure and visible content", () => {
    it("renders the label, associated input, value, placeholder, hint, and Search button", () => {
      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );

      const input = screen.getByLabelText("Ticker symbol") as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe("TSM");
      expect(input).toHaveAttribute("placeholder", "NVDA");
      expect(input).toHaveAttribute("autoCapitalize", "characters");
      expect(input).toHaveAttribute("autoComplete", "off");
      expect(input).toHaveAttribute("spellCheck", "false");

      expect(
        screen.getByText(
          "Try an optionable ticker such as NVDA, AAPL, SPY, MSFT, or TSM.",
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: "Search" }),
      ).toBeInTheDocument();
    });
  });

  describe("controlled-input behavior", () => {
    it("calls onSymbolInputChange with the exact raw text, unnormalized", () => {
      const onSymbolInputChange = vi.fn();

      render(
        <MarketSearchForm
          symbolInput=""
          marketLoading={false}
          onSymbolInputChange={onSymbolInputChange}
          onSubmit={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByLabelText("Ticker symbol"), {
        target: { value: "  aapl  " },
      });

      expect(onSymbolInputChange).toHaveBeenCalledTimes(1);
      expect(onSymbolInputChange).toHaveBeenCalledWith("  aapl  ");
    });

    it("does not change its own displayed value without a new prop", () => {
      const onSymbolInputChange = vi.fn();

      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={onSymbolInputChange}
          onSubmit={vi.fn()}
        />,
      );

      const input = screen.getByLabelText("Ticker symbol") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "  aapl  " } });

      // Controlled component: the displayed value stays whatever the
      // symbolInput prop says until the parent re-renders with a new value.
      expect(input.value).toBe("TSM");
    });

    it("displays the new value once rerendered with the updated prop", () => {
      const { rerender } = render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );

      rerender(
        <MarketSearchForm
          symbolInput="  aapl  "
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );

      const input = screen.getByLabelText("Ticker symbol") as HTMLInputElement;
      expect(input.value).toBe("  aapl  ");
    });
  });

  describe("submit behavior", () => {
    it("calls onSubmit exactly once when the Search button is clicked", () => {
      const onSubmit = vi.fn((event) => event.preventDefault());

      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Search" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("calls onSubmit when Enter is pressed in the ticker input", () => {
      const onSubmit = vi.fn((event) => event.preventDefault());

      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={onSubmit}
        />,
      );

      const input = screen.getByLabelText("Ticker symbol");
      const form = input.closest("form")!;

      // jsdom does not synthesize a submit from a raw Enter keypress the
      // way a real browser does, so this exercises the same native path a
      // browser takes for Enter-to-submit on a single-field form.
      fireEvent.submit(form);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("does not submit on input change alone", () => {
      const onSubmit = vi.fn();

      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText("Ticker symbol"), {
        target: { value: "NVDA" },
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("loading behavior", () => {
    it("shows an enabled Search button when marketLoading is false", () => {
      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );

      const button = screen.getByRole("button", { name: "Search" });
      expect(button).toBeEnabled();
    });

    it("shows a disabled Loading… button when marketLoading is true, without changing the input value", () => {
      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={true}
          onSymbolInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );

      const button = screen.getByRole("button", { name: "Loading…" });
      expect(button).toBeDisabled();

      const input = screen.getByLabelText("Ticker symbol") as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe("TSM");
    });
  });

  describe("accessibility and attributes", () => {
    it("exposes exactly one textbox and one submit button", () => {
      render(
        <MarketSearchForm
          symbolInput="TSM"
          marketLoading={false}
          onSymbolInputChange={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(
        screen.getByRole("button", { name: "Search" }),
      ).toHaveAttribute("type", "submit");
    });
  });
});
