import { getSupabaseBrowser } from "./client";
import type { MarketQuote } from "@/lib/finnhub/client";
import type { Holding, PriceAlert, Transaction } from "@/lib/types";
import type { OhlcvSeries } from "@/lib/ohlcv";

// ─── Quotes (from the latest_prices view) ────────────────────────────────
type LatestPriceRow = {
  symbol: string;
  company_name: string | null;
  currency: string | null;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string | null;
  previous_close: number | string | null;
};

function mapQuote(row: LatestPriceRow): MarketQuote {
  const price = Number(row.close);
  const previousClose =
    row.previous_close != null ? Number(row.previous_close) : price;
  const change = Number((price - previousClose).toFixed(2));
  const percentChange =
    previousClose > 0
      ? Number((((price - previousClose) / previousClose) * 100).toFixed(2))
      : 0;
  return {
    symbol: row.symbol,
    companyName: row.company_name ?? row.symbol,
    price,
    change,
    percentChange,
    open: row.open != null ? Number(row.open) : null,
    high: row.high != null ? Number(row.high) : null,
    low: row.low != null ? Number(row.low) : null,
    previousClose,
    volume: row.volume != null ? Number(row.volume) : null,
    currency: row.currency ?? "USD",
  };
}

export async function getDbQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];
  const upper = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  if (!upper.length) return [];
  const { data, error } = await supabase
    .from("latest_prices")
    .select("*")
    .in("symbol", upper);
  if (error || !data) return [];
  return (data as LatestPriceRow[]).map(mapQuote);
}

export async function getDbQuote(symbol: string): Promise<MarketQuote | null> {
  const cleaned = symbol.trim().toUpperCase();
  if (!cleaned) return null;
  const [quote] = await getDbQuotes([cleaned]);
  return quote ?? null;
}

// ─── OHLCV history (charts + compare) ─────────────────────────────────────
// Supabase/PostgREST caps a response at 1000 rows, so we page through each
// symbol's full history (~2.5k rows) rather than silently getting the oldest
// 1000. Queried per symbol so multi-symbol compares aren't starved.
const OHLCV_PAGE = 1000;

async function fetchSymbolCandles(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  symbol: string,
): Promise<OhlcvSeries> {
  const candles: OhlcvSeries["candles"] = [];
  for (let from = 0; ; from += OHLCV_PAGE) {
    const { data, error } = await supabase
      .from("stock_prices")
      .select("date,open,high,low,close,volume")
      .eq("symbol", symbol)
      .order("date", { ascending: true })
      .range(from, from + OHLCV_PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as Array<Record<string, unknown>>) {
      candles.push({
        date: String(row.date),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      });
    }
    if (data.length < OHLCV_PAGE) break;
  }
  return { symbol, candles };
}

export async function getDbOhlcv(symbols: string[]): Promise<OhlcvSeries[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];
  const upper = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  if (!upper.length) return [];
  const results = await Promise.all(upper.map((s) => fetchSymbolCandles(supabase, s)));
  return results.filter((r) => r.candles.length > 0);
}

// ─── Per-user portfolio load (called on login) ────────────────────────────
export interface LoadedPortfolio {
  virtualBalance: number;
  holdings: Holding[];
  transactions: Transaction[];
  favorites: string[];
  alerts: PriceAlert[];
}

const EMPTY_PORTFOLIO: LoadedPortfolio = {
  virtualBalance: 100000,
  holdings: [],
  transactions: [],
  favorites: [],
  alerts: [],
};

export async function loadPortfolio(userId: string): Promise<LoadedPortfolio> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return EMPTY_PORTFOLIO;

  const [profileRes, holdingsRes, txRes, watchRes, alertRes] = await Promise.all([
    supabase.from("profiles").select("virtual_balance").eq("id", userId).maybeSingle(),
    supabase.from("holdings").select("*").eq("user_id", userId),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("watchlist").select("symbol").eq("user_id", userId),
    supabase
      .from("price_alerts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const virtualBalance = profileRes.data?.virtual_balance != null
    ? Number(profileRes.data.virtual_balance)
    : 100000;

  const holdings: Holding[] = (holdingsRes.data ?? []).map((r) => ({
    symbol: String(r.symbol),
    companyName: r.company_name ?? String(r.symbol),
    quantity: Number(r.quantity),
    averageBuyPrice: Number(r.average_buy_price),
  }));

  const transactions: Transaction[] = (txRes.data ?? []).map((r) => ({
    id: String(r.id),
    symbol: String(r.symbol),
    type: r.type as "buy" | "sell",
    quantity: Number(r.quantity),
    price: Number(r.price),
    timestamp: String(r.created_at),
  }));

  const favorites: string[] = (watchRes.data ?? []).map((r) => String(r.symbol));

  const alerts: PriceAlert[] = (alertRes.data ?? []).map((r) => ({
    id: String(r.id),
    symbol: String(r.symbol),
    targetPrice: Number(r.target_price),
    condition: r.condition as "above" | "below",
    createdAt: String(r.created_at),
    triggered: Boolean(r.triggered),
  }));

  return { virtualBalance, holdings, transactions, favorites, alerts };
}
