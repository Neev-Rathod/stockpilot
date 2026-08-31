import { ArrowUpRight, ArrowDownRight, Activity, TrendingUp, BarChart2 } from "lucide-react";
import type { StockQuote } from "@/lib/types";

export function StockQuoteCard({ quote }: { quote: StockQuote }) {
  const isPositive = quote.percentChange >= 0;
  const high = quote.high ?? quote.price;
  const low = quote.low ?? quote.price;
  const rangeSpan = high - low || 1;
  const pricePositionPct = Math.min(100, Math.max(0, ((quote.price - low) / rangeSpan) * 100));

  return (
    <div className="glass-card rounded-3xl p-6 shadow-2xl relative overflow-hidden border border-white/[0.08]">
      {/* Background glow gradient */}
      <div 
        className={`absolute -right-20 -top-20 h-48 w-48 rounded-full blur-3xl pointer-events-none ${
          isPositive ? "bg-emerald-500/15" : "bg-rose-500/15"
        }`} 
      />

      <div className="flex flex-wrap items-start justify-between gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-mono font-bold text-blue-400 border border-blue-500/20">
              {quote.symbol}
            </span>
            <span className="text-xs text-slate-400 font-medium">Real-Time Market Quote</span>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-white font-mono">
              ${quote.price.toFixed(2)}
            </h1>
            <div
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold font-mono ${
                isPositive
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 emerald-glow"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              }`}
            >
              {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {isPositive ? "+" : ""}
              {quote.percentChange.toFixed(2)}% (${Math.abs(quote.change).toFixed(2)})
            </div>
          </div>
        </div>
      </div>

      {/* High/Low Range Bar */}
      <div className="mt-6 pt-5 border-t border-white/[0.06] relative z-10 space-y-2">
        <div className="flex justify-between text-xs text-slate-400 font-medium">
          <span>Day Range: <strong className="text-slate-200 font-mono">${low.toFixed(2)}</strong></span>
          <span><strong className="text-slate-200 font-mono">${high.toFixed(2)}</strong></span>
        </div>
        <div className="relative h-2 w-full rounded-full bg-slate-800 overflow-hidden">
          <div 
            className={`h-full rounded-full ${isPositive ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-rose-500 to-amber-500"}`}
            style={{ width: `${Math.max(5, pricePositionPct)}%` }}
          />
        </div>
      </div>

      {/* Grid of Key Statistics */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 relative z-10">
        <div className="rounded-2xl bg-slate-900/60 p-3.5 border border-white/[0.05]">
          <div className="text-[11px] font-medium text-slate-400">Change</div>
          <div className={`mt-1 text-sm font-semibold font-mono ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {isPositive ? "+" : "-"}${Math.abs(quote.change).toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/60 p-3.5 border border-white/[0.05]">
          <div className="text-[11px] font-medium text-slate-400">Open Price</div>
          <div className="mt-1 text-sm font-semibold text-slate-100 font-mono">
            ${quote.open?.toFixed(2) ?? quote.price.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/60 p-3.5 border border-white/[0.05]">
          <div className="text-[11px] font-medium text-slate-400">24h High</div>
          <div className="mt-1 text-sm font-semibold text-emerald-400 font-mono">
            ${quote.high?.toFixed(2) ?? quote.price.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/60 p-3.5 border border-white/[0.05]">
          <div className="text-[11px] font-medium text-slate-400">24h Low</div>
          <div className="mt-1 text-sm font-semibold text-rose-400 font-mono">
            ${quote.low?.toFixed(2) ?? quote.price.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
