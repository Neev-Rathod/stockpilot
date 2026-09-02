// Pure technical-analysis helpers computed from real OHLCV.
import { sma, rsi } from "./indicators";

// Pearson correlation coefficient of two equal-length series.
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxx += x[i] * x[i];
    syy += y[i] * y[i];
    sxy += x[i] * y[i];
  }
  const cov = n * sxy - sx * sy;
  const dx = Math.sqrt(n * sxx - sx * sx);
  const dy = Math.sqrt(n * syy - sy * sy);
  if (dx === 0 || dy === 0) return 0;
  return Math.max(-1, Math.min(1, cov / (dx * dy)));
}

// Classic floor-trader pivot points from a single bar's H/L/C.
export interface PivotLevels {
  pivot: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
}
export function pivotLevels(high: number, low: number, close: number): PivotLevels {
  const pivot = (high + low + close) / 3;
  return {
    pivot,
    r1: 2 * pivot - low,
    s1: 2 * pivot - high,
    r2: pivot + (high - low),
    s2: pivot - (high - low),
    r3: high + 2 * (pivot - low),
    s3: low - 2 * (high - pivot),
  };
}

// Local swing highs/lows (pivots) from a value series.
export interface Swing {
  index: number;
  price: number;
  type: "high" | "low";
}
export function localSwings(values: number[], window = 5): Swing[] {
  const out: Swing[] = [];
  for (let i = window; i < values.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (values[j] >= values[i]) isHigh = false;
      if (values[j] <= values[i]) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: values[i], type: "high" });
    else if (isLow) out.push({ index: i, price: values[i], type: "low" });
  }
  return out;
}

// ── Backtesting ──────────────────────────────────────────────────────────────
export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number; // negative %
  winRate: number;
  totalTrades: number;
  sharpeRatio: number;
}

const ZERO: BacktestMetrics = {
  totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, sharpeRatio: 0,
};

function positionsFor(closes: number[], strategy: string): number[] {
  const n = closes.length;
  if (strategy === "buy_hold") return new Array(n).fill(1);

  if (strategy === "sma_crossover") {
    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    const pos: number[] = [];
    let cur = 0;
    for (let i = 0; i < n; i++) {
      if (s20[i] != null && s50[i] != null) cur = (s20[i] as number) > (s50[i] as number) ? 1 : 0;
      pos.push(cur);
    }
    return pos;
  }

  // rsi_mean_revert: buy oversold (<30), exit when recovered (>55)
  const r = rsi(closes, 14);
  const pos: number[] = [];
  let cur = 0;
  for (let i = 0; i < n; i++) {
    const v = r[i];
    if (v != null) {
      if (cur === 0 && v < 30) cur = 1;
      else if (cur === 1 && v > 55) cur = 0;
    }
    pos.push(cur);
  }
  return pos;
}

export function runBacktest(closes: number[], strategy: string): BacktestMetrics {
  const n = closes.length;
  if (n < 60) return ZERO;

  const position = positionsFor(closes, strategy);
  const dailyReturns: number[] = [];
  const trades: number[] = [];
  let inTrade = false;
  let entry = 0;

  for (let i = 1; i < n; i++) {
    const assetRet = closes[i - 1] > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
    dailyReturns.push((position[i - 1] || 0) * assetRet);
    if (!inTrade && position[i - 1] === 1) { inTrade = true; entry = closes[i - 1]; }
    if (inTrade && position[i] === 0) { inTrade = false; if (entry > 0) trades.push((closes[i] - entry) / entry); }
  }
  if (inTrade && entry > 0) trades.push((closes[n - 1] - entry) / entry);

  // Equity curve stats
  let eq = 1, peak = 1, maxDd = 0;
  for (const r of dailyReturns) {
    eq *= 1 + r;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? (peak - eq) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  const totalReturn = (eq - 1) * 100;
  const years = n / 252;
  const annualized = years > 0 && eq > 0 ? (Math.pow(eq, 1 / years) - 1) * 100 : totalReturn;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / (dailyReturns.length || 1);
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, dailyReturns.length - 1);
  const sd = Math.sqrt(variance);
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;

  const wins = trades.filter((t) => t > 0).length;
  const winRate = trades.length ? wins / trades.length : strategy === "buy_hold" ? (totalReturn >= 0 ? 1 : 0) : 0;

  return {
    totalReturn: +totalReturn.toFixed(2),
    annualizedReturn: +annualized.toFixed(2),
    maxDrawdown: +(-maxDd * 100).toFixed(2),
    winRate: +winRate.toFixed(3),
    totalTrades: strategy === "buy_hold" ? 1 : trades.length,
    sharpeRatio: +sharpe.toFixed(2),
  };
}
