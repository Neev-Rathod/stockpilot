"use client";

import { useMemo } from "react";
import { useLiveMarketQuotes } from "@/lib/use-live-quotes";

// The 10 symbols we have real OHLCV data for in Supabase.
const DEFAULT_SYMBOLS = [
  "AAPL",
  "MSFT",
  "AMZN",
  "META",
  "TSLA",
  "AMD",
  "NFLX",
  "QCOM",
  "CSCO",
  "SBUX",
];

export function useMarketTicker(symbols: string[] = DEFAULT_SYMBOLS) {
  const { quotes, isLoading, isError, refetch } = useLiveMarketQuotes(
    symbols,
    30_000, // 30-Second API Refresh Loop
    1_000,  // 1-Second Price Ticker Loop
  );

  const priceMap = useMemo(
    () => Object.fromEntries(quotes.map((q) => [q.symbol, q.price])),
    [quotes],
  );

  return { quotes, priceMap, isLoading, isError, refetch };
}
