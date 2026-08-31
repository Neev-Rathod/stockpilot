export type MarketNewsCategory = "general" | "forex" | "crypto" | "merger";

export interface FinnhubCompanyProfile {
  country?: string;
  currency?: string;
  exchange?: string;
  finnhubIndustry?: string;
  ipo?: string;
  logo?: string;
  marketCapitalization?: number;
  name?: string;
  phone?: string;
  shareOutstanding?: number;
  ticker?: string;
  weburl?: string;
}

export interface FinnhubQuote {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
}

export interface MarketQuote {
  symbol: string;
  companyName: string;
  price: number;
  change: number;
  percentChange: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  currency: string;
}

export interface FinnhubNewsItem {
  category?: string;
  datetime?: number;
  headline?: string;
  id?: number;
  image?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
}

export interface FinnhubIpoItem {
  date?: string;
  exchange?: string;
  name?: string;
  numberOfShares?: number;
  price?: number;
  status?: string;
  symbol?: string;
  totalSharesValue?: number;
}

async function finnhubRequest<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/finnhub?${query.toString()}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Finnhub request failed.",
    );
  }

  return (await response.json()) as T;
}

export async function getStockQuote(
  symbol: string,
): Promise<MarketQuote | null> {
  const cleaned = symbol.trim();
  if (!cleaned) {
    return null;
  }

  try {
    const quote = await finnhubRequest<FinnhubQuote>({
      type: "quote",
      symbol: cleaned.toUpperCase(),
    });

    const price = typeof quote?.c === "number" ? quote.c : 0;
    const previousClose = typeof quote?.pc === "number" ? quote.pc : null;

    return {
      symbol: cleaned.toUpperCase(),
      companyName: cleaned.toUpperCase(),
      price,
      change: typeof quote?.d === "number" ? quote.d : 0,
      percentChange: typeof quote?.dp === "number" ? quote.dp : 0,
      open: typeof quote?.o === "number" ? quote.o : null,
      high: typeof quote?.h === "number" ? quote.h : null,
      low: typeof quote?.l === "number" ? quote.l : null,
      previousClose,
      volume: null,
      currency: "USD",
    };
  } catch {
    return null;
  }
}

export async function getMultipleQuotes(
  symbols: string[],
): Promise<MarketQuote[]> {
  const unique = [
    ...new Set(
      symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    ),
  ];
  if (unique.length === 0) {
    return [];
  }

  try {
    const payload = await finnhubRequest<
      Array<FinnhubQuote & { symbol?: string; companyName?: string }>
    >({
      type: "bulk-quote",
      symbols: unique.join(","),
    });

    return payload
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const symbol = String(entry.symbol ?? "").toUpperCase();
        const price = typeof entry.c === "number" ? entry.c : 0;
        const previousClose = typeof entry.pc === "number" ? entry.pc : null;

        return {
          symbol,
          companyName: entry.companyName ?? symbol,
          price,
          change: typeof entry.d === "number" ? entry.d : 0,
          percentChange: typeof entry.dp === "number" ? entry.dp : 0,
          open: typeof entry.o === "number" ? entry.o : null,
          high: typeof entry.h === "number" ? entry.h : null,
          low: typeof entry.l === "number" ? entry.l : null,
          previousClose,
          volume: null,
          currency: "USD",
        };
      });
  } catch {
    const results = await Promise.all(
      unique.map((symbol) => getStockQuote(symbol)),
    );
    return results.filter(Boolean) as MarketQuote[];
  }
}

export async function getCompanyProfile(
  symbol: string,
): Promise<FinnhubCompanyProfile | null> {
  const cleaned = symbol.trim();
  if (!cleaned) {
    return null;
  }

  try {
    return await finnhubRequest<FinnhubCompanyProfile>({
      type: "profile",
      symbol: cleaned.toUpperCase(),
    });
  } catch {
    return null;
  }
}

export async function getMarketNews(
  category: MarketNewsCategory = "general",
): Promise<FinnhubNewsItem[]> {
  try {
    const result = await finnhubRequest<FinnhubNewsItem[]>({
      type: "market-news",
      category,
    });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function getCompanyNews(
  symbol: string,
  from: string,
  to: string,
): Promise<FinnhubNewsItem[]> {
  if (!symbol || !from || !to) {
    return [];
  }

  try {
    const result = await finnhubRequest<FinnhubNewsItem[]>({
      type: "company-news",
      symbol: symbol.toUpperCase(),
      from,
      to,
    });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function getIPOCalendar(
  from: string,
  to: string,
): Promise<FinnhubIpoItem[]> {
  if (!from || !to) {
    return [];
  }

  try {
    const result = await finnhubRequest<{ ipoCalendar?: FinnhubIpoItem[] }>({
      type: "ipo-calendar",
      from,
      to,
    });
    return Array.isArray(result?.ipoCalendar) ? result.ipoCalendar : [];
  } catch {
    return [];
  }
}
