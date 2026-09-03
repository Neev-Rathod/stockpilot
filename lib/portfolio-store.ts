import { create } from "zustand";
import type { PortfolioState, PriceAlert } from "@/lib/types";
import { buy as buyLogic, sell as sellLogic } from "@/lib/portfolio-logic";
import { loadPortfolio } from "@/lib/supabase/queries";
import * as persist from "@/lib/supabase/persist";

const DEFAULT_BALANCE = 100000;

interface PortfolioStore extends PortfolioState {
  favorites: string[];
  alerts: PriceAlert[];
  userId: string | null;
  hydrated: boolean;
  hydrate: (userId: string) => Promise<void>;
  clear: () => void;
  toggleFavorite: (symbol: string) => void;
  buyStock: (
    symbol: string,
    companyName: string,
    quantity: number,
    price: number,
  ) => { success: boolean; message: string };
  sellStock: (
    symbol: string,
    quantity: number,
    price: number,
  ) => { success: boolean; message: string };
  resetPortfolio: () => void;
  setAlert: (
    symbol: string,
    targetPrice: number,
    condition: "above" | "below",
  ) => { success: boolean; message: string; alert?: PriceAlert };
  removeAlert: (id: string) => void;
  getAlerts: () => PriceAlert[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const usePortfolioStore = create<PortfolioStore>()((set, get) => ({
  virtualBalance: DEFAULT_BALANCE,
  holdings: [],
  transactions: [],
  favorites: [],
  alerts: [],
  userId: null,
  hydrated: false,

  // Load the signed-in user's state from Supabase into the store.
  hydrate: async (userId) => {
    try {
      const data = await loadPortfolio(userId);
      set({
        userId,
        hydrated: true,
        virtualBalance: data.virtualBalance,
        holdings: data.holdings,
        transactions: data.transactions,
        favorites: data.favorites,
        alerts: data.alerts,
      });
    } catch (error) {
      console.error("[stockpilot] Failed to hydrate portfolio:", error);
      set({ userId, hydrated: true });
    }
  },

  // Reset to a logged-out empty state.
  clear: () => {
    set({
      userId: null,
      hydrated: false,
      virtualBalance: DEFAULT_BALANCE,
      holdings: [],
      transactions: [],
      favorites: [],
      alerts: [],
    });
  },

  toggleFavorite: (symbol) => {
    const cleaned = symbol.toUpperCase();
    const { favorites, userId } = get();
    if (!userId) return; // watchlist is per-user; ignore when signed out
    const exists = favorites.includes(cleaned);
    set({
      favorites: exists
        ? favorites.filter((entry) => entry !== cleaned)
        : [...favorites, cleaned],
    });
    if (userId) {
      if (exists) void persist.removeWatchlist(userId, cleaned);
      else void persist.addWatchlist(userId, cleaned);
    }
  },

  buyStock: (symbol, companyName, quantity, price) => {
    const { virtualBalance, holdings, transactions, userId } = get();
    if (!userId) {
      return { success: false, message: "Please sign in to trade — StockPilot portfolios are per user." };
    }
    const result = buyLogic(
      { virtualBalance, holdings, transactions },
      symbol,
      companyName,
      quantity,
      price,
    );
    if (!result.success || !result.state || !result.transaction) {
      return { success: false, message: result.message };
    }
    set(result.state);
    if (userId) {
      const holding = result.state.holdings.find((h) => h.symbol === symbol);
      if (holding) {
        void persist.persistBuy(userId, holding, result.state.virtualBalance, result.transaction);
      }
    }
    return { success: true, message: result.message };
  },

  sellStock: (symbol, quantity, price) => {
    const { virtualBalance, holdings, transactions, userId } = get();
    if (!userId) {
      return { success: false, message: "Please sign in to trade — StockPilot portfolios are per user." };
    }
    const result = sellLogic(
      { virtualBalance, holdings, transactions },
      symbol,
      quantity,
      price,
    );
    if (!result.success || !result.state || !result.transaction) {
      return { success: false, message: result.message };
    }
    set(result.state);
    if (userId) {
      const remaining = result.state.holdings.find((h) => h.symbol === symbol)?.quantity ?? 0;
      void persist.persistSell(userId, symbol, remaining, result.state.virtualBalance, result.transaction);
    }
    return { success: true, message: result.message };
  },

  resetPortfolio: () => {
    const { userId } = get();
    if (!userId) return;
    set({ virtualBalance: DEFAULT_BALANCE, holdings: [], transactions: [] });
    void persist.persistReset(userId);
  },

  setAlert: (symbol, targetPrice, condition) => {
    const cleaned = symbol.toUpperCase();
    if (!get().userId) {
      return { success: false, message: "Please sign in to set price alerts." };
    }
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return { success: false, message: "Invalid target price." };
    }
    const alert: PriceAlert = {
      id: newId(),
      symbol: cleaned,
      targetPrice,
      condition,
      createdAt: new Date().toISOString(),
      triggered: false,
    };
    set({ alerts: [...get().alerts, alert] });
    const { userId } = get();
    if (userId) void persist.addAlert(userId, alert);
    return {
      success: true,
      message: `Alert set: notify when ${cleaned} goes ${condition} $${targetPrice.toFixed(2)}.`,
      alert,
    };
  },

  removeAlert: (id) => {
    const { userId } = get();
    if (!userId) return;
    set({ alerts: get().alerts.filter((a) => a.id !== id) });
    void persist.removeAlert(userId, id);
  },

  getAlerts: () => get().alerts,
}));

export const portfolioInitialState: PortfolioState = {
  virtualBalance: DEFAULT_BALANCE,
  holdings: [],
  transactions: [],
};
