import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Holding, PortfolioState, Transaction, PriceAlert } from "@/lib/types";


const DEFAULT_BALANCE = 100000;

interface PortfolioStore extends PortfolioState {
  favorites: string[];
  alerts: PriceAlert[];
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


export const usePortfolioStore = create<PortfolioStore>()(
  persist(
    (set, get) => ({
      virtualBalance: DEFAULT_BALANCE,
      holdings: [],
      transactions: [],
      favorites: [],
      alerts: [],

      toggleFavorite: (symbol) => {
        const cleaned = symbol.toUpperCase();
        const favorites = get().favorites;
        const exists = favorites.includes(cleaned);
        set({
          favorites: exists
            ? favorites.filter((entry) => entry !== cleaned)
            : [...favorites, cleaned],
        });
      },
      buyStock: (symbol, companyName, quantity, price) => {
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return {
            success: false,
            message: "Quantity must be a positive number.",
          };
        }
        if (!Number.isFinite(price) || price <= 0) {
          return { success: false, message: "Price is invalid." };
        }

        const totalCost = quantity * price;
        const { virtualBalance, holdings } = get();
        if (totalCost > virtualBalance) {
          return { success: false, message: "Insufficient virtual balance." };
        }

        const existingIndex = holdings.findIndex(
          (holding) => holding.symbol === symbol,
        );
        const currentHolding =
          existingIndex >= 0 ? holdings[existingIndex] : null;
        const newQuantity = (currentHolding?.quantity ?? 0) + quantity;
        const newAverage = currentHolding
          ? (currentHolding.averageBuyPrice * currentHolding.quantity +
              quantity * price) /
            newQuantity
          : price;

        const nextHoldings = [...holdings];
        if (currentHolding) {
          nextHoldings[existingIndex] = {
            ...currentHolding,
            quantity: newQuantity,
            averageBuyPrice: newAverage,
          };
        } else {
          nextHoldings.push({
            symbol,
            companyName,
            quantity,
            averageBuyPrice: price,
          });
        }

        const tx: Transaction = {
          id: `${symbol}-${Date.now()}`,
          symbol,
          type: "buy",
          quantity,
          price,
          timestamp: new Date().toISOString(),
        };

        set({
          virtualBalance: Number((virtualBalance - totalCost).toFixed(2)),
          holdings: nextHoldings,
          transactions: [tx, ...get().transactions],
        });

        return {
          success: true,
          message: `Successfully simulated purchase of ${quantity} shares of ${symbol}.`,
        };
      },
      sellStock: (symbol, quantity, price) => {
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return {
            success: false,
            message: "Quantity must be a positive number.",
          };
        }
        const { virtualBalance, holdings, transactions } = get();
        const holding = holdings.find((item) => item.symbol === symbol);
        if (!holding) {
          return { success: false, message: `You do not own ${symbol}.` };
        }
        if (quantity > holding.quantity) {
          return {
            success: false,
            message: "You cannot sell more than you own.",
          };
        }

        const nextQuantity = holding.quantity - quantity;
        const nextHoldings = holdings.filter(
          (item) => item.symbol !== symbol || nextQuantity > 0,
        );
        const transaction: Transaction = {
          id: `${symbol}-${Date.now()}-sell`,
          symbol,
          type: "sell",
          quantity,
          price,
          timestamp: new Date().toISOString(),
        };

        set({
          virtualBalance: Number(
            (virtualBalance + quantity * price).toFixed(2),
          ),
          holdings: nextHoldings,
          transactions: [transaction, ...transactions],
        });

        return {
          success: true,
          message: `Successfully simulated sale of ${quantity} shares of ${symbol}.`,
        };
      },
      resetPortfolio: () => {
        set({
          virtualBalance: DEFAULT_BALANCE,
          holdings: [],
          transactions: [],
        });
      },
      setAlert: (symbol, targetPrice, condition) => {
        const cleaned = symbol.toUpperCase();
        if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
          return { success: false, message: "Invalid target price." };
        }
        const alert: PriceAlert = {
          id: `alert-${cleaned}-${Date.now()}`,
          symbol: cleaned,
          targetPrice,
          condition,
          createdAt: new Date().toISOString(),
          triggered: false,
        };
        set({ alerts: [...get().alerts, alert] });
        return {
          success: true,
          message: `Alert set: notify when ${cleaned} goes ${condition} $${targetPrice.toFixed(2)}.`,
          alert,
        };
      },
      removeAlert: (id) => {
        set({ alerts: get().alerts.filter((a) => a.id !== id) });
      },
      getAlerts: () => get().alerts,
    }),
    {
      name: "stockpilot-portfolio",
      partialize: (state) => ({
        virtualBalance: state.virtualBalance,
        holdings: state.holdings,
        transactions: state.transactions,
        favorites: state.favorites,
        alerts: state.alerts,
      }),
    },

  ),
);

export const portfolioInitialState: PortfolioState = {
  virtualBalance: DEFAULT_BALANCE,
  holdings: [],
  transactions: [],
};
