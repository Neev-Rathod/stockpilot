"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Wallet, Layers, PieChart as PieIcon, TrendingUp } from "lucide-react";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { PortfolioAllocation } from "@/components/portfolio/portfolio-allocation";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { formatUsd } from "@/lib/format";
import { Panel, PanelHeader, Button, Stat, PriceChange, EmptyState } from "@/components/ui/kit";

export default function PortfolioPage() {
  const holdings = usePortfolioStore((s) => s.holdings);
  const transactions = usePortfolioStore((s) => s.transactions);
  const virtualBalance = usePortfolioStore((s) => s.virtualBalance);
  const sellStock = usePortfolioStore((s) => s.sellStock);

  // Live prices for every tradeable symbol — covers all held symbols
  // (fixes the old bug that only priced a hardcoded list of 5).
  const { priceMap } = useMarketTicker();
  const [modal, setModal] = useState<{ symbol: string; companyName: string; price: number } | null>(null);

  const holdingsValue = useMemo(
    () => holdings.reduce((sum, h) => sum + (priceMap[h.symbol] ?? h.averageBuyPrice) * h.quantity, 0),
    [holdings, priceMap],
  );
  const totalCost = holdings.reduce((sum, h) => sum + h.averageBuyPrice * h.quantity, 0);
  const pnl = holdingsValue - totalCost;
  const returnPct = totalCost ? (pnl / totalCost) * 100 : 0;

  function trade(quantity: number) {
    if (!modal) return;
    const res = sellStock(modal.symbol, quantity, modal.price);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setModal(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <h1 className="text-xl font-bold text-txt">Portfolio</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Available cash" value={formatUsd(virtualBalance)} icon={<Wallet className="h-4 w-4 text-accent" />} />
        <Stat label="Holdings value" value={formatUsd(holdingsValue)} icon={<Layers className="h-4 w-4 text-accent" />} />
        <Stat label="Total invested" value={formatUsd(totalCost)} icon={<PieIcon className="h-4 w-4 text-accent" />} />
        <Stat
          label="Net P&L"
          value={<span className={pnl >= 0 ? "text-up" : "text-down"}>{formatUsd(pnl)}</span>}
          sub={<PriceChange percent={returnPct} />}
          icon={<TrendingUp className="h-4 w-4 text-accent" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Panel padded={false}>
          <div className="p-5 pb-0">
            <PanelHeader title={`Active holdings (${holdings.length})`} />
          </div>
          {holdings.length === 0 ? (
            <EmptyState
              title="No holdings yet"
              hint="Head to a stock page and place a buy order to get started."
              action={<Link href="/markets"><Button size="sm">Browse markets</Button></Link>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-txt-mute">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Symbol</th>
                    <th className="px-5 py-2.5 font-medium">Qty</th>
                    <th className="px-5 py-2.5 font-medium">Avg cost</th>
                    <th className="px-5 py-2.5 font-medium">Price</th>
                    <th className="px-5 py-2.5 font-medium">Value</th>
                    <th className="px-5 py-2.5 font-medium">P&L</th>
                    <th className="px-5 py-2.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline font-mono tnum">
                  {holdings.map((h) => {
                    const price = priceMap[h.symbol] ?? h.averageBuyPrice;
                    const value = price * h.quantity;
                    const cost = h.averageBuyPrice * h.quantity;
                    const gain = value - cost;
                    const gainPct = cost ? (gain / cost) * 100 : 0;
                    return (
                      <tr key={h.symbol} className="transition hover:bg-elevated">
                        <td className="px-5 py-3">
                          <Link href={`/stock/${h.symbol}`} className="font-bold text-txt hover:text-accent">
                            {h.symbol}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-txt-dim">{h.quantity}</td>
                        <td className="px-5 py-3 text-txt-dim">{formatUsd(h.averageBuyPrice)}</td>
                        <td className="px-5 py-3 text-txt">{formatUsd(price)}</td>
                        <td className="px-5 py-3 text-txt">{formatUsd(value)}</td>
                        <td className="px-5 py-3">
                          <span className={gain >= 0 ? "text-up" : "text-down"}>
                            {formatUsd(gain)} ({gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%)
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setModal({ symbol: h.symbol, companyName: h.companyName, price })}
                          >
                            Sell
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Allocation" />
            <PortfolioAllocation holdings={holdings} prices={priceMap} />
          </Panel>

          <Panel padded={false}>
            <div className="p-5 pb-3">
              <PanelHeader title="Recent transactions" />
            </div>
            {transactions.length === 0 ? (
              <div className="px-5 pb-5 text-xs text-txt-mute">No transactions yet.</div>
            ) : (
              <div className="divide-y divide-hairline">
                {transactions.slice(0, 6).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-2.5 font-mono text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold ${tx.type === "buy" ? "text-up" : "text-down"}`}>
                        {tx.type.toUpperCase()}
                      </span>
                      <span className="font-bold text-txt">{tx.symbol}</span>
                    </div>
                    <div className="text-right text-txt-dim tnum">
                      {tx.quantity} @ {formatUsd(tx.price)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {modal && (
        <BuySellModal
          mode="sell"
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
