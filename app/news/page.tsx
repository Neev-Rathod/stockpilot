"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Newspaper } from "lucide-react";
import { getMarketNews, getCompanyNews, type MarketNewsCategory, type FinnhubNewsItem } from "@/lib/finnhub/client";
import { Panel, PanelHeader, EmptyState } from "@/components/ui/kit";

const categories: MarketNewsCategory[] = ["general", "forex", "crypto", "merger"];

export default function NewsPage() {
  const [category, setCategory] = useState<MarketNewsCategory>("general");

  const dates = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);

  const { data: marketNews = [] } = useQuery({
    queryKey: ["market-news", category],
    queryFn: () => getMarketNews(category),
    staleTime: 5 * 60_000,
  });

  const { data: companyNews = [] } = useQuery({
    queryKey: ["company-news", "AAPL", dates.from, dates.to],
    queryFn: () => getCompanyNews("AAPL", dates.from, dates.to),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <h1 className="text-xl font-bold text-txt">News</h1>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel padded={false}>
          <div className="flex items-center justify-between p-5 pb-3">
            <PanelHeader title="Market news" />
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                    category === c ? "bg-accent text-[color:var(--on-accent)]" : "border border-hairline bg-elevated text-txt-dim hover:text-txt"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <NewsList items={marketNews} />
        </Panel>

        <Panel padded={false}>
          <div className="flex items-center justify-between p-5 pb-3">
            <PanelHeader title="Company news" hint="AAPL · last 12 months" />
          </div>
          <NewsList items={companyNews} accent />
        </Panel>
      </div>
    </div>
  );
}

function NewsList({ items, accent }: { items: FinnhubNewsItem[]; accent?: boolean }) {
  if (!items.length) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          icon={<Newspaper className="h-6 w-6" />}
          title="No news available"
          hint="Add a FINNHUB_API_KEY to .env to enable the news feed."
        />
      </div>
    );
  }
  return (
    <div className="space-y-2.5 px-5 pb-5">
      {items.slice(0, 8).map((item) => (
        <a
          key={item.id ?? item.headline}
          href={item.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg border border-hairline bg-elevated p-3 transition hover:border-accent"
        >
          <div className={`text-[10px] uppercase tracking-[0.18em] ${accent ? "text-up" : "text-accent"}`}>
            {item.source ?? item.category ?? "Market"}
          </div>
          <div className="mt-1.5 text-sm font-semibold text-txt">{item.headline}</div>
          <div className="mt-1.5 text-[11px] text-txt-mute">
            {item.summary ? item.summary.slice(0, 140) : item.datetime ? new Date(item.datetime * 1000).toLocaleDateString() : "Recent"}
          </div>
        </a>
      ))}
    </div>
  );
}
