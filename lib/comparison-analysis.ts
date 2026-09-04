import type { OhlcvCandle, OhlcvSeries } from "@/lib/ohlcv";
import type { FinnhubNewsItem, FinnhubRecommendationItem, FinnhubFinancialsReportedResponse } from "@/lib/finnhub/client";

export type ComparisonChartStyle = "candles" | "bars" | "line" | "area" | "compare" | "split";

export type ChartToolId =
  | "cursor"
  | "trendline"
  | "horizontal"
  | "ray"
  | "channel"
  | "rectangle"
  | "brush"
  | "text"
  | "measure"
  | "abcd"
  | "xabcd"
  | "cypher"
  | "headshoulders"
  | "triangle"
  | "threedrives";

export interface ChartRawPoint {
  time: string | number;
  price: number;
}

export interface ChartDrawing {
  id: string;
  tool: ChartToolId;
  points: ChartRawPoint[];
  color: string;
  text?: string;
}

export interface DetectedChartPattern {
  id: string;
  symbol: string;
  name: string;
  tool: ChartToolId;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  rationale: string;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  drawings: ChartDrawing[];
}

export interface CompanyComparisonMetric {
  symbol: string;
  companyName: string;
  price: number;
  returnPct: number;
  high: number;
  low: number;
  rangeSpread: number;
  volatility: number;
  avgVolume: number;
  volumeMomentum: number;
  sharpeRatio: number;
  technicalHealth: number; // 0-100
  analystConsensus: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    total: number;
    consensusScore: number; // 1 to 5
    bullishRatio: number; // percentage
  } | null;
  reportedFinancials: {
    period?: string;
    grossProfit?: number;
    netIncome?: number;
    assets?: number;
    liabilities?: number;
    grossMarginPct?: number;
    profitMarginPct?: number;
    hasData: boolean;
  } | null;
  newsSummary: {
    articleCount: number;
    sentimentScore: number; // -1 to +1
    topCatalysts: string[];
    topRisks: string[];
  };
}

export interface ComparisonAnalysisResult {
  generatedAt: string;
  symbols: string[];
  metrics: CompanyComparisonMetric[];
  matrixLeaders: {
    highestReturn: string;
    lowestVolatility: string;
    bestSharpe: string;
    strongestAnalystConsensus: string;
    highestTechnicalHealth: string;
    highestVolume: string;
  };
  detectedPatterns: DetectedChartPattern[];
  newsComparison: Array<{
    symbol: string;
    sentiment: "bullish" | "bearish" | "neutral";
    verdict: string;
    keyHeadlines: string[];
  }>;
  aiVerdict: {
    topPick: string;
    topPickRationale: string;
    growthWinner: string;
    valueOrDefensiveWinner: string;
    momentumWinner: string;
    riskSummary: string;
    executiveSummary: string;
  };
}

