import { getDbQuote, getDbQuotes } from "@/lib/supabase/queries";

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

export interface SECFiling {
  acceptedDate?: string;
  accessNumber?: string;
  cik?: string;
  filedDate?: string;
  filingUrl?: string;
  form?: string;
  reportUrl?: string;
  symbol?: string;
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

// Quotes are now served from the Supabase `stock_prices` data (latest close +
// previous close), not the Finnhub live API. The cosmetic 1s drift in
// lib/use-live-quotes.ts still animates these values in the UI.
export async function getStockQuote(
  symbol: string,
): Promise<MarketQuote | null> {
  return getDbQuote(symbol);
}

export async function getMultipleQuotes(
  symbols: string[],
): Promise<MarketQuote[]> {
  return getDbQuotes(symbols);
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

export interface FinnhubEarningsItem {
  date?: string;
  symbol?: string;
  hour?: string;
  quarter?: number;
  year?: number;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
}

export async function getEarningsCalendar(
  from: string,
  to: string,
  symbol?: string,
): Promise<FinnhubEarningsItem[]> {
  if (!from || !to) return [];
  try {
    const result = await finnhubRequest<{ earningsCalendar?: FinnhubEarningsItem[] }>({
      type: "earnings-calendar",
      from,
      to,
      ...(symbol ? { symbol: symbol.toUpperCase() } : {}),
    });
    return Array.isArray(result?.earningsCalendar) ? result.earningsCalendar : [];
  } catch {
    return [];
  }
}

export async function getSECFilings(params: {
  symbol?: string;
  cik?: string;
  accessNumber?: string;
  form?: string;
  from?: string;
  to?: string;
}): Promise<SECFiling[]> {
  try {
    const query = Object.fromEntries(
      Object.entries({
        type: "sec-filings",
        symbol: params.symbol?.trim().toUpperCase() || undefined,
        cik: params.cik?.trim() || undefined,
        accessNumber: params.accessNumber?.trim() || undefined,
        form: params.form?.trim() || undefined,
        from: params.from?.trim() || undefined,
        to: params.to?.trim() || undefined,
      }).filter(([, value]) => value !== undefined && value !== ""),
    ) as Record<string, string>;

    const result = await finnhubRequest<SECFiling[]>(query);
    return Array.isArray(result) ? result.slice(0, 250) : [];
  } catch {
    return [];
  }
}

export interface FinnhubRecommendationItem {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
}

export interface FinnhubFinancialReportItem {
  accessNumber: string;
  symbol: string;
  cik: string;
  year: number;
  quarter: number;
  form: string;
  startDate: string;
  endDate: string;
  filedDate: string;
  acceptedDate: string;
  report?: {
    bs?: Record<string, number>;
    cf?: Record<string, number>;
    ic?: Record<string, number>;
  };
}

export interface FinnhubFinancialsReportedResponse {
  cik: string;
  symbol: string;
  data: FinnhubFinancialReportItem[];
}

export interface FinnhubBasicFinancials {
  metric?: Record<string, number>;
  series?: Record<string, Record<string, Array<{ period?: string; v?: number }>>>;
}

export interface FinnhubEarningsSurprise {
  actual?: number | null;
  estimate?: number | null;
  period?: string;
  surprise?: number | null;
  surprisePercent?: number | null;
  quarter?: number;
  year?: number;
}

export async function getRecommendationTrends(
  symbol: string,
): Promise<FinnhubRecommendationItem[]> {
  const cleaned = symbol.trim().toUpperCase();
  if (!cleaned) return [];
  try {
    const result = await finnhubRequest<FinnhubRecommendationItem[]>({
      type: "recommendation",
      symbol: cleaned,
    });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function getFinancialsReported(params: {
  symbol?: string;
  cik?: string;
  accessNumber?: string;
  freq?: string;
  from?: string;
  to?: string;
}): Promise<FinnhubFinancialsReportedResponse | null> {
  try {
    const query = Object.fromEntries(
      Object.entries({
        type: "financials-reported",
        symbol: params.symbol?.trim().toUpperCase() || undefined,
        cik: params.cik?.trim() || undefined,
        accessNumber: params.accessNumber?.trim() || undefined,
        freq: params.freq || undefined,
        from: params.from || undefined,
        to: params.to || undefined,
      }).filter(([, value]) => value !== undefined && value !== ""),
    ) as Record<string, string>;

    const result = await finnhubRequest<FinnhubFinancialsReportedResponse>(query);
    return result && typeof result === "object" && Array.isArray(result.data)
      ? result
      : null;
  } catch {
    return null;
  }
}

export async function getBasicFinancials(
  symbol: string,
): Promise<FinnhubBasicFinancials | null> {
  const cleaned = symbol.trim().toUpperCase();
  if (!cleaned) return null;
  try {
    const result = await finnhubRequest<FinnhubBasicFinancials>({
      type: "metric",
      symbol: cleaned,
    });
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
}

export async function getEarningsSurprises(
  symbol: string,
  limit = 4,
): Promise<FinnhubEarningsSurprise[]> {
  const cleaned = symbol.trim().toUpperCase();
  if (!cleaned) return [];
  try {
    const result = await finnhubRequest<FinnhubEarningsSurprise[]>({
      type: "earnings",
      symbol: cleaned,
      limit: String(limit),
    });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

