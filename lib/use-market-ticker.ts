"use client";

import { useEffect, useState, useMemo } from "react";
import type { StockQuote } from "@/lib/types";
import { getMultipleQuotes } from "@/lib/twelve-data/client";

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA", "AMZN", "ADBE", "BTCUSD", "EURUSD"];

export function useMarketTicker(symbols: string[] = DEFAULT_SYMBOLS) {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Initial & 30-Second API Fetching Loop
  useEffect(() => {
    let isMounted = true;

    async function fetchFreshData() {
      try {
        const freshQuotes = await getMultipleQuotes(symbols);
        if (isMounted && freshQuotes.length > 0) {
          setQuotes(freshQuotes);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Market ticker fetch error:", err);
      }
    }

    fetchFreshData();

    // 30-Second API Fetch Loop (30,000 ms)
    const apiInterval = setInterval(() => {
      fetchFreshData();
    }, 30_000);

    return () => {
      isMounted = false;
      clearInterval(apiInterval);
    };
  }, [symbols.join(",")]);

  // 2. 1-Second Live Price Update Ticker (1,000 ms)
  useEffect(() => {
    if (quotes.length === 0) return;

    const tickInterval = setInterval(() => {
      setQuotes((prevQuotes) =>
        prevQuotes.map((quote) => {
          // Simulate micro 1-second price fluctuation (+/- 0.05%)
          const fluctuation = (Math.random() - 0.49) * 0.001 * quote.price;
          const newPrice = Math.max(0.01, quote.price + fluctuation);
          const newChange = quote.change + fluctuation;
          const newPercentChange = (newChange / (quote.open || quote.price)) * 100;
          const newHigh = Math.max(quote.high || newPrice, newPrice);
          const newLow = Math.min(quote.low || newPrice, newPrice);

          return {
            ...quote,
            price: newPrice,
            change: newChange,
            percentChange: newPercentChange,
            high: newHigh,
            low: newLow,
          };
        })
      );
    }, 1_000);

    return () => clearInterval(tickInterval);
  }, [quotes.length > 0]);

  const priceMap = useMemo(
    () => Object.fromEntries(quotes.map((q) => [q.symbol, q.price])),
    [quotes]
  );

  return { quotes, priceMap, isLoading };
}
