"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { StockRange } from "@/lib/types";
import { CandlestickChart, LineChart as LineChartIcon } from "lucide-react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Dynamically import TradingView Advanced Real-Time Chart component with SSR disabled
const AdvancedRealTimeChart = dynamic(
  () =>
    import("react-ts-tradingview-widgets").then(
      (mod) => mod.AdvancedRealTimeChart
    ),
  { ssr: false }
);

export function ComparisonChart({
  symbols = ["AAPL", "MSFT"],
  series = [],
  range = "1Y",
}: {
  symbols?: string[];
  series?: Array<{
    symbol: string;
    data: Array<{ label: string; value: number }>;
  }>;
  range?: StockRange;
}) {
  const [mounted, setMounted] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState<string>(symbols[0] ?? "AAPL");
  const [viewMode, setViewMode] = useState<"tradingview" | "normalized">("tradingview");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (symbols.length > 0 && !symbols.includes(activeSymbol)) {
      setActiveSymbol(symbols[0]);
    }
  }, [symbols, activeSymbol]);

  // Format symbol for TradingView (e.g., AAPL -> NASDAQ:AAPL)
  const formatTvSymbol = (sym: string) => {
    if (sym.includes(":")) return sym;
    if (sym === "BTCUSD") return "BINANCE:BTCUSDT";
    if (sym === "EURUSD") return "FX:EURUSD";
    return `NASDAQ:${sym}`;
  };

  const formattedWatchlist = symbols.map(formatTvSymbol);
  const currentTvSymbol = formatTvSymbol(activeSymbol);

  // Prepare normalized Recharts data for secondary benchmark view
  const labels = series[0]?.data.map((point) => point.label) ?? [];
  const chartData = labels.map((label, index) => {
    const points: Record<string, number | string> = { label };
    series.forEach((entry) => {
      const point = entry.data[index];
      points[entry.symbol] = point?.value ?? 0;
    });
    return points;
  });

  return (
    <div className="space-y-4">
      {/* Top Controls: Active Asset Tabs & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        {/* Active Stock Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
            Benchmark Assets:
          </span>
          {symbols.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => setActiveSymbol(sym)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold font-mono transition-all ${
                activeSymbol === sym
                  ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]"
                  : "bg-slate-900/80 text-slate-400 border border-white/[0.06] hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {activeSymbol === sym ? `● ${sym}` : sym}
            </button>
          ))}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-950/80 p-1 border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setViewMode("tradingview")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold font-mono transition-all ${
              viewMode === "tradingview"
                ? "bg-blue-600 text-white shadow-sm font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CandlestickChart className="h-3.5 w-3.5" />
            TradingView Pro Engine
          </button>
          <button
            type="button"
            onClick={() => setViewMode("normalized")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold font-mono transition-all ${
              viewMode === "normalized"
                ? "bg-blue-600 text-white shadow-sm font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LineChartIcon className="h-3.5 w-3.5" />
            Normalized Growth
          </button>
        </div>
      </div>

      {/* Main Chart Section */}
      {viewMode === "tradingview" ? (
        <div className="h-[540px] w-full relative rounded-2xl overflow-hidden border border-[#1d1e26] bg-[#131418]">
          {mounted ? (
            <AdvancedRealTimeChart
              key={`${currentTvSymbol}-${symbols.join("-")}`}
              theme="dark"
              symbol={currentTvSymbol}
              autosize
              hide_side_toolbar={false}
              allow_symbol_change={true}
              interval="D"
              style="1" // Candlesticks
              toolbar_bg="#131418"
              enable_publishing={false}
              withdateranges={true}
              watchlist={formattedWatchlist}
              container_id="tradingview_compare_advanced_chart"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#131418] text-xs text-slate-400 font-mono">
              Loading TradingView Candlestick Pro Chart Engine...
            </div>
          )}
        </div>
      ) : (
        <div className="h-96 w-full rounded-2xl bg-slate-950/40 p-2 border border-white/[0.06]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#475569"
                opacity={0.45}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#cbd5e1" }}
                tickLine={{ stroke: "#64748b" }}
                axisLine={{ stroke: "#64748b" }}
              />
              <YAxis
                domain={[90, "auto"]}
                tick={{ fontSize: 11, fill: "#cbd5e1" }}
                tickLine={{ stroke: "#64748b" }}
                axisLine={{ stroke: "#64748b" }}
              />
              <Tooltip
                cursor={{ stroke: "#38bdf8", strokeWidth: 1 }}
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "12px",
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#f8fafc" }}
                formatter={(value) => {
                  const numericValue =
                    typeof value === "number" ? value : Number(value ?? 0);
                  return [`${numericValue.toFixed(1)}`, "Indexed value"];
                }}
              />
              <Legend wrapperStyle={{ color: "#e2e8f0" }} />
              {series.map((entry) => (
                <Line
                  key={entry.symbol}
                  type="monotone"
                  dataKey={entry.symbol}
                  stroke={getStroke(entry.symbol)}
                  strokeWidth={2.5}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function getStroke(symbol: string) {
  const palette = ["#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f87171"];
  const index =
    Array.from(symbol).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    palette.length;
  return palette[index];
}
