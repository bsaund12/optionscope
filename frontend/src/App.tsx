import { type FormEvent, useState } from "react";

import {
  getOptionChain,
  getOptionExpirations,
  getStockSnapshot,
  type ApiDecimal,
  type OptionChainContract,
  type OptionChainResponse,
  type OptionChainSideResponse,
  type OptionType,
  type StockMarketSnapshot,
} from "./api";

import {
  analyzeSingleOptionPosition,
  getPositionLabel,
  getPositionModesForContract,
  type PositionMode,
  type PositionOutcome,
} from "./positionLens";

function numberFromApiValue(value: ApiDecimal): number | null {
  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatCurrency(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsedValue);
}

function formatCurrencyNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  const sign = parsedValue > 0 ? "+" : "";

  return `${sign}${parsedValue.toFixed(2)}%`;
}

function formatImpliedVolatility(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  return `${(parsedValue * 100).toFixed(2)}%`;
}

function formatGreek(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null) {
    return "—";
  }

  return parsedValue.toFixed(4);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatOutcome(outcome: PositionOutcome): string {
  if (outcome.kind === "unlimited") {
    return "Unlimited";
  }

  if (outcome.kind === "unavailable") {
    return "—";
  }

  return formatCurrencyNumber(outcome.amount);
}

function getQuoteSourceLabel(
  quoteSource:
    | "ask"
    | "bid"
    | "last_trade"
    | "unavailable",
): string {
  if (quoteSource === "ask") {
    return "using ask";
  }

  if (quoteSource === "bid") {
    return "using bid";
  }

  if (quoteSource === "last_trade") {
    return "using last trade";
  }

  return "quote unavailable";
}

function getDefaultStrikeWindow(referencePrice: ApiDecimal): {
  minimumStrike: string;
  maximumStrike: string;
} {
  const price = numberFromApiValue(referencePrice);

  if (price === null || price <= 0) {
    return {
      minimumStrike: "",
      maximumStrike: "",
    };
  }

  const strikeStep = price < 20 ? 1 : price < 100 ? 2.5 : 5;

  const minimumStrike = Math.max(
    strikeStep,
    Math.floor((price * 0.9) / strikeStep) * strikeStep,
  );

  const maximumStrike =
    Math.ceil((price * 1.1) / strikeStep) * strikeStep;

  return {
    minimumStrike: String(minimumStrike),
    maximumStrike: String(maximumStrike),
  };
}

type Moneyness = "itm" | "atm" | "otm" | "unknown";

function getDirectionalClass(value: ApiDecimal): string {
  const parsedValue = numberFromApiValue(value);

  if (parsedValue === null || parsedValue === 0) {
    return "metric-value--neutral";
  }

  return parsedValue > 0
    ? "metric-value--positive"
    : "metric-value--negative";
}

function classifyMoneyness(
  contract: OptionChainContract,
  underlyingPrice: ApiDecimal,
): Moneyness {
  const currentPrice = numberFromApiValue(underlyingPrice);
  const strikePrice = numberFromApiValue(contract.strike_price);

  if (
    currentPrice === null ||
    currentPrice <= 0 ||
    strikePrice === null
  ) {
    return "unknown";
  }

  const atmTolerance = Math.max(0.5, currentPrice * 0.003);

  if (Math.abs(strikePrice - currentPrice) <= atmTolerance) {
    return "atm";
  }

  if (contract.option_type === "call") {
    return strikePrice < currentPrice ? "itm" : "otm";
  }

  return strikePrice > currentPrice ? "itm" : "otm";
}

function getMoneynessLabel(moneyness: Moneyness): string {
  if (moneyness === "itm") {
    return "ITM";
  }

  if (moneyness === "atm") {
    return "ATM";
  }

  if (moneyness === "otm") {
    return "OTM";
  }

  return "—";
}

