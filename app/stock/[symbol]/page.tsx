"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Star, Bell, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useLiveMarketQuotes } from "@/lib/use-live-quotes";
import { StockChart } from "@/components/stocks/stock-chart";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { getCompanyProfile } from "@/lib/finnhub/client";
import { formatUsd, formatCompact } from "@/lib/format";
import { Panel, PanelHeader, Button, Badge, PriceChange, Segmented, Skeleton } from "@/components/ui/kit";

export default function StockDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol ?? "AAPL").toUpperCase();
  const [modal, setModal] = useState<"buy" | "sell" | null>(null);

  const buyStock = usePortfolioStore((s) => s.buyStock);
  const sellStock = usePortfolioStore((s) => s.sellStock);
  const favorites = usePortfolioStore((s) => s.favorites);
  const toggleFavorite = usePortfolioStore((s) => s.toggleFavorite);
  const holdings = usePortfolioStore((s) => s.holdings);
  const owned = holdings.find((h) => h.symbol === symbol);
  const isWatchlisted = favorites.includes(symbol);

  const symbolList = useMemo(() => [symbol], [symbol]);
  const { quotes } = useLiveMarketQuotes(symbolList, 30_000, 1000);
  const quote = quotes[0] ?? null;

  const { data: profile } = useQuery({
    queryKey: ["stock-profile", symbol],
    queryFn: () => getCompanyProfile(symbol),
    staleTime: 5 * 60_000,
  });

  function handleConfirm(quantity: number) {
    if (!quote) return;
    const res =
      modal === "buy"
        ? buyStock(symbol, quote.companyName, quantity, quote.price)
        : sellStock(symbol, quantity, quote.price);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setModal(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {profile?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logo}
              alt=""
              className="h-12 w-12 rounded-xl border border-hairline bg-white/5 object-contain p-1.5"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-elevated font-mono text-sm font-bold text-accent">
              {symbol.slice(0, 2)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold text-txt">{symbol}</h1>
              <Badge tone="neutral">{profile?.exchange ?? "NASDAQ"}</Badge>
            </div>
            <div className="text-sm text-txt-dim">{profile?.name ?? quote?.companyName ?? symbol}</div>
          </div>
        </div>

        <div className="flex items-end gap-4">
          {quote ? (
            <div className="text-right">
              <div className="font-mono text-3xl font-bold tnum text-txt">{formatUsd(quote.price)}</div>
              <PriceChange amount={quote.change} percent={quote.percentChange} className="justify-end text-sm" />
            </div>
          ) : (
            <Skeleton className="h-12 w-32" />
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Left: chart + stats */}
        <div className="space-y-5">
          <StockChart symbol={symbol} price={quote?.price} change={quote?.percentChange} />

          <Panel>
            <PanelHeader title="Key statistics" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Stat label="Open" value={quote ? formatUsd(quote.open ?? quote.price) : "—"} />
              <Stat label="Day high" value={quote ? formatUsd(quote.high ?? quote.price) : "—"} />
              <Stat label="Day low" value={quote ? formatUsd(quote.low ?? quote.price) : "—"} />
              <Stat label="Prev close" value={quote ? formatUsd(quote.previousClose ?? quote.price) : "—"} />
              <Stat label="Volume" value={quote?.volume ? formatCompact(quote.volume) : "—"} />
              <Stat
                label="Market cap"
                value={profile?.marketCapitalization ? `$${formatCompact(profile.marketCapitalization * 1_000_000)}` : "—"}
              />
              <Stat label="Industry" value={profile?.finnhubIndustry ?? "—"} />
              <Stat label="Currency" value={quote?.currency ?? "USD"} />
            </div>
            {profile?.weburl && (
              <a
                href={profile.weburl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-hover"
              >
                Company website <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Panel>
        </div>

        {/* Right: order + alert */}
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Trade" hint={owned ? `You own ${owned.quantity} @ ${formatUsd(owned.averageBuyPrice)}` : "No position yet"} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="up" disabled={!quote} onClick={() => setModal("buy")}>
                Buy
              </Button>
              <Button variant="down" disabled={!quote || !owned} onClick={() => setModal("sell")}>
                Sell
              </Button>
            </div>
            <button
              type="button"
              onClick={() => toggleFavorite(symbol)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-hairline bg-elevated py-2 text-xs font-semibold text-txt-dim transition hover:text-txt"
            >
              <Star className={`h-3.5 w-3.5 ${isWatchlisted ? "fill-accent text-accent" : ""}`} />
              {isWatchlisted ? "In watchlist" : "Add to watchlist"}
            </button>
          </Panel>

          <AlertSetter symbol={symbol} currentPrice={quote?.price ?? 0} />
        </div>
      </div>

      {modal && quote && (
        <BuySellModal
          mode={modal}
          symbol={symbol}
          companyName={quote.companyName}
          currentPrice={quote.price}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-txt-mute">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold tnum text-txt">{value}</div>
    </div>
  );
}

function AlertSetter({ symbol, currentPrice }: { symbol: string; currentPrice: number }) {
  const setAlert = usePortfolioStore((s) => s.setAlert);
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [target, setTarget] = useState<number>(0);

  function save() {
    const res = setAlert(symbol, target, condition);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
  }

  return (
    <Panel>
      <PanelHeader title="Price alert" hint={<Bell className="inline h-3 w-3" />} />
      <Segmented
        className="w-full"
        options={[
          { value: "above", label: "Above" },
          { value: "below", label: "Below" },
        ]}
        value={condition}
        onChange={setCondition}
      />
      <div className="relative mt-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-txt-mute">$</span>
        <input
          type="number"
          min={0}
          value={target || ""}
          onChange={(e) => setTarget(Number(e.target.value))}
          placeholder={currentPrice ? currentPrice.toFixed(2) : "0.00"}
          className="w-full rounded-lg border border-hairline bg-app py-2 pl-7 pr-3 font-mono text-sm text-txt outline-none focus:border-accent"
        />
      </div>
      <Button variant="ghost" className="mt-2 w-full" onClick={save} disabled={target <= 0}>
        Set alert
      </Button>
    </Panel>
  );
}
