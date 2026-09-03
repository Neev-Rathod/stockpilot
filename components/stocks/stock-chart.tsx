"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { getDbOhlcv } from "@/lib/supabase/queries";
import { ComparisonChart } from "@/components/comparison/comparison-chart";
import { formatUsd } from "@/lib/format";
import { Panel, PriceChange, Skeleton, EmptyState } from "@/components/ui/kit";

// The single, app-wide stock chart — the same engine/UI as the Compare tab
// (candles / bars / line / area, indicators, drawings), fed real Supabase OHLCV.
export function StockChart({
  symbol,
  price,
  change,
}: {
  symbol: string;
  price?: number;
  change?: number;
}) {
  const upper = symbol.toUpperCase();
  const { data: series = [], isLoading } = useQuery({
    queryKey: ["ohlcv-chart", upper],
    queryFn: () => getDbOhlcv([upper]),
    staleTime: 5 * 60_000,
    enabled: Boolean(upper),
  });
  const single = useMemo(
    () => series.filter((s) => s.symbol === upper),
    [series, upper],
  );

  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-bold text-txt">{upper}</span>
          {typeof price === "number" && (
            <span className="font-mono text-lg font-bold tnum text-txt">{formatUsd(price)}</span>
          )}
          {typeof change === "number" && <PriceChange percent={change} />}
        </div>
      </div>
      <div className="p-3">
        {isLoading ? (
          <Skeleton className="h-[520px] w-full" />
        ) : single.length === 0 ? (
          <EmptyState
            icon={<LineChart className="h-6 w-6" />}
            title="No price history"
            hint={`No OHLCV data for ${upper}.`}
          />
        ) : (
          <ComparisonChart series={single} normalized={false} />
        )}
      </div>
    </Panel>
  );
}
