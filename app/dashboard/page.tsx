"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Wallet, TrendingUp, Coins, Activity } from "lucide-react";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { StockChart } from "@/components/stocks/stock-chart";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { formatUsd, formatPercent } from "@/lib/format";
import { Panel, PanelHeader, Button, PriceChange, Stat, EmptyState } from "@/components/ui/kit";

export default function DashboardPage() {
  const { quotes, priceMap } = useMarketTicker();
  const holdings = usePortfolioStore((s) => s.holdings);
  const virtualBalance = usePortfolioStore((s) => s.virtualBalance);
  const buyStock = usePortfolioStore((s) => s.buyStock);
  const sellStock = usePortfolioStore((s) => s.sellStock);

  const [chartSymbol, setChartSymbol] = useState("AAPL");
  const [modal, setModal] = useState<{ mode: "buy" | "sell"; symbol: string; companyName: string; price: number } | null>(null);

  const changeMap = useMemo(
    () => Object.fromEntries(quotes.map((q) => [q.symbol, q.change])),
    [quotes],
  );

  const holdingsValue = useMemo(
    () => holdings.reduce((sum, h) => sum + (priceMap[h.symbol] ?? h.averageBuyPrice) * h.quantity, 0),
    [holdings, priceMap],
  );
  const totalCost = holdings.reduce((sum, h) => sum + h.averageBuyPrice * h.quantity, 0);
  const totalPnl = holdingsValue - totalCost;
  const returnPct = totalCost ? (totalPnl / totalCost) * 100 : 0;
  const dayPnl = holdings.reduce((sum, h) => sum + (changeMap[h.symbol] ?? 0) * h.quantity, 0);
  const equity = virtualBalance + holdingsValue;

  const movers = useMemo(
    () => [...quotes].sort((a, b) => b.percentChange - a.percentChange),
    [quotes],
  );

  function trade(quantity: number) {
    if (!modal) return;
    const res =
      modal.mode === "buy"
        ? buyStock(modal.symbol, modal.companyName, quantity, modal.price)
        : sellStock(modal.symbol, quantity, modal.price);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setModal(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <div>
        <h1 className="text-xl font-bold text-txt">Overview</h1>
        <p className="mt-0.5 text-xs text-txt-mute">Your paper-trading account at a glance.</p>
      </div>

      {/* Account summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Portfolio value" value={formatUsd(equity)} icon={<Wallet className="h-4 w-4 text-accent" />} />
        <Stat label="Available cash" value={formatUsd(virtualBalance)} icon={<Coins className="h-4 w-4 text-accent" />} />
        <Stat
          label="Total P&L"
          value={<span className={totalPnl >= 0 ? "text-up" : "text-down"}>{formatUsd(totalPnl)}</span>}
          sub={<PriceChange percent={returnPct} />}
          icon={<TrendingUp className="h-4 w-4 text-accent" />}
        />
        <Stat
          label="Day's change"
          value={<span className={dayPnl >= 0 ? "text-up" : "text-down"}>{formatUsd(dayPnl)}</span>}
          icon={<Activity className="h-4 w-4 text-accent" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Holdings */}
        <Panel padded={false}>
          <div className="p-5 pb-0">
            <PanelHeader title={`Holdings (${holdings.length})`} action={<Link href="/portfolio" className="text-xs font-semibold text-accent hover:text-accent-hover">View all</Link>} />
          </div>
          {holdings.length === 0 ? (
            <EmptyState
              title="No holdings yet"
              hint="Buy a stock from the movers list to start building your portfolio."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-txt-mute">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Symbol</th>
                    <th className="px-5 py-2.5 font-medium">Qty</th>
                    <th className="px-5 py-2.5 font-medium">Price</th>
                    <th className="px-5 py-2.5 font-medium">Value</th>
                    <th className="px-5 py-2.5 text-right font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline font-mono tnum">
                  {holdings.map((h) => {
                    const price = priceMap[h.symbol] ?? h.averageBuyPrice;
                    const value = price * h.quantity;
                    const pnl = value - h.averageBuyPrice * h.quantity;
                    return (
                      <tr key={h.symbol} className="transition hover:bg-elevated">
                        <td className="px-5 py-3">
                          <Link href={`/stock/${h.symbol}`} className="font-bold text-txt hover:text-accent">
                            {h.symbol}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-txt-dim">{h.quantity}</td>
                        <td className="px-5 py-3 text-txt">{formatUsd(price)}</td>
                        <td className="px-5 py-3 text-txt">{formatUsd(value)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={pnl >= 0 ? "text-up" : "text-down"}>{formatUsd(pnl)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Movers */}
        <Panel padded={false}>
          <div className="p-5 pb-3">
            <PanelHeader title="Market movers" hint="Live from your dataset" />
          </div>
          <div className="divide-y divide-hairline">
            {movers.map((q) => (
              <div key={q.symbol} className="flex items-center justify-between px-5 py-2.5">
                <Link href={`/stock/${q.symbol}`} className="min-w-0">
                  <div className="font-mono text-sm font-bold text-txt hover:text-accent">{q.symbol}</div>
                  <div className="truncate text-[11px] text-txt-mute">{q.companyName}</div>
                </Link>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono text-sm tnum text-txt">{formatUsd(q.price)}</div>
                    <div className={`font-mono text-[11px] tnum ${q.percentChange >= 0 ? "text-up" : "text-down"}`}>
                      {formatPercent(q.percentChange)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setModal({ mode: "buy", symbol: q.symbol, companyName: q.companyName, price: q.price })}
                  >
                    Buy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Chart */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {quotes.slice(0, 6).map((q) => (
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
        <StockChart
          symbol={chartSymbol}
          price={priceMap[chartSymbol]}
          change={quotes.find((q) => q.symbol === chartSymbol)?.percentChange}
        />
      </div>

      {modal && (
        <BuySellModal
          mode={modal.mode}
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
