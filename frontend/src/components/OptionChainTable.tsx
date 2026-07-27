import type {
  ApiDecimal,
  OptionChainContract,
  OptionChainSideResponse,
} from "../api";
import { formatCurrency } from "../format";
import {
  classifyMoneyness,
  formatGreek,
  formatImpliedVolatility,
  getMoneynessLabel,
} from "../marketView";

interface OptionChainTableProps {
  title: string;
  side: OptionChainSideResponse;
  underlyingPrice: ApiDecimal;
  selectedContractSymbol: string | null;
  onAnalyze: (contract: OptionChainContract) => void;
}

export default function OptionChainTable({
  title,
  side,
  underlyingPrice,
  selectedContractSymbol,
  onAnalyze,
}: OptionChainTableProps) {
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
