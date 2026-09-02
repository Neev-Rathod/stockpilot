"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Trash2 } from "lucide-react";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { formatUsd } from "@/lib/format";
import { Panel, PanelHeader, Button, Badge, Segmented, EmptyState } from "@/components/ui/kit";

export default function AlertsPage() {
  const alerts = usePortfolioStore((s) => s.alerts);
  const setAlert = usePortfolioStore((s) => s.setAlert);
  const removeAlert = usePortfolioStore((s) => s.removeAlert);
  const { quotes, priceMap } = useMarketTicker();

  const symbols = useMemo(() => quotes.map((q) => q.symbol), [quotes]);
  const [symbol, setSymbol] = useState("AAPL");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [target, setTarget] = useState(0);

  function create() {
    const res = setAlert(symbol, target, condition);
    if (res.success) {
      toast.success(res.message);
      setTarget(0);
    } else toast.error(res.message);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <h1 className="text-xl font-bold text-txt">Price alerts</h1>

      {/* Create */}
      <Panel>
        <PanelHeader title="New alert" hint="Notifies you when the price crosses your target." />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="rounded-lg border border-hairline bg-app px-3 py-2 font-mono text-sm text-txt outline-none focus:border-accent"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Segmented
            options={[
              { value: "above", label: "Above" },
              { value: "below", label: "Below" },
            ]}
            value={condition}
            onChange={setCondition}
          />
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-txt-mute">$</span>
            <input
              type="number"
              min={0}
              value={target || ""}
              onChange={(e) => setTarget(Number(e.target.value))}
              placeholder={priceMap[symbol] ? priceMap[symbol].toFixed(2) : "0.00"}
              className="w-full rounded-lg border border-hairline bg-app py-2 pl-7 pr-3 font-mono text-sm text-txt outline-none focus:border-accent"
            />
          </div>
          <Button onClick={create} disabled={target <= 0}>Add alert</Button>
        </div>
      </Panel>

      {/* List */}
      <Panel padded={false}>
        <div className="p-5 pb-3">
          <PanelHeader title={`Active alerts (${alerts.length})`} />
        </div>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title="No alerts set"
            hint="Create an alert above, or use the bell on any stock page."
          />
        ) : (
          <div className="divide-y divide-hairline">
            {alerts.map((a) => {
              const current = priceMap[a.symbol];
              const triggered =
                current != null && (a.condition === "above" ? current >= a.targetPrice : current <= a.targetPrice);
              return (
                <div key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-txt">{a.symbol}</span>
                    <span className="text-sm text-txt-dim">
                      {a.condition === "above" ? "≥" : "≤"} {formatUsd(a.targetPrice)}
                    </span>
                    {current != null && (
                      <span className="font-mono text-xs text-txt-mute">now {formatUsd(current)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={triggered ? "up" : "neutral"}>{triggered ? "Triggered" : "Watching"}</Badge>
                    <button
                      type="button"
                      onClick={() => { removeAlert(a.id); toast.success("Alert removed."); }}
                      aria-label="Delete alert"
                      className="rounded-md p-1.5 text-txt-mute transition hover:bg-elevated hover:text-down"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
