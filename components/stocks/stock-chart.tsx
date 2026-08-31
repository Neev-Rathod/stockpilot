"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { StockHistory, StockRange } from "@/lib/types";

// Dynamically import TradingView Advanced Real-Time Chart component with SSR disabled
const AdvancedRealTimeChart = dynamic(
  () =>
    import("react-ts-tradingview-widgets").then(
      (mod) => mod.AdvancedRealTimeChart
    ),
  { ssr: false }
);

export function StockChart({
  symbol = "AAPL",
  price,
  change,
  range,
  onRangeChange,
}: {
  history?: StockHistory;
  range?: StockRange;
  onRangeChange?: (newRange: StockRange) => void;
  symbol?: string;
  price?: number;
  change?: number;
  priceHistory?: number[];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Format symbol for TradingView (e.g., AAPL -> NASDAQ:AAPL, BTCUSD -> BINANCE:BTCUSDT)
  const formattedSymbol = symbol.includes(":")
    ? symbol
    : symbol === "BTCUSD"
    ? "BINANCE:BTCUSDT"
    : symbol === "EURUSD"
    ? "FX:EURUSD"
    : `NASDAQ:${symbol}`;

  return (
    <div className="dark-card overflow-hidden text-slate-200">
      <div className="flex items-center justify-between border-b border-[#1d1e26] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold text-white font-mono">{symbol}</div>
          <span className="rounded bg-[#1e2029] px-2 py-0.5 text-[10px] font-mono text-slate-400">
            TradingView Pro Candlestick Engine
          </span>
        </div>
        {typeof price === "number" && (
          <div className="flex items-center gap-3 font-mono">
            <div className="text-sm font-bold text-white">${price.toFixed(2)}</div>
            <div
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                (change ?? 0) >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
              }`}
            >
              {(change ?? 0) >= 0 ? "+" : ""}
              {(change ?? 0).toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      <div className="h-[520px] w-full relative bg-[#131418]">
        {mounted ? (
          <AdvancedRealTimeChart
            theme="dark"
            symbol={formattedSymbol}
            autosize
            hide_side_toolbar={false}
            allow_symbol_change={true}
            interval="D"
            style="1" // 1 = Candlesticks
            toolbar_bg="#131418"
            enable_publishing={false}
            withdateranges={true}
            container_id="tradingview_advanced_chart"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#131418] text-xs text-slate-400 font-mono">
            Loading TradingView Candlestick Pro Chart & Drawing Tools...
          </div>
        )}
      </div>
    </div>
  );
}
