import type { FormEvent } from "react";

import type { ApiDecimal, OptionType } from "../api";
import { formatCurrency } from "../format";
import { formatDate } from "../marketView";

interface OptionChainControlsProps {
  expirationDates: string[];
  selectedExpiration: string;
  onExpirationChange: (value: string) => void;

  optionType: OptionType;
  onOptionTypeChange: (value: OptionType) => void;

  minimumStrike: string;
  onMinimumStrikeChange: (value: string) => void;

  maximumStrike: string;
  onMaximumStrikeChange: (value: string) => void;

  limitPerSide: string;
  onLimitPerSideChange: (value: string) => void;

  chainLoading: boolean;
  latestPrice: ApiDecimal;

  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function OptionChainControls({
  expirationDates,
  selectedExpiration,
  onExpirationChange,
  optionType,
  onOptionTypeChange,
  minimumStrike,
  onMinimumStrikeChange,
  maximumStrike,
  onMaximumStrikeChange,
  limitPerSide,
  onLimitPerSideChange,
  chainLoading,
  latestPrice,
  onSubmit,
}: OptionChainControlsProps) {
  return (
    <section className="chain-controls">
      <div className="section-heading">
        <div>
          <p className="eyebrow">OPTION CHAIN</p>
          <h2>Choose your view</h2>
        </div>

        {selectedExpiration ? (
          <p>{formatDate(selectedExpiration)}</p>
        ) : null}
      </div>

      <form onSubmit={onSubmit}>
        <div className="controls-grid">
          <label>
            Expiration
            <select
              value={selectedExpiration}
              onChange={(event) =>
                onExpirationChange(event.target.value)
              }
            >
              {expirationDates.map((expirationDate) => (
                <option
                  key={expirationDate}
                  value={expirationDate}
                >
                  {formatDate(expirationDate)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Chain side
            <select
              value={optionType}
              onChange={(event) =>
                onOptionTypeChange(event.target.value as OptionType)
              }
            >
              <option value="all">Calls + puts</option>
              <option value="call">Calls only</option>
              <option value="put">Puts only</option>
            </select>
          </label>

          <label>
            Minimum strike
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={minimumStrike}
              onChange={(event) =>
                onMinimumStrikeChange(event.target.value)
              }
            />
          </label>

          <label>
            Maximum strike
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={maximumStrike}
              onChange={(event) =>
                onMaximumStrikeChange(event.target.value)
              }
            />
          </label>

          <label>
            Limit per side
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={limitPerSide}
              onChange={(event) =>
                onLimitPerSideChange(event.target.value)
              }
            />
          </label>
        </div>

        <div className="chain-controls__footer">
          <p>
            ATM reference: <strong>{formatCurrency(latestPrice)}</strong>.
            The initial strike window is roughly ±10% around the
            latest available stock price. Adjust it freely.
          </p>

          <button type="submit" disabled={chainLoading}>
            {chainLoading ? "Loading chain…" : "Load option chain"}
          </button>
        </div>
      </form>
    </section>
  );
}
