"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  Star,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { useMarketTicker } from "@/lib/use-market-ticker";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { BuySellModal } from "@/components/portfolio/buy-sell-modal";
import { StockChart } from "@/components/stocks/stock-chart";
import { toast } from "sonner";
import { formatUsd, formatPercent } from "@/lib/format";
import {
  Panel,
  PanelHeader,
  Button,
  Stat,
  PriceChange,
  EmptyState,
} from "@/components/ui/kit";

// Real sectors for the 10 symbols we hold data for.
const SECTOR_MAP: Record<string, string> = {
  AAPL: "Technology",
  MSFT: "Technology",
  AMD: "Technology",
  CSCO: "Technology",
  QCOM: "Technology",
  AMZN: "Consumer Cyclical",
  TSLA: "Consumer Cyclical",
  SBUX: "Consumer Cyclical",
  META: "Communication Services",
  NFLX: "Communication Services",
};

// Beta values from the universe (same as webmcp.ts)
const BETA_MAP: Record<string, number> = {
  AAPL: 0.84,
  MSFT: 0.81,
  AMD: 1.56,
  CSCO: 0.59,
  QCOM: 1.05,
  AMZN: 0.96,
  TSLA: 1.5,
  SBUX: 0.64,
  META: 1.04,
  NFLX: 1.0,
};

const SECTORS = ["All", "Technology", "Consumer Cyclical", "Communication Services"];

type SortKey = "symbol" | "price" | "change" | "beta" | "dayRange";
type SortDir = "asc" | "desc";

interface DirectoryFilters {
  minPrice: string;
  maxPrice: string;
  minChange: string;
  maxChange: string;
  minBeta: string;
  maxBeta: string;
}

const DEFAULT_FILTERS: DirectoryFilters = {
  minPrice: "",
  maxPrice: "",
  minChange: "",
  maxChange: "",
  minBeta: "",
  maxBeta: "",
};

// ─── Custom event types dispatched by webmcp tools ───────────────────────────
export type MarketsFilterEvent = {
  filters?: Partial<DirectoryFilters>;
  sector?: string;
  sort?: { key: SortKey; dir: SortDir };
  scrollTo?: "directory" | "sector-performance";
};

