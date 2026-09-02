"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { formatUsd } from "@/lib/format";
import { Panel, PanelHeader, Segmented, Stat, Badge, EmptyState } from "@/components/ui/kit";
import { ReceiptText } from "lucide-react";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buys" },
  { value: "sell", label: "Sells" },
] as const;

export default function OrdersPage() {
  const transactions = usePortfolioStore((s) => s.transactions);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");

  const stats = useMemo(() => {
    const buys = transactions.filter((t) => t.type === "buy");
    const sells = transactions.filter((t) => t.type === "sell");
    return {
      total: transactions.length,
      buyValue: buys.reduce((s, t) => s + t.price * t.quantity, 0),
      sellValue: sells.reduce((s, t) => s + t.price * t.quantity, 0),
    };
  }, [transactions]);

  const rows = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => t.type === filter)),
    [transactions, filter],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-txt-mute">Paper trading</div>
        <h1 className="mt-1 text-xl font-bold text-txt">Order history</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total orders" value={String(stats.total)} />
        <Stat label="Bought" value={<span className="text-up">{formatUsd(stats.buyValue)}</span>} />
        <Stat label="Sold" value={<span className="text-down">{formatUsd(stats.sellValue)}</span>} />
      </div>

      <Panel padded={false}>
        <div className="flex items-center justify-between p-5 pb-3">
          <PanelHeader title="Orders" />
          <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="h-6 w-6" />}
            title="No orders yet"
            hint="Every buy and sell you place is recorded here. All orders execute immediately at the market price."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-txt-mute">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Side</th>
                  <th className="px-5 py-2.5 font-medium">Symbol</th>
                  <th className="px-5 py-2.5 font-medium">Qty</th>
                  <th className="px-5 py-2.5 font-medium">Price</th>
                  <th className="px-5 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline font-mono tnum">
                {rows.map((tx) => (
                  <tr key={tx.id} className="transition hover:bg-elevated">
                    <td className="px-5 py-3 text-txt-dim">
                      {new Date(tx.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={tx.type === "buy" ? "up" : "down"}>{tx.type.toUpperCase()}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/stock/${tx.symbol}`} className="font-bold text-txt hover:text-accent">
                        {tx.symbol}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-txt-dim">{tx.quantity}</td>
                    <td className="px-5 py-3 text-txt">{formatUsd(tx.price)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-txt">
                      {formatUsd(tx.price * tx.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
