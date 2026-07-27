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

import type { FormEvent } from "react";

import type { OptionType } from "../api";
import OptionChainControls from "./OptionChainControls";

interface RenderOverrides {
  expirationDates?: string[];
  selectedExpiration?: string;
  onExpirationChange?: (value: string) => void;
  optionType?: OptionType;
  onOptionTypeChange?: (value: OptionType) => void;
  minimumStrike?: string;
  onMinimumStrikeChange?: (value: string) => void;
  maximumStrike?: string;
  onMaximumStrikeChange?: (value: string) => void;
  limitPerSide?: string;
  onLimitPerSideChange?: (value: string) => void;
  chainLoading?: boolean;
  latestPrice?: string | null;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

function renderControls(overrides: RenderOverrides = {}) {
  const props = {
    expirationDates: ["2026-08-21", "2026-09-18"],
    selectedExpiration: "2026-08-21",
    onExpirationChange: vi.fn(),
    optionType: "all" as OptionType,
    onOptionTypeChange: vi.fn(),
    minimumStrike: "90",
    onMinimumStrikeChange: vi.fn(),
    maximumStrike: "110",
    onMaximumStrikeChange: vi.fn(),
    limitPerSide: "12",
    onLimitPerSideChange: vi.fn(),
    chainLoading: false,
    latestPrice: "100.00",
    onSubmit: vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
    ),
    ...overrides,
  };

  const view = render(<OptionChainControls {...props} />);

  return { ...view, props };
}

