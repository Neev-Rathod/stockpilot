import { describe, it, expect } from "vitest";
import { pearson, pivotLevels, localSwings, runBacktest } from "./ta";

describe("pearson", () => {
  it("is 1 for perfectly correlated, -1 for anti-correlated", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 5);
  });
  it("returns 0 when a series is flat", () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe("pivotLevels", () => {
  it("orders supports below and resistances above the pivot", () => {
    const p = pivotLevels(110, 90, 100);
    expect(p.pivot).toBeCloseTo(100, 5);
    expect(p.s1).toBeLessThan(p.pivot);
    expect(p.r1).toBeGreaterThan(p.pivot);
    expect(p.s2).toBeLessThan(p.s1);
    expect(p.r2).toBeGreaterThan(p.r1);
  });
});

describe("localSwings", () => {
  it("finds an obvious peak", () => {
    const s = localSwings([1, 2, 3, 10, 3, 2, 1], 2);
    expect(s.some((sw) => sw.type === "high" && sw.price === 10)).toBe(true);
  });
});

describe("runBacktest", () => {
  const rising = Array.from({ length: 300 }, (_, i) => 100 * (1 + i * 0.002));
  it("buy_hold on a rising series is profitable with one trade", () => {
    const m = runBacktest(rising, "buy_hold");
    expect(m.totalReturn).toBeGreaterThan(0);
    expect(m.totalTrades).toBe(1);
  });
  it("returns zeros for too-short series", () => {
    expect(runBacktest([1, 2, 3], "sma_crossover").totalTrades).toBe(0);
  });
  it("produces a bounded max drawdown (<= 0)", () => {
    const m = runBacktest(rising, "sma_crossover");
    expect(m.maxDrawdown).toBeLessThanOrEqual(0);
  });
});
