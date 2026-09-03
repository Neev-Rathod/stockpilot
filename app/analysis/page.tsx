"use client";

import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, CalendarDays, FileText, Newspaper, TrendingUp } from "lucide-react";
import { StockChart } from "@/components/stocks/stock-chart";
import { useLiveMarketQuotes } from "@/lib/use-live-quotes";
import {
  getBasicFinancials,
  getCompanyNews,
  getCompanyProfile,
  getEarningsCalendar,
  getEarningsSurprises,
  getFinancialsReported,
  getRecommendationTrends,
  type FinnhubBasicFinancials,
  type FinnhubCompanyProfile,
  type FinnhubEarningsItem,
  type FinnhubEarningsSurprise,
  type FinnhubFinancialsReportedResponse,
  type FinnhubNewsItem,
  type FinnhubRecommendationItem,
} from "@/lib/finnhub/client";
import { formatCompact, formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { Badge, EmptyState, Panel, PanelHeader, PriceChange, Skeleton, Stat } from "@/components/ui/kit";

const COMPANIES = [
  ["AAPL", "Apple Inc."],
  ["MSFT", "Microsoft Corporation"],
  ["AMD", "Advanced Micro Devices, Inc."],
  ["CSCO", "Cisco Systems, Inc."],
  ["QCOM", "QUALCOMM Incorporated"],
  ["AMZN", "Amazon.com, Inc."],
  ["TSLA", "Tesla, Inc."],
  ["SBUX", "Starbucks Corporation"],
  ["META", "Meta Platforms, Inc."],
  ["NFLX", "Netflix, Inc."],
] as const;

const EMPTY = "—";

function dateRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function metricValue(metric: Record<string, number> | undefined, ...keys: string[]) {
  const key = keys.find((candidate) => typeof metric?.[candidate] === "number");
  return key ? metric?.[key] : undefined;
}

function percentValue(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return EMPTY;
  return formatPercent(Math.abs(value) <= 2 ? value * 100 : value, false);
}

function seriesRows(series: FinnhubBasicFinancials["series"], names: string[]) {
  const annual = series?.annual ?? {};
  const rows = new Map<string, Record<string, string | number>>();
  names.forEach((name) => {
    const values = annual[name] ?? [];
    values.slice(-6).forEach((item) => {
      if (!item.period || typeof item.v !== "number") return;
      const row = rows.get(item.period) ?? { period: item.period };
      row[name] = item.v;
      rows.set(item.period, row);
    });
  });
  return [...rows.values()].sort((a, b) => String(a.period).localeCompare(String(b.period)));
}

function reportedRows(data: FinnhubFinancialsReportedResponse | null) {
  return (data?.data ?? [])
    .map((filing) => {
      const values = Object.entries(filing.report?.ic ?? {});
      const findValue = (terms: string[]) => {
        const entry = values.find(([key, value]) => {
          const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
          return terms.some((term) => normalized.includes(term)) && typeof value === "number";
        });
        return entry?.[1];
      };
      return {
        period: filing.endDate || `${filing.year} Q${filing.quarter}`,
        revenue: findValue(["revenue"]),
        netIncome: findValue(["netincome"]),
      };
    })
    .filter((item) => item.revenue !== undefined || item.netIncome !== undefined)
    .slice(-8);
}

function ChartFallback({ title, hint = "No data returned for this symbol." }: { title: string; hint?: string }) {
  return <EmptyState icon={<BarChart3 className="h-6 w-6" />} title={title} hint={hint} />;
}

function AnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requested = searchParams.get("symbol")?.toUpperCase();
  const symbol = COMPANIES.some(([item]) => item === requested) ? requested! : "AAPL";
  const dates = useMemo(() => dateRange(30), []);
  const earningsDates = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 120);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);
  const { quotes, isLoading: quoteLoading } = useLiveMarketQuotes([symbol], 30_000);
  const quote = quotes[0];
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["analysis-profile", symbol],
    queryFn: () => getCompanyProfile(symbol),
    staleTime: 5 * 60_000,
  });
  const { data: financials } = useQuery({
    queryKey: ["analysis-metrics", symbol],
    queryFn: () => getBasicFinancials(symbol),
    staleTime: 15 * 60_000,
  });
  const { data: recommendations = [] } = useQuery({
    queryKey: ["analysis-recommendations", symbol],
    queryFn: () => getRecommendationTrends(symbol),
    staleTime: 15 * 60_000,
  });
  const { data: surprises = [] } = useQuery({
    queryKey: ["analysis-surprises", symbol],
    queryFn: () => getEarningsSurprises(symbol),
    staleTime: 15 * 60_000,
  });
  const { data: reported } = useQuery({
    queryKey: ["analysis-reported", symbol],
    queryFn: () => getFinancialsReported({ symbol }),
    staleTime: 15 * 60_000,
  });
  const { data: earnings = [] } = useQuery({
    queryKey: ["analysis-calendar", symbol, earningsDates],
    queryFn: () => getEarningsCalendar(earningsDates.from, earningsDates.to, symbol),
    staleTime: 15 * 60_000,
  });
  const { data: news = [] } = useQuery({
    queryKey: ["analysis-news", symbol, dates],
    queryFn: () => getCompanyNews(symbol, dates.from, dates.to),
    staleTime: 10 * 60_000,
  });

  const metrics = financials?.metric;
  const annualRows = seriesRows(financials?.series, ["netMargin", "salesPerShare"]);
  const filingRows = reportedRows(reported ?? null);
  const recommendationRows = recommendations.slice(0, 8).reverse();
  const surpriseRows = [...surprises].reverse();
  const selectedCompany = COMPANIES.find(([item]) => item === symbol)?.[1] ?? symbol;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {profileLoading ? <Skeleton className="h-14 w-14" /> : profile?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logo} alt="" className="h-14 w-14 rounded-xl border border-hairline bg-white/5 object-contain p-1.5" />
            ) : <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-hairline bg-elevated font-mono font-bold text-accent">{symbol.slice(0, 2)}</div>}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-2xl font-bold text-txt">{symbol}</h1>
                <Badge tone="neutral">{profile?.exchange ?? "NASDAQ"}</Badge>
              </div>
              <p className="text-sm text-txt-dim">{profile?.name ?? selectedCompany}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-xs text-txt-dim">
              Company
              <select value={symbol} onChange={(event) => router.replace(`/analysis?symbol=${event.target.value}`)} className="rounded-lg border border-hairline bg-elevated px-3 py-2 font-mono text-xs font-semibold text-txt">
                {COMPANIES.map(([item, name]) => <option key={item} value={item}>{item} · {name}</option>)}
              </select>
            </label>
            {quoteLoading ? <Skeleton className="h-12 w-32" /> : quote ? (
              <div className="text-right"><div className="font-mono text-3xl font-bold tnum text-txt">{formatUsd(quote.price)}</div><PriceChange amount={quote.change} percent={quote.percentChange} className="justify-end text-sm" /></div>
            ) : <div className="text-sm text-txt-mute">Quote unavailable</div>}
          </div>
        </div>
      </Panel>

      <StockChart symbol={symbol} price={quote?.price} change={quote?.percentChange} />

      <Panel>
        <PanelHeader title="Key metrics" hint="Latest available basic financials" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="52-week high" value={metricValue(metrics, "52WeekHigh") !== undefined ? formatUsd(metricValue(metrics, "52WeekHigh")!) : EMPTY} />
          <Stat label="52-week low" value={metricValue(metrics, "52WeekLow") !== undefined ? formatUsd(metricValue(metrics, "52WeekLow")!) : EMPTY} />
          <Stat label="Beta" value={metricValue(metrics, "beta", "beta5YMonthly") !== undefined ? formatNumber(metricValue(metrics, "beta", "beta5YMonthly")!, 2) : EMPTY} />
          <Stat label="P/E" value={metricValue(metrics, "peBasicExclExtraTTM", "peTTM") !== undefined ? formatNumber(metricValue(metrics, "peBasicExclExtraTTM", "peTTM")!, 2) : EMPTY} />
          <Stat label="Gross margin" value={percentValue(metricValue(metrics, "grossMarginTTM"))} />
          <Stat label="Net margin" value={percentValue(metricValue(metrics, "netMarginTTM"))} />
          <Stat label="Current ratio" value={metricValue(metrics, "currentRatioTTM") !== undefined ? formatNumber(metricValue(metrics, "currentRatioTTM")!, 2) : EMPTY} />
          <Stat label="Market cap" value={metricValue(metrics, "marketCapitalization", "marketCapTTM") !== undefined ? `$${formatCompact(metricValue(metrics, "marketCapitalization", "marketCapTTM")! * 1_000_000)}` : profile?.marketCapitalization ? `$${formatCompact(profile.marketCapitalization * 1_000_000)}` : EMPTY} />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Recommendation trends" hint="Analyst ratings by period" />
          {recommendationRows.length ? <ChartFrame><ResponsiveContainer width="100%" height="100%"><ComposedChart data={recommendationRows}><CartesianGrid stroke="var(--hairline)" vertical={false} /><XAxis dataKey="period" tick={{ fill: "var(--txt-mute)", fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fill: "var(--txt-mute)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--hairline)", color: "var(--txt)" }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="strongBuy" stackId="ratings" fill="var(--up)" /><Bar dataKey="buy" stackId="ratings" fill="var(--accent)" /><Bar dataKey="hold" stackId="ratings" fill="var(--txt-dim)" /><Bar dataKey="sell" stackId="ratings" fill="var(--down)" /><Bar dataKey="strongSell" stackId="ratings" fill="var(--down)" /></ComposedChart></ResponsiveContainer></ChartFrame> : <ChartFallback title="No recommendation trends" hint="Analyst ratings are not available for this symbol." />}
        </Panel>

        <Panel>
          <PanelHeader title="Earnings surprises" hint="Actual versus estimate, last four quarters" />
          {surpriseRows.length ? <ChartFrame><ResponsiveContainer width="100%" height="100%"><ComposedChart data={surpriseRows}><CartesianGrid stroke="var(--hairline)" vertical={false} /><XAxis dataKey="period" tick={{ fill: "var(--txt-mute)", fontSize: 10 }} /><YAxis tick={{ fill: "var(--txt-mute)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--hairline)", color: "var(--txt)" }} formatter={(value: unknown, name: unknown) => [typeof value === "number" || typeof value === "string" ? value : EMPTY, name === "actual" ? "Actual EPS" : "Estimate EPS"]} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="actual" fill="var(--up)" /><Bar dataKey="estimate" fill="var(--accent)" /></ComposedChart></ResponsiveContainer></ChartFrame> : <ChartFallback title="No earnings surprises" hint="Finnhub returned no quarterly surprise data." />}
          {surpriseRows.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{surpriseRows.map((item) => <Badge key={`${item.period}-${item.quarter}-${item.year}`} tone={typeof item.surprisePercent === "number" && item.surprisePercent >= 0 ? "up" : "down"}>{item.period ?? "Quarter"}: {typeof item.surprisePercent === "number" ? formatPercent(item.surprisePercent) : EMPTY}</Badge>)}</div>}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Basic financials" hint="Annual operating ratios" />
          {annualRows.length ? <ChartFrame><ResponsiveContainer width="100%" height="100%"><ComposedChart data={annualRows}><CartesianGrid stroke="var(--hairline)" vertical={false} /><XAxis dataKey="period" tick={{ fill: "var(--txt-mute)", fontSize: 10 }} /><YAxis yAxisId="left" tick={{ fill: "var(--txt-mute)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--hairline)", color: "var(--txt)" }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Line yAxisId="left" type="monotone" dataKey="netMargin" name="Net margin" stroke="var(--accent)" strokeWidth={2} dot={false} /><Line yAxisId="left" type="monotone" dataKey="salesPerShare" name="Sales / share" stroke="var(--up)" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></ChartFrame> : <ChartFallback title="No annual ratio history" />}
        </Panel>
        <Panel>
          <PanelHeader title="Reported financials" hint="Revenue and net income from filings" />
          {filingRows.length ? <ChartFrame><ResponsiveContainer width="100%" height="100%"><ComposedChart data={filingRows}><CartesianGrid stroke="var(--hairline)" vertical={false} /><XAxis dataKey="period" tick={{ fill: "var(--txt-mute)", fontSize: 10 }} /><YAxis tick={{ fill: "var(--txt-mute)", fontSize: 10 }} tickFormatter={(value: string | number) => formatCompact(Number(value))} /><Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--hairline)", color: "var(--txt)" }} formatter={(value: unknown) => typeof value === "number" || typeof value === "string" ? formatCompact(Number(value)) : EMPTY} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="revenue" name="Revenue" fill="var(--accent)" /><Line type="monotone" dataKey="netIncome" name="Net income" stroke="var(--up)" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></ChartFrame> : <EmptyState icon={<FileText className="h-6 w-6" />} title="No reported financials" hint="The available filings did not include recognizable Revenue or Net Income concepts." />}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Upcoming earnings" hint="Next 120 days" />
          {earnings.length ? <div className="space-y-2">{earnings.map((item) => <EarningsRow key={`${item.symbol}-${item.date}-${item.quarter}`} item={item} />)}</div> : <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No upcoming earnings" hint="Finnhub returned no scheduled earnings in the next 120 days." />}
        </Panel>
        <Panel>
          <PanelHeader title="Recent company news" hint="Last 30 days" />
          {news.length ? <div className="space-y-2">{news.slice(0, 6).map((item) => <NewsRow key={item.id ?? item.headline} item={item} />)}</div> : <EmptyState icon={<Newspaper className="h-6 w-6" />} title="No recent company news" hint="Add a FINNHUB_API_KEY to enable this feed." />}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Data summary" hint="Derived only from the datasets above" />
        <p className="max-w-4xl text-sm leading-7 text-txt-dim">{buildSummary(symbol, profile, metrics, annualRows, recommendationRows, surpriseRows)}</p>
      </Panel>
    </div>
  );
}

function ChartFrame({ children }: { children: React.ReactNode }) { return <div className="h-72 w-full">{children}</div>; }

function EarningsRow({ item }: { item: FinnhubEarningsItem }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-elevated px-3 py-2.5"><div><div className="text-sm font-semibold text-txt">{item.date ?? "Date unavailable"}</div><div className="text-xs text-txt-mute">{item.hour ?? "Time unavailable"} · Q{item.quarter ?? "?"} {item.year ?? ""}</div></div><div className="text-right text-xs text-txt-dim">EPS est. <span className="font-mono text-txt">{typeof item.epsEstimate === "number" ? formatUsd(item.epsEstimate, 2) : EMPTY}</span></div></div>;
}

function NewsRow({ item }: { item: FinnhubNewsItem }) {
  return <a href={item.url ?? "#"} target="_blank" rel="noreferrer" className="block rounded-lg border border-hairline bg-elevated px-3 py-2.5 transition hover:border-accent"><div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-accent"><span>{item.source ?? "Company news"}</span><span>{item.datetime ? new Date(item.datetime * 1000).toLocaleDateString() : "Recent"}</span></div><div className="mt-1 text-sm font-semibold text-txt">{item.headline ?? "Untitled article"}</div></a>;
}

function buildSummary(symbol: string, profile: FinnhubCompanyProfile | null | undefined, metrics: Record<string, number> | undefined, annualRows: Array<Record<string, string | number>>, recommendations: FinnhubRecommendationItem[], surprises: FinnhubEarningsSurprise[]) {
  const pe = metricValue(metrics, "peBasicExclExtraTTM", "peTTM");
  const recommendationTotals = recommendations.reduce((totals, row) => ({ strongBuy: totals.strongBuy + row.strongBuy, buy: totals.buy + row.buy, hold: totals.hold + row.hold, sell: totals.sell + row.sell, strongSell: totals.strongSell + row.strongSell }), { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 });
  const positive = recommendationTotals.strongBuy + recommendationTotals.buy;
  const negative = recommendationTotals.sell + recommendationTotals.strongSell;
  const tilt = recommendations.length ? positive > negative ? "leans positive" : negative > positive ? "leans cautious" : "is mixed" : "has no analyst trend available";
  const streak = surprises.filter((item) => typeof item.surprisePercent === "number").slice(-4).reduce((count, item) => item.surprisePercent! > 0 ? count + 1 : 0, 0);
  const marginValues = annualRows.map((row) => row.netMargin).filter((value): value is number => typeof value === "number");
  const marginTrend = marginValues.length > 1 ? marginValues.at(-1)! > marginValues[0] ? "has improved" : marginValues.at(-1)! < marginValues[0] ? "has declined" : "has been broadly stable" : "cannot be determined from the available annual series";
  const valuation = typeof pe === "number" ? `P/E is ${formatNumber(pe, 2)}; no sector benchmark is included in the returned data.` : "P/E is unavailable, so valuation cannot be assessed here.";
  const beatText = surprises.length && streak > 0 ? `${streak} of the latest ${Math.min(4, surprises.length)} reported surprises were positive.` : surprises.length ? "The latest surprise data does not show a positive beat streak." : "No earnings surprise history is available.";
  return `${profile?.name ?? symbol}: ${valuation} The available annual net-margin series ${marginTrend}. Analyst recommendations ${tilt}. ${beatText}`;
}

export default function AnalysisPage() {
  return <Suspense fallback={<div className="mx-auto max-w-7xl space-y-5"><Skeleton className="h-28 w-full" /><Skeleton className="h-[520px] w-full" /><Skeleton className="h-56 w-full" /></div>}><AnalysisContent /></Suspense>;
}