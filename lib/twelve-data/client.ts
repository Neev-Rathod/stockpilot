import { getCachedValue, setCachedValue } from "@/lib/twelve-data/cache";
import {
  getFallbackHistory,
  getFallbackMultipleQuotes,
  getFallbackQuote,
  getFallbackSearchResults,
} from "@/lib/fallback-data";
import type {
  StockHistory,
  StockQuote,
  StockRange,
  StockSearchResult,
} from "@/lib/types";
import {
  normalizeHistory,
  normalizeQuote,
  normalizeSearchResult,
} from "@/lib/twelve-data/transformers";
import type {
  TwelveDataApiError,
  TwelveDataQuoteResponse,
  TwelveDataSeriesPoint,
  TwelveDataSymbolSearchResponse,
} from "@/lib/twelve-data/types";

const API_BASE = "/api/twelve-data";

const requestOptions = {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
  },
};

async function safeFetch<T>(
  params: Record<string, string>,
  key: string,
  ttlMs: number,
): Promise<T | null> {
  const cached = getCachedValue<T>(key);
  if (cached) {
    return cached;
  }

  const query = new URLSearchParams(params).toString();
  const resp = await fetch(`${API_BASE}?${query}`, requestOptions);
  if (!resp.ok) {
    const errorText = await resp.text();
    if (resp.status === 429 || resp.status >= 500) {
      throw new Error(
        "Market data is temporarily unavailable. Please try again shortly.",
      );
    }
    throw new Error(errorText || "Unable to load market data.");
  }

  const data = (await resp.json()) as T;
  setCachedValue(key, data, ttlMs);
  return data;
}

export async function searchStocks(
  query: string,
): Promise<StockSearchResult[]> {
  const normalized = query.trim();
  if (!normalized || normalized.length < 2) {
    return [];
  }

  const cacheKey = `search:${normalized.toLowerCase()}`;
  const cached = getCachedValue<StockSearchResult[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(
      `/api/market/catalog?query=${encodeURIComponent(normalized)}`,
    );

    if (!response.ok) {
      throw new Error("Catalog unavailable");
    }

    const payload = await response.json();
    const result = Array.isArray(payload?.data) ? payload.data : [];
    const mapped = result.map(normalizeSearchResult);
    setCachedValue(cacheKey, mapped, 5 * 60_000);
    return mapped;
  } catch {
    return getFallbackSearchResults(normalized);
  }
}

export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `quote:${upperSymbol}`;

  try {
    const result = await safeFetch<{ data: TwelveDataQuoteResponse }>(
      { type: "quote", symbol: upperSymbol },
      cacheKey,
      60_000,
    );
    if (!result || !result.data) {
      return getFallbackQuote(upperSymbol);
    }
    return normalizeQuote(result.data);
  } catch {
    return getFallbackQuote(upperSymbol);
  }
}

export async function getStockHistory(
  symbol: string,
  range: StockRange,
): Promise<StockHistory> {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `history:${upperSymbol}:${range}`;

  try {
    const result = await safeFetch<{ data: TwelveDataSeriesPoint[] }>(
      { type: "history", symbol: upperSymbol, range },
      cacheKey,
      10 * 60_000,
    );
    if (!result || !result.data) {
      return getFallbackHistory(upperSymbol, range);
    }
    return normalizeHistory(upperSymbol, range, result.data);
  } catch {
    return getFallbackHistory(upperSymbol, range);
  }
}

export async function getMultipleQuotes(
  symbols: string[],
): Promise<StockQuote[]> {
  const uniqueSymbols = [
    ...new Set(symbols.map((symbol) => symbol.toUpperCase())),
  ];
  if (uniqueSymbols.length === 0) {
    return [];
  }

  const cacheKey = `quotes:${uniqueSymbols.join(",")}`;

  try {
    const result = await safeFetch<{ data: TwelveDataQuoteResponse[] }>(
      { type: "quotes", symbols: uniqueSymbols.join(",") },
      cacheKey,
      90_000,
    );
    if (!result || !result.data) {
      return getFallbackMultipleQuotes(uniqueSymbols);
    }
    return result.data.map(normalizeQuote);
  } catch {
    return getFallbackMultipleQuotes(uniqueSymbols);
  }
}

export async function getStockProfile(symbol: string): Promise<{
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
}> {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `profile:${upperSymbol}`;

  try {
    const result = await safeFetch<{
      data: {
        symbol?: string;
        name?: string;
        exchange?: string;
        currency?: string;
      };
    }>({ type: "profile", symbol: upperSymbol }, cacheKey, 10 * 60_000);
    if (!result || !result.data) {
      return {
        symbol: upperSymbol,
        name: getFallbackQuote(upperSymbol).companyName,
      };
    }
    return {
      symbol: result.data.symbol ?? upperSymbol,
      name: result.data.name ?? upperSymbol,
      exchange: result.data.exchange,
      currency: result.data.currency,
    };
  } catch {
    return {
      symbol: upperSymbol,
      name: getFallbackQuote(upperSymbol).companyName,
    };
  }
}
