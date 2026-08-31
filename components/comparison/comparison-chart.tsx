"use client";

import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { StockRange } from "@/lib/types";

export function ComparisonChart({
  series,
  range,
}: {
  series: Array<{
    symbol: string;
    data: Array<{ label: string; value: number }>;
  }>;
  range: StockRange;
}) {
  const labels = series[0]?.data.map((point) => point.label) ?? [];
  const chartData = labels.map((label, index) => {
    const points: Record<string, number | string> = { label };
    series.forEach((entry) => {
      const point = entry.data[index];
      points[entry.symbol] = point?.value ?? 0;
    });
    return points;
  });

  return (
    <div className="h-80 w-full rounded-2xl bg-slate-950/40 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#475569"
            opacity={0.45}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#cbd5e1" }}
            tickLine={{ stroke: "#64748b" }}
            axisLine={{ stroke: "#64748b" }}
          />
          <YAxis
            domain={[90, "auto"]}
            tick={{ fontSize: 11, fill: "#cbd5e1" }}
            tickLine={{ stroke: "#64748b" }}
            axisLine={{ stroke: "#64748b" }}
          />
          <Tooltip
            cursor={{ stroke: "#38bdf8", strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "12px",
              color: "#e2e8f0",
            }}
            labelStyle={{ color: "#f8fafc" }}
            formatter={(value) => {
              const numericValue =
                typeof value === "number" ? value : Number(value ?? 0);
              return [`${numericValue.toFixed(1)}`, "Indexed value"];
            }}
          />
          <Legend wrapperStyle={{ color: "#e2e8f0" }} />
          {series.map((entry) => (
            <Line
              key={entry.symbol}
              type="monotone"
              dataKey={entry.symbol}
              stroke={getStroke(entry.symbol)}
              strokeWidth={2.5}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function getStroke(symbol: string) {
  const palette = ["#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f87171"];
  const index =
    Array.from(symbol).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    palette.length;
  return palette[index];
}