// ─── Math & Indicator Helpers ──────────────────────────────────────────────────

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateRsi(candles: OhlcvCandle[], period = 14): number {
  if (candles.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ─── Pattern Detection On OHLCV Candles ────────────────────────────────────────

export function detectPatternsForSymbol(
  symbol: string,
  allCandles: OhlcvCandle[],
): DetectedChartPattern[] {
  if (!allCandles || allCandles.length < 15) return [];

  // ── Restrict analysis to the last 1 year of bars (≈252 trading days) so
  //    every detected swing point lands inside the default 1Y visible window.
  //    Without this, swing highs/lows from years ago produce drawing points
  //    that are off-screen and invisible on the chart.
  const ONE_YEAR_BARS = 252;
  const candles = allCandles.length > ONE_YEAR_BARS
    ? allCandles.slice(-ONE_YEAR_BARS)
    : allCandles;

  const patterns: DetectedChartPattern[] = [];
  const n = candles.length;

  // Identify local extrema (swing highs and lows)
  interface SwingPoint {
    index: number;
    candle: OhlcvCandle;
    type: "high" | "low";
  }

  const swings: SwingPoint[] = [];
  const window = Math.max(2, Math.floor(n / 25));

  for (let i = window; i < n - window; i++) {
    const curr = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= curr.high) isHigh = false;
      if (candles[j].low <= curr.low) isLow = false;
    }

    if (isHigh) swings.push({ index: i, candle: curr, type: "high" });
    else if (isLow) swings.push({ index: i, candle: curr, type: "low" });
  }

  const swingHighs = swings.filter((s) => s.type === "high");
  const swingLows = swings.filter((s) => s.type === "low");

  // 1. Head & Shoulders or Inverse Head & Shoulders
  if (swingHighs.length >= 3 && swingLows.length >= 2) {
    const h1 = swingHighs[swingHighs.length - 3];
    const h2 = swingHighs[swingHighs.length - 2];
    const h3 = swingHighs[swingHighs.length - 1];

    if (h2.candle.high > h1.candle.high && h2.candle.high > h3.candle.high) {
      const l1 = swingLows.find((l) => l.index > h1.index && l.index < h2.index);
      const l2 = swingLows.find((l) => l.index > h2.index && l.index < h3.index);

      if (l1 && l2) {
        const necklinePrice = (l1.candle.low + l2.candle.low) / 2;
        const target = necklinePrice - (h2.candle.high - necklinePrice) * 0.8;
        const lastCandle = candles[n - 1];

        patterns.push({
          id: `hs-${symbol}-${h2.candle.date}`,
          symbol,
          name: "Head & Shoulders Reversal",
          tool: "headshoulders",
          direction: "bearish",
          confidence: Math.min(88, 70 + Math.round(Math.abs(h1.candle.high - h3.candle.high) / h2.candle.high * 100)),
          rationale: `Classic reversal formation on ${symbol}. Peak head at $${h2.candle.high.toFixed(2)} flanked by symmetrical shoulders ($${h1.candle.high.toFixed(2)} & $${h3.candle.high.toFixed(2)}). Breakdown below neckline at $${necklinePrice.toFixed(2)} triggers targeted correction.`,
          entryPrice: +(necklinePrice * 0.99).toFixed(2),
          targetPrice: +target.toFixed(2),
          stopLoss: +(h3.candle.high * 1.01).toFixed(2),
          drawings: [
            {
              id: `hs-shape-${symbol}`,
              tool: "headshoulders",
              color: "#fbbf24",
              points: [
                { time: h1.candle.date, price: h1.candle.high },
                { time: h2.candle.date, price: h2.candle.high },
                { time: h3.candle.date, price: h3.candle.high },
                { time: l1.candle.date, price: l1.candle.low },
                { time: l2.candle.date, price: l2.candle.low },
              ],
            },
            {
              id: `hs-target-${symbol}`,
              tool: "measure",
              color: "#f87171",
              points: [
                { time: l2.candle.date, price: necklinePrice },
                { time: lastCandle.date, price: +target.toFixed(2) },
              ],
            },
            {
              id: `hs-note-${symbol}`,
              tool: "text",
              color: "#fbbf24",
              points: [{ time: h2.candle.date, price: +(h2.candle.high * 1.02).toFixed(2) }],
              text: `AI: H&S Top (Target $${target.toFixed(2)})`,
            },
          ],
        });
      }
    }
  }

  // 2. Ascending or Symmetrical Triangle
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const p1 = swingHighs[swingHighs.length - 2];
    const p2 = swingHighs[swingHighs.length - 1];
    const t1 = swingLows[swingLows.length - 2];
    const t2 = swingLows[swingLows.length - 1];

    if (t2.candle.low > t1.candle.low && Math.abs(p2.candle.high - p1.candle.high) / p1.candle.high < 0.04) {
      const resistance = (p1.candle.high + p2.candle.high) / 2;
      const breakoutTarget = resistance + (resistance - t1.candle.low) * 0.9;
      const lastCandle = candles[n - 1];

      patterns.push({
        id: `tri-${symbol}-${p2.candle.date}`,
        symbol,
        name: "Ascending Triangle Breakout",
        tool: "triangle",
        direction: "bullish",
        confidence: 84,
        rationale: `Bullish accumulation on ${symbol} with rising swing lows meeting flat overhead resistance at $${resistance.toFixed(2)}. Compression indicates imminent upside breakout toward $${breakoutTarget.toFixed(2)}.`,
        entryPrice: +(resistance * 1.005).toFixed(2),
        targetPrice: +breakoutTarget.toFixed(2),
        stopLoss: +(t2.candle.low * 0.98).toFixed(2),
        drawings: [
          {
            id: `tri-shape-${symbol}`,
            tool: "triangle",
            color: "#38bdf8",
            points: [
              { time: p1.candle.date, price: p1.candle.high },
              { time: t1.candle.date, price: t1.candle.low },
              { time: p2.candle.date, price: p2.candle.high },
              { time: t2.candle.date, price: t2.candle.low },
            ],
          },
          {
            id: `tri-measure-${symbol}`,
            tool: "measure",
            color: "#34d399",
            points: [
              { time: p2.candle.date, price: resistance },
              { time: lastCandle.date, price: +breakoutTarget.toFixed(2) },
            ],
          },
          {
            id: `tri-text-${symbol}`,
            tool: "text",
            color: "#38bdf8",
            points: [{ time: p2.candle.date, price: +(resistance * 1.02).toFixed(2) }],
            text: `Breakout Level: $${resistance.toFixed(2)} → $${breakoutTarget.toFixed(2)}`,
          },
        ],
      });
    }
  }

  // 3. Parallel Support/Resistance Channel
  {
    const recentCandles = candles.slice(-Math.min(50, n));
    const start = recentCandles[0];
    const end = recentCandles[recentCandles.length - 1];
    const minLow = Math.min(...recentCandles.map((c) => c.low));
    const maxHigh = Math.max(...recentCandles.map((c) => c.high));
    const isUptrend = end.close > start.close;

    patterns.push({
      id: `channel-${symbol}-${end.date}`,
      symbol,
      name: isUptrend ? "Ascending Trend Channel" : "Consolidation Range",
      tool: "channel",
      direction: isUptrend ? "bullish" : "neutral",
      confidence: 78,
      rationale: `Defines the primary trading corridor for ${symbol}. Lower support bound at $${minLow.toFixed(2)}, upper resistance envelope at $${maxHigh.toFixed(2)}.`,
      entryPrice: +(minLow * 1.01).toFixed(2),
      targetPrice: +maxHigh.toFixed(2),
      stopLoss: +(minLow * 0.97).toFixed(2),
      drawings: [
        {
          id: `channel-shape-${symbol}`,
          tool: "channel",
          color: isUptrend ? "#34d399" : "#60a5fa",
          points: [
            { time: start.date, price: start.low },
            { time: end.date, price: isUptrend ? end.low : start.low },
            { time: start.date, price: maxHigh },
          ],
        },
        {
          id: `channel-text-${symbol}`,
          tool: "text",
          color: isUptrend ? "#34d399" : "#60a5fa",
          points: [{ time: end.date, price: +(maxHigh * 1.01).toFixed(2) }],
          text: `Channel Ceiling: $${maxHigh.toFixed(2)}`,
        },
      ],
    });
  }

  // 4. Harmonic ABCD extension
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const a = swingHighs[swingHighs.length - 2];
    const b = swingLows[swingLows.length - 2];
    const c = swingHighs[swingHighs.length - 1];
    const ab = a.candle.high - b.candle.low;
    const projectedD = c.candle.high - ab * 1.272;

    if (ab > 0 && projectedD > 0) {
      const last = candles[n - 1];
      patterns.push({
        id: `abcd-${symbol}-${c.candle.date}`,
        symbol,
        name: "Harmonic ABCD Extension",
        tool: "abcd",
        direction: projectedD < last.close ? "bullish" : "bearish",
        confidence: 76,
        rationale: `Harmonic leg completion for ${symbol}. Leg AB ($${ab.toFixed(2)}) projects potential reversal zone at Point D ($${projectedD.toFixed(2)}) based on 1.272 Fibonacci extension.`,
        entryPrice: +projectedD.toFixed(2),
        targetPrice: +c.candle.high.toFixed(2),
        stopLoss: +(projectedD * 0.96).toFixed(2),
        drawings: [
          {
            id: `abcd-shape-${symbol}`,
            tool: "abcd",
            color: "#fbbf24",
            points: [
              { time: a.candle.date, price: a.candle.high },
              { time: b.candle.date, price: b.candle.low },
              { time: c.candle.date, price: c.candle.high },
              { time: last.date, price: +projectedD.toFixed(2) },
            ],
          },
        ],
      });
    }
  }

  return patterns;
}

