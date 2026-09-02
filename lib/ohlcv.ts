export type OhlcvCandle = { date: string; close: number; volume: number; open: number; high: number; low: number };
export type OhlcvSeries = { symbol: string; candles: OhlcvCandle[] };

export async function getLocalOhlcv(symbols: string[]): Promise<OhlcvSeries[]> {
  const response = await fetch(`/api/ohlcv?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!response.ok) throw new Error("Unable to load local OHLCV data.");
  const payload = (await response.json()) as { data?: OhlcvSeries[] };
  return payload.data ?? [];
}
