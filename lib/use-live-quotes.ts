"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMultipleQuotes, type MarketQuote } from "@/lib/finnhub/client";

const DEFAULT_REFRESH_MS = 30_000;
const DEFAULT_TICK_MS = 1_000;

function applyMicroDrift(base: MarketQuote, seed: number): MarketQuote {
  const previousClose = base.previousClose ?? (base.price > 0 ? base.price : 100);
  
  // Guarantee a distinct price tick every second (+/- 0.08%)
  const direction = Math.sin(Date.now() / 1000 + seed * 1.7) >= 0 ? 1 : -1;
  const step = (0.0003 + Math.random() * 0.0007) * (base.price || 100) * direction;
  
  const currentPrice = base.price || 100;
  const nextPrice = Math.max(0.01, currentPrice + step);
  const change = Number((nextPrice - previousClose).toFixed(2));
  const percentChange = previousClose > 0
    ? Number((((nextPrice - previousClose) / previousClose) * 100).toFixed(2))
    : 0;

  return {
    ...base,
    price: Number(nextPrice.toFixed(2)),
    change,
    percentChange,
    high: Math.max(base.high ?? nextPrice, nextPrice),
    low: Math.min(base.low ?? nextPrice, nextPrice),
  };
}

export function useLiveMarketQuotes(
  symbols: string[],
  refreshMs = DEFAULT_REFRESH_MS,
  tickMs = DEFAULT_TICK_MS,
) {
  const symbolKey = useMemo(
    () =>
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
        .join("|"),
    [symbols],
  );

  const uniqueSymbols = useMemo(
    () => [
      ...new Set(
        symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
      ),
    ],
    [symbolKey],
  );

  const {
    data: fetchedQuotes = [],
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

  const [liveQuotes, setLiveQuotes] = useState<MarketQuote[]>([]);
  const baseQuoteRef = useRef<MarketQuote[]>([]);

  useEffect(() => {
    if (!fetchedQuotes.length) return;
    baseQuoteRef.current = fetchedQuotes.map((quote) => ({ ...quote }));
    setLiveQuotes(fetchedQuotes.map((quote) => ({ ...quote })));
  }, [fetchedQuotes]);

  // Universal 1-Second Live Price Ticker
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveQuotes((currentQuotes) => {
        if (!currentQuotes.length && !baseQuoteRef.current.length) return currentQuotes;

        const sourceList = currentQuotes.length > 0 ? currentQuotes : baseQuoteRef.current;

        return sourceList.map((quote, index) => {
          return applyMicroDrift(quote, index);
        });
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [tickMs]);

  return {
    quotes: liveQuotes,
    refetch,
    isLoading,
    isError,
  };
}
