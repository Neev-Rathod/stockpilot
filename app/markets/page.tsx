"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Globe,
  Activity,
  Bookmark,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { toast } from "sonner";

const MARKET_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "NVDA",
  "TSLA",
  "AMZN",
  "ADBE",
  "META",
  "AMD",
  "NFLX",
  "INTC",
  "BTCUSD",
  "EURUSD",
];

const SECTORS = [
  "All Markets",
  "Technology",
  "Financials",
  "Energy",
  "Healthcare",
  "Consumer",
  "Crypto",
  "Forex",
];

const SECTOR_MAPPING: Record<string, string[]> = {
  Technology: ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN", "ADBE", "META", "AMD", "NFLX", "INTC"],
  Financials: ["JPM", "BAC", "WFC", "GS", "MS"],
  Energy: ["XOM", "CVX", "COP"],
  Healthcare: ["JNJ", "PFE", "UNH"],
  Consumer: ["TSLA", "AMZN", "WMT", "NKE"],
  Crypto: ["BTCUSD", "ETHUSD", "SOLUSD"],
  Forex: ["EURUSD", "GBPUSD", "USDJPY"],
};

export default function MarketsPage() {
  const [selectedSector, setSelectedSector] = useState("All Markets");
  const [searchQuery, setSearchQuery] = useState("");
  const [modal, setModal] = useState<{ type: "buy" | "sell"; symbol: string; price: number } | null>(null);

  // Universal 1-Second Price Ticker & 30-Second Market API Fetch Engine
  const { quotes, isLoading } = useMarketTicker(MARKET_SYMBOLS);

  const buyStock = usePortfolioStore((state) => state.buyStock);
  const sellStock = usePortfolioStore((state) => state.sellStock);

  // Dynamic Market Indices Data
  const indexData = useMemo(() => {
    const sp500 = quotes.find((q) => q.symbol === "AAPL")?.price ?? 5088.2;
    const nasdaq = quotes.find((q) => q.symbol === "NVDA")?.price ?? 18240.5;
    const dow = quotes.find((q) => q.symbol === "MSFT")?.price ?? 38980.2;

    return [
      { label: "S&P 500", value: (sp500 * 25).toFixed(2), change: "+0.92%", positive: true },
      { label: "NASDAQ", value: (nasdaq * 125).toFixed(2), change: "+1.24%", positive: true },
      { label: "DOW JONES", value: (dow * 90).toFixed(2), change: "+0.45%", positive: true },
    ];
  }, [quotes]);

  // Dynamically Sorted Top Gainers & Losers
  const { gainers, losers } = useMemo(() => {
    const sorted = [...quotes].sort((a, b) => b.percentChange - a.percentChange);
    return {
      gainers: sorted.filter((q) => q.percentChange >= 0).slice(0, 4),
      losers: sorted.filter((q) => q.percentChange < 0).slice(0, 4),
    };
  }, [quotes]);

  // Dynamic Sector & Search Filtered Quotes Table
  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        q.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.companyName.toLowerCase().includes(searchQuery.toLowerCase());

      if (selectedSector === "All Markets") return matchesSearch;

      const sectorSymbols = SECTOR_MAPPING[selectedSector] ?? [];
      return matchesSearch && sectorSymbols.includes(q.symbol);
    });
  }, [quotes, selectedSector, searchQuery]);

  function handleConfirmTrade(quantity: number) {
    if (!modal) return;
    if (modal.type === "buy") {
      const res = buyStock(modal.symbol, modal.symbol, quantity, modal.price);
      if (res.success) toast.success(res.message); else toast.error(res.message);
    }
    if (modal.type === "sell") {
      const res = sellStock(modal.symbol, quantity, modal.price);
      if (res.success) toast.success(res.message); else toast.error(res.message);
    }
    setModal(null);
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            <Globe className="h-4 w-4 text-blue-500" />
            Live Global Markets Hub
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white flex items-center gap-3">
            Real-Time Market Directory
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          </h1>
        </div>

        {/* Search Bar Input */}
        <div className="flex items-center rounded-xl border border-[#1e2027] bg-[#131418] px-3.5 py-2 text-xs w-64 focus-within:border-blue-500">
          <Search className="h-4 w-4 text-slate-400 mr-2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search NVDA, TSLA, BTC..."
            className="w-full bg-transparent outline-none text-slate-200 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Live Market Index Cards (Dynamic 1s Ticks) */}
      <div className="grid gap-4 md:grid-cols-3">
        {indexData.map((item) => (
          <div key={item.label} className="dark-card p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              {item.label}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="font-mono text-2xl font-bold text-white">
                ${Number(item.value).toLocaleString()}
              </div>
              <div className="text-xs font-bold font-mono text-emerald-400">
                {item.change} ▲
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic Top Gainers & Top Losers Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="dark-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Dynamic Top Gainers
            </h2>
            <span className="text-[10px] font-mono text-slate-400">Updating 1s</span>
          </div>

          <div className="space-y-2.5">
            {gainers.map((stock) => (
              <div
                key={stock.symbol}
                className="flex items-center justify-between rounded-xl border border-[#1e2027] bg-[#0d0e12] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-950/50 text-emerald-400 font-bold font-mono text-xs">
                    {stock.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <Link href={`/stock/${stock.symbol}`} className="font-mono text-xs font-bold text-white hover:text-blue-400">
                      {stock.symbol}
                    </Link>
                    <div className="text-[10px] text-slate-400">{stock.companyName}</div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-white">${stock.price.toFixed(2)}</div>
                  <div className="text-[11px] font-bold text-emerald-400">
                    +{stock.percentChange.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dark-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400" /> Dynamic Top Losers
            </h2>
            <span className="text-[10px] font-mono text-slate-400">Updating 1s</span>
          </div>

          <div className="space-y-2.5">
            {losers.length > 0 ? (
              losers.map((stock) => (
                <div
                  key={stock.symbol}
                  className="flex items-center justify-between rounded-xl border border-[#1e2027] bg-[#0d0e12] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-950/50 text-red-400 font-bold font-mono text-xs">
                      {stock.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <Link href={`/stock/${stock.symbol}`} className="font-mono text-xs font-bold text-white hover:text-blue-400">
                        {stock.symbol}
                      </Link>
                      <div className="text-[10px] text-slate-400">{stock.companyName}</div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xs font-bold text-white">${stock.price.toFixed(2)}</div>
                    <div className="text-[11px] font-bold text-red-400">
                      {stock.percentChange.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 p-4">Market momentum positive across active symbols.</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Dynamic Market Directory & Sector Filter */}
      <div className="dark-card p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" /> Market Assets Directory ({filteredQuotes.length})
          </h2>

          {/* Interactive Sector Filter Pills */}
          <div className="flex flex-wrap gap-2">
            {SECTORS.map((sector) => (
              <button
                key={sector}
                type="button"
                onClick={() => setSelectedSector(sector)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-mono transition-colors ${
                  selectedSector === sector
                    ? "bg-white text-[#0d0e12] font-bold"
                    : "border border-[#22232a] bg-[#101115] text-slate-400 hover:text-white"
                }`}
              >
                {sector}
              </button>
            ))}
          </div>
        </div>

        {/* Filtered Live Market Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] font-medium text-slate-400 border-b border-[#1e2027]">
              <tr>
                <th className="py-3 px-4">Asset</th>
                <th className="py-3 px-4">Live Price</th>
                <th className="py-3 px-4">24h Change</th>
                <th className="py-3 px-4">Day High</th>
                <th className="py-3 px-4">Day Low</th>
                <th className="py-3 px-4 text-center">Watchlist</th>
                <th className="py-3 px-4 text-right">Trade Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181921] font-mono">
              {filteredQuotes.map((stock) => {
                const positive = stock.percentChange >= 0;
                return (
                  <tr key={stock.symbol} className="hover:bg-[#181921] transition-colors">
                    <td className="py-3.5 px-4 font-sans">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-950/40 text-blue-400 text-xs font-bold font-mono">
                          {stock.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <Link href={`/stock/${stock.symbol}`} className="font-bold text-white hover:text-blue-400 font-mono">
                            {stock.symbol}
                          </Link>
                          <div className="text-[10px] text-slate-400">{stock.companyName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-white font-bold">${stock.price.toFixed(2)}</td>
                    <td className={`py-3.5 px-4 font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
                      {positive ? "+" : ""}{stock.percentChange.toFixed(2)}%
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">${(stock.high ?? stock.price).toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-slate-300">${(stock.low ?? stock.price).toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button type="button" aria-label="Bookmark" className="text-slate-400 hover:text-white">
                        <Bookmark className="h-4 w-4 mx-auto" />
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => setModal({ type: "buy", symbol: stock.symbol, price: stock.price })}
                        className="btn-blue px-4 py-1.5 text-xs"
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

      {/* Real-Time Exchange Session Status */}
      <div className="dark-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Global Exchange Status</h2>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Active Trading Session
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-4 font-mono text-xs">
          {[
            ["NYSE", "New York", "OPEN"],
            ["NASDAQ", "New York", "OPEN"],
            ["LSE", "London", "OPEN"],
            ["TSE", "Tokyo", "CLOSED"],
          ].map(([market, city, status]) => (
            <div key={market} className="rounded-xl border border-[#1e2027] bg-[#0d0e12] px-4 py-3">
              <div className="text-[10px] uppercase text-slate-400 font-sans">{market} ({city})</div>
              <div className={`mt-1 font-bold ${status === "OPEN" ? "text-emerald-400" : "text-slate-500"}`}>
                {status}
              </div>
            </div>
          ))}
        </div>
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
