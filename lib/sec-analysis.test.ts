import { describe, it, expect } from "vitest";
import { dailyReturns, annualizedVolatility, maxDrawdown, riskScore } from "./sec-analysis";

describe("dailyReturns", () => {
  it("computes period-over-period returns", () => {
    expect(dailyReturns([100, 110, 99])).toEqual([0.1, expect.closeTo(-0.1, 5)]);
  });
});

describe("annualizedVolatility", () => {
  it("is 0 for a flat series", () => {
    expect(annualizedVolatility([50, 50, 50, 50])).toBe(0);
  });
  it("is positive for a moving series", () => {
    expect(annualizedVolatility([100, 110, 90, 120, 95])).toBeGreaterThan(0);
  });
});

describe("maxDrawdown", () => {
  it("finds the largest peak-to-trough decline", () => {
    expect(maxDrawdown([100, 120, 90, 150])).toBeCloseTo(25, 5); // 120 -> 90
  });
  it("is 0 for a monotonically rising series", () => {
    expect(maxDrawdown([10, 20, 30])).toBe(0);
  });
});

describe("riskScore", () => {
  it("rates calm stocks Low and wild stocks High", () => {
    expect(riskScore({ volatility: 15, drawdown: 5 }).rating).toBe("Low");
    expect(riskScore({ volatility: 90, drawdown: 70 }).rating).toBe("High");
  });
  it("clamps to 0-100 and factors in bullish sentiment", () => {
    const bullish = riskScore({ volatility: 40, drawdown: 30, bullishRatio: 0.9 });
    const bearish = riskScore({ volatility: 40, drawdown: 30, bullishRatio: 0.1 });
    expect(bullish.score).toBeGreaterThanOrEqual(0);
    expect(bearish.score).toBeLessThanOrEqual(100);
    expect(bearish.score).toBeGreaterThan(bullish.score);
    expect(bullish.components.sentiment).not.toBeNull();
  });
});
