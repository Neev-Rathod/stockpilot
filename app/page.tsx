"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  PieChart as PieChartIcon,
  TrendingUp,
  Bookmark,
  Star,
  Layers,
  History,
  BarChart2,
} from "lucide-react";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { StockChart } from "@/components/stocks/stock-chart";
import { PortfolioAllocation } from "@/components/portfolio/portfolio-allocation";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { toast } from "sonner";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<
    "portfolio" | "watchlist" | "favorites"
  >("portfolio");
  const [selectedChartSymbol, setSelectedChartSymbol] = useState("AAPL");
  const [modal, setModal] = useState<{
    type: "buy" | "sell";
    symbol: string;
    price: number;
  } | null>(null);

  // Live Market Ticker Engine: 1-Second Price Ticks & 30-Second API Fetching
  const { quotes, priceMap } = useMarketTicker();

  const virtualBalance = usePortfolioStore((state) => state.virtualBalance);
  const holdings = usePortfolioStore((state) => state.holdings);
  const transactions = usePortfolioStore((state) => state.transactions);
  const buyStock = usePortfolioStore((state) => state.buyStock);
  const sellStock = usePortfolioStore((state) => state.sellStock);

  // Calculate live portfolio values based on 1-second ticking prices
  const portfolioValue = useMemo(
    () =>
      holdings.reduce((sum, holding) => {
        const currentPrice =
          priceMap[holding.symbol] ?? holding.averageBuyPrice;
        return sum + currentPrice * holding.quantity;
      }, 0),
    [holdings, priceMap],
  );

  const totalInvestment = holdings.reduce(
    (sum, holding) => sum + holding.averageBuyPrice * holding.quantity,
    0,
  );
  const pnl = portfolioValue - totalInvestment;
  const returnPct = totalInvestment ? (pnl / totalInvestment) * 100 : 0;

  function handleConfirmTrade(
    quantity: number,
    orderType: string,
    executionType: string,
  ) {
    if (!modal) return;
    if (modal.type === "buy") {
      const res = buyStock(modal.symbol, modal.symbol, quantity, modal.price);
      if (res.success) {
        toast.success(`${res.message} · ${orderType} · ${executionType}`);
      } else {
        toast.error(res.message);
      }
    }
    if (modal.type === "sell") {
      const res = sellStock(modal.symbol, quantity, modal.price);
      if (res.success) {
        toast.success(`${res.message} · ${orderType} · ${executionType}`);
      } else {
        toast.error(res.message);
      }
    }
    setModal(null);
  }

  const activeQuote =
    quotes.find((q) => q.symbol === selectedChartSymbol) ?? quotes[0];

  return (
    <div className="space-y-8 pb-12">
      {/* Top Title & 1s Live Ticker Notice */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">My Portofolio</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live 1s Price Engine (30s API Fetch Loop Active)
          </div>
        </div>
      </div>

      {/* Top Summary Cards (Matching Reference Image 1) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quotes.slice(0, 4).map((stock, idx) => {
          const positive = stock.percentChange >= 0;
          return (
            <div
              key={idx}
              className="dark-card p-4 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#22171c] text-red-500 font-bold text-xs font-mono">
                    {stock.symbol.slice(0, 2)}
                  </div>
                  <span className="font-bold text-sm text-white">
                    {stock.companyName || stock.symbol}
                  </span>
                </div>

                <div className="h-6 w-16">
                  <svg
                    viewBox="0 0 60 20"
                    className="h-full w-full overflow-visible"
                  >
                    <path
                      d={
                        positive
                          ? "M0,15 Q15,5 30,12 T60,2"
                          : "M0,2 Q15,12 30,5 T60,18"
                      }
                      fill="none"
                      stroke={positive ? "#22c55e" : "#ef4444"}
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1e2027] flex items-center justify-between text-xs font-mono">
                <div>
                  <div className="text-[10px] text-slate-400 font-sans">
                    Total Share
                  </div>
                  <div
                    className={
                      positive
                        ? "text-emerald-400 font-bold"
                        : "text-red-400 font-bold"
                    }
                  >
                    {positive ? "+" : ""}
                    {stock.percentChange.toFixed(2)}% ▲
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-sans">
                    Live Price
                  </div>
                  <div className="text-white font-bold">
                    ${stock.price.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dashboard Section Tabs Navigation (Matching User Request) */}
      <div className="dark-card p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1e2027] pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("portfolio")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold font-sans transition-all ${
                activeTab === "portfolio"
                  ? "bg-white text-[#0d0e12]"
                  : "text-slate-400 hover:text-white hover:bg-[#181921]"
              }`}
            >
              <PieChartIcon className="h-4 w-4" />
              Actual Portfolio ({holdings.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("watchlist")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold font-sans transition-all ${
                activeTab === "watchlist"
                  ? "bg-white text-[#0d0e12]"
                  : "text-slate-400 hover:text-white hover:bg-[#181921]"
              }`}
            >
              <Bookmark className="h-4 w-4" />
              Live Watchlist
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("favorites")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold font-sans transition-all ${
                activeTab === "favorites"
                  ? "bg-white text-[#0d0e12]"
                  : "text-slate-400 hover:text-white hover:bg-[#181921]"
              }`}
            >
              <Star className="h-4 w-4" />
              Favorites
            </button>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400">Cash:</span>{" "}
              <strong className="text-white">
                ${virtualBalance.toFixed(2)}
              </strong>
            </div>
            <div>
              <span className="text-slate-400">Portfolio:</span>{" "}
              <strong className="text-emerald-400">
                ${portfolioValue.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>

        {/* TAB 1: ACTUAL PORTFOLIO */}
        {activeTab === "portfolio" && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                  Your Holdings
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] font-medium text-slate-400 border-b border-[#1e2027]">
                    <tr>
                      <th className="py-3 px-3">Asset</th>
                      <th className="py-3 px-3">Shares</th>
                      <th className="py-3 px-3">Avg Price</th>
                      <th className="py-3 px-3">Live Price</th>
                      <th className="py-3 px-3">Total Value</th>
                      <th className="py-3 px-3">Unrealized P/L</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181921] font-mono">
                    {holdings.length > 0 ? (
                      holdings.map((holding) => {
                        const current =
                          priceMap[holding.symbol] ?? holding.averageBuyPrice;
                        const value = current * holding.quantity;
                        const gain =
                          value - holding.averageBuyPrice * holding.quantity;
                        const isPositive = gain >= 0;

                        return (
                          <tr
                            key={holding.symbol}
                            className="hover:bg-[#181921] transition-colors"
                          >
                            <td className="py-3 px-3 font-bold font-mono text-white">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedChartSymbol(holding.symbol)
                                }
                                className="text-white hover:text-blue-400 text-left font-bold"
                              >
                                {holding.symbol}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-slate-200">
                              {holding.quantity}
                            </td>
                            <td className="py-3 px-3 text-slate-400">
                              ${holding.averageBuyPrice.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-white font-bold">
                              ${current.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-white font-bold">
                              ${value.toFixed(2)}
                            </td>
                            <td
                              className={`py-3 px-3 font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                            >
                              {isPositive ? "+" : "-"}$
                              {Math.abs(gain).toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex justify-end gap-1.5 font-sans">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setModal({
                                      type: "buy",
                                      symbol: holding.symbol,
                                      price: current,
                                    })
                                  }
                                  className="rounded bg-emerald-950/60 px-2 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-900"
                                >
                                  + Buy
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setModal({
                                      type: "sell",
                                      symbol: holding.symbol,
                                      price: current,
                                    })
                                  }
                                  className="rounded bg-red-950/60 px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-900"
                                >
                                  - Sell
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-slate-500 font-sans"
                        >
                          No active holdings. Explore stocks in the Watchlist
                          tab to buy virtual shares.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Allocation Chart & Audit Trail */}
            <div className="space-y-4">
              <div className="rounded-xl border border-[#1e2027] bg-[#0d0e12] p-4">
                <div className="text-xs font-bold text-white mb-2">
                  Portfolio Asset Allocation
                </div>
                <PortfolioAllocation holdings={holdings} prices={priceMap} />
              </div>

              <div className="rounded-xl border border-[#1e2027] bg-[#0d0e12] p-4 space-y-2 font-mono">
                <div className="flex items-center justify-between text-xs font-bold text-white mb-1 font-sans">
                  <span>Recent Transaction Audit</span>
                  <History className="h-3.5 w-3.5 text-slate-400" />
                </div>
                {transactions.length > 0 ? (
                  transactions.slice(0, 4).map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-[#181921] last:border-0"
                    >
                      <div>
                        <span className="font-bold text-white">
                          {tx.symbol}
                        </span>
                        <span
                          className={`ml-2 text-[10px] ${tx.type === "buy" ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {tx.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-slate-300">
                        {tx.quantity} shrs @ ${tx.price.toFixed(2)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-[10px] font-sans">
                    No recent transactions.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE WATCHLIST */}
        {activeTab === "watchlist" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Live Market Tickers (Updating 1s)
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] font-medium text-slate-400 border-b border-[#1e2027]">
                  <tr>
                    <th className="py-3 px-4">Asset</th>
                    <th className="py-3 px-4">Live Price</th>
                    <th className="py-3 px-4">24h Change</th>
                    <th className="py-3 px-4">Day High</th>
                    <th className="py-3 px-4">Day Low</th>
                    <th className="py-3 px-4 text-center">Chart</th>
                    <th className="py-3 px-4 text-right">Trade Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#181921] font-mono">
                  {quotes.map((stock) => {
                    const positive = stock.percentChange >= 0;
                    return (
                      <tr
                        key={stock.symbol}
                        className="hover:bg-[#181921] transition-colors"
                      >
                        <td className="py-3.5 px-4 font-sans">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-950/40 text-blue-400 text-xs font-bold font-mono">
                              {stock.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedChartSymbol(stock.symbol)
                                }
                                className="font-bold text-white hover:text-blue-400 text-left font-mono"
                              >
                                {stock.symbol}
                              </button>
                              <div className="text-[10px] text-slate-400">
                                {stock.companyName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-white font-bold">
                          ${stock.price.toFixed(2)}
                        </td>
                        <td
                          className={`py-3.5 px-4 font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {positive ? "+" : ""}
                          {stock.percentChange.toFixed(2)}%
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          ${(stock.high ?? stock.price).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          ${(stock.low ?? stock.price).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedChartSymbol(stock.symbol)}
                            className="text-xs text-blue-400 hover:underline font-sans"
                          >
                            Inspect
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right font-sans">
                          <button
                            type="button"
                            onClick={() =>
                              setModal({
                                type: "buy",
                                symbol: stock.symbol,
                                price: stock.price,
                              })
                            }
                            className="btn-blue px-3.5 py-1 text-xs"
                          >
                            Trade
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: FAVORITES */}
        {activeTab === "favorites" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quotes.slice(0, 6).map((stock) => {
              const positive = stock.percentChange >= 0;
              return (
                <div
                  key={stock.symbol}
                  className="rounded-xl border border-[#1e2027] bg-[#0d0e12] p-4 flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-950/40 text-blue-400 font-bold font-mono">
                        {stock.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white font-mono">
                          {stock.symbol}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {stock.companyName}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedChartSymbol(stock.symbol)}
                      className="text-amber-400 hover:text-amber-300"
                    >
                      ★
                    </button>
                  </div>

                  <div className="flex items-baseline justify-between font-mono">
                    <div className="text-xl font-bold text-white">
                      ${stock.price.toFixed(2)}
                    </div>
                    <div
                      className={`text-xs font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {positive ? "+" : ""}
                      {stock.percentChange.toFixed(2)}%
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#1a1b23]">
                    <button
                      type="button"
                      onClick={() => setSelectedChartSymbol(stock.symbol)}
                      className="flex-1 rounded-lg border border-[#22232a] bg-[#131418] py-1.5 text-xs text-slate-300 hover:text-white font-sans"
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setModal({
                          type: "buy",
                          symbol: stock.symbol,
                          price: stock.price,
                        })
                      }
                      className="flex-1 btn-blue py-1.5 text-xs font-sans"
                    >
                      Buy Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Restored TradingView Candlestick Pro Chart Engine Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-500" />
            Restored TradingView Candlestick Pro Chart:{" "}
            <span className="text-blue-400 font-mono">
              {selectedChartSymbol}
            </span>
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>Ticker Switcher:</span>
            {["AAPL", "AMZN", "NVDA", "TSLA", "BTCUSD"].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSelectedChartSymbol(sym)}
                className={`px-2 py-0.5 rounded ${
                  selectedChartSymbol === sym
                    ? "bg-white text-[#0d0e12] font-bold"
                    : "hover:text-white"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* TradingView Candlestick Pro Chart Component */}
        <StockChart
          symbol={selectedChartSymbol}
          price={activeQuote?.price}
          change={activeQuote?.percentChange}
        />
      </div>

      {/* Trade Execution Modal */}
      {modal && (
        <BuySellModal
          mode={modal.type}
          symbol={modal.symbol}
          currentPrice={modal.price}
          onClose={() => setModal(null)}
          onConfirm={handleConfirmTrade}
        />
      )}
    </div>
  );
}
