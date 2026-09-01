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

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: "above" | "below";
  createdAt: string;
  triggered: boolean;
}

export type ChartPatternType =
  | "head_and_shoulders"
  | "inverse_head_and_shoulders"
  | "abcd"
  | "xabcd"
  | "cypher"
  | "triangle_ascending"
  | "triangle_descending"
  | "triangle_symmetrical"
  | "three_drives"
  | "double_top"
  | "double_bottom";

export type ElliottWaveType =
  | "impulse_12345"
  | "correction_abc"
  | "triangle_abcde"
  | "double_combo_wxy"
  | "triple_combo_wxyxz";

export interface PatternPoint {
  label: string;
  priceLevel: number;
  description: string;
}

export interface PatternResult {
  symbol: string;
  pattern: ChartPatternType;
  confidence: number;
  direction: "bullish" | "bearish" | "neutral";
  description: string;
  keyPoints: PatternPoint[];
  projectedTarget: number | null;
  stopLoss: number | null;
  detectedAt: string;
}

export interface ElliottWaveResult {
  symbol: string;
  waveType: ElliottWaveType;
  confidence: number;
  currentWave: string;
  description: string;
  waves: PatternPoint[];
  projectedTarget: number | null;
  detectedAt: string;
}

export interface ScreenerCriteria {
  minPrice?: number;
  maxPrice?: number;
  minMarketCap?: number;
  maxPE?: number;
  minPercentChange?: number;
  maxPercentChange?: number;
  sector?: string;
  limit?: number;
}

export interface ScreenerResult {
  symbol: string;
  companyName: string;
  price: number;
  percentChange: number;
  marketCap?: number;
  sector?: string;
  score: number;
}

export interface PortfolioRiskMetrics {
  totalValue: number;
  concentrationRisk: "low" | "medium" | "high";
  topHoldingWeight: number;
  diversificationScore: number;
  estimatedBeta: number;
  sectorExposure: Record<string, number>;
  recommendation: string;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  startDate: string;
  endDate: string;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio: number;
}

