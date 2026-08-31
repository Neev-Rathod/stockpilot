import type {
  StockCandle,
  StockHistory,
  StockQuote,
  StockSearchResult,
  StockRange,
} from "@/lib/types";
import type {
  TwelveDataQuoteResponse,
  TwelveDataSeriesPoint,
  TwelveDataSymbolSearchResponse,
} from "@/lib/twelve-data/types";

const toNumber = (value?: string | number | null): number | null => {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    Number.isNaN(Number(value))
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function normalizeSearchResult(
  item: TwelveDataSymbolSearchResponse,
): StockSearchResult {
  return {
    symbol: item.symbol,
    name: item.name ?? item.symbol,
    exchange: item.exchange,
    currency: item.currency,
    type: item.type,
  };
}

export function normalizeQuote(item: TwelveDataQuoteResponse): StockQuote {
  const price = toNumber(item.price) ?? 0;
  const change = toNumber(item.change) ?? 0;
  const percent = toNumber(item.percent_change) ?? 0;
  const previousClose = toNumber(item.previous_close);

  return {
    symbol: item.symbol,
    companyName: item.name ?? item.symbol,
    price,
    change,
    percentChange: percent,
    open: toNumber(item.open),
    high: toNumber(item.high),
    low: toNumber(item.low),
    previousClose,
    volume: toNumber(item.volume),
    currency: item.currency ?? "USD",
  };
}

export function normalizeHistory(
  symbol: string,
  range: StockRange,
  points: TwelveDataSeriesPoint[],
): StockHistory {
  const candles: StockCandle[] = points
    .map((point) => {
      const timeValue = point.datetime
        ? Date.parse(point.datetime)
        : Number(point.timestamp ?? 0) * 1000;
      return {
        time: Math.floor(timeValue / 1000),
        open: toNumber(point.open) ?? 0,
        high: toNumber(point.high) ?? 0,
        low: toNumber(point.low) ?? 0,
        close: toNumber(point.close) ?? 0,
        volume: toNumber(point.volume) ?? 0,
      };
    })
    .filter((point) => Number.isFinite(point.time) && point.close > 0)
    .sort((a, b) => a.time - b.time);

  return {
    symbol,
    range,
    candles,
  };
}
