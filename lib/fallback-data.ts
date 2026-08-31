import type {
  StockCandle,
  StockHistory,
  StockQuote,
  StockSearchResult,
  StockRange,
} from "@/lib/types";

export const CURATED_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "NVDA",
  "TSLA",
] as const;

export const STOCK_METADATA: Record<
  string,
  { name: string; exchange: string; currency: string }
> = {
  AAPL: { name: "Apple Inc.", exchange: "NASDAQ", currency: "USD" },
  MSFT: { name: "Microsoft Corporation", exchange: "NASDAQ", currency: "USD" },
  GOOGL: { name: "Alphabet Inc.", exchange: "NASDAQ", currency: "USD" },
  NVDA: { name: "NVIDIA Corporation", exchange: "NASDAQ", currency: "USD" },
  TSLA: { name: "Tesla Inc.", exchange: "NASDAQ", currency: "USD" },
};

const rangeSeed: Record<StockRange, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "5Y": 1825,
};

function createSyntheticPrice(
  seed: number,
  symbol: string,
  range: StockRange,
): number {
  const symbolFactor =
    [...symbol].reduce((acc, char) => acc + char.charCodeAt(0), 0) % 57;
  return Number(
    (seed + symbolFactor * 0.87 + rangeSeed[range] * 0.12).toFixed(2),
  );
}

function buildHistory(symbol: string, range: StockRange): StockCandle[] {
  const base = createSyntheticPrice(120, symbol, range);
  const candles: StockCandle[] = [];
  const days =
    range === "1D"
      ? 24
      : range === "1W"
        ? 7
        : range === "1M"
          ? 30
          : range === "3M"
            ? 90
            : range === "6M"
              ? 180
              : range === "1Y"
                ? 365
                : 1825;

  let previous = base;
  for (let i = 0; i < days; i += 1) {
    const drift = Math.sin((i + symbol.length) / 7) * 2.4;
    const noise = ((i * 13 + symbol.length * 11) % 7) * 0.26;
    const open = previous;
    const close = Number((open + drift + noise).toFixed(2));
    const high = Number(
      (Math.max(open, close) + 1.7 + ((i * 3) % 5) * 0.2).toFixed(2),
    );
    const low = Number(
      (Math.min(open, close) - 1.4 - ((i * 5) % 4) * 0.2).toFixed(2),
    );
    const volume = 800000 + i * 4200 + symbol.length * 10000;
    candles.push({
      time: Math.floor((Date.now() - (days - i) * 86400000) / 1000),
      open,
      high,
      low,
      close,
      volume,
    });
    previous = close;
  }

  return candles;
}

export function getFallbackSearchResults(query: string): StockSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized)
    return CURATED_SYMBOLS.map((symbol) => ({
      symbol,
      name: STOCK_METADATA[symbol].name,
      exchange: STOCK_METADATA[symbol].exchange,
      currency: STOCK_METADATA[symbol].currency,
    }));

  const results: StockSearchResult[] = [];
  for (const symbol of CURATED_SYMBOLS) {
    const metadata = STOCK_METADATA[symbol];
    const haystack = `${symbol} ${metadata.name}`.toLowerCase();
    if (haystack.includes(normalized)) {
      results.push({
        symbol,
        name: metadata.name,
        exchange: metadata.exchange,
        currency: metadata.currency,
      });
    }
  }
  return results;
}

export function getFallbackQuote(symbol: string): StockQuote {
  const key = symbol.toUpperCase();
  const meta = STOCK_METADATA[key] ?? {
    name: "Selected Stock",
    exchange: "NASDAQ",
    currency: "USD",
  };
  const history = buildHistory(key, "1M");
  const latest = history[history.length - 1]?.close ?? 100;
  const previous = history[Math.max(0, history.length - 2)]?.close ?? latest;
  const change = Number((latest - previous).toFixed(2));
  const percentChange = Number(((change / previous) * 100).toFixed(2));

  return {
    symbol: key,
    companyName: meta.name,
    price: Number(latest.toFixed(2)),
    change,
    percentChange,
    open: Number((history[0]?.open ?? latest).toFixed(2)),
    high: Number(Math.max(...history.map((point) => point.high)).toFixed(2)),
    low: Number(Math.min(...history.map((point) => point.low)).toFixed(2)),
    previousClose: Number(previous.toFixed(2)),
    volume: history[history.length - 1]?.volume ?? 0,
    currency: meta.currency,
  };
}

export function getFallbackHistory(
  symbol: string,
  range: StockRange,
): StockHistory {
  const key = symbol.toUpperCase();
  return {
    symbol: key,
    range,
    candles: buildHistory(key, range),
  };
}

export function getFallbackMultipleQuotes(symbols: string[]) {
  return symbols.map((symbol) => getFallbackQuote(symbol));
}
