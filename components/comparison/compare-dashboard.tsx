"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { BarChart3, CalendarDays, Newspaper } from "lucide-react";
import { ComparisonChart } from "@/components/comparison/comparison-chart";
import { getCompanyNews, type FinnhubNewsItem } from "@/lib/finnhub/client";
import { getLocalOhlcv, type OhlcvSeries } from "@/lib/ohlcv";
import type { StockRange } from "@/lib/types";

const COMPANIES = [
  ["AAPL", "Apple Inc."], ["SBUX", "Starbucks Corporation"], ["MSFT", "Microsoft Corporation"], ["CSCO", "Cisco Systems, Inc."], ["QCOM", "QUALCOMM Incorporated"],
  ["META", "Meta Platforms, Inc."], ["AMZN", "Amazon.com, Inc."], ["TSLA", "Tesla, Inc."], ["AMD", "Advanced Micro Devices, Inc."], ["NFLX", "Netflix, Inc."],
] as const;
const RANGES: StockRange[] = ["1M", "3M", "6M", "1Y", "5Y"];
const RANGE_DAYS: Record<StockRange, number> = { "1D": 1, "1W": 7, "1M": 31, "3M": 92, "6M": 184, "1Y": 366, "5Y": 1826 };

function filterRange(series: OhlcvSeries[], range: StockRange) {
  const latest = series.flatMap((entry) => entry.candles.map((candle) => candle.date)).sort().at(-1);
  if (!latest) return series;
  const cutoff = new Date(`${latest}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - RANGE_DAYS[range]);
  return series.map((entry) => ({ ...entry, candles: entry.candles.filter((candle) => new Date(`${candle.date}T00:00:00Z`) >= cutoff) }));
}

function formatDate(value: number) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value * 1000); }

export function CompareDashboard() {
  const [selected, setSelected] = useState<string[]>(["AAPL", "MSFT"]);
  const [range, setRange] = useState<StockRange>("1Y");
  const [normalized, setNormalized] = useState(false);
  const [newsSymbol, setNewsSymbol] = useState("AAPL");
  const history = useQuery({ queryKey: ["local-ohlcv", selected], queryFn: () => getLocalOhlcv(selected), staleTime: Infinity });
  const visibleSeries = useMemo(() => filterRange(history.data ?? [], range), [history.data, range]);
  const news = useQuery({ queryKey: ["company-news", newsSymbol], queryFn: () => {
    const to = new Date(); const from = new Date(to); from.setDate(to.getDate() - 30);
    return getCompanyNews(newsSymbol, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  }, staleTime: 5 * 60_000 });
  const metrics = useMemo(() => visibleSeries.map((entry) => {
    const first = entry.candles[0]; const last = entry.candles.at(-1);
    const returnPct = first && last ? ((last.close - first.close) / first.close) * 100 : 0;
    return { symbol: entry.symbol, price: last?.close ?? 0, returnPct, high: Math.max(...entry.candles.map((candle) => candle.high), 0), volume: entry.candles.reduce((total, candle) => total + candle.volume, 0) / Math.max(entry.candles.length, 1) };
  }), [visibleSeries]);
  const leader = [...metrics].sort((a, b) => b.returnPct - a.returnPct)[0];

  function toggle(symbol: string) {
    setSelected((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : current.length === 5 ? [...current.slice(1), symbol] : [...current, symbol]);
  }

  return <div className="space-y-6 pb-10">
    <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,.2),transparent_35%),#11141c] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-blue-300"><BarChart3 className="h-4 w-4" /> Historical comparison</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Benchmark stocks on the same timeline</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Compare closing prices from your local OHLCV files. Switch to indexed returns to compare performance independent of share price.</p></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Data source</div><div className="mt-1 text-sm font-semibold text-emerald-100">Local OHLCV · daily</div></div></div>
      <div className="mt-6 border-t border-white/[0.08] pt-5"><p className="mb-3 text-xs font-semibold text-slate-300">Choose up to five companies</p><div className="flex flex-wrap gap-2">{COMPANIES.map(([symbol, name]) => <button key={symbol} onClick={() => toggle(symbol)} aria-pressed={selected.includes(symbol)} title={name} className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${selected.includes(symbol) ? "border-blue-400 bg-blue-500 text-white" : "border-white/[0.08] bg-black/20 text-slate-300 hover:border-slate-500 hover:bg-white/[.05]"}`}>{symbol}</button>)}</div></div>
    </section>
    <section className="rounded-3xl border border-white/[0.08] bg-[#11141c] p-4 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-white">Price performance</h2><p className="mt-1 text-xs text-slate-400">{normalized ? "Indexed to 100 at the first day in the selected period." : "Actual daily closing price in USD."}</p></div><div className="flex rounded-xl border border-white/[0.08] bg-black/20 p-1">{[[false, "Price"], [true, "Indexed return"]].map(([value, label]) => <button key={label as string} onClick={() => setNormalized(value as boolean)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${normalized === value ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"}`}>{label as string}</button>)}</div></div><div className="mb-5 flex flex-wrap gap-2">{RANGES.map((value) => <button key={value} onClick={() => setRange(value)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${range === value ? "bg-emerald-400 text-slate-950" : "bg-white/[.04] text-slate-400 hover:bg-white/[.08]"}`}>{value}</button>)}</div>{history.isLoading ? <div className="flex h-[440px] items-center justify-center text-sm text-slate-400">Loading local market history…</div> : history.isError ? <div className="flex h-[440px] items-center justify-center text-sm text-rose-300">Could not load the local OHLCV files.</div> : <ComparisonChart series={visibleSeries} normalized={normalized} />}</section>
    <div className="grid gap-6 xl:grid-cols-[1.45fr_.85fr]"><section className="rounded-3xl border border-white/[0.08] bg-[#11141c] p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-bold text-white">Comparison snapshot</h2><p className="mt-1 text-xs text-slate-400">Close, period return, high and average volume.</p></div>{leader && <div className="hidden rounded-xl bg-emerald-400/10 px-3 py-2 text-right sm:block"><div className="text-[10px] uppercase tracking-wider text-emerald-300">Period leader</div><div className="text-sm font-bold text-emerald-100">{leader.symbol} · {leader.returnPct >= 0 ? "+" : ""}{leader.returnPct.toFixed(1)}%</div></div>}</div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-white/[.08] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="pb-3 font-semibold">Symbol</th><th className="pb-3 font-semibold">Last close</th><th className="pb-3 font-semibold">Return</th><th className="pb-3 font-semibold">Period high</th><th className="pb-3 text-right font-semibold">Avg. volume</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.symbol} className="border-b border-white/[.05] last:border-0"><td className="py-3 font-mono font-bold text-white">{metric.symbol}</td><td className="py-3 text-slate-200">${metric.price.toFixed(2)}</td><td className={`py-3 font-semibold ${metric.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{metric.returnPct >= 0 ? "+" : ""}{metric.returnPct.toFixed(2)}%</td><td className="py-3 text-slate-300">${metric.high.toFixed(2)}</td><td className="py-3 text-right font-mono text-slate-400">{Math.round(metric.volume).toLocaleString()}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-3xl border border-white/[0.08] bg-[#11141c] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-blue-300"><Newspaper className="h-4 w-4" /> Company news</p><h2 className="mt-1 font-bold text-white">Latest on {newsSymbol}</h2></div><select aria-label="Company for news" value={newsSymbol} onChange={(event) => setNewsSymbol(event.target.value)} className="rounded-lg border border-white/[.1] bg-black/20 px-2 py-1.5 text-xs font-bold text-white outline-none">{COMPANIES.map(([symbol]) => <option key={symbol} value={symbol}>{symbol}</option>)}</select></div><NewsList items={news.data ?? []} loading={news.isLoading} /></section></div>
  </div>;
}

function NewsList({ items, loading }: { items: FinnhubNewsItem[]; loading: boolean }) {
  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading news…</div>;
  if (!items.length) return <div className="py-10 text-center text-sm text-slate-400">No recent company news is available. Add <code className="rounded bg-white/[.06] px-1.5 py-0.5 text-slate-300">FINNHUB_API_KEY</code> to enable this feed.</div>;
  return <div className="mt-5 space-y-3">{items.slice(0, 4).map((item) => <a key={item.id ?? item.url} href={item.url} target="_blank" rel="noreferrer" className="group block rounded-2xl border border-white/[.06] bg-black/15 p-3 transition-colors hover:border-blue-400/40 hover:bg-blue-400/[.04]"><div className="flex gap-3">{item.image ? <Image src={item.image} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-xl object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300"><Newspaper className="h-5 w-5" /></div>}<div className="min-w-0"><p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-100 group-hover:text-blue-200">{item.headline}</p><p className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><span>{item.source || "News"}</span>{item.datetime ? <><span>·</span><span><CalendarDays className="mr-1 inline h-3 w-3" />{formatDate(item.datetime)}</span></> : null}</p></div></div></a>)}</div>;
}