// ─── News Sentiment Extraction ─────────────────────────────────────────────────

function analyzeNewsSentiment(news: FinnhubNewsItem[]): {
  sentimentScore: number;
  topCatalysts: string[];
  topRisks: string[];
} {
  if (!news || !news.length) {
    return { sentimentScore: 0, topCatalysts: [], topRisks: [] };
  }

  const positiveWords = ["surge", "jump", "record", "beat", "growth", "upgrade", "outperform", "profit", "gain", "bullish", "rally", "strong", "boost", "expanding"];
  const negativeWords = ["drop", "fall", "miss", "downgrade", "probe", "lawsuit", "slump", "loss", "bearish", "plunge", "concern", "decline", "warning", "risk"];

  let score = 0;
  const topCatalysts: string[] = [];
  const topRisks: string[] = [];

  for (const item of news.slice(0, 15)) {
    const text = `${item.headline ?? ""} ${item.summary ?? ""}`.toLowerCase();
    let posCount = 0;
    let negCount = 0;

    positiveWords.forEach((w) => {
      if (text.includes(w)) posCount++;
    });
    negativeWords.forEach((w) => {
      if (text.includes(w)) negCount++;
    });

    if (posCount > negCount) {
      score += 1;
      if (topCatalysts.length < 3 && item.headline) topCatalysts.push(item.headline);
    } else if (negCount > posCount) {
      score -= 1;
      if (topRisks.length < 3 && item.headline) topRisks.push(item.headline);
    }
  }

  const normalized = Number((score / Math.max(news.length, 1)).toFixed(2));
  return {
    sentimentScore: Math.max(-1, Math.min(1, normalized)),
    topCatalysts: topCatalysts.length ? topCatalysts : ["Recent product & commercial developments", "Steady customer demand"],
    topRisks: topRisks.length ? topRisks : ["Macroeconomic rate headwinds", "Broad market volatility"],
  };
}

