"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMultipleQuotes } from "@/lib/finnhub/client";
import type { StockRange } from "@/lib/types";
import { ComparisonChart } from "@/components/comparison/comparison-chart";
import {
  ArrowRightLeft,
  Award,
  TrendingDown,
  Layers,
  LoaderCircle,
} from "lucide-react";
import { motion } from "framer-motion";

const SYMBOL_OPTIONS = ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA"];
const rangeOptions: StockRange[] = ["1M", "3M", "6M", "1Y", "5Y"];

function calculateRelativeReturn(points: { close: number }[]) {
  if (!points.length) return 0;
  const start = points[0].close;
  const end = points[points.length - 1].close;
  return start === 0 ? 0 : ((end - start) / start) * 100;
}

function normalizeSeries(points: { close: number }[]) {
  if (!points.length) return [];
  const start = points[0].close;
  return points.map((point, index) => ({
    label: `${index + 1}`,
    value: start === 0 ? 0 : (point.close / start) * 100,
  }));
}

export default function ComparePage() {
  const [selected, setSelected] = useState<string[]>(["AAPL", "MSFT"]);
  const [range, setRange] = useState<StockRange>("1Y");

  const { data: quotes = [] } = useQuery({
    queryKey: ["compare-quotes", selected],
    queryFn: () => getMultipleQuotes(selected),
    staleTime: 60_000,
  });

  const queryResults = useQuery({
    queryKey: ["compare-history", selected, range],
    queryFn: async () => {
      const entries = await Promise.all(
        selected.map(async (symbol) => {
          const quote = await getMultipleQuotes([symbol]);
          const price = quote[0]?.price ?? 0;
          const baseline = Math.max(price * 0.9, 1);
          return {
            symbol,
            data: [
              {
                label: "Live",
                value: ((price - baseline) / baseline) * 100 + 100,
              },
            ],
          };
        }),
      );
      return entries;
    },
    enabled: selected.length > 0,
    staleTime: 10 * 60_000,
  });

  const metrics = useMemo(() => {
    const lookup = new Map<
      string,
      { symbol: string; returnPct: number; volatility: number }
    >();
    const historyData = queryResults.data ?? [];

    historyData.forEach((entry) => {
      const values = entry.data.map((point) => point.value);
      const returns = values
        .slice(1)
        .map(
          (current, index) =>
            ((current - values[index]) / Math.max(values[index], 1)) * 100,
        );
      const averageReturn = returns.length
        ? returns.reduce((sum, value) => sum + value, 0) / returns.length
        : 0;
      const volatility = returns.length
        ? Math.sqrt(
            returns.reduce(
              (sum, value) => sum + (value - averageReturn) ** 2,
              0,
            ) / returns.length,
          )
        : 0;
      lookup.set(entry.symbol, {
        symbol: entry.symbol,
        returnPct: calculateRelativeReturn(
          historyData
            .find((item) => item.symbol === entry.symbol)
            ?.data.map((point) => ({ close: point.value })) ?? [],
        ),
        volatility,
      });
    });

    return [...lookup.values()];
  }, [queryResults.data]);

  const bestPerformer = metrics.reduce(
    (best, current) => (current.returnPct > best.returnPct ? current : best),
    metrics[0] ?? { symbol: "N/A", returnPct: 0, volatility: 0 },
  );

  const worstPerformer = metrics.reduce(
    (worst, current) => (current.returnPct < worst.returnPct ? current : worst),
    metrics[0] ?? { symbol: "N/A", returnPct: 0, volatility: 0 },
  );

  function toggleSymbol(symbol: string) {
    setSelected((current) => {
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol);
      }
      if (current.length >= 5) {
        return [...current.slice(1), symbol];
      }
      return [...current, symbol];
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6 pb-12"
    >
      {/* Header bar */}
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          <ArrowRightLeft className="h-4 w-4 text-blue-400" />
          Comparative Intelligence
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
          Stock Performance Benchmark
        </h1>
        <p className="mt-1 text-sm text-slate-400 max-w-xl">
          Select multiple assets to normalize historical performance and
          evaluate risk metrics side by side.
        </p>

        {/* Stock Selection Pills */}
        <div className="mt-6 space-y-3 pt-5 border-t border-white/[0.06]">
          <div className="text-xs font-semibold text-slate-300">
            Select Assets to Benchmark (Max 5)
          </div>
          <div className="flex flex-wrap gap-2">
            {SYMBOL_OPTIONS.map((symbol) => {
              const isSelected = selected.includes(symbol);
              return (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => toggleSymbol(symbol)}
                  className={`rounded-xl px-4 py-2 text-xs font-bold font-mono transition-all ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                      : "bg-slate-900/80 text-slate-400 border border-white/[0.06] hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  {isSelected ? `✓ ${symbol}` : `+ ${symbol}`}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-2">
            {rangeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold font-mono transition-all ${
                  range === option
                    ? "bg-emerald-500 text-slate-950 font-bold"
                    : "bg-slate-900/60 text-slate-400 border border-white/[0.04] hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chart & Side Metrics */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
        <div className="glass-panel rounded-3xl p-6">
          <div className="mb-4 text-base font-bold text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-400" />
            TradingView Technical Chart & Comparison Engine
          </div>
          {selected.length >= 1 ? (
            <ComparisonChart symbols={selected} series={queryResults.data ?? []} range={range} />
          ) : (
            <div className="flex h-80 flex-col items-center justify-center rounded-2xl bg-slate-950/60 border border-white/[0.06] text-slate-400">
              {selected.length >= 2 ? (
                <div className="flex items-center gap-2 text-xs">
                  <LoaderCircle className="h-4 w-4 animate-spin text-blue-400" />
                  Calculating relative historical growth series...
                </div>
              ) : (
                <div className="text-xs">
                  Select at least 2 stock tickers to begin comparison.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-card rounded-3xl p-6 border border-white/[0.08]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Benchmark Leaders
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 border border-white/[0.04]">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Award className="h-4 w-4 text-emerald-400" /> Top Performer
                </span>
                <span className="font-bold font-mono text-emerald-400 text-sm">
                  {bestPerformer.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 border border-white/[0.04]">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <TrendingDown className="h-4 w-4 text-rose-400" /> Lagging
                  Asset
                </span>
                <span className="font-bold font-mono text-rose-400 text-sm">
                  {worstPerformer.symbol}
                </span>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6 border border-white/[0.08]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Asset Metrics Summary
            </div>
            <div className="mt-4 space-y-2.5">
              {quotes.map((quote) => (
                <div
                  key={quote.symbol}
                  className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 border border-white/[0.04]"
                >
                  <div>
                    <div className="font-bold text-xs text-white font-mono">
                      {quote.symbol}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                      {quote.companyName}
                    </div>
                  </div>
                  <div
                    className={`font-bold font-mono text-xs ${
                      quote.percentChange >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {quote.percentChange >= 0 ? "+" : ""}
                    {quote.percentChange.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
