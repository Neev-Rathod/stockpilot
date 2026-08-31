import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.TWELVE_DATA_API_KEY;
const BASE_URL = "https://api.twelvedata.com";
const CACHE_TTL_MS = {
  search: 3 * 60_000,
  quote: 60_000,
  quotes: 90_000,
  history: 10 * 60_000,
  profile: 10 * 60_000,
} as const;

const inMemoryCache = new Map<string, { expiresAt: number; value: unknown }>();

function getCacheEntry<T>(key: string): T | null {
  const entry = inMemoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    inMemoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCacheEntry<T>(key: string, value: T, ttlMs: number) {
  inMemoryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

function handleError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Market data is temporarily unavailable.",
    },
    { status: 500 },
  );
}

function getRangeQuery(range: string) {
  const normalized = (range || "1M").toUpperCase();

  switch (normalized) {
    case "1D":
      return { interval: "1min", outputsize: "390" };
    case "1W":
      return { interval: "30min", outputsize: "168" };
    case "1M":
      return { interval: "1day", outputsize: "30" };
    case "3M":
      return { interval: "1day", outputsize: "90" };
    case "6M":
      return { interval: "1day", outputsize: "180" };
    case "1Y":
      return { interval: "1day", outputsize: "365" };
    case "5Y":
      return { interval: "1day", outputsize: "1825" };
    default:
      return { interval: "1day", outputsize: "30" };
  }
}

async function proxy(path: string, cacheKey: string, ttlMs: number) {
  const cached = getCacheEntry<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  if (!API_KEY) {
    return NextResponse.json(
      { error: "TWELVE_DATA_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const endpoint = new URL(`${BASE_URL}${path}`);
  endpoint.searchParams.set("apikey", API_KEY);

  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          "Market data is temporarily unavailable. Please try again shortly.",
      },
      { status: response.status || 503 },
    );
  }

  const payload = await response.json();
  setCacheEntry(cacheKey, payload, ttlMs);
  return NextResponse.json(payload);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "quote";
  const symbol = searchParams.get("symbol");
  const symbols = searchParams.get("symbols");
  const query = searchParams.get("query");
  const range = searchParams.get("range") || "1M";

  try {
    if (type === "search" || query) {
      const lookup = query ?? "";
      const cacheKey = `search:${lookup.toLowerCase()}`;
      return proxy(
        `/symbol_search?symbol=${encodeURIComponent(lookup)}`,
        cacheKey,
        CACHE_TTL_MS.search,
      );
    }

    if (type === "profile") {
      if (!symbol) {
        return NextResponse.json({ error: "Missing symbol." }, { status: 400 });
      }
      const cacheKey = `profile:${symbol.toUpperCase()}`;
      return proxy(
        `/profile?symbol=${encodeURIComponent(symbol)}`,
        cacheKey,
        CACHE_TTL_MS.profile,
      );
    }

    if (type === "history") {
      if (!symbol) {
        return NextResponse.json({ error: "Missing symbol." }, { status: 400 });
      }
      const { interval, outputsize } = getRangeQuery(range);
      const cacheKey = `history:${symbol.toUpperCase()}:${range}`;
      return proxy(
        `/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${encodeURIComponent(outputsize)}`,
        cacheKey,
        CACHE_TTL_MS.history,
      );
    }

    if (type === "quotes" && symbols) {
      const cacheKey = `quotes:${symbols.toUpperCase()}`;
      return proxy(
        `/quote?symbol=${encodeURIComponent(symbols)}`,
        cacheKey,
        CACHE_TTL_MS.quotes,
      );
    }

    if (type === "quote" && symbol) {
      const cacheKey = `quote:${symbol.toUpperCase()}`;
      return proxy(
        `/quote?symbol=${encodeURIComponent(symbol)}`,
        cacheKey,
        CACHE_TTL_MS.quote,
      );
    }

    return NextResponse.json(
      { error: "Missing required data parameters." },
      { status: 400 },
    );
  } catch (error) {
    return handleError(error);
  }
}
