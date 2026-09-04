"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Newspaper,
  Bot,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import {
  ComparisonChart,
  type ChartStyle,
  type Drawing,
  type IndicatorState,
} from "@/components/comparison/comparison-chart";
import {
  getCompanyNews,
  getRecommendationTrends,
  getFinancialsReported,
  type FinnhubNewsItem,
  type FinnhubRecommendationItem,
  type FinnhubFinancialsReportedResponse,
} from "@/lib/finnhub/client";
import { getLocalOhlcv, type OhlcvSeries } from "@/lib/ohlcv";
import {
  analyzeComparison,
  type ComparisonAnalysisResult,
} from "@/lib/comparison-analysis";
import type { StockRange } from "@/lib/types";

const COMPANIES = [
  ["AAPL", "Apple Inc."],
  ["SBUX", "Starbucks Corporation"],
  ["MSFT", "Microsoft Corporation"],
  ["CSCO", "Cisco Systems, Inc."],
  ["QCOM", "QUALCOMM Incorporated"],
  ["META", "Meta Platforms, Inc."],
  ["AMZN", "Amazon.com, Inc."],
  ["TSLA", "Tesla, Inc."],
  ["AMD", "Advanced Micro Devices, Inc."],
  ["NFLX", "Netflix, Inc."],
] as const;

const RANGES: StockRange[] = ["1M", "3M", "6M", "1Y", "5Y"];
const RANGE_DAYS: Record<StockRange, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 31,
  "3M": 92,
  "6M": 184,
  "1Y": 366,
  "5Y": 1826,
};

