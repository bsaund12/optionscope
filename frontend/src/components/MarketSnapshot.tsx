import type { ApiDecimal, StockMarketSnapshot } from "../api";
import { formatCurrency } from "../format";
import {
  formatNumber,
  formatPercent,
  formatTimestamp,
  getDirectionalClass,
} from "../marketView";

interface MarketSnapshotProps {
  snapshot: StockMarketSnapshot;
  latestPrice: ApiDecimal;
}

export default function MarketSnapshot({
  snapshot,
  latestPrice,
}: MarketSnapshotProps) {
  return (
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
  );
}
