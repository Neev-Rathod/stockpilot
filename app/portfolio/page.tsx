"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  PieChart as PieChartIcon,
  TrendingUp,
  History,
  Layers,
} from "lucide-react";
import { getMultipleQuotes } from "@/lib/finnhub/client";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { PortfolioAllocation } from "@/components/portfolio/portfolio-allocation";
import Link from "next/link";

const INITIAL_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA"];

export default function PortfolioPage() {
  const holdings = usePortfolioStore((state) => state.holdings);
  const transactions = usePortfolioStore((state) => state.transactions);
  const virtualBalance = usePortfolioStore((state) => state.virtualBalance);

  const { data: quotes = [] } = useQuery({
    queryKey: ["portfolio-quotes"],
    queryFn: () => getMultipleQuotes(INITIAL_SYMBOLS),
    staleTime: 60_000,
  });

  const priceMap = useMemo(
    () =>
      Object.fromEntries(quotes.map((quote) => [quote.symbol, quote.price])),
    [quotes],
  );

  const portfolioValue = useMemo(
    () =>
      holdings.reduce((sum, holding) => {
        const currentQuote = quotes.find(
          (quote) => quote.symbol === holding.symbol,
        );
        return sum + (currentQuote?.price ?? 0) * holding.quantity;
      }, 0),
    [holdings, quotes],
  );

  const totalInvestment = holdings.reduce(
    (sum, holding) => sum + holding.averageBuyPrice * holding.quantity,
    0,
  );
  const pnl = portfolioValue - totalInvestment;
  const returnPct = totalInvestment ? (pnl / totalInvestment) * 100 : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white">Portfolio</h1>
      </div>

      {/* Financial Stat Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="dark-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Cash</span>
            <Wallet className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-3 text-xl font-bold font-mono text-white">
            $
            {virtualBalance.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        <div className="dark-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Holdings Value</span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 text-xl font-bold font-mono text-white">
            $
            {portfolioValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        <div className="dark-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Invested</span>
            <PieChartIcon className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 text-xl font-bold font-mono text-white">
            $
            {totalInvestment.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        <div className="dark-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Net Profit / Loss</span>
            <TrendingUp
              className={`h-4 w-4 ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
            />
          </div>
          <div
            className={`mt-3 text-xl font-bold font-mono ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {pnl >= 0 ? "+" : "-"}$
            {Math.abs(pnl).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
      </div>

      {/* Main Grid: Holdings Table & Allocation Sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
        <div className="dark-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-white">
            Active Holdings ({holdings.length})
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] font-medium text-slate-400 border-b border-[#1e2027]">
                <tr>
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4">Shares</th>
                  <th className="py-3 px-4">Avg Price</th>
                  <th className="py-3 px-4">Market Price</th>
                  <th className="py-3 px-4">Total Value</th>
                  <th className="py-3 px-4 text-right">P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181921] font-mono">
                {holdings.length > 0 ? (
                  holdings.map((holding) => {
                    const current =
                      quotes.find((quote) => quote.symbol === holding.symbol)
                        ?.price ?? holding.averageBuyPrice;
                    const value = current * holding.quantity;
                    const gain =
                      value - holding.averageBuyPrice * holding.quantity;
                    const isPositive = gain >= 0;

                    return (
                      <tr
                        key={holding.symbol}
                        className="hover:bg-[#181921] transition-colors"
                      >
                        <td className="py-3.5 px-4 font-bold font-mono text-white">
                          <Link
                            href={`/stock/${holding.symbol}`}
                            className="hover:text-blue-500"
                          >
                            {holding.symbol}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-slate-200">
                          {holding.quantity}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          ${holding.averageBuyPrice.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-white">
                          ${current.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-white font-bold">
                          ${value.toFixed(2)}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {isPositive ? "+" : "-"}${Math.abs(gain).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-slate-500 font-sans"
                    >
                      No active holdings yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Return & Allocation Sidebar */}
        <div className="space-y-6">
          <div className="dark-card p-5">
            <div className="text-[10px] text-slate-400 mb-1">Overall Yield</div>
            <div
              className={`text-2xl font-bold font-mono ${returnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {returnPct >= 0 ? "+" : ""}
              {returnPct.toFixed(2)}%
            </div>
          </div>

          <div className="dark-card p-5">
            <div className="text-xs font-bold text-white mb-3">
              Portfolio Allocation
            </div>
            <PortfolioAllocation holdings={holdings} prices={priceMap} />
          </div>

          <div className="dark-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-white">
                Recent Transactions
              </div>
              <History className="h-3.5 w-3.5 text-slate-400" />
            </div>

            <div className="space-y-2 text-xs font-mono">
              {transactions.length > 0 ? (
                transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2 border-b border-[#1c1d25] last:border-0"
                  >
                    <div>
                      <div className="font-bold text-white">{tx.symbol}</div>
                      <div
                        className={`text-[10px] ${tx.type === "buy" ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {tx.type.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white">{tx.quantity} shares</div>
                      <div className="text-slate-400">
                        ${tx.price.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-[11px] font-sans">
                  No transaction logs available.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
