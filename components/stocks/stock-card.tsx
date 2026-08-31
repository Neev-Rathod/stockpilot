import Link from "next/link";
import type { StockQuote } from "@/lib/types";

export function StockCard({ stock }: { stock: StockQuote }) {
  const isPositive = stock.percentChange >= 0;

  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {stock.symbol}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {stock.companyName}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${isPositive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
        >
          {isPositive ? "+" : ""}
          {stock.percentChange.toFixed(2)}%
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div className="text-2xl font-semibold text-slate-900 dark:text-white">
          ${stock.price.toFixed(2)}
        </div>
        <div
          className={`text-sm ${isPositive ? "text-emerald-600" : "text-rose-600"}`}
        >
          {isPositive ? "▲" : "▼"} {Math.abs(stock.change).toFixed(2)}
        </div>
      </div>
    </Link>
  );
}
