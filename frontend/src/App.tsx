import { type FormEvent, useState } from "react";

import {
  getOptionChain,
  getOptionExpirations,
  getStockSnapshot,
  type OptionChainContract,
  type OptionChainResponse,
  type OptionType,
  type StockMarketSnapshot,
} from "./api";

import {
  getPositionModesForContract,
  type PositionMode,
} from "./positionLens";

import { formatDate, getDefaultStrikeWindow } from "./marketView";

import VerticalSpreadBuilder from "./components/VerticalSpreadBuilder";
import OptionChainTable from "./components/OptionChainTable";
import PositionLens from "./components/PositionLens";
import MarketSnapshot from "./components/MarketSnapshot";
import MarketSearchForm from "./components/MarketSearchForm";
import OptionChainControls from "./components/OptionChainControls";

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

  const [isSpreadBuilderOpen, setIsSpreadBuilderOpen] = useState(false);

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
    setIsSpreadBuilderOpen(false);

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
    setIsSpreadBuilderOpen(false);

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

        <MarketSearchForm
          symbolInput={symbolInput}
          marketLoading={marketLoading}
          onSymbolInputChange={setSymbolInput}
          onSubmit={handleMarketSearch}
        />

        {marketError ? (
          <section className="message message--error" role="alert">
            <strong>Could not load market data.</strong>
            <span>{marketError}</span>
          </section>
        ) : null}

        {snapshot ? (
          <>
            <MarketSnapshot snapshot={snapshot} latestPrice={latestPrice} />

            <OptionChainControls
              expirationDates={expirationDates}
              selectedExpiration={selectedExpiration}
              onExpirationChange={setSelectedExpiration}
              optionType={optionType}
              onOptionTypeChange={setOptionType}
              minimumStrike={minimumStrike}
              onMinimumStrikeChange={setMinimumStrike}
              maximumStrike={maximumStrike}
              onMaximumStrikeChange={setMaximumStrike}
              limitPerSide={limitPerSide}
              onLimitPerSideChange={setLimitPerSide}
              chainLoading={chainLoading}
              latestPrice={latestPrice}
              onSubmit={handleChainLoad}
            />
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

            {!isSpreadBuilderOpen ? (
              <div className="spread-builder-toggle">
                <button
                  type="button"
                  onClick={() => setIsSpreadBuilderOpen(true)}
                >
                  Build a vertical spread
                </button>
              </div>
            ) : null}

            {isSpreadBuilderOpen ? (
              <VerticalSpreadBuilder
                chain={chain}
                onClose={() => setIsSpreadBuilderOpen(false)}
              />
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
              <OptionChainTable
                title="Calls"
                side={chain.calls}
                underlyingPrice={latestPrice}
                selectedContractSymbol={
                  selectedContract?.contract_symbol ?? null
                }
                onAnalyze={handleAnalyzeContract}
              />

              <OptionChainTable
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