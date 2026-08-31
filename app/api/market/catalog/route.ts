import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = "https://finnhub.io/api/v1";

type FinnhubSearchResult = {
  description?: string;
  displaySymbol?: string;
  symbol?: string;
  type?: string;
  exchange?: string;
  currency?: string;
};

async function proxySearch(query: string, exchange?: string) {
  if (!API_KEY) {
    return [];
  }

  const url = new URL(`${BASE_URL}/search`);
  url.searchParams.set("q", query);
  if (exchange) {
    url.searchParams.set("exchange", exchange);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Finnhub-Token": API_KEY,
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { result?: FinnhubSearchResult[] };
  return Array.isArray(payload.result) ? payload.result : [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (
    searchParams.get("query") ??
    searchParams.get("q") ??
    ""
  ).trim();
  const exchange = searchParams.get("exchange") ?? undefined;

  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const result = await proxySearch(query, exchange);
  const normalized = result
    .filter((item) => item?.symbol)
    .map((item) => ({
      symbol: item.symbol,
      name: item.description ?? item.displaySymbol ?? item.symbol,
      exchange: item.exchange ?? (item.type ? "US" : undefined),
      currency: item.currency ?? "USD",
      type: item.type,
    }))
    .slice(0, 20);

  return NextResponse.json({ data: normalized });
}
