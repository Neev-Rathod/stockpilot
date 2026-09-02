"use client";

import { useMemo } from "react";
import type { OhlcvSeries } from "@/lib/ohlcv";
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

export function ComparisonChart({
  series,
  normalized,
}: {
  series: OhlcvSeries[];
  normalized: boolean;
}) {
  const chartData = useMemo(() => {
    const dates = [
      ...new Set(
        series.flatMap((entry) => entry.candles.map((candle) => candle.date)),
      ),
    ].sort();
    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      series.forEach((entry) => {
        const candle = entry.candles.find((item) => item.date === date);
        if (candle)
          row[entry.symbol] = normalized
            ? Number(
                ((candle.close / (entry.candles[0]?.close || 1)) * 100).toFixed(
                  2,
                ),
              )
            : candle.close;
      });
      return row;
    });
  }, [normalized, series]);

  return (
    <div className="h-[440px] w-full rounded-2xl border border-white/[0.07] bg-[#0b0e15] p-3 sm:p-5">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 10, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 5"
            stroke="#273244"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            minTickGap={46}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickFormatter={(value: string) => value.slice(5)}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={58}
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickFormatter={(value: number) =>
              normalized ? `${value}` : `$${value}`
            }
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #334155",
              borderRadius: "12px",
              color: "#e2e8f0",
            }}
            labelStyle={{ color: "#cbd5e1" }}
            formatter={(value, name) => [
              normalized
                ? Number(value).toFixed(2)
                : `$${Number(value).toFixed(2)}`,
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          {series.map((entry) => (
            <Line
              key={entry.symbol}
              type="monotone"
              dataKey={entry.symbol}
              stroke={getStroke(entry.symbol, series.indexOf(entry))}
              strokeWidth={2.4}
              dot={false}
              connectNulls
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function getStroke(symbol: string, index: number) {
  const palette = ["#60a5fa", "#34d399", "#fbbf24", "#c084fc", "#f87171"];
  return palette[index % palette.length];
}
