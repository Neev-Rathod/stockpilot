"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { useLiveMarketQuotes } from "@/lib/use-live-quotes";

export default function WatchlistPage() {
  const favorites = usePortfolioStore((state) => state.favorites);

  const activeSymbols = useMemo(() => favorites, [favorites]);
  const { quotes } = useLiveMarketQuotes(activeSymbols, 30_000, 1000);

  const watchlistRows = useMemo(
    () =>
      favorites.length === 0
        ? []
        : quotes.filter((quote) => favorites.includes(quote.symbol)),
    [favorites, quotes],
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
            Saved Symbols
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">Watchlist</h1>
        </div>

        <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-[#1e2027] bg-[#0d0e12] px-3 py-2 text-xs text-slate-300">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            placeholder="Search stocks to add"
            className="w-full border-0 bg-transparent text-slate-200 placeholder:text-slate-500 outline-none"
            readOnly
            aria-label="Watchlist search"
          />
        </div>
      </div>

      <div className="dark-card p-6">
        {watchlistRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1e2027] text-[10px] font-medium text-slate-400">
                <tr>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Change</th>
                  <th className="py-3 px-4">Day High</th>
                  <th className="py-3 px-4">Day Low</th>
                  <th className="py-3 px-4 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181921] font-mono">
                {watchlistRows.map((row) => (
                  <tr
                    key={row.symbol}
                    className="hover:bg-[#181921] transition-colors"
                  >
                    <td className="py-3.5 px-4 font-bold text-white">
                      <Link
                        href={`/stock/${row.symbol}`}
                        className="hover:text-blue-400"
                      >
                        {row.symbol}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-white">
                      ${row.price.toFixed(2)}
                    </td>
                    <td
                      className={`py-3.5 px-4 font-bold ${row.percentChange >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {row.percentChange >= 0 ? "+" : ""}
                      {row.percentChange.toFixed(2)}%
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      ${(row.high ?? row.price).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      ${(row.low ?? row.price).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/stock/${row.symbol}`}
                        className="inline-flex items-center rounded-lg border border-blue-500/30 bg-blue-600/10 px-3 py-1.5 text-[10px] font-semibold text-blue-300 hover:bg-blue-600/20"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#2a2d37] bg-[#0d0e12] p-10 text-center text-sm text-slate-400">
            Your watchlist is empty. Add any stock from a company page and it
            will appear here automatically.
          </div>
        )}
      </div>
    </div>
  );
}
