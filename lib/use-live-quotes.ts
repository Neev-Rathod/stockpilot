"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMultipleQuotes, type MarketQuote } from "@/lib/finnhub/client";

const DEFAULT_REFRESH_MS = 30_000;
const DEFAULT_TICK_MS = 1_000;

function applyMicroDrift(base: MarketQuote, seed: number): MarketQuote {
  const previousClose = base.previousClose ?? base.price;
  const drift = Math.sin(Date.now() / 1000 + seed) * 0.0008;
  const jitter = (Math.random() - 0.5) * 0.0006;
  const nextPrice = Math.max(0.01, base.price * (1 + drift + jitter));
  const change = Number((nextPrice - previousClose).toFixed(2));
  const percentChange = previousClose
    ? Number((((nextPrice - previousClose) / previousClose) * 100).toFixed(2))
    : 0;

  return {
    ...base,
    price: Number(nextPrice.toFixed(2)),
    change,
    percentChange,
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
  const lastBaseSignatureRef = useRef("");

  useEffect(() => {
    if (!fetchedQuotes.length) {
      if (baseQuoteRef.current.length > 0 || lastBaseSignatureRef.current) {
        baseQuoteRef.current = [];
        lastBaseSignatureRef.current = "";
        setLiveQuotes([]);
      }
      return;
    }

    const nextBase = fetchedQuotes.map((quote) => ({ ...quote }));
    const baseSignature = nextBase
      .map(
        (quote) =>
          `${quote.symbol}:${quote.price}:${quote.change ?? 0}:${quote.percentChange ?? 0}`,
      )
      .join("|");

    if (baseSignature === lastBaseSignatureRef.current) {
      return;
    }

    lastBaseSignatureRef.current = baseSignature;
    baseQuoteRef.current = nextBase;
    setLiveQuotes(nextBase);
  }, [fetchedQuotes]);

  useEffect(() => {
    if (!baseQuoteRef.current.length) {
      return;
    }

    const timer = window.setInterval(() => {
      setLiveQuotes((current) => {
        const activeBase = current.length > 0 ? current : baseQuoteRef.current;
        const currentMap = new Map(
          activeBase.map((quote) => [quote.symbol, quote]),
        );

        return baseQuoteRef.current.map((baseQuote, index) => {
          const currentQuote = currentMap.get(baseQuote.symbol) ?? baseQuote;
          const nextQuote = applyMicroDrift(
            currentQuote,
            index + Date.now() / 1000,
          );
          return {
            ...baseQuote,
            ...nextQuote,
            price: Number(nextQuote.price.toFixed(2)),
          };
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
