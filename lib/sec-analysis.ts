// Pure risk/fundamental analysis math for the SEC-filing WebMCP tool.
// Score is derived from data we can actually source: price volatility &
// drawdown (from Supabase OHLCV), plus analyst sentiment when available.

export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

// Annualized volatility (%), std-dev of daily returns × √252.
export function annualizedVolatility(closes: number[]): number {
  const r = dailyReturns(closes);
  if (r.length < 2) return 0;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// Largest peak-to-trough decline (%), as a positive number.
export function maxDrawdown(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = (peak - c) / peak;
      if (dd > worst) worst = dd;
    }
  }
  return worst * 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface RiskInputs {
  volatility: number;
  drawdown: number;
  bullishRatio?: number | null;
}

export interface RiskResult {
  score: number; // 0-100, higher = riskier
  rating: "Low" | "Moderate" | "High";
  components: { volatility: number; drawdown: number; sentiment: number | null };
}

export function riskScore({ volatility, drawdown, bullishRatio }: RiskInputs): RiskResult {
  const volC = clamp(((volatility - 15) / (70 - 15)) * 100, 0, 100);
  const ddC = clamp((drawdown / 60) * 100, 0, 100);
  const hasSentiment = bullishRatio != null && Number.isFinite(bullishRatio);
  const sentC = hasSentiment ? clamp((1 - (bullishRatio as number)) * 100, 0, 100) : null;

  const score = Math.round(
    sentC != null ? volC * 0.4 + ddC * 0.35 + sentC * 0.25 : volC * 0.53 + ddC * 0.47,
  );
  const rating: RiskResult["rating"] = score < 34 ? "Low" : score < 67 ? "Moderate" : "High";
  return {
    score: clamp(score, 0, 100),
    rating,
    components: {
      volatility: Math.round(volC),
      drawdown: Math.round(ddC),
      sentiment: sentC == null ? null : Math.round(sentC),
    },
  };
}

export interface FilingAnalysis {
  symbol: string;
  score: number;
  rating: RiskResult["rating"];
  volatility: number;
  maxDrawdown: number;
  components: RiskResult["components"];
  marketCap: number | null; // millions USD
  industry: string | null;
  recommendation: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
}

// Markdown returned to the agent (the tool result).
export function formatAnalysisMarkdown(a: FilingAnalysis, highlight: string[]): string {
  const capB = a.marketCap ? `$${(a.marketCap / 1000).toFixed(1)}B` : "n/a";
  const rec = a.recommendation;
  const total = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const bullPct = rec && total ? Math.round(((rec.strongBuy + rec.buy) / total) * 100) : null;

  return [
    `# ${a.symbol} — Risk & Fundamental Snapshot`,
    ``,
    `**Risk score: ${a.score}/100 (${a.rating})**`,
    `- Annualized volatility: ${a.volatility}%`,
    `- Max drawdown: ${a.maxDrawdown}%`,
    `- Analyst sentiment: ${bullPct != null ? `${bullPct}% bullish (${total} analysts)` : "n/a"}`,
    ``,
    `#### 1. Fundamentals (the "numbers")`,
    `- Market cap: ${capB}${a.industry ? ` · Industry: ${a.industry}` : ""}`,
    `- Revenue & earnings growth, margins, balance-sheet health and valuation should be reviewed in the filing's financial statements.`,
    ``,
    `#### 2. Qualitative strengths (the "story")`,
    `- Competitive moat, total addressable market, and management/insider ownership are assessed from the filing narrative.`,
    ``,
    `Highlighted in the document: ${highlight.length ? highlight.join(", ") : "key dollar amounts, dates, and risk-factor language"}.`,
  ].join("\n");
}
