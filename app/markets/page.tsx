"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, TrendingUp, TrendingDown, Activity, Star } from "lucide-react";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { StockChart } from "@/components/stocks/stock-chart";
import { toast } from "sonner";
import { formatUsd, formatPercent } from "@/lib/format";
import { Panel, PanelHeader, Button, Stat, PriceChange, EmptyState } from "@/components/ui/kit";

// Real sectors for the 10 symbols we hold data for.
const SECTOR_MAP: Record<string, string> = {
  AAPL: "Technology", MSFT: "Technology", AMD: "Technology", CSCO: "Technology", QCOM: "Technology",
  AMZN: "Consumer Cyclical", TSLA: "Consumer Cyclical", SBUX: "Consumer Cyclical",
  META: "Communication Services", NFLX: "Communication Services",
};
const SECTORS = ["All", "Technology", "Consumer Cyclical", "Communication Services"];

export default function MarketsPage() {
  const [sector, setSector] = useState("All");
  const [search, setSearch] = useState("");
  const [chartSymbol, setChartSymbol] = useState("AAPL");
  const [modal, setModal] = useState<{ symbol: string; companyName: string; price: number } | null>(null);

  const { quotes } = useMarketTicker();
  const chartQuote = quotes.find((q) => q.symbol === chartSymbol);
  const buyStock = usePortfolioStore((s) => s.buyStock);
  const favorites = usePortfolioStore((s) => s.favorites);
  const toggleFavorite = usePortfolioStore((s) => s.toggleFavorite);

  const breadth = useMemo(() => {
    const adv = quotes.filter((q) => q.percentChange >= 0).length;
    const avg = quotes.length ? quotes.reduce((s, q) => s + q.percentChange, 0) / quotes.length : 0;
    return { adv, dec: quotes.length - adv, avg };
  }, [quotes]);

  const sorted = useMemo(() => [...quotes].sort((a, b) => b.percentChange - a.percentChange), [quotes]);
  const gainers = sorted.slice(0, 3);
  const losers = sorted.slice(-3).reverse();

  const rows = useMemo(
    () =>
      quotes.filter((q) => {
        const matchesSearch =
          !search.trim() ||
          q.symbol.toLowerCase().includes(search.toLowerCase()) ||
          q.companyName.toLowerCase().includes(search.toLowerCase());
        const matchesSector = sector === "All" || SECTOR_MAP[q.symbol] === sector;
        return matchesSearch && matchesSector;
      }),
    [quotes, search, sector],
  );

  function trade(quantity: number) {
    if (!modal) return;
    const res = buyStock(modal.symbol, modal.companyName, quantity, modal.price);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setModal(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-txt">Markets</h1>
        <div className="flex w-64 items-center rounded-lg border border-hairline bg-panel px-3 py-2 text-sm focus-within:border-accent">
          <Search className="mr-2 h-4 w-4 text-txt-mute" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or name…"
            className="w-full bg-transparent text-txt outline-none placeholder:text-txt-mute"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Advancing" value={<span className="text-up">{breadth.adv}</span>} icon={<TrendingUp className="h-4 w-4 text-up" />} />
        <Stat label="Declining" value={<span className="text-down">{breadth.dec}</span>} icon={<TrendingDown className="h-4 w-4 text-down" />} />
        <Stat label="Avg change" value={<span className={breadth.avg >= 0 ? "text-up" : "text-down"}>{formatPercent(breadth.avg)}</span>} icon={<Activity className="h-4 w-4 text-accent" />} />
      </div>

      {/* Chart — same engine/UI as the Compare tab */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {quotes.map((q) => (
            <button
              key={q.symbol}
              type="button"
              onClick={() => setChartSymbol(q.symbol)}
              className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold transition ${
                chartSymbol === q.symbol ? "bg-accent text-[color:var(--on-accent)]" : "text-txt-dim hover:text-txt"
              }`}
            >
              {q.symbol}
            </button>
          ))}
        </div>
        <StockChart symbol={chartSymbol} price={chartQuote?.price} change={chartQuote?.percentChange} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <MoverList title="Top gainers" icon={<TrendingUp className="h-4 w-4 text-up" />} rows={gainers} />
        <MoverList title="Top losers" icon={<TrendingDown className="h-4 w-4 text-down" />} rows={losers} />
      </div>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <PanelHeader title={`Directory (${rows.length})`} />
          <div className="flex flex-wrap gap-2">
            {SECTORS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSector(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  sector === s ? "bg-accent text-[color:var(--on-accent)]" : "border border-hairline bg-elevated text-txt-dim hover:text-txt"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No matches" hint="Try a different search or sector." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-txt-mute">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Symbol</th>
                  <th className="px-5 py-2.5 font-medium">Price</th>
                  <th className="px-5 py-2.5 font-medium">Change</th>
                  <th className="px-5 py-2.5 font-medium">Day range</th>
                  <th className="px-5 py-2.5 text-right font-medium">Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline font-mono tnum">
                {rows.map((q) => {
                  const fav = favorites.includes(q.symbol);
                  return (
                    <tr key={q.symbol} className="transition hover:bg-elevated">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleFavorite(q.symbol)} aria-label="Toggle watchlist">
                            <Star className={`h-3.5 w-3.5 ${fav ? "fill-accent text-accent" : "text-txt-mute"}`} />
                          </button>
                          <div>
                            <Link href={`/stock/${q.symbol}`} className="font-bold text-txt hover:text-accent">{q.symbol}</Link>
                            <div className="truncate font-sans text-[11px] text-txt-mute">{q.companyName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-txt">{formatUsd(q.price)}</td>
                      <td className={`px-5 py-3 ${q.percentChange >= 0 ? "text-up" : "text-down"}`}>{formatPercent(q.percentChange)}</td>
                      <td className="px-5 py-3 text-txt-dim">{formatUsd(q.low ?? q.price)} – {formatUsd(q.high ?? q.price)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" onClick={() => setModal({ symbol: q.symbol, companyName: q.companyName, price: q.price })}>Trade</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-center text-[11px] text-txt-mute">
        Prices reflect the latest available close from your dataset, animated for a live feel.
      </p>

      {modal && (
        <BuySellModal
          mode="buy"
          symbol={modal.symbol}
          companyName={modal.companyName}
          currentPrice={modal.price}
          onClose={() => setModal(null)}
          onConfirm={trade}
        />
      )}
    </div>
  );
}

function MoverList({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { symbol: string; companyName: string; price: number; percentChange: number }[];
}) {
  return (
    <Panel padded={false}>
      <div className="p-5 pb-2">
        <PanelHeader title={<span className="flex items-center gap-2">{icon}{title}</span>} />
      </div>
      <div className="divide-y divide-hairline">
        {rows.map((q) => (
          <Link key={q.symbol} href={`/stock/${q.symbol}`} className="flex items-center justify-between px-5 py-2.5 transition hover:bg-elevated">
            <div className="min-w-0">
              <div className="font-mono text-sm font-bold text-txt">{q.symbol}</div>
              <div className="truncate text-[11px] text-txt-mute">{q.companyName}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm tnum text-txt">{formatUsd(q.price)}</div>
              <PriceChange percent={q.percentChange} className="justify-end text-[11px]" showArrow={false} />
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
