"use client";

import { useDebounce } from "@/lib/use-debounce";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, LoaderCircle, TrendingUp, ChevronRight } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import type { StockSearchResult } from "@/lib/types";

async function fetchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const response = await fetch(
    `/api/market/catalog?query=${encodeURIComponent(query)}`,
  );
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const items = Array.isArray(data?.data) ? data.data : [];

  return items.map((item: any) => ({
    symbol: item.symbol,
    name: item.name ?? item.symbol,
    exchange: item.exchange,
    currency: item.currency,
    type: item.type,
  }));
}

export function StockSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-search", debouncedQuery],
    queryFn: () => fetchStocks(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    setIsOpen(Boolean(debouncedQuery.length >= 2));
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" id="global-search" ref={containerRef}>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-slate-900/80 px-3.5 py-2.5 shadow-inner transition-all focus-within:border-blue-500/50 focus-within:bg-slate-900 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.2)]">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search AAPL, MSFT, NVDA..."
          className="w-full border-0 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
          aria-label="Search stocks"
        />
        {isLoading && (
          <LoaderCircle className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-1.5 backdrop-blur-2xl shadow-2xl">
          {isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-400">
              <LoaderCircle className="h-4 w-4 animate-spin text-blue-400" />
              Searching market database...
            </div>
          ) : data && data.length > 0 ? (
            <ul className="dark-scrollbar max-h-72 overflow-auto space-y-0.5">
              {data.map((stock) => (
                <li key={stock.symbol}>
                  <Link
                    href={`/stock/${stock.symbol}`}
                    onClick={() => {
                      setQuery("");
                      setIsOpen(false);
                    }}
                    className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-blue-600/15"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                        {stock.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-white group-hover:text-blue-300">
                          {stock.symbol}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">
                          {stock.name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stock.exchange && (
                        <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                          {stock.exchange}
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-blue-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3 text-center text-xs text-slate-400">
              No matching assets found for "{debouncedQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
