export type ApiDecimal = string | null;

export type OptionType = "call" | "put" | "all";

export interface StockMarketSnapshot {
  symbol: string;
  last_trade_price: ApiDecimal;
  last_trade_timestamp: string | null;
  bid_price: ApiDecimal;
  ask_price: ApiDecimal;
  bid_size: number | null;
  ask_size: number | null;
  quote_timestamp: string | null;
  day_open: ApiDecimal;
  day_high: ApiDecimal;
  day_low: ApiDecimal;
  day_close: ApiDecimal;
  day_volume: number | null;
  previous_close: ApiDecimal;
  day_change: ApiDecimal;
  day_change_percent: ApiDecimal;
  feed: string;
}

export interface OptionExpirationsResponse {
  symbol: string;
  expiration_dates: string[];
  dates_returned: number;
  catalog_pages_checked: number;
  catalog_scan_incomplete: boolean;
  window_start: string;
  window_end: string;
}

export interface OptionChainContract {
  contract_symbol: string;
  underlying_symbol: string;
  expiration_date: string;
  option_type: "call" | "put";
  strike_price: string;
  last_trade_price: ApiDecimal;
  last_trade_size: number | null;
  last_trade_timestamp: string | null;
  bid_price: ApiDecimal;
  ask_price: ApiDecimal;
  bid_size: number | null;
  ask_size: number | null;
  quote_timestamp: string | null;
  implied_volatility: ApiDecimal;
  delta: ApiDecimal;
  gamma: ApiDecimal;
  theta: ApiDecimal;
  vega: ApiDecimal;
  rho: ApiDecimal;
}

export interface OptionChainSideResponse {
  requested: boolean;
  option_type: "call" | "put";
  contracts: OptionChainContract[];
  contracts_returned: number;
  skipped_provider_contracts: number;
  provider_more_available: boolean;
  optionscope_truncated: boolean;
}

export interface OptionChainResponse {
  symbol: string;
  expiration_date: string;
  requested_option_type: OptionType;
  minimum_strike: ApiDecimal;
  maximum_strike: ApiDecimal;
  limit_per_side: number;
  calls: OptionChainSideResponse;
  puts: OptionChainSideResponse;
  response_may_be_incomplete: boolean;
  feed: string;
  provider: string;
  data_notice: string;
}

interface OptionChainRequest {
  symbol: string;
  expirationDate: string;
  optionType: OptionType;
  minimumStrike?: string;
  maximumStrike?: string;
  limit: number;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

function getErrorMessage(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  return "OptionScope could not complete that market-data request.";
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
    },
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }

  return payload as T;
}

export function getStockSnapshot(
  symbol: string,
): Promise<StockMarketSnapshot> {
  return request<StockMarketSnapshot>(
    `/market/stocks/${encodeURIComponent(symbol)}/snapshot`,
  );
}

export function getOptionExpirations(
  symbol: string,
): Promise<OptionExpirationsResponse> {
  return request<OptionExpirationsResponse>(
    `/market/options/${encodeURIComponent(symbol)}/expirations`,
  );
}

export function getOptionChain(
  requestData: OptionChainRequest,
): Promise<OptionChainResponse> {
  const query = new URLSearchParams({
    expiration_date: requestData.expirationDate,
    option_type: requestData.optionType,
    limit: String(requestData.limit),
  });

  if (requestData.minimumStrike) {
    query.set("minimum_strike", requestData.minimumStrike);
  }

  if (requestData.maximumStrike) {
    query.set("maximum_strike", requestData.maximumStrike);
  }

  return request<OptionChainResponse>(
    `/market/options/${encodeURIComponent(
      requestData.symbol,
    )}/chain?${query.toString()}`,
  );
}