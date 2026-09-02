import type { Holding, Transaction } from "@/lib/types";

// Pure, side-effect-free trade math shared by the store and its unit tests.
// The Zustand store applies the returned state synchronously (optimistic) and
// then persists to Supabase in the background — see lib/portfolio-store.ts.

export interface CoreState {
  virtualBalance: number;
  holdings: Holding[];
  transactions: Transaction[];
}

export interface TradeOptions {
  id?: string;
  timestamp?: string;
}

export interface TradeResult {
  success: boolean;
  message: string;
  state?: CoreState;
  transaction?: Transaction;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function buy(
  state: CoreState,
  symbol: string,
  companyName: string,
  quantity: number,
  price: number,
  options: TradeOptions = {},
): TradeResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { success: false, message: "Quantity must be a positive number." };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { success: false, message: "Price is invalid." };
  }

  const totalCost = quantity * price;
  if (totalCost > state.virtualBalance) {
    return { success: false, message: "Insufficient virtual balance." };
  }

  const existingIndex = state.holdings.findIndex((h) => h.symbol === symbol);
  const current = existingIndex >= 0 ? state.holdings[existingIndex] : null;
  const newQuantity = (current?.quantity ?? 0) + quantity;
  const newAverage = current
    ? (current.averageBuyPrice * current.quantity + quantity * price) / newQuantity
    : price;

  const nextHoldings = [...state.holdings];
  if (current) {
    nextHoldings[existingIndex] = {
      ...current,
      quantity: newQuantity,
      averageBuyPrice: newAverage,
    };
  } else {
    nextHoldings.push({ symbol, companyName, quantity, averageBuyPrice: price });
  }

  const transaction: Transaction = {
    id: options.id ?? `${symbol}-${Date.now()}`,
    symbol,
    type: "buy",
    quantity,
    price,
    timestamp: options.timestamp ?? new Date().toISOString(),
  };

  return {
    success: true,
    message: `Successfully simulated purchase of ${quantity} shares of ${symbol}.`,
    state: {
      virtualBalance: round2(state.virtualBalance - totalCost),
      holdings: nextHoldings,
      transactions: [transaction, ...state.transactions],
    },
    transaction,
  };
}

export function sell(
  state: CoreState,
  symbol: string,
  quantity: number,
  price: number,
  options: TradeOptions = {},
): TradeResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { success: false, message: "Quantity must be a positive number." };
  }

  const holding = state.holdings.find((h) => h.symbol === symbol);
  if (!holding) {
    return { success: false, message: `You do not own ${symbol}.` };
  }
  if (quantity > holding.quantity) {
    return { success: false, message: "You cannot sell more than you own." };
  }

  const nextQuantity = holding.quantity - quantity;
  const nextHoldings = state.holdings
    .map((h) => (h.symbol === symbol ? { ...h, quantity: nextQuantity } : h))
    .filter((h) => h.quantity > 0);

  const transaction: Transaction = {
    id: options.id ?? `${symbol}-${Date.now()}-sell`,
    symbol,
    type: "sell",
    quantity,
    price,
    timestamp: options.timestamp ?? new Date().toISOString(),
  };

  return {
    success: true,
    message: `Successfully simulated sale of ${quantity} shares of ${symbol}.`,
    state: {
      virtualBalance: round2(state.virtualBalance + quantity * price),
      holdings: nextHoldings,
      transactions: [transaction, ...state.transactions],
    },
    transaction,
  };
}
