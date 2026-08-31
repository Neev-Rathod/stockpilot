"use client";

import Link from "next/link";

const indexData = [
  { label: "S&P 500", value: "6,481.40", change: "+0.62%" },
  { label: "NASDAQ", value: "21,455.30", change: "+0.81%" },
  { label: "DOW JONES", value: "45,321.20", change: "+0.31%" },
];

const movers = [
  { symbol: "NVDA", value: "+5.82%", tone: "emerald" },
  { symbol: "AMD", value: "+4.71%", tone: "emerald" },
  { symbol: "TSLA", value: "+3.94%", tone: "emerald" },
  { symbol: "XYZ", value: "-4.21%", tone: "red" },
  { symbol: "ABC", value: "-3.82%", tone: "red" },
];

export default function MarketsPage() {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
          US Market Overview
        </div>
        <h1 className="mt-1 text-2xl font-bold text-white">Markets</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {indexData.map((item) => (
          <div key={item.label} className="dark-card p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {item.label}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="font-mono text-xl font-bold text-white">
                {item.value}
              </div>
              <div className="text-xs font-semibold text-emerald-400">
                {item.change}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="dark-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Top Gainers</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Live
            </span>
          </div>
          <div className="space-y-3">
            {movers
              .filter((item) => item.tone === "emerald")
              .map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-center justify-between rounded-xl border border-[#1e2027] bg-[#0d0e12] px-3 py-2"
                >
                  <div className="font-mono text-sm font-bold text-white">
                    {item.symbol}
                  </div>
                  <div className="text-xs font-semibold text-emerald-400">
                    {item.value}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="dark-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Top Losers</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Live
            </span>
          </div>
          <div className="space-y-3">
            {movers
              .filter((item) => item.tone === "red")
              .map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-center justify-between rounded-xl border border-[#1e2027] bg-[#0d0e12] px-3 py-2"
                >
                  <div className="font-mono text-sm font-bold text-white">
                    {item.symbol}
                  </div>
                  <div className="text-xs font-semibold text-red-400">
                    {item.value}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="dark-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Market Status</h2>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Open
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["NYSE", "OPEN"],
            ["NASDAQ", "OPEN"],
            ["AMEX", "OPEN"],
          ].map(([market, state]) => (
            <div
              key={market}
              className="rounded-xl border border-[#1e2027] bg-[#0d0e12] px-4 py-3"
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {market}
              </div>
              <div className="mt-2 text-sm font-bold text-white">{state}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="dark-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Market Categories</h2>
          <Link
            href="/news"
            className="text-xs font-semibold text-blue-400 hover:text-blue-300"
          >
            Latest News
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            "Technology",
            "Healthcare",
            "Financials",
            "Energy",
            "Consumer",
            "Industrials",
          ].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#1e2027] bg-[#0d0e12] px-3 py-1.5 text-[10px] font-medium text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
