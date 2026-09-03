"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMultipleQuotes, type MarketQuote } from "@/lib/finnhub/client";

const DEFAULT_REFRESH_MS = 30_000;

// Quotes are the real latest close (+ real daily change) from Supabase.
// We refetch on an interval but do NOT synthesize intraday motion — the
// dataset is end-of-day, so prices are shown as their true values.
export function useLiveMarketQuotes(
  symbols: string[],
  refreshMs = DEFAULT_REFRESH_MS,
) {
  const uniqueSymbols = useMemo(
    () => [
      ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
    ],
    [symbols],
  );

  const {
    data: quotes = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["live-market-quotes", uniqueSymbols],
    queryFn: () => getMultipleQuotes(uniqueSymbols),
    staleTime: refreshMs,
    refetchInterval: refreshMs,
    enabled: uniqueSymbols.length > 0,
  });

  return { quotes: quotes as MarketQuote[], refetch, isLoading, isError };
}
