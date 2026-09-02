"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useLiveMarketQuotes } from "@/lib/use-live-quotes";
import { StockChart } from "@/components/stocks/stock-chart";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { getCompanyProfile } from "@/lib/finnhub/client";
import { SECFilingsPanel } from "@/components/stocks/sec-filings-panel";
import { toast } from "sonner";

export default function StockDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol ?? "AAPL").toUpperCase();
  const [modal, setModal] = useState<{ type: "buy" | "sell" } | null>(null);

  const buyStock = usePortfolioStore((state) => state.buyStock);
  const sellStock = usePortfolioStore((state) => state.sellStock);
  const favorites = usePortfolioStore((state) => state.favorites);
  const toggleFavorite = usePortfolioStore((state) => state.toggleFavorite);

  const isWatchlisted = favorites.includes(symbol);

  const symbolList = useMemo(() => [symbol], [symbol]);
  const { quotes: quoteList } = useLiveMarketQuotes(symbolList, 30_000, 1000);
  const quote = quoteList[0] ?? null;

  const { data: profile } = useQuery({
    queryKey: ["stock-profile", symbol],
    queryFn: () => getCompanyProfile(symbol),
    staleTime: 5 * 60_000,
    refetchInterval: 5000,
  });

  function handleConfirm(
    quantity: number,
    orderType: string,
    executionType: string,
  ) {
    if (!quote) return;
    if (modal?.type === "buy") {
      const res = buyStock(symbol, quote.companyName, quantity, quote.price);
      if (res.success)
        toast.success(`${res.message} · ${orderType} · ${executionType}`);
      else toast.error(res.message);
    }
    if (modal?.type === "sell") {
      const res = sellStock(symbol, quantity, quote.price);
      if (res.success)
        toast.success(`${res.message} · ${orderType} · ${executionType}`);
      else toast.error(res.message);
    }
    setModal(null);
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page Title Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Stock</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggleFavorite(symbol)}
            className={`px-4 py-2 text-xs font-sans rounded-xl border ${
              isWatchlisted
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-[#1e2027] bg-[#0d0e12] text-slate-200"
            }`}
          >
            {isWatchlisted ? "★ Added to Watchlist" : "+ Add to Watchlist"}
          </button>
          <button
            type="button"
            onClick={() => setModal({ type: "buy" })}
            className="btn-blue px-4 py-2 text-xs font-sans"
          >
            + Buy {symbol}
          </button>
        </div>
      </div>

      <div className="dark-card p-4">
        <StockChart
          symbol={symbol}
          price={quote?.price}
          change={quote?.percentChange}
        />
      </div>

      <div className="dark-card p-5">
        <div className="flex items-center gap-4">
          {profile?.logo ? (
            <img
              src={profile.logo}
              alt={`${profile.name ?? symbol} logo`}
              className="h-16 w-16 rounded-2xl border border-white/10 bg-slate-900 object-contain p-2"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-lg font-bold text-blue-400">
              {symbol.slice(0, 2)}
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Company
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">
              {profile?.name ?? symbol}
            </h2>
            <div className="mt-1 text-xs text-slate-400">
              {profile?.ticker ?? symbol} • {profile?.exchange ?? "NASDAQ"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoPill
            label="Market Cap"
            value={
              profile?.marketCapitalization
                ? `$${(profile.marketCapitalization / 1_000_000_000).toFixed(2)}B`
                : "N/A"
            }
          />
          <InfoPill
            label="Industry"
            value={profile?.finnhubIndustry ?? "N/A"}
          />
          <InfoPill label="IPO" value={profile?.ipo ?? "N/A"} />
          <InfoPill label="Currency" value={profile?.currency ?? "USD"} />
        </div>

        {profile?.weburl && (
          <a
            href={profile.weburl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300"
          >
            Visit company site
            <Plus className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {modal && (
        <BuySellModal
          mode={modal.type}
          symbol={symbol}
          currentPrice={quote?.price ?? 201.01}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
