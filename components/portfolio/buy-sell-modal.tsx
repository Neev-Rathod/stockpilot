"use client";

import { useState } from "react";
import { X, ArrowRight, Wallet, ShieldCheck, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BuySellModal({
  mode,
  symbol,
  currentPrice,
  onClose,
  onConfirm,
}: {
  mode: "buy" | "sell";
  symbol: string;
  currentPrice: number;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const totalCost = quantity * currentPrice;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-2xl"
        >
          {/* Top glow accent */}
          <div
            className={`absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-48 rounded-full blur-2xl pointer-events-none ${
              mode === "buy" ? "bg-emerald-500/20" : "bg-rose-500/20"
            }`}
          />

          <div className="flex items-center justify-between gap-3 relative z-10">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                <Wallet className="h-3 w-3 text-blue-400" />
                Virtual Execution
              </div>
              <h3 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                {mode === "buy" ? (
                  <span className="text-emerald-400">Simulated Buy Order</span>
                ) : (
                  <span className="text-rose-400">Simulated Sell Order</span>
                )}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-slate-800/60 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-6 space-y-4 relative z-10">
            {/* Stock details panel */}
            <div className="rounded-2xl border border-white/[0.06] bg-slate-950/60 p-4">
              <div className="text-xs font-medium text-slate-400">Target Asset</div>
              <div className="mt-2 flex items-center justify-between">
                <div className="font-bold text-lg text-white font-mono">{symbol}</div>
                <div className="text-sm font-semibold text-slate-200 font-mono">
                  ${currentPrice.toFixed(2)} <span className="text-xs text-slate-400 font-sans">/ share</span>
                </div>
              </div>
            </div>

            {/* Quantity Input */}
            <label className="block space-y-2">
              <span className="block text-xs font-semibold text-slate-300">
                Number of Shares
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-bold text-white font-mono outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </label>

            {/* Total summary panel */}
            <div className="rounded-2xl border border-white/[0.08] bg-blue-500/5 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Estimated Transaction Value</span>
                <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> No Real Funds
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-white font-mono">
                ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/10 bg-slate-800/80 px-4 py-3 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(quantity)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold font-mono transition-transform active:scale-95 shadow-lg ${
                  mode === "buy"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:from-emerald-400 hover:to-teal-400 emerald-glow"
                    : "bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-400 hover:to-red-500"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                {mode === "buy" ? "Confirm Purchase" : "Confirm Sale"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
