import { describe, it, expect } from "vitest";
import { buy, sell, type CoreState } from "./portfolio-logic";

const fresh: CoreState = { virtualBalance: 100000, holdings: [], transactions: [] };
const opts = { id: "tx-1", timestamp: "2026-09-02T00:00:00.000Z" };

describe("buy", () => {
  it("buys a new holding and debits the balance", () => {
    const r = buy(fresh, "AAPL", "Apple Inc.", 10, 200, opts);
    expect(r.success).toBe(true);
    expect(r.state!.virtualBalance).toBe(98000);
    expect(r.state!.holdings).toEqual([
      { symbol: "AAPL", companyName: "Apple Inc.", quantity: 10, averageBuyPrice: 200 },
    ]);
    expect(r.state!.transactions[0]).toMatchObject({ symbol: "AAPL", type: "buy", quantity: 10, price: 200 });
  });

  it("averages the buy price when adding to an existing holding", () => {
    const first = buy(fresh, "AAPL", "Apple Inc.", 10, 100, opts).state!;
    const second = buy(first, "AAPL", "Apple Inc.", 10, 200, opts);
    expect(second.state!.holdings[0].quantity).toBe(20);
    expect(second.state!.holdings[0].averageBuyPrice).toBe(150);
  });

  it("rejects a purchase that exceeds the balance", () => {
    const r = buy(fresh, "AAPL", "Apple Inc.", 1000, 200, opts);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/insufficient/i);
  });

  it("rejects non-positive quantity or price", () => {
    expect(buy(fresh, "AAPL", "Apple Inc.", 0, 200, opts).success).toBe(false);
    expect(buy(fresh, "AAPL", "Apple Inc.", 10, 0, opts).success).toBe(false);
  });
});

describe("sell", () => {
  const owned: CoreState = {
    virtualBalance: 98000,
    holdings: [{ symbol: "AAPL", companyName: "Apple Inc.", quantity: 10, averageBuyPrice: 200 }],
    transactions: [],
  };

  it("sells part of a holding and credits the balance", () => {
    const r = sell(owned, "AAPL", 4, 250, opts);
    expect(r.success).toBe(true);
    expect(r.state!.virtualBalance).toBe(99000);
    expect(r.state!.holdings[0].quantity).toBe(6);
  });

  it("removes the holding when fully sold", () => {
    const r = sell(owned, "AAPL", 10, 250, opts);
    expect(r.success).toBe(true);
    expect(r.state!.holdings).toHaveLength(0);
  });

  it("rejects selling more than owned or a symbol not held", () => {
    expect(sell(owned, "AAPL", 11, 250, opts).success).toBe(false);
    expect(sell(owned, "TSLA", 1, 250, opts).success).toBe(false);
  });
});
