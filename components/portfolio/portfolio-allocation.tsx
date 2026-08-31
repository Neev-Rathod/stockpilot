"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export function PortfolioAllocation({
  holdings,
  prices,
}: {
  holdings: Array<{
    symbol: string;
    quantity: number;
    averageBuyPrice: number;
  }>;
  prices: Record<string, number>;
}) {
  const data = holdings
    .map((holding) => ({
      name: holding.symbol,
      value:
        (prices[holding.symbol] ?? holding.averageBuyPrice) * holding.quantity,
    }))
    .filter((item) => item.value > 0);

  if (!data.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        No allocations yet.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={4}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => {
              const numericValue =
                typeof value === "number" ? value : Number(value ?? 0);
              return `$${numericValue.toFixed(2)}`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORS = [
  "#0f172a",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];
