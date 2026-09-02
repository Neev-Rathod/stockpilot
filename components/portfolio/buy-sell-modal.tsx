"use client";

import { useMemo, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { formatUsd } from "@/lib/format";
import { Button, Segmented, cn } from "@/components/ui/kit";

export function BuySellModal({
  mode,
  symbol,
  companyName,
  currentPrice,
  onClose,
  onConfirm,
}: {
  mode: "buy" | "sell";
  symbol: string;
  companyName?: string;
  currentPrice: number;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}) {
  const virtualBalance = usePortfolioStore((s) => s.virtualBalance);
  const holdings = usePortfolioStore((s) => s.holdings);
  const owned = holdings.find((h) => h.symbol === symbol)?.quantity ?? 0;

  const [inputMode, setInputMode] = useState<"shares" | "amount">("shares");
  const [shares, setShares] = useState(1);
  const [amount, setAmount] = useState(currentPrice);

  // Resolve the effective whole-share quantity from whichever input is active.
  const quantity = useMemo(() => {
    if (inputMode === "amount") return Math.floor(amount / currentPrice) || 0;
    return Math.max(0, Math.floor(shares));
  }, [inputMode, amount, shares, currentPrice]);

  const estValue = quantity * currentPrice;
  const isBuy = mode === "buy";
  const maxShares = isBuy ? Math.floor(virtualBalance / currentPrice) : owned;

  const error = useMemo(() => {
    if (quantity <= 0) return "Enter a quantity.";
    if (isBuy && estValue > virtualBalance) return "Not enough buying power.";
    if (!isBuy && quantity > owned) return `You only own ${owned} share${owned === 1 ? "" : "s"}.`;
    return null;
  }, [quantity, estValue, isBuy, virtualBalance, owned]);

  function applyPercent(pct: number) {
    const qty = Math.max(1, Math.floor(maxShares * pct));
    setInputMode("shares");
    setShares(qty);
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-panel shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex h-7 items-center rounded-md px-2 text-xs font-bold uppercase",
                  isBuy ? "bg-[color:rgba(22,199,132,0.15)] text-up" : "bg-[color:rgba(234,57,67,0.15)] text-down",
                )}
              >
                {isBuy ? "Buy" : "Sell"}
              </span>
              <div>
                <div className="font-mono text-sm font-bold text-txt">{symbol}</div>
                {companyName && <div className="text-[11px] text-txt-mute">{companyName}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-txt-mute transition hover:bg-elevated hover:text-txt"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {/* Price + capacity */}
            <div className="flex items-center justify-between rounded-lg border border-hairline bg-elevated px-4 py-3">
              <div>
                <div className="text-[11px] text-txt-mute">Market price</div>
                <div className="font-mono text-lg font-bold tnum text-txt">{formatUsd(currentPrice)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-txt-mute">{isBuy ? "Buying power" : "Shares owned"}</div>
                <div className="font-mono text-sm font-semibold tnum text-txt">
                  {isBuy ? formatUsd(virtualBalance) : owned}
                </div>
              </div>
            </div>

            {/* Shares / amount toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-txt">Order</span>
              <Segmented
                options={[
                  { value: "shares", label: "Shares" },
                  { value: "amount", label: "Amount" },
                ]}
                value={inputMode}
                onChange={setInputMode}
              />
            </div>

            {inputMode === "shares" ? (
              <input
                type="number"
                min={1}
                step={1}
                value={shares}
                onChange={(e) => setShares(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-lg border border-hairline bg-app px-4 py-3 font-mono text-lg font-bold text-txt outline-none focus:border-accent"
                placeholder="Shares"
              />
            ) : (
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-txt-mute">$</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-lg border border-hairline bg-app py-3 pl-8 pr-4 font-mono text-lg font-bold text-txt outline-none focus:border-accent"
                  placeholder="Amount"
                />
              </div>
            )}

            {/* Quick % chips */}
            <div className="grid grid-cols-4 gap-2">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyPercent(pct)}
                  className="rounded-md border border-hairline bg-elevated py-1.5 text-xs font-semibold text-txt-dim transition hover:border-hairline-strong hover:text-txt"
                >
                  {pct === 1 ? "Max" : `${pct * 100}%`}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="space-y-2 rounded-lg border border-hairline bg-elevated px-4 py-3 text-sm">
              <Row label="Order type" value="Market" />
              <Row label="Quantity" value={`${quantity} share${quantity === 1 ? "" : "s"}`} />
              <Row
                label={isBuy ? "Estimated cost" : "Estimated proceeds"}
                value={formatUsd(estValue)}
                strong
              />
              {isBuy && (
                <Row label="Cash after" value={formatUsd(Math.max(0, virtualBalance - estValue))} />
              )}
            </div>

            {error && <div className="text-xs font-medium text-down">{error}</div>}

            <div className="flex items-center gap-1.5 text-[11px] text-txt-mute">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Paper trade — simulated with virtual funds, no real money.
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant={isBuy ? "up" : "down"}
                className="flex-1"
                disabled={Boolean(error)}
                onClick={() => onConfirm(quantity)}
              >
                {isBuy ? "Buy" : "Sell"} {quantity > 0 ? quantity : ""} {symbol}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-txt-mute">{label}</span>
      <span className={cn("font-mono tnum", strong ? "text-base font-bold text-txt" : "text-txt-dim")}>
        {value}
      </span>
    </div>
  );
}
