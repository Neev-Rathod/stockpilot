"use client";

/**
 * comparison-chart.tsx
 * ---------------------------------------------------------------------------
 * A self-contained trading chart component built on `lightweight-charts` v5.
 *
 * Key fixes in this revision:
 *  - Drawing/pattern tools no longer depend on `chart.subscribeClick`. The
 *    overlay canvas sits on top of the chart with pointer-events enabled
 *    whenever a tool is active, which means it was silently swallowing every
 *    click before the underlying chart ever saw it. Point placement is now
 *    handled directly on the overlay canvas (client coords -> time/price via
 *    the chart's own timeScale/series coordinate helpers).
 *  - Indicators, volume, and OHLC styles no longer require "exactly one
 *    symbol selected". A `focusSymbol` selector lets you pick which symbol's
 *    candles/indicators to view regardless of how many symbols are checked
 *    for comparison. A new "Compare" chart style is the explicit multi-line
 *    overlay mode (what used to be the only option once >1 symbol was picked).
 *
 * New in this revision:
 *  - LIVE TOOL PREVIEW: multi-point tools (trendline, ray, channel,
 *    rectangle, measure, harmonic/chart patterns) now render a "rubber
 *    band" preview that follows the pointer after the first click, instead
 *    of only appearing once the final point is placed. A `hoverPointRef`
 *    is updated on every `pointermove` and spliced into the in-progress
 *    draft so `drawOverlay` can render the pending segment live.
 *  - REAL SPLIT VIEW: a new "split" chart style renders one independent
 *    `lightweight-charts` pane per selected symbol in a responsive grid,
 *    instead of forcing every symbol onto a single shared price axis. The
 *    panes are kept in lockstep by subscribing to
 *    `timeScale().subscribeVisibleLogicalRangeChange` and
 *    `chart.subscribeCrosshairMove` on each pane and mirroring the range /
 *    crosshair position onto every other pane (guarded against feedback
 *    loops with a `syncing` flag). This is distinct from "Compare", which
 *    remains the single-axis overlay mode.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import {
  MousePointer2,
  TrendingUp,
  Minus,
  MoveUpRight,
  AlignJustify,
  Square,
  Pencil,
  Type as TypeIcon,
  Ruler,
  Shapes,
  ChevronDown,
  Undo2,
  Trash2,
  SlidersHorizontal,
  CandlestickChart as CandleIcon,
  BarChart3,
  LineChart as LineIcon,
  AreaChart as AreaIcon,
  GitCompareArrows,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import type { OhlcvCandle, OhlcvSeries } from "@/lib/ohlcv";

/* --------------------------------------------------------------------- */
/* Types                                                                  */
/* --------------------------------------------------------------------- */

export type ToolId =
  | "cursor"
  | "trendline"
  | "horizontal"
  | "ray"
  | "channel"
  | "rectangle"
  | "brush"
  | "text"
  | "measure"
  | "abcd"
  | "xabcd"
  | "cypher"
  | "headshoulders"
  | "triangle"
  | "threedrives";

export type ChartStyle = "candles" | "bars" | "line" | "area" | "compare" | "split";

// Line colors used for each series in compare mode (and the legend).
const COMPARE_PALETTE = ["#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f87171"];

/** Any concrete series handle — used where we only need coordinate/price-scale helpers. */
export type AnySeriesApi = ISeriesApi<SeriesType>;

export interface RawPoint {
  time: Time | string | number;
  price: number;
}

export interface Drawing {
  id: string;
  tool: ToolId;
  points: RawPoint[];
  color: string;
  text?: string;
}

const PATTERN_TOOLS = new Set<ToolId>([
  "abcd",
  "xabcd",
  "cypher",
  "headshoulders",
  "triangle",
  "threedrives",
]);

const POINTS_NEEDED: Record<ToolId, number> = {
  cursor: 0,
  trendline: 2,
  horizontal: 1,
  ray: 2,
  channel: 3,
  rectangle: 2,
  brush: 0, // freehand, handled via pointer down/move/up
  text: 1,
  measure: 2,
  abcd: 4,
  xabcd: 5,
  cypher: 5,
  headshoulders: 5,
  triangle: 4,
  threedrives: 5,
};

const PATTERN_LABELS: Partial<Record<ToolId, string[]>> = {
  abcd: ["A", "B", "C", "D"],
  xabcd: ["X", "A", "B", "C", "D"],
  cypher: ["X", "A", "B", "C", "D"],
  headshoulders: ["LS", "Head", "RS", "Neck-L", "Neck-R"],
  triangle: ["1", "2", "3", "4"],
  threedrives: ["1", "2", "3", "4", "5"],
};

const DRAWING_COLOR = "#38bdf8";
const PATTERN_COLOR = "#fbbf24";
const PREVIEW_COLOR = "rgba(148,163,184,.7)";

/* --------------------------------------------------------------------- */
/* Indicator math                                                        */
/* --------------------------------------------------------------------- */

function sma(candles: OhlcvCandle[], period: number) {
  const out: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    out.push({ time: candles[i].date as Time, value: sum / period });
  }
  return out;
}

