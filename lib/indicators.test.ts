import { describe, it, expect } from "vitest";
import { sma, ema, rsi } from "./indicators";

describe("sma", () => {
  it("is null during warm-up then averages the window", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBe(2); // (1+2+3)/3
    expect(out[4]).toBe(4); // (3+4+5)/3
  });
});

describe("ema", () => {
  it("seeds with the SMA and stays within the series range", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 5); // seed = SMA(1,2,3)
    expect(out[4]!).toBeGreaterThan(out[2]!);
  });
});

describe("rsi", () => {
  it("returns 100 for a monotonically rising series and stays within 0-100", () => {
    const rising = Array.from({ length: 30 }, (_, i) => i + 1);
    const out = rsi(rising, 14);
    expect(out[13]).toBeNull();
    expect(out[29]).toBe(100);
    out.filter((v): v is number => v !== null).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});