describe("OptionChainControls", () => {
  afterEach(() => {
    cleanup();
  });

  describe("heading and structure", () => {
    it("renders the eyebrow, heading, and current expiration when non-empty", () => {
      renderControls({ selectedExpiration: "2026-08-21" });

      expect(screen.getByText("OPTION CHAIN")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Choose your view" }),
      ).toBeInTheDocument();

      // "Aug 21, 2026" also appears as an <option> label in the Expiration
      // select, so this scopes to the heading's own paragraph.
      const heading = screen
        .getByRole("heading", { name: "Choose your view" })
        .closest<HTMLElement>(".section-heading")!;
      expect(within(heading).getByText("Aug 21, 2026")).toBeInTheDocument();
    });

    it("renders no expiration heading value when selectedExpiration is empty", () => {
      renderControls({ selectedExpiration: "", expirationDates: [] });

      expect(screen.queryByText("Aug 21, 2026")).not.toBeInTheDocument();
    });

    it("renders all five controls and the submit button", () => {
      renderControls();

      expect(screen.getByLabelText("Expiration")).toBeInTheDocument();
      expect(screen.getByLabelText("Chain side")).toBeInTheDocument();
      expect(screen.getByLabelText("Minimum strike")).toBeInTheDocument();
      expect(screen.getByLabelText("Maximum strike")).toBeInTheDocument();
      expect(screen.getByLabelText("Limit per side")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Load option chain" }),
      ).toBeInTheDocument();
    });
  });

  describe("expiration control", () => {
    it("renders every supplied date using formatDate, selecting the current value", () => {
      renderControls({
        expirationDates: ["2026-08-21", "2026-09-18"],
        selectedExpiration: "2026-09-18",
      });

      const select = screen.getByLabelText("Expiration") as HTMLSelectElement;
      expect(select.value).toBe("2026-09-18");

      expect(
        within(select).getByText("Aug 21, 2026"),
      ).toBeInTheDocument();
      expect(
        within(select).getByText("Sep 18, 2026"),
      ).toBeInTheDocument();
    });

    it("calls onExpirationChange with the exact raw date string and does not choose its own default", () => {
      const onExpirationChange = vi.fn();
      renderControls({
        expirationDates: ["2026-08-21", "2026-09-18"],
        selectedExpiration: "2026-08-21",
        onExpirationChange,
      });

      fireEvent.change(screen.getByLabelText("Expiration"), {
        target: { value: "2026-09-18" },
      });

      expect(onExpirationChange).toHaveBeenCalledTimes(1);
      expect(onExpirationChange).toHaveBeenCalledWith("2026-09-18");

      // The component itself must not change the selected value; it stays
      // whatever the selectedExpiration prop says until rerendered.
      const select = screen.getByLabelText("Expiration") as HTMLSelectElement;
      expect(select.value).toBe("2026-08-21");
    });
  });

  describe("chain-side control", () => {
    it("renders exactly the three options with their exact underlying values", () => {
      renderControls();

      const select = screen.getByLabelText("Chain side") as HTMLSelectElement;
      const options = within(select).getAllByRole("option");

      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent("Calls + puts");
      expect(options[0]).toHaveValue("all");
      expect(options[1]).toHaveTextContent("Calls only");
      expect(options[1]).toHaveValue("call");
      expect(options[2]).toHaveTextContent("Puts only");
      expect(options[2]).toHaveValue("put");
    });

    it("selects the supplied optionType", () => {
      renderControls({ optionType: "put" });

      const select = screen.getByLabelText("Chain side") as HTMLSelectElement;
      expect(select.value).toBe("put");
    });

    it("calls onOptionTypeChange with the exact OptionType value", () => {
      const onOptionTypeChange = vi.fn();
      renderControls({ optionType: "all", onOptionTypeChange });

      fireEvent.change(screen.getByLabelText("Chain side"), {
        target: { value: "call" },
      });

      expect(onOptionTypeChange).toHaveBeenCalledTimes(1);
      expect(onOptionTypeChange).toHaveBeenCalledWith("call");
    });
  });

  describe("strike controls", () => {
    it("renders the minimum-strike input with the existing attributes and value", () => {
      renderControls({ minimumStrike: "90" });

      const input = screen.getByLabelText(
        "Minimum strike",
      ) as HTMLInputElement;
      expect(input).toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("min", "0.01");
      expect(input).toHaveAttribute("step", "0.01");
      expect(input.value).toBe("90");
    });

    it("renders the maximum-strike input with the existing attributes and value", () => {
      renderControls({ maximumStrike: "110" });

      const input = screen.getByLabelText(
        "Maximum strike",
      ) as HTMLInputElement;
      expect(input).toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("min", "0.01");
      expect(input).toHaveAttribute("step", "0.01");
      expect(input.value).toBe("110");
    });

    it("passes the raw minimum-strike text through unnormalized", () => {
      const onMinimumStrikeChange = vi.fn();
      renderControls({ onMinimumStrikeChange });

      // A trailing zero like "92.50" would be collapsed to "92.5" by any
      // Number() round-trip, so receiving it verbatim proves the component
      // forwards the raw string rather than reparsing it. (A number input
      // sanitizes whitespace-padded values to "" at the DOM level, so
      // surrounding spaces aren't a usable probe here.)
      fireEvent.change(screen.getByLabelText("Minimum strike"), {
        target: { value: "92.50" },
      });

      expect(onMinimumStrikeChange).toHaveBeenCalledTimes(1);
      expect(onMinimumStrikeChange).toHaveBeenCalledWith("92.50");
    });

    it("passes the raw maximum-strike text through unnormalized", () => {
      const onMaximumStrikeChange = vi.fn();
      renderControls({ onMaximumStrikeChange });

      fireEvent.change(screen.getByLabelText("Maximum strike"), {
        target: { value: "108.50" },
      });

      expect(onMaximumStrikeChange).toHaveBeenCalledTimes(1);
      expect(onMaximumStrikeChange).toHaveBeenCalledWith("108.50");
    });
  });

  describe("limit control", () => {
    it("renders the limit input with the existing attributes and value", () => {
      renderControls({ limitPerSide: "12" });

      const input = screen.getByLabelText(
        "Limit per side",
      ) as HTMLInputElement;
      expect(input).toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("min", "1");
      expect(input).toHaveAttribute("max", "100");
      expect(input).toHaveAttribute("step", "1");
      expect(input.value).toBe("12");
    });

    it("passes the raw limit text through without parsing or validating it", () => {
      const onLimitPerSideChange = vi.fn();
      renderControls({ onLimitPerSideChange });

      fireEvent.change(screen.getByLabelText("Limit per side"), {
        target: { value: "0" },
      });

      expect(onLimitPerSideChange).toHaveBeenCalledTimes(1);
      expect(onLimitPerSideChange).toHaveBeenCalledWith("0");

      // The component does not reject or clamp an out-of-range value; it
      // simply forwards whatever string was entered. App.tsx owns
      // validation, as covered in App.test.tsx.
      fireEvent.change(screen.getByLabelText("Limit per side"), {
        target: { value: "1.5" },
      });
      expect(onLimitPerSideChange).toHaveBeenLastCalledWith("1.5");
    });
  });

  describe("footer and price presentation", () => {
    it("displays the ATM reference, formatted latestPrice, and the strike-window explanation", () => {
      renderControls({ latestPrice: "100.25" });

      expect(screen.getByText(/ATM reference:/)).toBeInTheDocument();
      expect(screen.getByText("$100.25")).toBeInTheDocument();
      expect(
        screen.getByText(
          /The initial strike window is roughly ±10% around the/,
        ),
      ).toBeInTheDocument();
    });

    it("displays an em dash when latestPrice is null", () => {
      renderControls({ latestPrice: null });

      expect(screen.getByText("—", { exact: true })).toBeInTheDocument();
    });
  });

  describe("submit and loading behavior", () => {
    it("calls onSubmit exactly once when the button is clicked, and not on input changes alone", () => {
      const onSubmit = vi.fn((event) => event.preventDefault());
      const onMinimumStrikeChange = vi.fn();

      renderControls({ onSubmit, onMinimumStrikeChange });

      fireEvent.change(screen.getByLabelText("Minimum strike"), {
        target: { value: "95" },
      });
      expect(onSubmit).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole("button", { name: "Load option chain" }),
      );

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("shows an enabled 'Load option chain' button when chainLoading is false", () => {
      renderControls({ chainLoading: false });

      const button = screen.getByRole("button", {
        name: "Load option chain",
      });
      expect(button).toBeEnabled();
    });

    it("shows a disabled 'Loading chain…' button when chainLoading is true, keeping controlled values visible", () => {
      renderControls({
        chainLoading: true,
        selectedExpiration: "2026-08-21",
        minimumStrike: "90",
        maximumStrike: "110",
        limitPerSide: "12",
      });

      const button = screen.getByRole("button", { name: "Loading chain…" });
      expect(button).toBeDisabled();

      expect(
        (screen.getByLabelText("Minimum strike") as HTMLInputElement).value,
      ).toBe("90");
      expect(
        (screen.getByLabelText("Maximum strike") as HTMLInputElement).value,
      ).toBe("110");
      expect(
        (screen.getByLabelText("Limit per side") as HTMLInputElement).value,
      ).toBe("12");
    });
  });

  describe("prop-boundary behavior", () => {
    it("reflects updated props after rerendering, without retaining independent local values", () => {
      const { rerender, props } = renderControls({
        selectedExpiration: "2026-08-21",
        optionType: "all",
        minimumStrike: "90",
        maximumStrike: "110",
        limitPerSide: "12",
        chainLoading: false,
      });

      rerender(
        <OptionChainControls
          {...props}
          selectedExpiration="2026-09-18"
          optionType="put"
          minimumStrike="85"
          maximumStrike="115"
          limitPerSide="25"
          chainLoading={true}
        />,
      );

      expect(
        (screen.getByLabelText("Expiration") as HTMLSelectElement).value,
      ).toBe("2026-09-18");
      expect(
        (screen.getByLabelText("Chain side") as HTMLSelectElement).value,
      ).toBe("put");
      expect(
        (screen.getByLabelText("Minimum strike") as HTMLInputElement).value,
      ).toBe("85");
      expect(
        (screen.getByLabelText("Maximum strike") as HTMLInputElement).value,
      ).toBe("115");
      expect(
        (screen.getByLabelText("Limit per side") as HTMLInputElement).value,
      ).toBe("25");
      expect(
        screen.getByRole("button", { name: "Loading chain…" }),
      ).toBeDisabled();
    });
  });
});