function ema(candles: OhlcvCandle[], period: number) {
  const out: { time: Time; value: number }[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  candles.forEach((c, i) => {
    prev = i === 0 ? c.close : c.close * k + (prev as number) * (1 - k);
    if (i >= period - 1)
      out.push({ time: c.date as Time, value: prev as number });
  });
  return out;
}

function bollinger(candles: OhlcvCandle[], period = 20, mult = 2) {
  const mid: { time: Time; value: number }[] = [];
  const upper: { time: Time; value: number }[] = [];
  const lower: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1).map((c) => c.close);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const time = candles[i].date as Time;
    mid.push({ time, value: mean });
    upper.push({ time, value: mean + mult * sd });
    lower.push({ time, value: mean - mult * sd });
  }
  return { mid, upper, lower };
}

function rsi(candles: OhlcvCandle[], period = 14) {
  const out: { time: Time; value: number }[] = [];
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      gainSum += gain;
      lossSum += loss;
      if (i === period) {
        const avgGain = gainSum / period;
        const avgLoss = lossSum / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.push({
          time: candles[i].date as Time,
          value: 100 - 100 / (1 + rs),
        });
      }
      continue;
    }
    const prevAvgGain = gainSum / period;
    const prevAvgLoss = lossSum / period;
    const avgGain = (prevAvgGain * (period - 1) + gain) / period;
    const avgLoss = (prevAvgLoss * (period - 1) + loss) / period;
    gainSum = avgGain * period;
    lossSum = avgLoss * period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({ time: candles[i].date as Time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

function macd(candles: OhlcvCandle[], fast = 12, slow = 26, signalPeriod = 9) {
  const emaSeries = (period: number) => {
    const k = 2 / (period + 1);
    const vals: number[] = [];
    candles.forEach((c, i) => {
      vals.push(i === 0 ? c.close : c.close * k + vals[i - 1] * (1 - k));
    });
    return vals;
  };
  const fastE = emaSeries(fast);
  const slowE = emaSeries(slow);
  const macdLine = candles.map((_, i) => fastE[i] - slowE[i]);
  const k = 2 / (signalPeriod + 1);
  const signal: number[] = [];
  macdLine.forEach((v, i) =>
    signal.push(i === 0 ? v : v * k + signal[i - 1] * (1 - k)),
  );
  const macdData = candles.map((c, i) => ({
    time: c.date as Time,
    value: macdLine[i],
  }));
  const signalData = candles.map((c, i) => ({
    time: c.date as Time,
    value: signal[i],
  }));
  const histData = candles.map((c, i) => ({
    time: c.date as Time,
    value: macdLine[i] - signal[i],
    color: macdLine[i] - signal[i] >= 0 ? "#34d399" : "#f87171",
  }));
  return { macdData, signalData, histData };
}

/* --------------------------------------------------------------------- */
/* Component                                                              */
/* --------------------------------------------------------------------- */

export interface IndicatorState {
  sma20: boolean;
  ema50: boolean;
  bollinger: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
}

export interface ComparisonChartProps {
  series: OhlcvSeries[];
  normalized: boolean;
  externalDrawings?: Drawing[];
  drawings?: Drawing[];
  onDrawingsChange?: (drawings: Drawing[]) => void;
  activeFocusSymbol?: string;
  focusSymbol?: string;
  onFocusSymbolChange?: (symbol: string) => void;
  activeChartStyle?: ChartStyle;
  chartStyle?: ChartStyle;
  onChartStyleChange?: (style: ChartStyle) => void;
  indicators?: IndicatorState;
  onIndicatorsChange?: (indicators: IndicatorState) => void;
}

export function ComparisonChart({
  series,
  normalized,
  externalDrawings,
  drawings: controlledDrawings,
  onDrawingsChange,
  activeFocusSymbol,
  focusSymbol: controlledFocusSymbol,
  onFocusSymbolChange,
  activeChartStyle,
  chartStyle: controlledChartStyle,
  onChartStyleChange,
  indicators: controlledIndicators,
  onIndicatorsChange,
}: ComparisonChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const mainSeriesRef = useRef<AnySeriesApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, AnySeriesApi>>(new Map());
  const compareSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  // Split-view: one independent chart instance per symbol, kept in sync.
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitChartsRef = useRef<
    Map<string, { chart: IChartApi; series: AnySeriesApi }>
  >(new Map());

  const [chartStyle, setChartStyle] = useState<ChartStyle>(
    controlledChartStyle ?? activeChartStyle ?? "candles",
  );
  const [focusSymbol, setFocusSymbol] = useState<string | undefined>(
    controlledFocusSymbol ?? activeFocusSymbol ?? series[0]?.symbol,
  );
  const [tool, setTool] = useState<ToolId>("cursor");
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showPatternPicker, setShowPatternPicker] = useState(false);
  const [showIndicatorPicker, setShowIndicatorPicker] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorState>(
    controlledIndicators ?? {
      sma20: false,
      ema50: false,
      bollinger: false,
      volume: true,
      rsi: false,
      macd: false,
    },
  );
  const [drawings, setDrawings] = useState<Drawing[]>(
    controlledDrawings ?? externalDrawings ?? [],
  );

  // Sync external controlled props
  useEffect(() => {
    const sym = controlledFocusSymbol ?? activeFocusSymbol;
    if (sym) setFocusSymbol(sym);
  }, [controlledFocusSymbol, activeFocusSymbol]);

  useEffect(() => {
    const st = controlledChartStyle ?? activeChartStyle;
    if (st) setChartStyle(st);
  }, [controlledChartStyle, activeChartStyle]);

  useEffect(() => {
    const dr = controlledDrawings ?? externalDrawings;
    if (dr) setDrawings(dr);
  }, [controlledDrawings, externalDrawings]);

  useEffect(() => {
    if (controlledIndicators) setIndicators(controlledIndicators);
  }, [controlledIndicators]);

  // Listen for WebMCP & AI custom events
  useEffect(() => {
    function handleSetStyle(e: Event) {
      const detail = (e as CustomEvent<{ style: ChartStyle }>).detail;
      if (detail?.style) {
        setChartStyle(detail.style);
        onChartStyleChange?.(detail.style);
      }
    }

    function handleSetFocus(e: Event) {
      const detail = (e as CustomEvent<{ symbol: string }>).detail;
      if (detail?.symbol) {
        setFocusSymbol(detail.symbol);
        onFocusSymbolChange?.(detail.symbol);
      }
    }

    function handleSetIndicators(e: Event) {
      const detail = (e as CustomEvent<Partial<typeof indicators>>).detail;
      if (detail) {
        setIndicators((prev) => ({ ...prev, ...detail }));
      }
    }

    function handleAddDrawing(e: Event) {
      const detail = (
        e as CustomEvent<{ drawing?: Drawing; drawings?: Drawing[] }>
      ).detail;
      if (detail?.drawing) {
        setDrawings((prev) => {
          const next = [...prev, detail.drawing!];
          onDrawingsChange?.(next);
          return next;
        });
      } else if (Array.isArray(detail?.drawings)) {
        setDrawings((prev) => {
          const next = [...prev, ...detail.drawings!];
          onDrawingsChange?.(next);
          return next;
        });
      }
    }

    function handleClearDrawings() {
      setDrawings([]);
      draftRef.current = [];
      hoverPointRef.current = null;
      onDrawingsChange?.([]);
    }

    function handleApplyAiPatterns(e: Event) {
      const detail = (
        e as CustomEvent<{
          symbol?: string;
          drawings: Drawing[];
          style?: ChartStyle;
        }>
      ).detail;
      if (detail?.symbol) {
        setFocusSymbol(detail.symbol);
        onFocusSymbolChange?.(detail.symbol);
      }
      if (detail?.style) {
        setChartStyle(detail.style);
        onChartStyleChange?.(detail.style);
      } else {
        setChartStyle("candles");
        onChartStyleChange?.("candles");
      }
      if (Array.isArray(detail?.drawings)) {
        setDrawings(detail.drawings);
        onDrawingsChange?.(detail.drawings);
      }
    }

    window.addEventListener(
      "stockpilot:compare-chart:set-style",
      handleSetStyle,
    );
    window.addEventListener(
      "stockpilot:compare-chart:set-focus",
      handleSetFocus,
    );
    window.addEventListener(
      "stockpilot:compare-chart:set-indicators",
      handleSetIndicators,
    );
    window.addEventListener(
      "stockpilot:compare-chart:add-drawing",
      handleAddDrawing,
    );
    window.addEventListener(
      "stockpilot:compare-chart:clear-drawings",
      handleClearDrawings,
    );
    window.addEventListener(
      "stockpilot:compare-chart:apply-ai-patterns",
      handleApplyAiPatterns,
    );

    return () => {
      window.removeEventListener(
        "stockpilot:compare-chart:set-style",
        handleSetStyle,
      );
      window.removeEventListener(
        "stockpilot:compare-chart:set-focus",
        handleSetFocus,
      );
      window.removeEventListener(
        "stockpilot:compare-chart:set-indicators",
        handleSetIndicators,
      );
      window.removeEventListener(
        "stockpilot:compare-chart:add-drawing",
        handleAddDrawing,
      );
      window.removeEventListener(
        "stockpilot:compare-chart:clear-drawings",
        handleClearDrawings,
      );
      window.removeEventListener(
        "stockpilot:compare-chart:apply-ai-patterns",
        handleApplyAiPatterns,
      );
    };
  }, [onChartStyleChange, onFocusSymbolChange, onDrawingsChange]);

  // Refs mirroring state that must be read from inside chart-event callbacks
  // and canvas pointer handlers, whose closures are effectively long-lived.
  const toolRef = useRef<ToolId>("cursor");
  const drawingsRef = useRef<Drawing[]>([]);
  const draftRef = useRef<RawPoint[]>([]);
  const brushingRef = useRef(false);
  // Tracks the pointer's current chart-space position while a multi-point
  // tool has a draft in progress, so the in-progress segment can be drawn
  // live instead of only appearing once the final point is clicked.
  const hoverPointRef = useRef<RawPoint | null>(null);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  const effectiveFocusSymbol =
    focusSymbol && series.some((s) => s.symbol === focusSymbol)
      ? focusSymbol
      : series[0]?.symbol;

  const focusEntry = useMemo(
    () =>
      series.find((s) => s.symbol === effectiveFocusSymbol) ??
      series[0] ??
      null,
    [series, effectiveFocusSymbol],
  );
  // Compare & split only make sense with 2+ symbols (i.e. the Compare tab).
  const multiSymbol = series.length > 1;
  const isCompareMode = chartStyle === "compare" && multiSymbol;
  const isSplitMode = chartStyle === "split" && multiSymbol;

  /* ---------------- overlay sizing ---------------- */
  const sizeOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { width, height } = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  /* ---------------- coordinate helpers ---------------- */
  const refSeries = useCallback((): AnySeriesApi | null => {
    return (
      mainSeriesRef.current ??
      compareSeriesRef.current.values().next().value ??
      null
    );
  }, []);

  const toXY = useCallback(
    (p: RawPoint): { x: number; y: number } | null => {
      const chart = chartRef.current;
      const s = refSeries();
      if (!chart || !s) return null;
      const x = chart.timeScale().timeToCoordinate(p.time as any);
      const y = s.priceToCoordinate(p.price);
      if (x === null || y === null) return null;
      return { x, y };
    },
    [refSeries],
  );

  /** Convert a raw client (viewport) coordinate to a chart time/price point. */
  const clientToRawPoint = useCallback(
    (clientX: number, clientY: number): RawPoint | null => {
      const chart = chartRef.current;
      const s = refSeries();
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!chart || !s || !rect) return null;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const time = chart.timeScale().coordinateToTime(x);
      const price = s.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time, price };
    },
    [refSeries],
  );

  /* ---------------- overlay drawing ---------------- */
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    const renderPoints = (pts: RawPoint[]) =>
      pts.map(toXY).filter((p): p is { x: number; y: number } => p !== null);

    const activeTool = toolRef.current;
    const all = [...drawingsRef.current];

    if (draftRef.current.length > 0) {
      const needed = POINTS_NEEDED[activeTool];
      // Splice the live pointer position in as a temporary trailing point
      // so tools with >1 point required render a "rubber band" preview
      // between clicks, instead of staying invisible until the last click.
      const previewPoints =
        draftRef.current.length < needed && hoverPointRef.current
          ? [...draftRef.current, hoverPointRef.current]
          : draftRef.current;
      all.push({
        id: "__draft",
        tool: activeTool,
        points: previewPoints,
        color: PATTERN_TOOLS.has(activeTool) ? PATTERN_COLOR : DRAWING_COLOR,
      });
    }

    for (const d of all) {
      const pts = renderPoints(d.points);
      if (pts.length === 0) continue;
      const isLivePreview =
        d.id === "__draft" &&
        hoverPointRef.current !== null &&
        d.points.at(-1) === hoverPointRef.current;
      ctx.strokeStyle = isLivePreview ? PREVIEW_COLOR : d.color;
      ctx.fillStyle = isLivePreview ? PREVIEW_COLOR : d.color;
      ctx.lineWidth = 1.6;
      ctx.font = "11px system-ui, sans-serif";
      if (isLivePreview) ctx.setLineDash([5, 4]);

      const labels = PATTERN_LABELS[d.tool];

      if (d.tool === "horizontal" && pts[0]) {
        ctx.beginPath();
        ctx.moveTo(0, pts[0].y);
        ctx.lineTo(canvas.width / dpr, pts[0].y);
        ctx.stroke();
      } else if (d.tool === "ray" && pts.length >= 2) {
        const [a, b] = pts;
        const dx = b.x - a.x || 0.0001;
        const slope = (b.y - a.y) / dx;
        const endX = canvas.width / dpr;
        const endY = a.y + slope * (endX - a.x);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      } else if (d.tool === "rectangle" && pts.length >= 2) {
        const [a, b] = pts;
        ctx.strokeRect(
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.abs(b.x - a.x),
          Math.abs(b.y - a.y),
        );
        ctx.globalAlpha = 0.08;
        ctx.fillRect(
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.abs(b.x - a.x),
          Math.abs(b.y - a.y),
        );
        ctx.globalAlpha = 1;
      } else if (d.tool === "channel" && pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        if (pts[2]) {
          const offsetY = pts[2].y - pts[0].y;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y + offsetY);
          ctx.lineTo(pts[1].x, pts[1].y + offsetY);
          ctx.stroke();
        }
      } else if (d.tool === "brush") {
        ctx.beginPath();
        pts.forEach((p, i) =>
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
        );
        ctx.stroke();
      } else if (d.tool === "text" && pts[0]) {
        ctx.fillText(d.text ?? "", pts[0].x + 4, pts[0].y - 4);
      } else if (d.tool === "measure" && pts.length >= 2) {
        const [a, b] = pts;
        ctx.setLineDash(isLivePreview ? [5, 4] : [4, 3]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const p0 = d.points[0].price;
        const p1 = d.points[1].price;
        const pct = ((p1 - p0) / p0) * 100;
        const t0 =
          chartRef.current?.timeScale().timeToCoordinate(d.points[0].time as any) ?? 0;
        const t1 =
          chartRef.current?.timeScale().timeToCoordinate(d.points[1].time as any) ?? 0;
        const bars = Math.abs(t1 - t0);
        ctx.fillStyle = pct >= 0 ? "#34d399" : "#f87171";
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y) - 20, 170, 18);
        ctx.fillStyle = "#0b0e15";
        ctx.fillText(
          `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%  Δ${(p1 - p0).toFixed(2)}  ~${Math.round(bars / 6)} bars`,
          Math.min(a.x, b.x) + 4,
          Math.min(a.y, b.y) - 7,
        );
      } else if (labels) {
        ctx.beginPath();
        pts.forEach((p, i) =>
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
        );
        ctx.stroke();
        if (d.tool === "headshoulders" && pts.length >= 5) {
          ctx.beginPath();
          ctx.moveTo(pts[3].x, pts[3].y);
          ctx.lineTo(pts[4].x, pts[4].y);
          ctx.stroke();
        }
        if (d.tool === "triangle" && pts.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.moveTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[3].x, pts[3].y);
          ctx.stroke();
        }
        pts.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(labels[i] ?? "", p.x + 5, p.y - 5);
        });
      } else if (d.tool === "trendline" && pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
      }

      if (isLivePreview) ctx.setLineDash([]);
    }
  }, [toXY]);

  useEffect(() => {
    drawOverlay();
  }, [drawings, drawOverlay]);

  /* ---------------- point placement: driven by the overlay canvas itself ---------------- */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const activeTool = toolRef.current;
      if (activeTool === "cursor" || activeTool === "brush") return;
      const point = clientToRawPoint(e.clientX, e.clientY);
      if (!point) return;

      draftRef.current = [...draftRef.current, point];
      hoverPointRef.current = point;
      const needed = POINTS_NEEDED[activeTool];

      if (draftRef.current.length >= needed) {
        let text: string | undefined;
        if (activeTool === "text") {
          text = window.prompt("Label text:") ?? "";
        }
        const newDrawing: Drawing = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tool: activeTool,
          points: draftRef.current,
          color: PATTERN_TOOLS.has(activeTool) ? PATTERN_COLOR : DRAWING_COLOR,
          text,
        };
        setDrawings((prev) => [...prev, newDrawing]);
        draftRef.current = [];
        hoverPointRef.current = null;
      }
      drawOverlay();
    },
    [clientToRawPoint, drawOverlay],
  );

  /* ---------------- chart init (once) ---------------- */
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#0b0e15" }, textColor: "#94a3b8" },
      grid: {
        vertLines: { color: "#1b2333" },
        horzLines: { color: "#1b2333" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#273244" },
      timeScale: { borderColor: "#273244" },
      autoSize: true,
    });
    chartRef.current = chart;

    const onCrosshairMove = () => drawOverlay();
    chart.subscribeCrosshairMove(onCrosshairMove);
    const onVisibleRangeChange = () => drawOverlay();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange);

    const resizeObserver = new ResizeObserver(() => {
      sizeOverlay();
      drawOverlay();
    });
    resizeObserver.observe(containerRef.current);
    sizeOverlay();

    const indicatorMap = indicatorSeriesRef.current;
    const compareMap = compareSeriesRef.current;

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorMap.clear();
      compareMap.clear();
    };
  }, [drawOverlay, sizeOverlay]);

  /* ---------------- indicators (re-applied on toggle; applies to the focused symbol) ---------------- */
  const applyIndicators = useCallback(
    (candles: OhlcvCandle[]) => {
      const chart = chartRef.current;
      if (!chart) return;
      indicatorSeriesRef.current.forEach((s) => chart.removeSeries(s));
      indicatorSeriesRef.current.clear();

      if (indicators.sma20) {
        const s = chart.addSeries(LineSeries, {
          color: "#f59e0b",
          lineWidth: 1,
          priceLineVisible: false,
        });
        s.setData(sma(candles, 20));
        indicatorSeriesRef.current.set("sma20", s);
      }
      if (indicators.ema50) {
        const s = chart.addSeries(LineSeries, {
          color: "#a78bfa",
          lineWidth: 1,
          priceLineVisible: false,
        });
        s.setData(ema(candles, 50));
        indicatorSeriesRef.current.set("ema50", s);
      }
      if (indicators.bollinger) {
        const { mid, upper, lower } = bollinger(candles, 20, 2);
        const mS = chart.addSeries(LineSeries, {
          color: "#38bdf8",
          lineWidth: 1,
          priceLineVisible: false,
        });
        const uS = chart.addSeries(LineSeries, {
          color: "rgba(56,189,248,.4)",
          lineWidth: 1,
          priceLineVisible: false,
        });
        const lS = chart.addSeries(LineSeries, {
          color: "rgba(56,189,248,.4)",
          lineWidth: 1,
          priceLineVisible: false,
        });
        mS.setData(mid);
        uS.setData(upper);
        lS.setData(lower);
        indicatorSeriesRef.current.set("bb-mid", mS);
        indicatorSeriesRef.current.set("bb-up", uS);
        indicatorSeriesRef.current.set("bb-low", lS);
      }
      if (indicators.rsi) {
        const s = chart.addSeries(LineSeries, {
          color: "#f472b6",
          lineWidth: 1,
          priceScaleId: "rsi",
          priceLineVisible: false,
        });
        s.priceScale().applyOptions({
          scaleMargins: { top: 0.78, bottom: 0.02 },
        });
        s.setData(rsi(candles, 14));
        indicatorSeriesRef.current.set("rsi", s);
      }
      if (indicators.macd) {
        const { macdData, signalData, histData } = macd(candles);
        const macdS = chart.addSeries(LineSeries, {
          color: "#60a5fa",
          lineWidth: 1,
          priceScaleId: "macd",
          priceLineVisible: false,
        });
        const sigS = chart.addSeries(LineSeries, {
          color: "#f59e0b",
          lineWidth: 1,
          priceScaleId: "macd",
          priceLineVisible: false,
        });
        const histS = chart.addSeries(HistogramSeries, {
          priceScaleId: "macd",
          priceLineVisible: false,
        });
        [macdS, sigS, histS].forEach((s) =>
          s
            .priceScale()
            .applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } }),
        );
        macdS.setData(macdData);
        sigS.setData(signalData);
        histS.setData(histData);
        indicatorSeriesRef.current.set("macd-line", macdS);
        indicatorSeriesRef.current.set("macd-signal", sigS);
        indicatorSeriesRef.current.set("macd-hist", histS);
      }
    },
    [indicators],
  );

  /* ---------------- render primary (single-axis) data ---------------- */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }
    if (volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    compareSeriesRef.current.forEach((s) => chart.removeSeries(s));
    compareSeriesRef.current.clear();
    indicatorSeriesRef.current.forEach((s) => chart.removeSeries(s));
    indicatorSeriesRef.current.clear();

    // Split mode renders into its own set of chart instances below — leave
    // the primary (hidden) chart empty so it isn't doing wasted work.
    if (isSplitMode || series.length === 0) {
      sizeOverlay();
      drawOverlay();
      return;
    }

    if (!isCompareMode && focusEntry) {
      const candles = focusEntry.candles;
      const ohlc = candles.map((c) => ({
        time: c.date as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      if (chartStyle === "candles") {
        const s = chart.addSeries(CandlestickSeries, {
          upColor: "#34d399",
          downColor: "#f87171",
          borderVisible: false,
          wickUpColor: "#34d399",
          wickDownColor: "#f87171",
        });
        s.setData(ohlc);
        mainSeriesRef.current = s;
      } else if (chartStyle === "bars") {
        const s = chart.addSeries(BarSeries, {
          upColor: "#34d399",
          downColor: "#f87171",
        });
        s.setData(ohlc);
        mainSeriesRef.current = s;
      } else if (chartStyle === "area") {
        const s = chart.addSeries(AreaSeries, {
          lineColor: "#60a5fa",
          topColor: "rgba(96,165,250,.35)",
          bottomColor: "rgba(96,165,250,0)",
        });
        s.setData(
          candles.map((c) => ({ time: c.date as Time, value: c.close })),
        );
        mainSeriesRef.current = s;
      } else {
        const s = chart.addSeries(LineSeries, {
          color: "#60a5fa",
          lineWidth: 2,
        });
        s.setData(
          candles.map((c) => ({ time: c.date as Time, value: c.close })),
        );
        mainSeriesRef.current = s;
      }

      if (indicators.volume) {
        const vs = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
          color: "#334155",
        });
        vs.priceScale().applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        });
        vs.setData(
          candles.map((c) => ({
            time: c.date as Time,
            value: c.volume,
            color:
              c.close >= c.open
                ? "rgba(52,211,153,.5)"
                : "rgba(248,113,113,.5)",
          })),
        );
        volumeSeriesRef.current = vs;
      }

      applyIndicators(candles);
    } else if (isCompareMode) {
      const palette = COMPARE_PALETTE;
      series.forEach((entry, i) => {
        const s = chart.addSeries(LineSeries, {
          color: palette[i % palette.length],
          lineWidth: 2,
        });
        const base = entry.candles[0]?.close || 1;
        s.setData(
          entry.candles.map((c) => ({
            time: c.date as Time,
            value: normalized
              ? Number(((c.close / base) * 100).toFixed(2))
              : c.close,
          })),
        );
        compareSeriesRef.current.set(entry.symbol, s);
      });
    }

    chart.timeScale().fitContent();
    sizeOverlay();
    drawOverlay();
  }, [
    series,
    normalized,
    chartStyle,
    focusEntry,
    isCompareMode,
    isSplitMode,
    indicators.volume,
    applyIndicators,
    sizeOverlay,
    drawOverlay,
  ]);

  useEffect(() => {
    if (!isCompareMode && !isSplitMode && focusEntry)
      applyIndicators(focusEntry.candles);
  }, [indicators, focusEntry, isCompareMode, isSplitMode, applyIndicators]);

  /* ---------------- split view: one independent, synced chart per symbol ---------------- */
  useEffect(() => {
    const container = splitContainerRef.current;
    if (!container) return;

    // Tear down any existing panes before rebuilding (covers both "leaving
    // split mode" and "selection changed while in split mode").
    splitChartsRef.current.forEach(({ chart }) => chart.remove());
    splitChartsRef.current.clear();
    container.innerHTML = "";

    if (!isSplitMode || series.length === 0) return;

    const cols = series.length === 1 ? 1 : series.length <= 4 ? 2 : 3;
    container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

    const closeByTime = new Map<string, Map<Time, number>>();
    const panes: { symbol: string; chart: IChartApi; series: AnySeriesApi }[] =
      [];
    let syncing = false;

    series.forEach((entry) => {
      const paneWrap = document.createElement("div");
      paneWrap.className =
        "relative flex flex-col overflow-hidden rounded-xl border border-hairline/[.08] bg-black/10";

      const label = document.createElement("div");
      label.className =
        "flex items-center justify-between border-b border-hairline/[.06] px-2.5 py-1.5 text-[11px] font-bold text-txt-dim";
      label.textContent = entry.symbol;

      const paneDiv = document.createElement("div");
      paneDiv.className = "min-h-0 flex-1";

      paneWrap.appendChild(label);
      paneWrap.appendChild(paneDiv);
      container.appendChild(paneWrap);

      const paneChart = createChart(paneDiv, {
        layout: { background: { color: "transparent" }, textColor: "#94a3b8" },
        grid: {
          vertLines: { color: "#1b2333" },
          horzLines: { color: "#1b2333" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#273244" },
        timeScale: { borderColor: "#273244" },
        autoSize: true,
      });

      const candleSeries = paneChart.addSeries(CandlestickSeries, {
        upColor: "#34d399",
        downColor: "#f87171",
        borderVisible: false,
        wickUpColor: "#34d399",
        wickDownColor: "#f87171",
      });
      candleSeries.setData(
        entry.candles.map((c) => ({
          time: c.date as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      paneChart.timeScale().fitContent();

      const cMap = new Map<Time, number>();
      entry.candles.forEach((c) => cMap.set(c.date as Time, c.close));
      closeByTime.set(entry.symbol, cMap);

      panes.push({
        symbol: entry.symbol,
        chart: paneChart,
        series: candleSeries,
      });
      splitChartsRef.current.set(entry.symbol, {
        chart: paneChart,
        series: candleSeries,
      });
    });

    // Mirror each pane's visible range and crosshair onto every other pane.
    panes.forEach(({ chart }) => {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        panes.forEach(({ chart: other }) => {
          if (other !== chart) other.timeScale().setVisibleLogicalRange(range);
        });
        syncing = false;
      });

      chart.subscribeCrosshairMove((param) => {
        if (syncing) return;
        syncing = true;
        panes.forEach(({ symbol, chart: other, series: otherSeries }) => {
          if (other === chart) return;
          if (!param.time) {
            other.clearCrosshairPosition();
            return;
          }
          const price = closeByTime.get(symbol)?.get(param.time as Time);
          if (price !== undefined) {
            other.setCrosshairPosition(price, param.time, otherSeries);
          }
        });
        syncing = false;
      });
    });

    return () => {
      panes.forEach(({ chart }) => chart.remove());
      splitChartsRef.current.clear();
    };
  }, [isSplitMode, series]);

  /* ---------------- freehand brush + live tool preview via pointer events on overlay ---------------- */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (toolRef.current !== "brush") return;
      brushingRef.current = true;
      const point = clientToRawPoint(e.clientX, e.clientY);
      if (point) draftRef.current = [point];
    },
    [clientToRawPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const activeTool = toolRef.current;

      if (activeTool === "brush") {
        if (!brushingRef.current) return;
        const point = clientToRawPoint(e.clientX, e.clientY);
        if (point) {
          draftRef.current = [...draftRef.current, point];
          drawOverlay();
        }
        return;
      }

      // Live "rubber band" preview: once the first point of a multi-point
      // tool has been placed, keep tracking the pointer and repaint so the
      // pending segment/shape follows the cursor until the next click.
      if (activeTool !== "cursor" && draftRef.current.length > 0) {
        const point = clientToRawPoint(e.clientX, e.clientY);
        if (point) {
          hoverPointRef.current = point;
          drawOverlay();
        }
      }
    },
    [clientToRawPoint, drawOverlay],
  );

  const handlePointerUp = useCallback(() => {
    if (toolRef.current !== "brush" || !brushingRef.current) return;
    brushingRef.current = false;
    if (draftRef.current.length > 1) {
      setDrawings((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          tool: "brush",
          points: draftRef.current,
          color: DRAWING_COLOR,
        },
      ]);
    }
    draftRef.current = [];
  }, []);

  const undo = () => setDrawings((prev) => prev.slice(0, -1));
  const clearAll = () => {
    setDrawings([]);
    draftRef.current = [];
    hoverPointRef.current = null;
  };

  const disableTools = isSplitMode;
  const disableIndicators = isCompareMode || isSplitMode;

  /* ---------------- UI ---------------- */
  const toolButtons: { id: ToolId; icon: React.ReactNode; title: string }[] = [
    {
      id: "cursor",
      icon: <MousePointer2 className="h-4 w-4" />,
      title: "Cursor",
    },
    {
      id: "trendline",
      icon: <TrendingUp className="h-4 w-4" />,
      title: "Trend line",
    },
    {
      id: "horizontal",
      icon: <Minus className="h-4 w-4" />,
      title: "Horizontal line",
    },
    { id: "ray", icon: <MoveUpRight className="h-4 w-4" />, title: "Ray" },
    {
      id: "channel",
      icon: <AlignJustify className="h-4 w-4" />,
      title: "Parallel channel",
    },
    {
      id: "rectangle",
      icon: <Square className="h-4 w-4" />,
      title: "Rectangle",
    },
    { id: "brush", icon: <Pencil className="h-4 w-4" />, title: "Brush" },
    { id: "text", icon: <TypeIcon className="h-4 w-4" />, title: "Text" },
    { id: "measure", icon: <Ruler className="h-4 w-4" />, title: "Measure" },
  ];

  const patternButtons: { id: ToolId; label: string }[] = [
    { id: "abcd", label: "ABCD pattern" },
    { id: "xabcd", label: "XABCD pattern" },
    { id: "cypher", label: "Cypher pattern" },
    { id: "headshoulders", label: "Head and Shoulders" },
    { id: "triangle", label: "Triangle pattern" },
    { id: "threedrives", label: "Three Drives pattern" },
  ];

  const styleButtons: {
    id: ChartStyle;
    icon: React.ReactNode;
    label: string;
  }[] = [
    {
      id: "candles",
      icon: <CandleIcon className="h-4 w-4" />,
      label: "Candles",
    },
    { id: "bars", icon: <BarChart3 className="h-4 w-4" />, label: "Bars" },
    { id: "line", icon: <LineIcon className="h-4 w-4" />, label: "Line" },
    { id: "area", icon: <AreaIcon className="h-4 w-4" />, label: "Area" },
    // Compare & Split only appear when 2+ symbols are charted (the Compare tab).
    ...(multiSymbol
      ? ([
          { id: "compare", icon: <GitCompareArrows className="h-4 w-4" />, label: "Compare" },
          { id: "split", icon: <LayoutGrid className="h-4 w-4" />, label: "Split" },
        ] as { id: ChartStyle; icon: React.ReactNode; label: string }[])
      : []),
  ];

  return (
    <div className="flex h-140 w-full gap-2 rounded-2xl border border-hairline bg-[#0b0e15] p-2 sm:p-3">
      {/* left tool rail */}
      <div
        className={`flex w-11 shrink-0 flex-col items-center gap-1 rounded-xl border border-hairline bg-black/20 py-2 ${
          disableTools ? "pointer-events-none opacity-40" : ""
        }`}
      >
        {toolButtons.map((b) => (
          <button
            key={b.id}
            title={b.title}
            onClick={() => {
              setTool(b.id);
              draftRef.current = [];
              hoverPointRef.current = null;
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              tool === b.id
                ? "bg-accent text-txt"
                : "text-txt-dim hover:bg-elevated hover:text-txt"
            }`}
          >
            {b.icon}
          </button>
        ))}

        <div className="relative">
          <button
            title="Chart patterns"
            onClick={() => setShowPatternPicker((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              PATTERN_TOOLS.has(tool)
                ? "bg-amber-500 text-black"
                : "text-txt-dim hover:bg-elevated hover:text-txt"
            }`}
          >
            <Shapes className="h-4 w-4" />
          </button>
          {showPatternPicker && (
            <div className="absolute left-10 top-0 z-20 w-52 rounded-xl border border-hairline bg-[#151a24] p-1.5 shadow-xl">
              {patternButtons.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setTool(p.id);
                    draftRef.current = [];
                    hoverPointRef.current = null;
                    setShowPatternPicker(false);
                  }}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-txt hover:bg-elevated"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="my-1 h-px w-6 bg-elevated" />

        <button
          title="Undo last"
          onClick={undo}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-txt-dim hover:bg-elevated hover:text-txt"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          title="Clear all drawings"
          onClick={clearAll}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-txt-dim hover:bg-elevated hover:text-rose-300"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* chart area */}
      <div className="relative flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowStylePicker((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-hairline bg-black/20 px-2.5 py-1.5 text-xs font-bold text-txt hover:bg-elevated"
            >
              {styleButtons.find((s) => s.id === chartStyle)?.icon}
              {styleButtons.find((s) => s.id === chartStyle)?.label}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showStylePicker && (
              <div className="absolute left-0 top-9 z-20 w-40 rounded-xl border border-hairline bg-[#151a24] p-1.5 shadow-xl">
                {styleButtons.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setChartStyle(s.id);
                      setShowStylePicker(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-txt hover:bg-elevated"
                  >
                    {s.icon}
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isCompareMode && !isSplitMode && series.length > 1 && (
            <select
              aria-label="Focused symbol"
              value={focusSymbol}
              onChange={(e) => setFocusSymbol(e.target.value)}
              className="rounded-lg border border-hairline bg-black/20 px-2.5 py-1.5 text-xs font-bold text-txt outline-none"
            >
              {series.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  Focus: {s.symbol}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <button
              onClick={() => setShowIndicatorPicker((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-hairline bg-black/20 px-2.5 py-1.5 text-xs font-bold text-txt hover:bg-elevated"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Indicators
              <ChevronDown className="h-3 w-3" />
            </button>
            {showIndicatorPicker && (
              <div className="absolute left-0 top-9 z-20 w-52 space-y-1 rounded-xl border border-hairline bg-[#151a24] p-2 shadow-xl">
                {disableIndicators && (
                  <p className="px-1.5 pb-1 text-[10px] text-amber-300">
                    Switch to a single-symbol style to apply indicators.
                  </p>
                )}
                {(
                  [
                    ["sma20", "SMA (20)"],
                    ["ema50", "EMA (50)"],
                    ["bollinger", "Bollinger Bands"],
                    ["volume", "Volume"],
                    ["rsi", "RSI (14)"],
                    ["macd", "MACD"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-semibold text-txt hover:bg-elevated ${
                      disableIndicators
                        ? "cursor-not-allowed opacity-40"
                        : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={disableIndicators}
                      checked={indicators[key]}
                      onChange={() => {
                        const next = {
                          ...indicators,
                          [key]: !indicators[key],
                        };
                        setIndicators(next);
                        onIndicatorsChange?.(next);
                      }}
                      className="accent-blue-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {drawings.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Canvas Overlays ({drawings.length})</span>
              <button
                onClick={clearAll}
                title="Clear all overlays"
                className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300/80 transition-colors hover:bg-amber-400/20 hover:text-txt"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* single-axis chart (candles / bars / line / area / compare) */}
        <div
          ref={containerRef}
          className="relative h-125 w-full"
          style={{ display: isSplitMode ? "none" : "block" }}
        >
          <canvas
            ref={overlayRef}
            className="absolute inset-0 z-10"
            style={{
              pointerEvents: tool === "cursor" || isSplitMode ? "none" : "auto",
              touchAction: "none",
            }}
            onClick={handleOverlayClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />

          {/* Compare-mode legend: color ↔ company */}
          {isCompareMode && series.length > 0 && (
            <div className="pointer-events-none absolute left-2 top-2 z-20 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-hairline bg-[#0d0e12]/90 px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur">
              {series.map((s, i) => (
                <span key={s.symbol} className="flex items-center gap-1.5 text-txt">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }}
                  />
                  {s.symbol}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* split view: one synced pane per symbol */}
        {isSplitMode && (
          <div
            ref={splitContainerRef}
            className="grid h-125 w-full auto-rows-fr gap-2"
          />
        )}
      </div>
    </div>
  );
}
