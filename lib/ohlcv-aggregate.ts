import type { OhlcvCandle } from "@/lib/ohlcv";

export type CandleInterval = "D" | "W" | "M" | "Q" | "6M" | "Y";

// Bucket key for a YYYY-MM-DD date at the given interval.
function periodKey(dateStr: string, interval: CandleInterval): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  switch (interval) {
    case "W": {
      // Monday of that ISO-ish week.
      const dt = new Date(Date.UTC(y, m - 1, d));
      const day = dt.getUTCDay(); // 0=Sun
      dt.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
      return dt.toISOString().slice(0, 10);
    }
    case "M":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "Q":
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case "6M":
      return `${y}-H${m <= 6 ? 1 : 2}`;
    case "Y":
      return String(y);
    default:
      return dateStr;
  }
}

// Aggregate daily candles into wider intervals (open=first, close=last,
// high=max, low=min, volume=sum). Input must be chronological ascending.
export function aggregateCandles(candles: OhlcvCandle[], interval: CandleInterval): OhlcvCandle[] {
  if (interval === "D" || candles.length === 0) return candles;
  const buckets = new Map<string, OhlcvCandle>();
  const order: string[] = [];
  for (const c of candles) {
    const key = periodKey(c.date, interval);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
      order.push(key);
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
      existing.date = c.date; // period's last trading day
    }
  }
  return order.map((k) => buckets.get(k) as OhlcvCandle);
}
