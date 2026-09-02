"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type Time,
  type LineData,
} from "lightweight-charts";
import { getDbOhlcv } from "@/lib/supabase/queries";
import { sma, ema, rsi } from "@/lib/indicators";
import { formatUsd } from "@/lib/format";
import { PriceChange, Segmented, Skeleton, EmptyState, cn } from "@/components/ui/kit";
import { LineChart } from "lucide-react";

const RANGE_OPTIONS = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "5Y", label: "5Y" },
  { value: "ALL", label: "All" },
] as const;

const RANGE_BARS: Record<string, number> = {
  "1M": 22, "3M": 66, "6M": 128, "1Y": 252, "5Y": 1260, ALL: Number.MAX_SAFE_INTEGER,
};

const TYPE_OPTIONS = [
  { value: "area", label: "Area" },
  { value: "candles", label: "Candles" },
] as const;

const INDICATORS = [
  { key: "ma20", label: "MA20", color: "#f5b70a" },
  { key: "ma50", label: "MA50", color: "#9aa0ab" },
  { key: "ema20", label: "EMA20", color: "#4aa3ff" },
  { key: "rsi", label: "RSI", color: "#f5b70a" },
] as const;

type IndicatorKey = (typeof INDICATORS)[number]["key"];

const COLORS = {
  up: "#16c784",
  down: "#ea3943",
  accent: "#f5b70a",
  text: "#9aa0ab",
  grid: "rgba(255,255,255,0.04)",
};

export function StockChart({
  symbol,
  price,
  change,
}: {
  symbol: string;
  price?: number;
  change?: number;
}) {
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["value"]>("1Y");
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]["value"]>("area");
  const [active, setActive] = useState<Record<IndicatorKey, boolean>>({
    ma20: false, ma50: false, ema20: false, rsi: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const { data: series = [], isLoading } = useQuery({
    queryKey: ["ohlcv-chart", symbol],
    queryFn: () => getDbOhlcv([symbol]),
    staleTime: 5 * 60_000,
    enabled: Boolean(symbol),
  });

  const candles = useMemo(() => series[0]?.candles ?? [], [series]);
  const visible = useMemo(() => {
    const n = RANGE_BARS[range];
    return n >= candles.length ? candles : candles.slice(candles.length - n);
  }, [candles, range]);

  function toggle(key: IndicatorKey) {
    setActive((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el || visible.length === 0) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COLORS.text,
        fontFamily: "var(--font-geist-sans), sans-serif",
        attributionLogo: false,
      },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    if (type === "candles") {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up, downColor: COLORS.down,
        borderVisible: false, wickUpColor: COLORS.up, wickDownColor: COLORS.down,
      });
      s.setData(visible.map((c) => ({ time: c.date as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor: COLORS.accent,
        topColor: "rgba(245,183,10,0.25)",
        bottomColor: "rgba(245,183,10,0.01)",
        lineWidth: 2,
      });
      s.setData(visible.map((c) => ({ time: c.date as Time, value: c.close })));
    }

    // Volume
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    volume.setData(
      visible.map((c) => ({
        time: c.date as Time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(22,199,132,0.35)" : "rgba(234,57,67,0.35)",
      })),
    );
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // Moving-average overlays (pane 0), computed from real closes
    const closes = visible.map((c) => c.close);
    const toLine = (arr: (number | null)[]): LineData[] =>
      visible
        .map((c, i) => (arr[i] == null ? null : { time: c.date as Time, value: arr[i] as number }))
        .filter((d): d is LineData => d !== null);

    const overlays: Array<[IndicatorKey, (number | null)[]]> = [
      ["ma20", sma(closes, 20)],
      ["ma50", sma(closes, 50)],
      ["ema20", ema(closes, 20)],
    ];
    for (const [key, arr] of overlays) {
      if (!active[key]) continue;
      const color = INDICATORS.find((i) => i.key === key)!.color;
      const line = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      line.setData(toLine(arr));
    }

    // RSI in its own pane (index 1)
    if (active.rsi) {
      const rsiLine = chart.addSeries(LineSeries, { color: COLORS.accent, lineWidth: 2, priceLineVisible: false }, 1);
      rsiLine.setData(toLine(rsi(closes, 14)));
      rsiLine.createPriceLine({ price: 70, color: "rgba(234,57,67,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "70" });
      rsiLine.createPriceLine({ price: 30, color: "rgba(22,199,132,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "30" });
      const panes = chart.panes();
      if (panes[1]) panes[1].setHeight(120);
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [visible, type, active]);

  return (
    <div className="rounded-xl border border-hairline bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-bold text-txt">{symbol}</span>
          {typeof price === "number" && (
            <span className="font-mono text-lg font-bold tnum text-txt">{formatUsd(price)}</span>
          )}
          {typeof change === "number" && <PriceChange percent={change} />}
        </div>
        <div className="flex items-center gap-2">
          <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
          <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        </div>
      </div>

      {/* Indicator toggles */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-4 py-2">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-txt-mute">Indicators</span>
        {INDICATORS.map((ind) => (
          <button
            key={ind.key}
            type="button"
            onClick={() => toggle(ind.key)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition",
              active[ind.key]
                ? "border-transparent text-[color:var(--on-accent)]"
                : "border-hairline bg-elevated text-txt-dim hover:text-txt",
            )}
            style={active[ind.key] ? { backgroundColor: ind.color } : undefined}
          >
            {ind.label}
          </button>
        ))}
      </div>

      <div className="relative h-[440px] w-full p-2">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<LineChart className="h-6 w-6" />} title="No price history" hint={`No OHLCV data for ${symbol}.`} />
        ) : (
          <div ref={containerRef} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
