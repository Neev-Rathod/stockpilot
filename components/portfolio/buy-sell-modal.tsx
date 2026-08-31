"use client";

import { useState } from "react";
import { X, Wallet, ShieldCheck, CheckCircle2 } from "lucide-react";
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
  onConfirm: (
    quantity: number,
    orderType: string,
    executionType: string,
  ) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState(
    mode === "buy" ? "Intraday" : "Delivery",
  );
  const [executionType, setExecutionType] = useState("Market");
  const totalCost = quantity * currentPrice;

  const productOptions =
    mode === "buy"
      ? [
          { value: "CNC", label: "Delivery", detail: "Hold overnight" },
          { value: "MIS", label: "Intraday", detail: "Square off today" },
          { value: "MTF", label: "MTF", detail: "Buy with leverage" },
        ]
      : [
          { value: "CNC", label: "Delivery", detail: "Sell holdings" },
          { value: "MIS", label: "Intraday", detail: "Square off today" },
        ];

  const executionOptions = ["Market", "Limit", "Stop Loss", "SL-M"];

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
          className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-2xl sm:p-7"
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
              <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
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
            <div className="rounded-xl border border-white/[0.06] bg-slate-950/60 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Target asset
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="font-mono text-lg font-semibold text-white">
                  {symbol}
                </div>
                <div className="font-mono text-sm font-semibold text-slate-200">
                  ${currentPrice.toFixed(2)}{" "}
                  <span className="font-sans text-xs font-normal text-slate-500">
                    per share
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-sm font-semibold text-slate-200">
                    Product
                  </div>
                  <div className="text-[11px] text-slate-500">
                    How this trade is held
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {productOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setOrderType(option.value)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        orderType === option.value
                          ? "border-blue-400/70 bg-blue-500/15 text-white shadow-[inset_0_0_0_1px_rgba(96,165,250,0.15)]"
                          : "border-white/10 bg-slate-800/50 text-slate-300 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <span className="block text-xs font-semibold">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-[10px] font-normal leading-tight text-slate-500">
                        {option.detail}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-sm font-semibold text-slate-200">
                    Order type
                  </div>
                  <div className="text-[11px] text-slate-500">
                    How the price is placed
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {executionOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setExecutionType(option)}
                      className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
                        executionType === option
                          ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200"
                          : "border-white/10 bg-slate-800/50 text-slate-300 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quantity Input */}
            <label className="block space-y-2">
              <span className="block text-sm font-semibold text-slate-200">
                Quantity
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) =>
                  setQuantity(Math.max(1, Number(event.target.value)))
                }
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-semibold text-white outline-none transition-all focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#1e2027] bg-[#101217] p-3 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>Product</span>
                <span className="font-semibold text-white">
                  {
                    productOptions.find((option) => option.value === orderType)
                      ?.label
                  }
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Execution</span>
                <span className="font-semibold text-white">
                  {executionType}
                </span>
              </div>
            </div>

            {/* Total summary panel */}
            <div className="rounded-2xl border border-white/[0.08] bg-blue-500/5 p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Estimated Transaction Value</span>
                <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> No Real Funds
                </span>
              </div>
              <div className="mt-2 text-2xl font-black text-white font-mono">
                $
                {totalCost.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
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
                onClick={() => onConfirm(quantity, orderType, executionType)}
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
