import type { FormEvent } from "react";

interface MarketSearchFormProps {
  symbolInput: string;
  marketLoading: boolean;
  onSymbolInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function MarketSearchForm({
  symbolInput,
  marketLoading,
  onSymbolInputChange,
  onSubmit,
}: MarketSearchFormProps) {
  return (
    <section className="search-card">
      <form onSubmit={onSubmit}>
        <label htmlFor="ticker-search">Ticker symbol</label>

        <div className="search-row">
          <input
            id="ticker-search"
            value={symbolInput}
            onChange={(event) => onSymbolInputChange(event.target.value)}
            placeholder="NVDA"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
          />

          <button type="submit" disabled={marketLoading}>
            {marketLoading ? "Loading…" : "Search"}
          </button>
        </div>
      </form>

      <p className="search-card__hint">
        Try an optionable ticker such as NVDA, AAPL, SPY, MSFT, or TSM.
      </p>
    </section>
  );
}
