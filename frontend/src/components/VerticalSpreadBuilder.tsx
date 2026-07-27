import { useState } from "react";

import type { OptionChainContract, OptionChainResponse } from "../api";
import { getContractStrike } from "../positionLens";
import {
  analyzeVerticalSpread,
  getVerticalSpreadRequirements,
  type VerticalSpreadAnalysis,
  type VerticalSpreadStrategy,
} from "../verticalSpreads";
import {
  formatCurrency,
  formatCurrencyNumber,
  formatOutcome,
  getQuoteSourceLabel,
} from "../format";

const STRATEGIES: VerticalSpreadStrategy[] = [
  "bull_call_spread",
  "bear_call_spread",
  "bear_put_spread",
  "bull_put_spread",
];

interface VerticalSpreadBuilderProps {
  chain: OptionChainResponse;
  onClose: () => void;
}

export default function VerticalSpreadBuilder({
  chain,
  onClose,
}: VerticalSpreadBuilderProps) {
  const [strategy, setStrategy] =
    useState<VerticalSpreadStrategy>("bull_call_spread");
  const [longSymbol, setLongSymbol] = useState("");
  const [shortSymbol, setShortSymbol] = useState("");

  function handleStrategyChange(nextStrategy: VerticalSpreadStrategy) {
    setStrategy(nextStrategy);
    setLongSymbol("");
    setShortSymbol("");
  }

  function handleReset() {
    setLongSymbol("");
    setShortSymbol("");
  }

  const requirements = getVerticalSpreadRequirements(strategy);

  const side =
    requirements.optionType === "call" ? chain.calls : chain.puts;

  const sideContracts = side.contracts.filter(
    (contract) => getContractStrike(contract) !== null,
  );

  const longContract =
    sideContracts.find(
      (contract) => contract.contract_symbol === longSymbol,
    ) ?? null;

  const shortContract =
    sideContracts.find(
      (contract) => contract.contract_symbol === shortSymbol,
    ) ?? null;

  const longStrike = longContract ? getContractStrike(longContract) : null;
  const shortStrike = shortContract
    ? getContractStrike(shortContract)
    : null;

  function isEligibleAsLong(contract: OptionChainContract): boolean {
    const strike = getContractStrike(contract);

    if (strike === null) {
      return false;
    }

    if (shortStrike === null) {
      return true;
    }

    return requirements.longStrikePosition === "lower"
      ? strike < shortStrike
      : strike > shortStrike;
  }

  function isEligibleAsShort(contract: OptionChainContract): boolean {
    const strike = getContractStrike(contract);

    if (strike === null) {
      return false;
    }

    if (longStrike === null) {
      return true;
    }

    return requirements.longStrikePosition === "lower"
      ? strike > longStrike
      : strike < longStrike;
  }

  function getLongOptionReason(
    contract: OptionChainContract,
  ): string | null {
    if (!shortContract || isEligibleAsLong(contract)) {
      return null;
    }

    const relation =
      requirements.longStrikePosition === "lower" ? "lower than" : "higher than";

    return `must be ${relation} short leg (${formatCurrency(
      shortContract.strike_price,
    )})`;
  }

  function getShortOptionReason(
    contract: OptionChainContract,
  ): string | null {
    if (!longContract || isEligibleAsShort(contract)) {
      return null;
    }

    const relation =
      requirements.longStrikePosition === "lower" ? "higher than" : "lower than";

    return `must be ${relation} long leg (${formatCurrency(
      longContract.strike_price,
    )})`;
  }

  function getLongOptionLabel(contract: OptionChainContract): string {
    const base = `${formatCurrency(contract.strike_price)} · ask ${formatCurrency(
      contract.ask_price,
    )}`;
    const reason = getLongOptionReason(contract);

    return reason ? `${base} — ${reason}` : base;
  }

  function getShortOptionLabel(contract: OptionChainContract): string {
    const base = `${formatCurrency(contract.strike_price)} · bid ${formatCurrency(
      contract.bid_price,
    )}`;
    const reason = getShortOptionReason(contract);

    return reason ? `${base} — ${reason}` : base;
  }

  let analysis: VerticalSpreadAnalysis | null = null;
  let analysisError: string | null = null;

  if (longContract && shortContract) {
    try {
      analysis = analyzeVerticalSpread(strategy, {
        longContract,
        shortContract,
      });
    } catch (error) {
      analysisError =
        error instanceof Error
          ? error.message
          : "OptionScope could not analyze this spread.";
    }
  }

  const optionTypeLabel =
    requirements.optionType === "call" ? "call" : "put";
  const optionTypeTitle =
    requirements.optionType === "call" ? "Call" : "Put";

  const quotesUnavailable =
    analysis !== null &&
    (analysis.maximumProfit.kind === "unavailable" ||
      analysis.maximumLoss.kind === "unavailable");

  return (
    <section className="position-lens" id="vertical-spread-builder">
      <div className="position-lens__header">
        <div>
          <p className="eyebrow">VERTICAL SPREAD BUILDER</p>
          <h2>
            {chain.symbol} · {requirements.title}
          </h2>
        </div>

        <button
          className="position-lens__close"
          type="button"
          onClick={onClose}
        >
          Close spread builder
        </button>
      </div>

      <div
        className="position-tabs"
        aria-label="Vertical spread strategy"
      >
        {STRATEGIES.map((candidateStrategy) => {
          const meta = getVerticalSpreadRequirements(candidateStrategy);
          const isActive = candidateStrategy === strategy;

          return (
            <button
              key={candidateStrategy}
              type="button"
              aria-pressed={isActive}
              className={[
                "position-tab",
                isActive ? "position-tab--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handleStrategyChange(candidateStrategy)}
            >
              <span>{meta.title}</span>{" "}
              <span
                className={
                  meta.outlook === "bullish"
                    ? "metric-value--positive"
                    : "metric-value--negative"
                }
              >
                {meta.outlook === "bullish" ? "Bullish" : "Bearish"}
              </span>
            </button>
          );
        })}
      </div>

      {sideContracts.length === 0 ? (
        <p className="spread-builder__empty" role="status">
          {side.requested
            ? `No ${optionTypeLabel} contracts are currently loaded for this expiration. Adjust the strike window and reload the chain.`
            : `${requirements.title} needs ${optionTypeLabel} contracts. Reload the option chain with "${optionTypeTitle}s only" or "Calls + puts" selected.`}
        </p>
      ) : (
        <>
          <div className="spread-builder__legs-picker">
            <div className="spread-builder__select-group">
              <label htmlFor="spread-builder-long-select">
                Long leg — buy the {requirements.longStrikePosition}-strike{" "}
                {optionTypeLabel}
              </label>

              <select
                id="spread-builder-long-select"
                value={longSymbol}
                onChange={(event) => setLongSymbol(event.target.value)}
              >
                <option value="">Select a {optionTypeLabel} to buy</option>

                {sideContracts.map((contract) => (
                  <option
                    key={contract.contract_symbol}
                    value={contract.contract_symbol}
                    disabled={!isEligibleAsLong(contract)}
                  >
                    {getLongOptionLabel(contract)}
                  </option>
                ))}
              </select>
            </div>

            <div className="spread-builder__select-group">
              <label htmlFor="spread-builder-short-select">
                Short leg — sell the{" "}
                {requirements.longStrikePosition === "lower" ? "higher" : "lower"}
                -strike {optionTypeLabel}
              </label>

              <select
                id="spread-builder-short-select"
                value={shortSymbol}
                onChange={(event) => setShortSymbol(event.target.value)}
              >
                <option value="">Select a {optionTypeLabel} to sell</option>

                {sideContracts.map((contract) => (
                  <option
                    key={contract.contract_symbol}
                    value={contract.contract_symbol}
                    disabled={!isEligibleAsShort(contract)}
                  >
                    {getShortOptionLabel(contract)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="spread-builder__actions">
            <button
              className="position-lens__close"
              type="button"
              onClick={handleReset}
            >
              Reset selections
            </button>
          </div>
        </>
      )}

      {analysisError ? (
        <section className="message message--error" role="alert">
          <strong>Could not analyze this spread.</strong>
          <span>{analysisError}</span>
        </section>
      ) : null}

      {analysis ? (
        <>
          <div className="position-lens__summary">
            <div>
              <p className="position-lens__label">{analysis.title}</p>
              <p className="position-lens__outlook">
                {analysis.outlook === "bullish" ? "Bullish" : "Bearish"}{" "}
                outlook ·{" "}
                {analysis.entry.kind === "debit"
                  ? "net debit spread"
                  : "net credit spread"}
              </p>
            </div>

            <p className="position-lens__assumption">
              Expiration-only estimate · one standard 100-share equity
              option contract
            </p>
          </div>

          <div className="spread-builder__legs">
            <article className="position-metric">
              <p>Long leg</p>
              <strong>
                {formatCurrency(longContract!.strike_price)}{" "}
                {optionTypeTitle}
              </strong>
              <span>
                {formatCurrencyNumber(analysis.entry.longLeg.pricePerShare)}{" "}
                per share ·{" "}
                {getQuoteSourceLabel(analysis.entry.longLeg.quoteSource)}
              </span>
            </article>

            <article className="position-metric">
              <p>Short leg</p>
              <strong>
                {formatCurrency(shortContract!.strike_price)}{" "}
                {optionTypeTitle}
              </strong>
              <span>
                {formatCurrencyNumber(analysis.entry.shortLeg.pricePerShare)}{" "}
                per share ·{" "}
                {getQuoteSourceLabel(analysis.entry.shortLeg.quoteSource)}
              </span>
            </article>
          </div>

          <div className="position-metrics">
            <article className="position-metric">
              <p>Strike width</p>
              <strong>{formatCurrencyNumber(analysis.strikeWidth)}</strong>
            </article>

            <article className="position-metric">
              <p>
                {analysis.entry.kind === "debit" ? "Net debit" : "Net credit"}{" "}
                per share
              </p>
              <strong>{formatCurrencyNumber(analysis.entry.perShare)}</strong>
            </article>

            <article className="position-metric">
              <p>
                {analysis.entry.kind === "debit" ? "Net debit" : "Net credit"}{" "}
                per contract
              </p>
              <strong>
                {formatCurrencyNumber(analysis.entry.perContract)}
              </strong>
            </article>

            <article className="position-metric">
              <p>Break-even at expiration</p>
              <strong>
                {formatCurrencyNumber(analysis.breakEvenPrice)}
              </strong>
            </article>

            <article className="position-metric position-metric--positive">
              <p>Maximum profit</p>
              <strong>{formatOutcome(analysis.maximumProfit)}</strong>
            </article>

            <article className="position-metric position-metric--negative">
              <p>Maximum loss</p>
              <strong>{formatOutcome(analysis.maximumLoss)}</strong>
            </article>
          </div>

          <div
            className="position-lens__caution"
            role={quotesUnavailable ? "status" : undefined}
          >
            <strong>Risk note</strong>
            <span>{analysis.caution}</span>
          </div>
        </>
      ) : null}
    </section>
  );
}