function ChainTable({
  title,
  side,
  underlyingPrice,
  selectedContractSymbol,
  onAnalyze,
}: {
  title: string;
  side: OptionChainSideResponse;
  underlyingPrice: ApiDecimal;
  selectedContractSymbol: string | null;
  onAnalyze: (contract: OptionChainContract) => void;
}) {
  if (!side.requested) {
    return (
      <section className="chain-panel">
        <div className="chain-panel__header">
          <h3>{title}</h3>
          <span>Not requested</span>
        </div>

        <p className="chain-panel__empty">
          Select “all” or “{side.option_type}” to load this side.
        </p>
      </section>
    );
  }

  if (side.contracts.length === 0) {
    return (
      <section className="chain-panel">
        <div className="chain-panel__header">
          <h3>{title}</h3>
          <span>0 contracts</span>
        </div>

        <p className="chain-panel__empty">
          No contracts matched the current expiration and strike filters.
        </p>
      </section>
    );
  }

  return (
    <section className="chain-panel">
      <div className="chain-panel__header">
        <div>
          <h3>{title}</h3>
          <p>
            {side.contracts_returned} returned
            {side.provider_more_available ? " · more available" : ""}
          </p>
        </div>

        <span>{side.option_type}</span>
      </div>

      <div className="chain-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Strike</th>
              <th>Mny.</th>
              <th>Last</th>
              <th>Bid</th>
              <th>Ask</th>
              <th>IV</th>
              <th>Delta</th>
              <th>Theta</th>
              <th>Lens</th>
            </tr>
          </thead>

          <tbody>
            {side.contracts.map((contract) => {
              const moneyness = classifyMoneyness(
                contract,
                underlyingPrice,
              );

              const isSelected =
                contract.contract_symbol === selectedContractSymbol;

              return (
                <tr
                  key={contract.contract_symbol}
                  className={[
                    "chain-row",
                    `chain-row--${moneyness}`,
                    isSelected ? "chain-row--selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td>{formatCurrency(contract.strike_price)}</td>

                  <td>
                    <span
                      className={`moneyness-badge moneyness-badge--${moneyness}`}
                    >
                      {getMoneynessLabel(moneyness)}
                    </span>
                  </td>

                  <td>{formatCurrency(contract.last_trade_price)}</td>
                  <td>{formatCurrency(contract.bid_price)}</td>
                  <td>{formatCurrency(contract.ask_price)}</td>

                  <td>
                    {formatImpliedVolatility(
                      contract.implied_volatility,
                    )}
                  </td>

                  <td>{formatGreek(contract.delta)}</td>
                  <td>{formatGreek(contract.theta)}</td>

                  <td>
                    <button
                      className="analyze-button"
                      type="button"
                      onClick={() => onAnalyze(contract)}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? "Selected" : "Analyze"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PositionLens({
  contract,
  position,
  onPositionChange,
  onClose,
}: {
  contract: OptionChainContract;
  position: PositionMode;
  onPositionChange: (position: PositionMode) => void;
  onClose: () => void;
}) {
  const availableModes = getPositionModesForContract(
    contract.option_type,
  );

  const analysis = analyzeSingleOptionPosition(contract, position);

  const entryLabel =
    analysis.entry.kind === "debit"
      ? "Estimated debit"
      : "Estimated credit";

  return (
    <section className="position-lens" id="position-lens">
      <div className="position-lens__header">
        <div>
          <p className="eyebrow">POSITION LENS</p>

          <h2>
            {contract.underlying_symbol} ·{" "}
            {formatCurrency(contract.strike_price)}{" "}
            {contract.option_type === "call" ? "Call" : "Put"}
          </h2>

          <p className="position-lens__contract">
            Expires {formatDate(contract.expiration_date)} ·{" "}
            {contract.contract_symbol}
          </p>
        </div>

        <button
          className="position-lens__close"
          type="button"
          onClick={onClose}
          aria-label="Close Position Lens"
        >
          Close
        </button>
      </div>

      <div className="position-tabs" aria-label="Position mode">
        {availableModes.map((mode) => (
          <button
            key={mode}
            type="button"
            className={[
              "position-tab",
              mode === position ? "position-tab--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onPositionChange(mode)}
          >
            {getPositionLabel(mode)}
          </button>
        ))}
      </div>

      <div className="position-lens__summary">
        <div>
          <p className="position-lens__label">{analysis.title}</p>
          <p className="position-lens__outlook">{analysis.outlook}</p>
        </div>

        <p className="position-lens__assumption">
          Expiration-only estimate · one standard 100-share equity
          option contract
        </p>
      </div>

      <div className="position-metrics">
        <article className="position-metric">
          <p>{entryLabel}</p>
          <strong>
            {formatCurrencyNumber(analysis.entry.amountPerContract)}
          </strong>
          <span>
            {formatCurrencyNumber(analysis.entry.pricePerShare)} per
            share · {getQuoteSourceLabel(analysis.entry.quoteSource)}
          </span>
        </article>

        <article className="position-metric">
          <p>Break-even at expiration</p>
          <strong>
            {formatCurrencyNumber(analysis.breakEvenPrice)}
          </strong>
          <span>Underlying price needed to offset premium</span>
        </article>

        <article className="position-metric position-metric--positive">
          <p>Maximum profit</p>
          <strong>{formatOutcome(analysis.maximumProfit)}</strong>
          <span>Expiration-only estimate</span>
        </article>

        <article className="position-metric position-metric--negative">
          <p>Maximum loss</p>
          <strong>{formatOutcome(analysis.maximumLoss)}</strong>
          <span>Expiration-only estimate</span>
        </article>
      </div>

      <div className="position-lens__caution">
        <strong>Risk note</strong>
        <span>{analysis.caution}</span>
      </div>

      <p className="position-lens__disclaimer">
        Analysis only. This is not an order ticket, does not include
        fees, taxes, margin requirements, assignment timing, or
        adjusted-contract deliverables.
      </p>
    </section>
  );
}

export default function App() {
  const [symbolInput, setSymbolInput] = useState("TSM");
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(
    null,
  );

  const [snapshot, setSnapshot] =
    useState<StockMarketSnapshot | null>(null);

  const [expirationDates, setExpirationDates] = useState<string[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState("");

  const [optionType, setOptionType] = useState<OptionType>("all");

  const [minimumStrike, setMinimumStrike] = useState("");
  const [maximumStrike, setMaximumStrike] = useState("");
  const [limitPerSide, setLimitPerSide] = useState("12");

  const [chain, setChain] = useState<OptionChainResponse | null>(
    null,
  );

  const [selectedContract, setSelectedContract] =
    useState<OptionChainContract | null>(null);

  const [selectedPosition, setSelectedPosition] =
    useState<PositionMode | null>(null);

  const [marketLoading, setMarketLoading] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);

  const [marketError, setMarketError] = useState<string | null>(
    null,
  );

  const [chainError, setChainError] = useState<string | null>(
    null,
  );

  async function handleMarketSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const symbol = symbolInput.trim().toUpperCase();

    if (!symbol) {
      setMarketError("Enter a ticker symbol first.");
      return;
    }

    setMarketLoading(true);
    setMarketError(null);
    setChainError(null);
    setChain(null);
    setSelectedContract(null);
    setSelectedPosition(null);

    try {
      const [nextSnapshot, expirationResponse] = await Promise.all([
        getStockSnapshot(symbol),
        getOptionExpirations(symbol),
      ]);

      const referencePrice =
        nextSnapshot.last_trade_price ?? nextSnapshot.day_close;

      const strikeWindow = getDefaultStrikeWindow(referencePrice);

      setSnapshot(nextSnapshot);
      setLoadedSymbol(nextSnapshot.symbol);
      setExpirationDates(expirationResponse.expiration_dates);

      setSelectedExpiration(
        expirationResponse.expiration_dates[0] ?? "",
      );

      setMinimumStrike(strikeWindow.minimumStrike);
      setMaximumStrike(strikeWindow.maximumStrike);
    } catch (error) {
      setSnapshot(null);
      setLoadedSymbol(null);
      setExpirationDates([]);
      setSelectedExpiration("");

      setMarketError(
        error instanceof Error
          ? error.message
          : "OptionScope could not load that ticker.",
      );
    } finally {
      setMarketLoading(false);
    }
  }

  async function handleChainLoad(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!loadedSymbol || !selectedExpiration) {
      setChainError(
        "Load a ticker and choose an expiration before loading an option chain.",
      );
      return;
    }

    const parsedLimit = Number(limitPerSide);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    ) {
      setChainError("Result limit must be a whole number from 1 to 100.");
      return;
    }

    setChainLoading(true);
    setChainError(null);
    setSelectedContract(null);
    setSelectedPosition(null);

    try {
      const nextChain = await getOptionChain({
        symbol: loadedSymbol,
        expirationDate: selectedExpiration,
        optionType,
        minimumStrike: minimumStrike.trim() || undefined,
        maximumStrike: maximumStrike.trim() || undefined,
        limit: parsedLimit,
      });

      setChain(nextChain);
    } catch (error) {
      setChainError(
        error instanceof Error
          ? error.message
          : "OptionScope could not load that option chain.",
      );
    } finally {
      setChainLoading(false);
    }
  }

  function handleAnalyzeContract(contract: OptionChainContract) {
    const availableModes = getPositionModesForContract(
      contract.option_type,
    );

    const firstMode = availableModes[0];

    if (!firstMode) {
      return;
    }

    setSelectedContract(contract);
    setSelectedPosition(firstMode);

    window.setTimeout(() => {
      document
        .getElementById("position-lens")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 0);
  }

  const latestPrice =
    snapshot?.last_trade_price ?? snapshot?.day_close ?? null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/">
          <span>Option</span>
          <strong>Scope</strong>
        </a>

        <p>Read-only options analytics</p>
      </header>

      <main className="content">
        <section className="hero">
          <p className="eyebrow">MARKET EXPLORER</p>

          <h1>
            See the option chain
            <br />
            before you build a trade idea.
          </h1>

          <p className="hero__copy">
            Search an underlying, review its market snapshot, choose an
            expiration, and inspect calls or puts around the current price.
          </p>
        </section>

        <section className="search-card">
          <form onSubmit={handleMarketSearch}>
            <label htmlFor="ticker-search">Ticker symbol</label>

            <div className="search-row">
              <input
                id="ticker-search"
                value={symbolInput}
                onChange={(event) => setSymbolInput(event.target.value)}
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

        {marketError ? (
          <section className="message message--error" role="alert">
            <strong>Could not load market data.</strong>
            <span>{marketError}</span>
          </section>
        ) : null}

        {snapshot ? (
          <>
            <section className="snapshot-card">
              <div className="snapshot-card__header">
                <div>
                  <p className="eyebrow">{snapshot.feed} MARKET DATA</p>
                  <h2>{snapshot.symbol}</h2>
                </div>

                <p className="timestamp">
                  Last available update:{" "}
                  {formatTimestamp(
                    snapshot.last_trade_timestamp ??
                      snapshot.quote_timestamp,
                  )}
                </p>
              </div>

              <div className="metrics-grid">
                <article className="metric">
                  <p>Last price</p>
                  <strong>{formatCurrency(latestPrice)}</strong>
                </article>

                <article className="metric">
                  <p>Day change</p>
                  <strong
                    className={getDirectionalClass(
                      snapshot.day_change_percent,
                    )}
                  >
                    {formatPercent(snapshot.day_change_percent)}
                  </strong>
                </article>

                <article className="metric">
                  <p>Bid / ask</p>
                  <strong>
                    {formatCurrency(snapshot.bid_price)} /{" "}
                    {formatCurrency(snapshot.ask_price)}
                  </strong>
                </article>

                <article className="metric">
                  <p>Day range</p>
                  <strong>
                    {formatCurrency(snapshot.day_low)} –{" "}
                    {formatCurrency(snapshot.day_high)}
                  </strong>
                </article>

                <article className="metric">
                  <p>Volume</p>
                  <strong>{formatNumber(snapshot.day_volume)}</strong>
                </article>
              </div>
            </section>

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

              <form onSubmit={handleChainLoad}>
                <div className="controls-grid">
                  <label>
                    Expiration
                    <select
                      value={selectedExpiration}
                      onChange={(event) =>
                        setSelectedExpiration(event.target.value)
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
                        setOptionType(event.target.value as OptionType)
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
                        setMinimumStrike(event.target.value)
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
                        setMaximumStrike(event.target.value)
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
                        setLimitPerSide(event.target.value)
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
          </>
        ) : (
          <section className="empty-state">
            <p className="eyebrow">READY WHEN YOU ARE</p>
            <h2>Search a ticker to begin.</h2>
            <p>
              OptionScope will load the latest available stock snapshot and
              active option expirations before you inspect the chain.
            </p>
          </section>
        )}

        {chainError ? (
          <section className="message message--error" role="alert">
            <strong>Could not load option chain.</strong>
            <span>{chainError}</span>
          </section>
        ) : null}

        {chain ? (
          <>
            <section className="notice-card">
              <div>
                <p className="eyebrow">DATA NOTICE</p>
                <h2>
                  {chain.symbol} · {formatDate(chain.expiration_date)}
                </h2>
              </div>

              <p>{chain.data_notice}</p>
            </section>

            {chain.response_may_be_incomplete ? (
              <section className="message">
                <strong>This is a filtered chain view.</strong>
                <span>
                  More contracts may exist than the number currently shown.
                </span>
              </section>
            ) : null}

            {selectedContract && selectedPosition ? (
              <PositionLens
                contract={selectedContract}
                position={selectedPosition}
                onPositionChange={setSelectedPosition}
                onClose={() => {
                  setSelectedContract(null);
                  setSelectedPosition(null);
                }}
              />
            ) : null}

            <section className="chains-grid">
              <ChainTable
                title="Calls"
                side={chain.calls}
                underlyingPrice={latestPrice}
                selectedContractSymbol={
                  selectedContract?.contract_symbol ?? null
                }
                onAnalyze={handleAnalyzeContract}
              />

              <ChainTable
                title="Puts"
                side={chain.puts}
                underlyingPrice={latestPrice}
                selectedContractSymbol={
                  selectedContract?.contract_symbol ?? null
                }
                onAnalyze={handleAnalyzeContract}
              />
            </section>
          </>
        ) : null}
      </main>

      <footer>
        <span>OptionScope</span>
        <span>Informational analysis only. Not financial advice.</span>
      </footer>
    </div>
  );
}