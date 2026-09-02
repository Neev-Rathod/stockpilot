"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { formatUsd, formatPercent } from "@/lib/format";
import { Panel, PanelHeader, Button, EmptyState } from "@/components/ui/kit";

export default function WatchlistPage() {
  const favorites = usePortfolioStore((s) => s.favorites);
  const toggleFavorite = usePortfolioStore((s) => s.toggleFavorite);
  const buyStock = usePortfolioStore((s) => s.buyStock);
  const { quotes } = useMarketTicker();
  const [modal, setModal] = useState<{ symbol: string; companyName: string; price: number } | null>(null);

  const rows = useMemo(
    () => quotes.filter((q) => favorites.includes(q.symbol)),
    [quotes, favorites],
  );

  function trade(quantity: number) {
    if (!modal) return;
    const res = buyStock(modal.symbol, modal.companyName, quantity, modal.price);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setModal(null);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <h1 className="text-xl font-bold text-txt">Watchlist</h1>

      <Panel padded={false}>
        <div className="p-5 pb-3">
          <PanelHeader title={`Tracked symbols (${favorites.length})`} />
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Star className="h-6 w-6" />}
            title="Your watchlist is empty"
            hint="Add stocks with the star button on any stock page to track them here."
            action={<Link href="/markets"><Button size="sm">Browse markets</Button></Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-txt-mute">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Symbol</th>
                  <th className="px-5 py-2.5 font-medium">Price</th>
                  <th className="px-5 py-2.5 font-medium">Change</th>
                  <th className="px-5 py-2.5 font-medium">Day range</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline font-mono tnum">
                {rows.map((q) => (
                  <tr key={q.symbol} className="transition hover:bg-elevated">
                    <td className="px-5 py-3">
                      <Link href={`/stock/${q.symbol}`} className="font-bold text-txt hover:text-accent">
                        {q.symbol}
                      </Link>
                      <div className="truncate font-sans text-[11px] text-txt-mute">{q.companyName}</div>
                    </td>
                    <td className="px-5 py-3 text-txt">{formatUsd(q.price)}</td>
                    <td className={`px-5 py-3 ${q.percentChange >= 0 ? "text-up" : "text-down"}`}>
                      {formatPercent(q.percentChange)}
                    </td>
                    <td className="px-5 py-3 text-txt-dim">
                      {formatUsd(q.low ?? q.price)} – {formatUsd(q.high ?? q.price)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="up" onClick={() => setModal({ symbol: q.symbol, companyName: q.companyName, price: q.price })}>
                          Buy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleFavorite(q.symbol)}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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
