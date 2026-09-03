import { describe, it, expect } from "vitest";
import { aggregateCandles } from "./ohlcv-aggregate";

const c = (date: string, open: number, high: number, low: number, close: number, volume: number) => ({ date, open, high, low, close, volume });

describe("aggregateCandles", () => {
  const daily = [
    c("2026-01-05", 10, 12, 9, 11, 100), // Mon
    c("2026-01-06", 11, 13, 10, 12, 150), // Tue
    c("2026-01-07", 12, 14, 8, 9, 200), // Wed
    c("2026-02-02", 9, 10, 7, 8, 120), // next month
  ];

  it("returns daily unchanged", () => {
    expect(aggregateCandles(daily, "D")).toBe(daily);
  });

  it("aggregates a month: open=first, close=last, high=max, low=min, volume=sum", () => {
    const monthly = aggregateCandles(daily, "M");
    expect(monthly).toHaveLength(2);
    const jan = monthly[0];
    expect(jan.open).toBe(10);
    expect(jan.close).toBe(9);
    expect(jan.high).toBe(14);
    expect(jan.low).toBe(8);
    expect(jan.volume).toBe(450);
    expect(jan.date).toBe("2026-01-07"); // last day of the bucket
  });

  it("groups the first three January days into one weekly bar", () => {
    const weekly = aggregateCandles(daily.slice(0, 3), "W");
    expect(weekly).toHaveLength(1);
    expect(weekly[0].volume).toBe(450);
  });

  it("buckets by year", () => {
    expect(aggregateCandles(daily, "Y")).toHaveLength(1);
  });
});