function filterRange(series: OhlcvSeries[], range: StockRange) {
  const latest = series
    .flatMap((entry) => entry.candles.map((candle) => candle.date))
    .sort()
    .at(-1);
  if (!latest) return series;
  const cutoff = new Date(`${latest}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - RANGE_DAYS[range]);
  return series.map((entry) => ({
    ...entry,
    candles: entry.candles.filter(
      (candle) => new Date(`${candle.date}T00:00:00Z`) >= cutoff,
    ),
  }));
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(value * 1000);
}

export function CompareDashboard() {
  const searchParams = useSearchParams();
  const chartSectionRef = useRef<HTMLDivElement>(null);

  const initialSymbols = useMemo(() => {
    const raw = searchParams?.get("symbols");
    if (!raw) return ["AAPL", "MSFT"];
    const parsed = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => COMPANIES.some(([c]) => c === s));
    return parsed.length > 0 ? parsed.slice(0, 5) : ["AAPL", "MSFT"];
  }, [searchParams]);

  const [selected, setSelected] = useState<string[]>(initialSymbols);
  const [range, setRange] = useState<StockRange>("1Y");
  const [normalized, setNormalized] = useState(false);
  const [newsSymbol, setNewsSymbol] = useState(initialSymbols[0] || "AAPL");
  const [chartStyle, setChartStyle] = useState<ChartStyle>("candles");
  const [focusSymbol, setFocusSymbol] = useState<string>(
    initialSymbols[0] || "AAPL",
  );
  const [indicators, setIndicators] = useState<IndicatorState>({
    sma20: false,
    ema50: false,
    bollinger: false,
    volume: true,
    rsi: false,
    macd: false,
  });
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [showAiAnalysis, setShowAiAnalysis] = useState(true);

  // Sync newsSymbol & focusSymbol if selected list changes
  useEffect(() => {
    if (!selected.includes(newsSymbol) && selected[0]) {
      setNewsSymbol(selected[0]);
    }
    if (!selected.includes(focusSymbol) && selected[0]) {
      setFocusSymbol(selected[0]);
    }
  }, [selected, newsSymbol, focusSymbol]);

  // Unified WebMCP sync listener
  useEffect(() => {
    function handleSync(e: Event) {
      const d = (e as CustomEvent).detail;
      if (!d) return;

      if (Array.isArray(d.symbols) && d.symbols.length > 0) {
        const validSymbols = d.symbols
          .map((s: string) => String(s).toUpperCase())
          .filter((s: string) => COMPANIES.some(([c]) => c === s));
        if (validSymbols.length > 0) {
          setSelected(validSymbols.slice(0, 5));
        }
      }
      if (d.range && RANGES.includes(d.range)) {
        setRange(d.range);
      }
      if (typeof d.normalized === "boolean") {
        setNormalized(d.normalized);
      }
      if (d.chartStyle) {
        setChartStyle(d.chartStyle);
      }
      if (d.focusSymbol) {
        const sym = String(d.focusSymbol).toUpperCase();
        setFocusSymbol(sym);
        setNewsSymbol(sym);
      }
      if (d.indicators) {
        setIndicators((prev) => ({
          ...prev,
          sma20:
            d.indicators.sma !== undefined
              ? Boolean(d.indicators.sma)
              : d.indicators.sma20 !== undefined
                ? Boolean(d.indicators.sma20)
                : prev.sma20,
          ema50:
            d.indicators.ema !== undefined
              ? Boolean(d.indicators.ema)
              : d.indicators.ema50 !== undefined
                ? Boolean(d.indicators.ema50)
                : prev.ema50,
          bollinger:
            d.indicators.bollinger !== undefined
              ? Boolean(d.indicators.bollinger)
              : prev.bollinger,
          volume:
            d.indicators.volume !== undefined
              ? Boolean(d.indicators.volume)
              : prev.volume,
          rsi:
            d.indicators.rsi !== undefined
              ? Boolean(d.indicators.rsi)
              : d.indicators.rsi14 !== undefined
                ? Boolean(d.indicators.rsi14)
                : prev.rsi,
          macd:
            d.indicators.macd !== undefined
              ? Boolean(d.indicators.macd)
              : prev.macd,
        }));
      }
      if (d.clearDrawings) {
        setDrawings([]);
      }
      if (Array.isArray(d.drawings)) {
        const nextDrawings = d.clearDrawings ? d.drawings : undefined;
        if (d.clearDrawings) {
          setDrawings(d.drawings);
        } else {
          setDrawings((prev) => [...prev, ...d.drawings]);
        }
        // Also fire the chart-level event so the chart calls fitContent and
        // scrolls the time scale to the drawing points.  Use a small delay so
        // the dashboard state (selected symbols, focusSymbol, chartStyle) has
        // been applied before the chart tries to resolve coordinates.
        const focusSym = d.focusSymbol
          ? String(d.focusSymbol).toUpperCase()
          : undefined;
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("stockpilot:compare-chart:apply-ai-patterns", {
              detail: {
                symbol: focusSym,
                style: d.chartStyle ?? "candles",
                drawings: nextDrawings ?? d.drawings,
              },
            }),
          );
        }, 150);
      }
    }

    window.addEventListener("stockpilot:compare:sync", handleSync);
    const pending = sessionStorage.getItem("stockpilot:pending-compare-sync");
    if (pending) {
      sessionStorage.removeItem("stockpilot:pending-compare-sync");
      try {
        handleSync(
          new CustomEvent("stockpilot:compare:sync", {
            detail: JSON.parse(pending),
          }),
        );
      } catch {
        // Ignore malformed pending tool state.
      }
    }
    return () => {
      window.removeEventListener("stockpilot:compare:sync", handleSync);
    };
  }, []);

  // Load local OHLCV
  const history = useQuery({
    queryKey: ["local-ohlcv", selected],
    queryFn: () => getLocalOhlcv(selected),
    staleTime: Infinity,
  });

  const visibleSeries = useMemo(
    () => filterRange(history.data ?? [], range),
    [history.data, range],
  );

  // Load single-company news for bottom news section
  const news = useQuery({
    queryKey: ["company-news", newsSymbol],
    queryFn: () => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(to.getDate() - 30);
      return getCompanyNews(
        newsSymbol,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10),
      );
    },
    staleTime: 5 * 60_000,
  });

  // Multi-company data queries for AI analysis
  const multiNewsQuery = useQuery({
    queryKey: ["compare-multi-news", selected],
    queryFn: async () => {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 30 * 86400000)
        .toISOString()
        .slice(0, 10);
      const entries = await Promise.all(
        selected.map(async (symbol) => {
          const items = await getCompanyNews(symbol, from, to);
          return [symbol, items] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, FinnhubNewsItem[]>;
    },
    staleTime: 5 * 60_000,
  });

  const recommendationsQuery = useQuery({
    queryKey: ["compare-recommendations", selected],
    queryFn: async () => {
      const entries = await Promise.all(
        selected.map(async (symbol) => {
          const trends = await getRecommendationTrends(symbol);
          return [symbol, trends] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<
        string,
        FinnhubRecommendationItem[]
      >;
    },
    staleTime: 10 * 60_000,
  });

  const financialsQuery = useQuery({
    queryKey: ["compare-financials", selected],
    queryFn: async () => {
      const entries = await Promise.all(
        selected.map(async (symbol) => {
          const fin = await getFinancialsReported({
            symbol,
            freq: "quarterly",
          });
          return [symbol, fin] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<
        string,
        FinnhubFinancialsReportedResponse | null
      >;
    },
    staleTime: 30 * 60_000,
  });

  // Run AI Comparison Synthesis
  const aiAnalysis: ComparisonAnalysisResult | null = useMemo(() => {
    if (!visibleSeries.length) return null;
    return analyzeComparison({
      series: visibleSeries,
      newsMap: multiNewsQuery.data ?? {},
      recommendationsMap: recommendationsQuery.data ?? {},
      financialsMap: financialsQuery.data ?? {},
    });
  }, [
    visibleSeries,
    multiNewsQuery.data,
    recommendationsQuery.data,
    financialsQuery.data,
  ]);

  const metrics = useMemo(
    () =>
      visibleSeries.map((entry) => {
        const first = entry.candles[0];
        const last = entry.candles.at(-1);
        const returnPct =
          first && last ? ((last.close - first.close) / first.close) * 100 : 0;
        return {
          symbol: entry.symbol,
          price: last?.close ?? 0,
          returnPct,
          high: Math.max(...entry.candles.map((candle) => candle.high), 0),
          volume:
            entry.candles.reduce((total, candle) => total + candle.volume, 0) /
            Math.max(entry.candles.length, 1),
        };
      }),
    [visibleSeries],
  );

  const leader = [...metrics].sort((a, b) => b.returnPct - a.returnPct)[0];

  function toggle(symbol: string) {
    setSelected((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : current.length === 5
          ? [...current.slice(1), symbol]
          : [...current, symbol],
    );
  }

  function clearCanvas() {
    setDrawings([]);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("stockpilot:compare-chart:clear-drawings"),
      );
    }
    toast.info("Cleared chart canvas drawings.");
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Company Selector */}
      <section className="overflow-hidden rounded-3xl border border-hairline bg-[radial-gradient(circle_at_top_right,_rgba(245,183,10,.12),transparent_45%),#12141a] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-accent">
              <BarChart3 className="h-4 w-4" /> Multi-Stock Benchmark & AI
              Intelligence
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-txt sm:text-4xl">
              Comparative Analysis & Technical Canvas
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-txt-dim">
              Benchmark closing prices, examine reported financials &
              recommendation trends, and let AI detect and draw chart patterns
              directly onto the live canvas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-up">
                Data Feed
              </div>
              <div className="mt-0.5 text-xs font-semibold text-up">
                Local OHLCV + Finnhub
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-hairline/[0.08] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-txt-dim">
              Selected Benchmarks ({selected.length}/5):
            </p>
            {aiAnalysis && (
              <span className="text-[11px] text-txt-dim">
                AI Detected {aiAnalysis.detectedPatterns.length} technical
                patterns
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {COMPANIES.map(([symbol, name]) => (
              <button
                key={symbol}
                onClick={() => toggle(symbol)}
                aria-pressed={selected.includes(symbol)}
                title={name}
                className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
                  selected.includes(symbol)
                    ? "border-accent bg-accent text-txt shadow-md shadow-black/30"
                    : "border-hairline/[0.08] bg-elevated text-txt-dim hover:border-hairline hover:bg-accent/[.05]"
                }`}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Chart Canvas Section */}
      <section
        ref={chartSectionRef}
        className="rounded-3xl border border-hairline/[0.08] bg-panel p-4 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-txt text-lg">
                Price Performance & Canvas
              </h2>
            </div>
            <p className="mt-1 text-xs text-txt-dim">
              {normalized
                ? "Indexed to 100 at the start of period for equal base comparison."
                : "Actual daily price in USD. Switch styles or focus a stock to view AI drawings & indicators."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={clearCanvas}
              className="rounded-xl border border-hairline/[0.08] bg-elevated px-3 py-1.5 text-xs font-semibold text-txt-dim hover:text-txt hover:bg-accent/[0.05]"
            >
              Clear Canvas
            </button>
            <div className="flex rounded-xl border border-hairline/[0.08] bg-elevated p-1">
              {[
                [false, "Price"],
                [true, "Indexed Return"],
              ].map(([value, label]) => (
                <button
                  key={label as string}
                  onClick={() => setNormalized(value as boolean)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    normalized === value
                      ? "bg-accent text-txt shadow"
                      : "text-txt-dim hover:text-txt"
                  }`}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {RANGES.map((value) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                range === value
                  ? "bg-emerald-400 text-black font-extrabold shadow-sm"
                  : "bg-accent/[.04] text-txt-dim hover:bg-accent/[.08]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {history.isLoading ? (
          <div className="flex h-[440px] items-center justify-center text-sm text-txt-dim">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin text-accent" />{" "}
            Loading local market history…
          </div>
        ) : history.isError ? (
          <div className="flex h-[440px] items-center justify-center text-sm text-down">
            Could not load the local OHLCV files.
          </div>
        ) : (
          <ComparisonChart
            series={visibleSeries}
            normalized={normalized}
            chartStyle={chartStyle}
            onChartStyleChange={setChartStyle}
            focusSymbol={focusSymbol}
            onFocusSymbolChange={setFocusSymbol}
            indicators={indicators}
            onIndicatorsChange={setIndicators}
            drawings={drawings}
            onDrawingsChange={setDrawings}
          />
        )}
      </section>

      {/* AI Comparative Intelligence Panel */}
      {aiAnalysis && (
        <section className="rounded-3xl border border-hairline/[0.08] bg-panel p-5 sm:p-7 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline/[0.08] pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-accent">
                <Bot className="h-4 w-4 text-accent" />
                Comparative AI Intelligence
              </div>
              <h2 className="mt-1 text-xl font-extrabold text-txt sm:text-2xl">
                Multi-Vector Synthesis & Canvas Pattern Detection
              </h2>
              <p className="mt-1 text-xs text-txt-dim">
                Synthesized across historical OHLCV, Finnhub analyst
                recommendation trends, reported SEC financials & news.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowAiAnalysis((v) => !v)}
                className="rounded-xl border border-hairline/[0.08] bg-elevated p-2 text-txt-dim hover:text-txt"
                title={showAiAnalysis ? "Collapse" : "Expand"}
              >
                {showAiAnalysis ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {showAiAnalysis && (
            <div className="mt-6 space-y-7">
              {/* Executive Verdict Banner */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-hairline-strong bg-[color:var(--accent-soft)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                      Optimal Risk-Adjusted
                    </span>
                    <Trophy className="h-4 w-4 text-accent" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-txt">
                    {aiAnalysis.aiVerdict.topPick}
                  </div>
                  <p className="mt-1 text-xs text-txt-dim leading-relaxed">
                    {aiAnalysis.aiVerdict.topPickRationale}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-up">
                      Growth & Return Leader
                    </span>
                    <TrendingUp className="h-4 w-4 text-up" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-txt">
                    {aiAnalysis.aiVerdict.growthWinner}
                  </div>
                  <p className="mt-1 text-xs text-txt-dim leading-relaxed">
                    Delivered the highest absolute price appreciation over the
                    selected period.
                  </p>
                </div>

                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                      Defensive / Low Beta
                    </span>
                    <ShieldCheck className="h-4 w-4 text-purple-400" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-txt">
                    {aiAnalysis.aiVerdict.valueOrDefensiveWinner}
                  </div>
                  <p className="mt-1 text-xs text-txt-dim leading-relaxed">
                    Lowest annualized volatility; best suited for downside risk
                    mitigation.
                  </p>
                </div>
              </div>

              {/* Comprehensive Row x Column Comparison Matrix */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-txt flex items-center gap-2">
                    <Layers className="h-4 w-4 text-accent" />
                    Multi-Company Performance & Fundamental Matrix
                  </h3>
                  <span className="text-[11px] text-txt-dim">
                    Leader highlighted per category
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-hairline/[0.08] bg-elevated">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-hairline/[0.08] text-[10px] font-bold uppercase tracking-wider text-txt-dim bg-accent/[0.02]">
                        <th className="py-3 px-4">Metric</th>
                        {aiAnalysis.metrics.map((m) => (
                          <th
                            key={m.symbol}
                            className="py-3 px-4 font-mono text-sm text-txt"
                          >
                            {m.symbol}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline/[0.05]">
                      {/* Price */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          Last Close
                        </td>
                        {aiAnalysis.metrics.map((m) => (
                          <td
                            key={m.symbol}
                            className="py-3 px-4 font-mono text-txt"
                          >
                            ${m.price.toFixed(2)}
                          </td>
                        ))}
                      </tr>

                      {/* Period Return */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          Period Return
                        </td>
                        {aiAnalysis.metrics.map((m) => {
                          const isLead =
                            m.symbol === aiAnalysis.matrixLeaders.highestReturn;
                          return (
                            <td
                              key={m.symbol}
                              className={`py-3 px-4 font-bold ${
                                m.returnPct >= 0 ? "text-up" : "text-down"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                {m.returnPct >= 0 ? "+" : ""}
                                {m.returnPct.toFixed(2)}%
                                {isLead && (
                                  <span className="rounded bg-emerald-400/20 px-1 py-0.5 text-[9px] uppercase font-bold text-up">
                                    Top
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Volatility */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          Annualized Volatility
                        </td>
                        {aiAnalysis.metrics.map((m) => {
                          const isLead =
                            m.symbol ===
                            aiAnalysis.matrixLeaders.lowestVolatility;
                          return (
                            <td
                              key={m.symbol}
                              className="py-3 px-4 font-mono text-txt-dim"
                            >
                              <div className="flex items-center gap-1.5">
                                {m.volatility.toFixed(1)}%
                                {isLead && (
                                  <span className="rounded bg-[color:var(--accent-soft)] px-1 py-0.5 text-[9px] uppercase font-bold text-accent">
                                    Lowest
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Sharpe */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          Sharpe Ratio (4% Rf)
                        </td>
                        {aiAnalysis.metrics.map((m) => {
                          const isLead =
                            m.symbol === aiAnalysis.matrixLeaders.bestSharpe;
                          return (
                            <td
                              key={m.symbol}
                              className="py-3 px-4 font-mono text-txt"
                            >
                              <div className="flex items-center gap-1.5">
                                {m.sharpeRatio.toFixed(2)}
                                {isLead && (
                                  <span className="rounded bg-purple-400/20 px-1 py-0.5 text-[9px] uppercase font-bold text-purple-300">
                                    Best
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Technical Health */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          Technical Health
                        </td>
                        {aiAnalysis.metrics.map((m) => {
                          const isLead =
                            m.symbol ===
                            aiAnalysis.matrixLeaders.highestTechnicalHealth;
                          return (
                            <td key={m.symbol} className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-elevated">
                                  <div
                                    className={`h-full ${
                                      m.technicalHealth >= 70
                                        ? "bg-emerald-400"
                                        : m.technicalHealth >= 45
                                          ? "bg-accent"
                                          : "bg-rose-400"
                                    }`}
                                    style={{ width: `${m.technicalHealth}%` }}
                                  />
                                </div>
                                <span className="font-mono text-txt">
                                  {m.technicalHealth}/100
                                </span>
                                {isLead && (
                                  <span className="rounded bg-emerald-400/20 px-1 py-0.5 text-[9px] uppercase font-bold text-up">
                                    Top
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Analyst Consensus */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          Analyst Consensus
                        </td>
                        {aiAnalysis.metrics.map((m) => {
                          const rec = m.analystConsensus;
                          if (!rec) {
                            return (
                              <td
                                key={m.symbol}
                                className="py-3 px-4 text-txt-mute"
                              >
                                N/A
                              </td>
                            );
                          }
                          const isLead =
                            m.symbol ===
                            aiAnalysis.matrixLeaders.strongestAnalystConsensus;
                          return (
                            <td key={m.symbol} className="py-3 px-4">
                              <div className="flex items-center gap-1.5 font-bold text-txt">
                                {rec.consensusScore >= 4
                                  ? "Strong Buy"
                                  : rec.consensusScore >= 3.5
                                    ? "Buy"
                                    : "Hold"}{" "}
                                ({rec.consensusScore.toFixed(1)}/5)
                                {isLead && (
                                  <span className="rounded bg-emerald-400/20 px-1 py-0.5 text-[9px] uppercase font-bold text-up">
                                    Top
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-txt-dim mt-0.5">
                                {rec.bullishRatio}% Bullish ({rec.total}{" "}
                                analysts)
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Reported Financials */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          SEC Reported Filing
                        </td>
                        {aiAnalysis.metrics.map((m) => {
                          const fin = m.reportedFinancials;
                          if (!fin || !fin.hasData) {
                            return (
                              <td
                                key={m.symbol}
                                className="py-3 px-4 text-txt-mute"
                              >
                                Standard SEC Filing
                              </td>
                            );
                          }
                          return (
                            <td key={m.symbol} className="py-3 px-4">
                              <div className="font-medium text-txt">
                                {fin.period || "Quarterly"}
                              </div>
                              {fin.grossProfit && (
                                <div className="text-[10px] text-txt-dim">
                                  Gross: ${(fin.grossProfit / 1e9).toFixed(1)}B
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* News Sentiment */}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-txt-dim">
                          News Sentiment
                        </td>
                        {aiAnalysis.metrics.map((m) => {
                          const score = m.newsSummary.sentimentScore;
                          return (
                            <td key={m.symbol} className="py-3 px-4">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  score > 0.15
                                    ? "bg-emerald-400/20 text-up"
                                    : score < -0.15
                                      ? "bg-rose-400/20 text-down"
                                      : "bg-elevated text-txt-dim"
                                }`}
                              >
                                {score > 0.15
                                  ? "Bullish"
                                  : score < -0.15
                                    ? "Bearish"
                                    : "Neutral"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Analyst Recommendation Trends (Finnhub API) */}
              <div>
                <h3 className="text-sm font-bold text-txt flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-up" />
                  Finnhub Analyst Recommendation Trends
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {aiAnalysis.metrics.map((m) => {
                    const rec = m.analystConsensus;
                    if (!rec || rec.total === 0) {
                      return (
                        <div
                          key={m.symbol}
                          className="rounded-2xl border border-hairline/[0.08] bg-elevated p-4 text-xs text-txt-dim"
                        >
                          <div className="font-mono font-bold text-txt">
                            {m.symbol}
                          </div>
                          <p className="mt-1 text-txt-mute">
                            No active analyst recommendations found.
                          </p>
                        </div>
                      );
                    }

                    const strongBuyPct = (rec.strongBuy / rec.total) * 100;
                    const buyPct = (rec.buy / rec.total) * 100;
                    const holdPct = (rec.hold / rec.total) * 100;
                    const sellPct = (rec.sell / rec.total) * 100;
                    const strongSellPct = (rec.strongSell / rec.total) * 100;

                    return (
                      <div
                        key={m.symbol}
                        className="rounded-2xl border border-hairline/[0.08] bg-elevated p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-txt">
                            {m.symbol}
                          </span>
                          <span className="text-xs font-semibold text-up">
                            {rec.bullishRatio}% Bullish
                          </span>
                        </div>

                        {/* Stacked Recommendation Bar */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-elevated flex">
                          <div
                            style={{ width: `${strongBuyPct}%` }}
                            className="bg-emerald-500"
                            title={`Strong Buy: ${rec.strongBuy}`}
                          />
                          <div
                            style={{ width: `${buyPct}%` }}
                            className="bg-green-400"
                            title={`Buy: ${rec.buy}`}
                          />
                          <div
                            style={{ width: `${holdPct}%` }}
                            className="bg-accent"
                            title={`Hold: ${rec.hold}`}
                          />
                          <div
                            style={{ width: `${sellPct}%` }}
                            className="bg-orange-400"
                            title={`Sell: ${rec.sell}`}
                          />
                          <div
                            style={{ width: `${strongSellPct}%` }}
                            className="bg-rose-500"
                            title={`Strong Sell: ${rec.strongSell}`}
                          />
                        </div>

                        <div className="grid grid-cols-5 text-center text-[10px] text-txt-dim font-mono">
                          <div>
                            <span className="block text-up font-bold">
                              {rec.strongBuy}
                            </span>
                            <span>S-Buy</span>
                          </div>
                          <div>
                            <span className="block text-green-300 font-bold">
                              {rec.buy}
                            </span>
                            <span>Buy</span>
                          </div>
                          <div>
                            <span className="block text-accent font-bold">
                              {rec.hold}
                            </span>
                            <span>Hold</span>
                          </div>
                          <div>
                            <span className="block text-orange-300 font-bold">
                              {rec.sell}
                            </span>
                            <span>Sell</span>
                          </div>
                          <div>
                            <span className="block text-down font-bold">
                              {rec.strongSell}
                            </span>
                            <span>S-Sell</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Comparative News & Catalysts */}
              <div>
                <h3 className="text-sm font-bold text-txt flex items-center gap-2 mb-3">
                  <Newspaper className="h-4 w-4 text-accent" />
                  Comparative News Catalysts & Risks
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {aiAnalysis.newsComparison.map((nc) => {
                    const m = aiAnalysis.metrics.find(
                      (item) => item.symbol === nc.symbol,
                    );
                    return (
                      <div
                        key={nc.symbol}
                        className="rounded-2xl border border-hairline/[0.08] bg-elevated p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-txt">
                            {nc.symbol}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              nc.sentiment === "bullish"
                                ? "bg-emerald-400/20 text-up"
                                : nc.sentiment === "bearish"
                                  ? "bg-rose-400/20 text-down"
                                  : "bg-elevated text-txt-dim"
                            }`}
                          >
                            {nc.sentiment}
                          </span>
                        </div>
                        <p className="text-xs text-txt-dim leading-relaxed">
                          {nc.verdict}
                        </p>

                        {m?.newsSummary.topCatalysts?.length ? (
                          <div className="pt-2 border-t border-hairline/[0.06]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-up">
                              Primary Catalyst:
                            </span>
                            <p className="text-[11px] text-txt-dim line-clamp-2 mt-0.5">
                              {m.newsSummary.topCatalysts[0]}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Comparison Snapshot & Feed Section */}
      <div className="grid gap-6 xl:grid-cols-[1.45fr_.85fr]">
        <section className="rounded-3xl border border-hairline/[0.08] bg-panel p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-txt">Comparison Snapshot</h2>
              <p className="mt-1 text-xs text-txt-dim">
                Close, period return, high and average volume.
              </p>
            </div>
            {leader && (
              <div className="hidden rounded-xl bg-emerald-400/10 px-3 py-2 text-right sm:block border border-emerald-400/20">
                <div className="text-[10px] uppercase tracking-wider text-up font-bold">
                  Period leader
                </div>
                <div className="text-sm font-bold text-up">
                  {leader.symbol} · {leader.returnPct >= 0 ? "+" : ""}
                  {leader.returnPct.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-hairline/[.08] text-[10px] uppercase tracking-wider text-txt-mute">
                <tr>
                  <th className="pb-3 font-semibold">Symbol</th>
                  <th className="pb-3 font-semibold">Last close</th>
                  <th className="pb-3 font-semibold">Return</th>
                  <th className="pb-3 font-semibold">Period high</th>
                  <th className="pb-3 text-right font-semibold">Avg. volume</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr
                    key={metric.symbol}
                    className="border-b border-hairline/[.05] last:border-0"
                  >
                    <td className="py-3 font-mono font-bold text-txt">
                      {metric.symbol}
                    </td>
                    <td className="py-3 text-txt">
                      ${metric.price.toFixed(2)}
                    </td>
                    <td
                      className={`py-3 font-semibold ${
                        metric.returnPct >= 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {metric.returnPct >= 0 ? "+" : ""}
                      {metric.returnPct.toFixed(2)}%
                    </td>
                    <td className="py-3 text-txt-dim">
                      ${metric.high.toFixed(2)}
                    </td>
                    <td className="py-3 text-right font-mono text-txt-dim">
                      {Math.round(metric.volume).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-hairline/[0.08] bg-panel p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-accent">
                <Newspaper className="h-4 w-4" /> Company news
              </p>
              <h2 className="mt-1 font-bold text-txt">
                Latest on {newsSymbol}
              </h2>
            </div>
            <select
              aria-label="Company for news"
              value={newsSymbol}
              onChange={(event) => setNewsSymbol(event.target.value)}
              className="rounded-lg border border-hairline/[.1] bg-elevated px-2 py-1.5 text-xs font-bold text-txt outline-none"
            >
              {COMPANIES.map(([symbol]) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </div>
          <NewsList items={news.data ?? []} loading={news.isLoading} />
        </section>
      </div>
    </div>
  );
}

function NewsList({
  items,
  loading,
}: {
  items: FinnhubNewsItem[];
  loading: boolean;
}) {
  if (loading)
    return (
      <div className="py-12 text-center text-sm text-txt-dim">
        Loading news…
      </div>
    );
  if (!items.length)
    return (
      <div className="py-10 text-center text-sm text-txt-dim">
        No recent company news is available. Add{" "}
        <code className="rounded bg-accent/[.06] px-1.5 py-0.5 text-txt-dim">
          FINNHUB_API_KEY
        </code>{" "}
        to enable this feed.
      </div>
    );
  return (
    <div className="mt-5 space-y-3">
      {items.slice(0, 4).map((item) => (
        <a
          key={item.id ?? item.url}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="group block rounded-2xl border border-hairline/[.06] bg-elevated p-3 transition-colors hover:border-accent hover:bg-accent/[.04]"
        >
          <div className="flex gap-3">
            {item.image ? (
              <Image
                src={item.image}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="h-14 w-14 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent-soft)] text-accent">
                <Newspaper className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold leading-5 text-txt group-hover:text-accent">
                {item.headline}
              </p>
              <p className="mt-1 flex items-center gap-2 text-[11px] text-txt-mute">
                <span>{item.source || "News"}</span>
                {item.datetime ? (
                  <>
                    <span>·</span>
                    <span>
                      <CalendarDays className="mr-1 inline h-3 w-3" />
                      {formatDate(item.datetime)}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
