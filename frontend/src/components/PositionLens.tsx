import type { OptionChainContract } from "../api";
import {
  analyzeSingleOptionPosition,
  getPositionLabel,
  getPositionModesForContract,
  type PositionMode,
} from "../positionLens";
import {
  formatCurrency,
  formatCurrencyNumber,
  formatOutcome,
  getQuoteSourceLabel,
} from "../format";
import { formatDate } from "../marketView";

interface PositionLensProps {
  contract: OptionChainContract;
  position: PositionMode;
  onPositionChange: (position: PositionMode) => void;
  onClose: () => void;
}

export default function PositionLens({
  contract,
  position,
  onPositionChange,
  onClose,
}: PositionLensProps) {
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
