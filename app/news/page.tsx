"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMarketNews,
  getCompanyNews,
  type MarketNewsCategory,
} from "@/lib/finnhub/client";

const categories: MarketNewsCategory[] = [
  "general",
  "forex",
  "crypto",
  "merger",
];

export default function NewsPage() {
  const [selectedCategory, setSelectedCategory] =
    useState<MarketNewsCategory>("general");

  const companyNewsDates = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, []);

  const { data: marketNews = [] } = useQuery({
    queryKey: ["market-news", selectedCategory],
    queryFn: () => getMarketNews(selectedCategory),
    staleTime: 5 * 60_000,
  });

  const { data: companyNews = [] } = useQuery({
    queryKey: [
      "company-news",
      "market-overview",
      companyNewsDates.from,
      companyNewsDates.to,
    ],
    queryFn: () =>
      getCompanyNews("AAPL", companyNewsDates.from, companyNewsDates.to),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">News</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="dark-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Market News</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                    selectedCategory === category
                      ? "bg-white text-[#0d0e12]"
                      : "border border-[#22232a] bg-[#101115] text-slate-400 hover:text-white"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {marketNews.length > 0 ? (
              marketNews.slice(0, 8).map((item) => (
                <a
                  key={item.id ?? item.headline}
                  href={item.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-3 transition hover:border-blue-500/50"
                >
                  <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400">
                    {item.source ?? item.category ?? "Market"}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {item.headline}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {item.summary
                      ? item.summary.slice(0, 140)
                      : "Read the latest market update."}
                  </div>
                </a>
              ))
            ) : (
              <div className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-4 text-sm text-slate-400">
                No market news is available for this category right now.
              </div>
            )}
          </div>
        </section>

        <section className="dark-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Company News</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Last 12 months
            </span>
          </div>

          <div className="space-y-3">
            {companyNews.length > 0 ? (
              companyNews.slice(0, 8).map((item) => (
                <a
                  key={item.id ?? item.headline}
                  href={item.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-3 transition hover:border-emerald-500/50"
                >
                  <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400">
                    {item.source ?? "Company"}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {item.headline}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {item.datetime
                      ? new Date(item.datetime * 1000).toLocaleDateString()
                      : "Recent"}
                  </div>
                </a>
              ))
            ) : (
              <div className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-4 text-sm text-slate-400">
                No company news is available right now.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
