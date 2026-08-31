export type StockRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  type?: string;
}

export interface StockQuote {
  symbol: string;
  companyName: string;
  price: number;
  change: number;
  percentChange: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  currency: string;
}

export interface StockCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockHistory {
  symbol: string;
  range: StockRange;
  candles: StockCandle[];
}

export interface Stock {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  quote?: StockQuote;
  history?: StockHistory;
}

export interface Holding {
  symbol: string;
  companyName: string;
  quantity: number;
  averageBuyPrice: number;
}

export interface Transaction {
  id: string;
  symbol: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  timestamp: string;
}

export interface PortfolioState {
  virtualBalance: number;
  holdings: Holding[];
  transactions: Transaction[];
}

export interface ComparisonMetric {
  symbol: string;
  returnPct: number;
  volatility: number;
  priceChange: number;
  score: number;
  latest: number;
  start: number;
}