export default function MarketsPage() {
  const [sector, setSector] = useState("All");
  const [search, setSearch] = useState("");
  const [chartSymbol, setChartSymbol] = useState("AAPL");
  const [modal, setModal] = useState<{
    symbol: string;
    companyName: string;
    price: number;
  } | null>(null);

  // ── Sort state ───────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Filter panel state ───────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_FILTERS);

  // ── Scroll anchor refs ───────────────────────────────────────────────────
  const directoryRef = useRef<HTMLDivElement>(null);
  const sectorPerfRef = useRef<HTMLDivElement>(null);

  const { quotes } = useMarketTicker();
  const chartQuote = quotes.find((q) => q.symbol === chartSymbol);
  const buyStock = usePortfolioStore((s) => s.buyStock);
  const favorites = usePortfolioStore((s) => s.favorites);
  const toggleFavorite = usePortfolioStore((s) => s.toggleFavorite);

  // ── Apply a MarketsFilterEvent detail to component state ────────────────
  function applyFilterDetail(detail: MarketsFilterEvent) {
    if (detail.filters) {
      setFilters((prev) => ({ ...prev, ...detail.filters }));
      setFiltersOpen(true);
    }
    if (detail.sector) setSector(detail.sector);
    if (detail.sort) {
      setSortKey(detail.sort.key);
      setSortDir(detail.sort.dir);
    }
    const scrollTarget = detail.scrollTo;
    if (scrollTarget === "directory") {
      setTimeout(
        () => directoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        200,
      );
    } else if (scrollTarget === "sector-performance") {
      setTimeout(
        () => sectorPerfRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        200,
      );
    }
  }

  // ── On mount: replay any pending filter stored by webmcp before navigation ──
  useEffect(() => {
    const pending = sessionStorage.getItem("stockpilot:pending-markets-filter");
    if (pending) {
      sessionStorage.removeItem("stockpilot:pending-markets-filter");
      try {
        applyFilterDetail(JSON.parse(pending) as MarketsFilterEvent);
      } catch {
        // ignore malformed data
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for webmcp navigation events (same page) ──────────────────────
  useEffect(() => {
    function handleMarketsFilter(e: Event) {
      applyFilterDetail((e as CustomEvent<MarketsFilterEvent>).detail ?? {});
    }
    window.addEventListener("stockpilot:markets:filter", handleMarketsFilter);
    return () => window.removeEventListener("stockpilot:markets:filter", handleMarketsFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Breadth stats ────────────────────────────────────────────────────────
  const breadth = useMemo(() => {
    const adv = quotes.filter((q) => q.percentChange >= 0).length;
    const avg =
      quotes.length
        ? quotes.reduce((s, q) => s + q.percentChange, 0) / quotes.length
        : 0;
    return { adv, dec: quotes.length - adv, avg };
  }, [quotes]);

  const sorted = useMemo(
    () => [...quotes].sort((a, b) => b.percentChange - a.percentChange),
    [quotes],
  );
  const gainers = sorted.slice(0, 3);
  const losers = sorted.slice(-3).reverse();

  // ── Sector performance ───────────────────────────────────────────────────
  const sectorPerformance = useMemo(() => {
    const map: Record<string, number[]> = {};
    quotes.forEach((q) => {
      const sec = SECTOR_MAP[q.symbol] ?? "Unknown";
      if (!map[sec]) map[sec] = [];
      map[sec].push(q.percentChange);
    });
    return Object.entries(map)
      .map(([sec, changes]) => ({
        sector: sec,
        avgChange: +(changes.reduce((a, b) => a + b, 0) / changes.length).toFixed(2),
        stockCount: changes.length,
      }))
      .sort((a, b) => b.avgChange - a.avgChange);
  }, [quotes]);

  // ── Directory rows: filter + sort ────────────────────────────────────────
  const rows = useMemo(() => {
    const minPrice = filters.minPrice !== "" ? Number(filters.minPrice) : null;
    const maxPrice = filters.maxPrice !== "" ? Number(filters.maxPrice) : null;
    const minChange = filters.minChange !== "" ? Number(filters.minChange) : null;
    const maxChange = filters.maxChange !== "" ? Number(filters.maxChange) : null;
    const minBeta = filters.minBeta !== "" ? Number(filters.minBeta) : null;
    const maxBeta = filters.maxBeta !== "" ? Number(filters.maxBeta) : null;

    let filtered = quotes.filter((q) => {
      const beta = BETA_MAP[q.symbol] ?? 1;
      if (
        !(!search.trim() ||
          q.symbol.toLowerCase().includes(search.toLowerCase()) ||
          q.companyName.toLowerCase().includes(search.toLowerCase()))
      )
        return false;
      if (sector !== "All" && SECTOR_MAP[q.symbol] !== sector) return false;
      if (minPrice !== null && q.price < minPrice) return false;
      if (maxPrice !== null && q.price > maxPrice) return false;
      if (minChange !== null && q.percentChange < minChange) return false;
      if (maxChange !== null && q.percentChange > maxChange) return false;
      if (minBeta !== null && beta < minBeta) return false;
      if (maxBeta !== null && beta > maxBeta) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "symbol":
          return sortDir === "asc"
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        case "price":
          va = a.price; vb = b.price; break;
        case "change":
          va = a.percentChange; vb = b.percentChange; break;
        case "beta":
          va = BETA_MAP[a.symbol] ?? 1; vb = BETA_MAP[b.symbol] ?? 1; break;
        case "dayRange":
          va = (a.high ?? a.price) - (a.low ?? a.price);
          vb = (b.high ?? b.price) - (b.low ?? b.price);
          break;
        default:
          va = a.percentChange; vb = b.percentChange;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });

    return filtered;
  }, [quotes, search, sector, filters, sortKey, sortDir]);

  const hasActiveFilters =
    Object.values(filters).some((v) => v !== "") || sector !== "All";

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setSector("All");
  }

  function trade(quantity: number) {
    if (!modal) return;
    const res = buyStock(modal.symbol, modal.companyName, quantity, modal.price);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setModal(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-txt">Markets</h1>
        <div className="flex w-64 items-center rounded-lg border border-hairline bg-panel px-3 py-2 text-sm focus-within:border-accent">
          <Search className="mr-2 h-4 w-4 text-txt-mute" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or name…"
            className="w-full bg-transparent text-txt outline-none placeholder:text-txt-mute"
          />
        </div>
      </div>

      {/* ── Breadth stats ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Advancing"
          value={<span className="text-up">{breadth.adv}</span>}
          icon={<TrendingUp className="h-4 w-4 text-up" />}
        />
        <Stat
          label="Declining"
          value={<span className="text-down">{breadth.dec}</span>}
          icon={<TrendingDown className="h-4 w-4 text-down" />}
        />
        <Stat
          label="Avg change"
          value={
            <span className={breadth.avg >= 0 ? "text-up" : "text-down"}>
              {formatPercent(breadth.avg)}
            </span>
          }
          icon={<Activity className="h-4 w-4 text-accent" />}
        />
      </div>

      {/* ── Chart ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {quotes.map((q) => (
            <button
              key={q.symbol}
              type="button"
              onClick={() => setChartSymbol(q.symbol)}
              className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold transition ${
                chartSymbol === q.symbol
                  ? "bg-accent text-[color:var(--on-accent)]"
                  : "text-txt-dim hover:text-txt"
              }`}
            >
              {q.symbol}
            </button>
          ))}
        </div>
        <StockChart
          symbol={chartSymbol}
          price={chartQuote?.price}
          change={chartQuote?.percentChange}
        />
      </div>

      {/* ── Gainers / Losers ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <MoverList
          title="Top gainers"
          icon={<TrendingUp className="h-4 w-4 text-up" />}
          rows={gainers}
        />
        <MoverList
          title="Top losers"
          icon={<TrendingDown className="h-4 w-4 text-down" />}
          rows={losers}
        />
      </div>

      {/* ── Sector Performance ── */}
      <div ref={sectorPerfRef} id="sector-performance">
        <Panel padded={false}>
          <div className="p-5 pb-3">
            <PanelHeader title="Sector Performance" />
          </div>
          <div className="grid gap-3 p-5 pt-2 sm:grid-cols-3">
            {sectorPerformance.map((sp) => (
              <button
                key={sp.sector}
                type="button"
                onClick={() => {
                  setSector(sp.sector);
                  directoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="flex items-center justify-between rounded-lg border border-hairline bg-elevated px-4 py-3 text-left transition hover:border-accent"
              >
                <div>
                  <div className="text-sm font-semibold text-txt">{sp.sector}</div>
                  <div className="mt-0.5 text-[11px] text-txt-mute">
                    {sp.stockCount} {sp.stockCount === 1 ? "stock" : "stocks"}
                  </div>
                </div>
                <div
                  className={`font-mono text-sm font-bold tnum ${
                    sp.avgChange >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {sp.avgChange >= 0 ? "+" : ""}
                  {sp.avgChange}%
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Directory ── */}
      <div ref={directoryRef} id="market-directory">
        <Panel padded={false}>
          {/* Directory header row */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
            <div className="flex items-center gap-3">
              <PanelHeader title={`Directory (${rows.length})`} />
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-txt-mute hover:text-txt"
                  title="Clear all filters"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Sector tabs */}
              {SECTORS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSector(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    sector === s
                      ? "bg-accent text-[color:var(--on-accent)]"
                      : "border border-hairline bg-elevated text-txt-dim hover:text-txt"
                  }`}
                >
                  {s}
                </button>
              ))}
              {/* Filters toggle */}
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                  filtersOpen || hasActiveFilters
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-hairline bg-elevated text-txt-dim hover:text-txt"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] text-[color:var(--on-accent)]">
                    ✓
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Filter panel */}
          {filtersOpen && (
            <div className="mx-5 mb-4 rounded-lg border border-hairline bg-elevated p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <FilterRange
                  label="Price ($)"
                  minVal={filters.minPrice}
                  maxVal={filters.maxPrice}
                  minPlaceholder="Min"
                  maxPlaceholder="Max"
                  onMinChange={(v) => setFilters((f) => ({ ...f, minPrice: v }))}
                  onMaxChange={(v) => setFilters((f) => ({ ...f, maxPrice: v }))}
                />
                <FilterRange
                  label="Daily change (%)"
                  minVal={filters.minChange}
                  maxVal={filters.maxChange}
                  minPlaceholder="e.g. -5"
                  maxPlaceholder="e.g. 5"
                  onMinChange={(v) => setFilters((f) => ({ ...f, minChange: v }))}
                  onMaxChange={(v) => setFilters((f) => ({ ...f, maxChange: v }))}
                />
                <FilterRange
                  label="Beta"
                  minVal={filters.minBeta}
                  maxVal={filters.maxBeta}
                  minPlaceholder="e.g. 0.5"
                  maxPlaceholder="e.g. 1.5"
                  onMinChange={(v) => setFilters((f) => ({ ...f, minBeta: v }))}
                  onMaxChange={(v) => setFilters((f) => ({ ...f, maxBeta: v }))}
                />
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState title="No matches" hint="Try a different search, sector, or filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-txt-mute">
                  <tr>
                    <SortableHeader label="Symbol" sortKey="symbol" current={sortKey} dir={sortDir} onToggle={toggleSort} className="px-5 py-2.5" />
                    <SortableHeader label="Price" sortKey="price" current={sortKey} dir={sortDir} onToggle={toggleSort} className="px-5 py-2.5" />
                    <SortableHeader label="Change" sortKey="change" current={sortKey} dir={sortDir} onToggle={toggleSort} className="px-5 py-2.5" />
                    <SortableHeader label="Beta" sortKey="beta" current={sortKey} dir={sortDir} onToggle={toggleSort} className="px-5 py-2.5" />
                    <SortableHeader label="Day range" sortKey="dayRange" current={sortKey} dir={sortDir} onToggle={toggleSort} className="px-5 py-2.5" />
                    <th className="px-5 py-2.5 text-right font-medium">Trade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline font-mono tnum">
                  {rows.map((q) => {
                    const fav = favorites.includes(q.symbol);
                    const beta = BETA_MAP[q.symbol] ?? 1;
                    return (
                      <tr key={q.symbol} className="transition hover:bg-elevated">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleFavorite(q.symbol)}
                              aria-label="Toggle watchlist"
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${
                                  fav ? "fill-accent text-accent" : "text-txt-mute"
                                }`}
                              />
                            </button>
                            <div>
                              <Link
                                href={`/stock/${q.symbol}`}
                                className="font-bold text-txt hover:text-accent"
                              >
                                {q.symbol}
                              </Link>
                              <div className="truncate font-sans text-[11px] text-txt-mute">
                                {q.companyName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-txt">{formatUsd(q.price)}</td>
                        <td
                          className={`px-5 py-3 ${
                            q.percentChange >= 0 ? "text-up" : "text-down"
                          }`}
                        >
                          {formatPercent(q.percentChange)}
                        </td>
                        <td className="px-5 py-3 text-txt-dim">{beta.toFixed(2)}</td>
                        <td className="px-5 py-3 text-txt-dim">
                          {formatUsd(q.low ?? q.price)} – {formatUsd(q.high ?? q.price)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            size="sm"
                            onClick={() =>
                              setModal({
                                symbol: q.symbol,
                                companyName: q.companyName,
                                price: q.price,
                              })
                            }
                          >
                            Trade
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <p className="text-center text-[11px] text-txt-mute">
        Prices reflect the latest available close from your dataset, animated for a live feel.
      </p>

      {modal && (
        <BuySellModal
          mode="buy"
          symbol={modal.symbol}
          companyName={modal.companyName}
          currentPrice={modal.price}
          onClose={() => setModal(null)}
          onConfirm={trade}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortableHeader({
  label,
  sortKey,
  current,
  dir,
  onToggle,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={`font-medium ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className="flex items-center gap-1 hover:text-txt"
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function FilterRange({
  label,
  minVal,
  maxVal,
  minPlaceholder,
  maxPlaceholder,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  minVal: string;
  maxVal: string;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-txt-mute">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={minVal}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder={minPlaceholder ?? "Min"}
          className="w-full rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-xs text-txt outline-none placeholder:text-txt-mute focus:border-accent"
        />
        <span className="text-txt-mute">–</span>
        <input
          type="number"
          value={maxVal}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder={maxPlaceholder ?? "Max"}
          className="w-full rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-xs text-txt outline-none placeholder:text-txt-mute focus:border-accent"
        />
      </div>
    </div>
  );
}

function MoverList({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: {
    symbol: string;
    companyName: string;
    price: number;
    percentChange: number;
  }[];
}) {
  return (
    <Panel padded={false}>
      <div className="p-5 pb-2">
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              {icon}
              {title}
            </span>
          }
        />
      </div>
      <div className="divide-y divide-hairline">
        {rows.map((q) => (
          <Link
            key={q.symbol}
            href={`/stock/${q.symbol}`}
            className="flex items-center justify-between px-5 py-2.5 transition hover:bg-elevated"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm font-bold text-txt">{q.symbol}</div>
              <div className="truncate text-[11px] text-txt-mute">{q.companyName}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm tnum text-txt">{formatUsd(q.price)}</div>
              <PriceChange
                percent={q.percentChange}
                className="justify-end text-[11px]"
                showArrow={false}
              />
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