// ─── Main Comparison Synthesis Engine ──────────────────────────────────────────

export function analyzeComparison({
  series,
  newsMap,
  recommendationsMap,
  financialsMap,
}: {
  series: OhlcvSeries[];
  newsMap: Record<string, FinnhubNewsItem[]>;
  recommendationsMap: Record<string, FinnhubRecommendationItem[]>;
  financialsMap: Record<string, FinnhubFinancialsReportedResponse | null>;
}): ComparisonAnalysisResult {
  const symbols = series.map((s) => s.symbol);

  // 1. Process Metrics Per Company
  const metrics: CompanyComparisonMetric[] = series.map((s) => {
    const candles = s.candles;
    const first = candles[0];
    const last = candles.at(-1);

    const price = last?.close ?? 0;
    const returnPct = first && last && first.close > 0
      ? ((last.close - first.close) / first.close) * 100
      : 0;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const high = Math.max(...highs, 0);
    const low = Math.min(...lows, price);
    const rangeSpread = low > 0 ? ((high - low) / low) * 100 : 0;

    // Daily percentage changes for volatility
    const dailyReturns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1].close;
      if (prev > 0) dailyReturns.push((candles[i].close - prev) / prev);
    }
    const dailyStd = stdDev(dailyReturns);
    const volatility = Number((dailyStd * Math.sqrt(252) * 100).toFixed(2));

    // Sharpe Ratio (using 4% risk-free rate assumption)
    const annualizedReturn = returnPct * (252 / Math.max(candles.length, 1));
    const sharpeRatio = volatility > 0 ? Number(((annualizedReturn - 4) / volatility).toFixed(2)) : 0;

    // Volume
    const volumes = candles.map((c) => c.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / Math.max(volumes.length, 1);
    const recentVolume = volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.max(Math.min(10, volumes.length), 1);
    const volumeMomentum = avgVolume > 0 ? Number((recentVolume / avgVolume).toFixed(2)) : 1;

    // Technical health (0-100)
    const rsi = calculateRsi(candles);
    const sma20 = candles.slice(-20).reduce((a, b) => a + b.close, 0) / Math.min(20, candles.length);
    const sma50 = candles.slice(-50).reduce((a, b) => a + b.close, 0) / Math.min(50, candles.length);

    let technicalScore = 50;
    if (price > sma20) technicalScore += 15;
    if (price > sma50) technicalScore += 15;
    if (sma20 > sma50) technicalScore += 10;
    if (rsi >= 45 && rsi <= 65) technicalScore += 10;
    else if (rsi > 70) technicalScore -= 5;
    else if (rsi < 30) technicalScore -= 10;
    const technicalHealth = Math.max(10, Math.min(95, technicalScore));

    // Finnhub Analyst Recommendations
    const recs = recommendationsMap[s.symbol] ?? [];
    const latestRec = recs[0];
    let analystConsensus = null;
    if (latestRec) {
      const strongBuy = latestRec.strongBuy ?? 0;
      const buy = latestRec.buy ?? 0;
      const hold = latestRec.hold ?? 0;
      const sell = latestRec.sell ?? 0;
      const strongSell = latestRec.strongSell ?? 0;
      const total = strongBuy + buy + hold + sell + strongSell;
      const consensusScore = total > 0
        ? Number(((strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / total).toFixed(2))
        : 3;
      const bullishRatio = total > 0 ? Number((((strongBuy + buy) / total) * 100).toFixed(1)) : 50;

      analystConsensus = {
        strongBuy,
        buy,
        hold,
        sell,
        strongSell,
        total,
        consensusScore,
        bullishRatio,
      };
    }

    // Finnhub Reported Financials
    const fin = financialsMap[s.symbol];
    let reportedFinancials = null;
    if (fin?.data && fin.data.length > 0) {
      const latestFiling = fin.data[0];
      const ic = latestFiling.report?.ic ?? {};
      const bs = latestFiling.report?.bs ?? {};

      const grossProfit = ic.GrossProfit ?? ic.GrossMargin ?? undefined;
      const netIncome = ic.NetIncomeLoss ?? ic.NetIncome ?? undefined;
      const assets = bs.Assets ?? bs.TotalAssets ?? undefined;
      const liabilities = bs.Liabilities ?? bs.TotalLiabilities ?? undefined;

      reportedFinancials = {
        period: latestFiling.form ? `${latestFiling.form} · ${latestFiling.year ?? ""}` : undefined,
        grossProfit,
        netIncome,
        assets,
        liabilities,
        grossMarginPct: grossProfit && assets ? Number(((grossProfit / assets) * 100).toFixed(1)) : undefined,
        profitMarginPct: netIncome && grossProfit ? Number(((netIncome / grossProfit) * 100).toFixed(1)) : undefined,
        hasData: Boolean(grossProfit || netIncome || assets),
      };
    }

    // News sentiment
    const news = newsMap[s.symbol] ?? [];
    const newsSummary = {
      articleCount: news.length,
      ...analyzeNewsSentiment(news),
    };

    return {
      symbol: s.symbol,
      companyName: s.symbol,
      price: +price.toFixed(2),
      returnPct: +returnPct.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      rangeSpread: +rangeSpread.toFixed(2),
      volatility,
      avgVolume,
      volumeMomentum,
      sharpeRatio,
      technicalHealth,
      analystConsensus,
      reportedFinancials,
      newsSummary,
    };
  });

  // 2. Identify Matrix Leaders
  const highestReturn = [...metrics].sort((a, b) => b.returnPct - a.returnPct)[0]?.symbol ?? symbols[0];
  const lowestVolatility = [...metrics].sort((a, b) => a.volatility - b.volatility)[0]?.symbol ?? symbols[0];
  const bestSharpe = [...metrics].sort((a, b) => b.sharpeRatio - a.sharpeRatio)[0]?.symbol ?? symbols[0];
  const strongestAnalystConsensus = [...metrics].sort(
    (a, b) => (b.analystConsensus?.consensusScore ?? 0) - (a.analystConsensus?.consensusScore ?? 0)
  )[0]?.symbol ?? symbols[0];
  const highestTechnicalHealth = [...metrics].sort((a, b) => b.technicalHealth - a.technicalHealth)[0]?.symbol ?? symbols[0];
  const highestVolume = [...metrics].sort((a, b) => b.avgVolume - a.avgVolume)[0]?.symbol ?? symbols[0];

  // 3. Detect Chart Patterns for all series
  const detectedPatterns = series.flatMap((s) => detectPatternsForSymbol(s.symbol, s.candles));

  // 4. Comparative News Breakdown
  const newsComparison = metrics.map((m) => {
    const sentiment: "bullish" | "bearish" | "neutral" =
      m.newsSummary.sentimentScore > 0.15
        ? "bullish"
        : m.newsSummary.sentimentScore < -0.15
        ? "bearish"
        : "neutral";
    const verdict = sentiment === "bullish"
      ? `Positive market momentum fueled by favorable product announcements and growth headlines.`
      : sentiment === "bearish"
      ? `Cautious news cycle with elevated headwind commentary and sector scrutiny.`
      : `Balanced sentiment with stable operational updates and moderate volatility expectations.`;

    const keyHeadlines = newsMap[m.symbol]?.slice(0, 2).map((n) => n.headline || "") || [];

    return {
      symbol: m.symbol,
      sentiment,
      verdict,
      keyHeadlines: keyHeadlines.filter(Boolean),
    };
  });

  // 5. Strategic AI Verdict
  const topPick = bestSharpe || highestReturn;
  const growthWinner = highestReturn;
  const valueOrDefensiveWinner = lowestVolatility;
  const momentumWinner = highestTechnicalHealth;

  const executiveSummary = `Comprehensive benchmark between ${symbols.join(", ")} indicates ${topPick} delivers the optimal risk-adjusted profile with a Sharpe ratio of ${metrics.find((m) => m.symbol === topPick)?.sharpeRatio ?? 0}, compared to ${growthWinner}'s period return of ${metrics.find((m) => m.symbol === growthWinner)?.returnPct ?? 0}%. For lower volatility allocations, ${valueOrDefensiveWinner} stands out with ${metrics.find((m) => m.symbol === valueOrDefensiveWinner)?.volatility ?? 0}% annualized volatility.`;

  return {
    generatedAt: new Date().toISOString(),
    symbols,
    metrics,
    matrixLeaders: {
      highestReturn,
      lowestVolatility,
      bestSharpe,
      strongestAnalystConsensus,
      highestTechnicalHealth,
      highestVolume,
    },
    detectedPatterns,
    newsComparison,
    aiVerdict: {
      topPick,
      topPickRationale: `${topPick} exhibits the strongest risk-adjusted return metric and consistent technical support structure across the selected timeframe.`,
      growthWinner,
      valueOrDefensiveWinner,
      momentumWinner,
      riskSummary: `Key divergence lies in volatility spreads: ${growthWinner} exhibits high momentum while ${valueOrDefensiveWinner} protects downside during corrections.`,
      executiveSummary,
    },
  };
}
