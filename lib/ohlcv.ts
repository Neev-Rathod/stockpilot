import { getDbOhlcv } from "@/lib/supabase/queries";

export type OhlcvCandle = { date: string; close: number; volume: number; open: number; high: number; low: number };
export type OhlcvSeries = { symbol: string; candles: OhlcvCandle[] };

// History now comes from the Supabase `stock_prices` table (imported from the
// local CSVs), making the database the single source of truth for price data.
export async function getLocalOhlcv(symbols: string[]): Promise<OhlcvSeries[]> {
  return getDbOhlcv(symbols);
}
