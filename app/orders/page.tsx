"use client";

const orders = [
  {
    side: "BUY",
    symbol: "NVDA",
    shares: 10,
    orderType: "Market Order",
    status: "Executed",
    price: "$181.42",
  },
  {
    side: "SELL",
    symbol: "AAPL",
    shares: 5,
    orderType: "Limit",
    status: "Pending",
    price: "$240.00",
  },
  {
    side: "BUY",
    symbol: "MSFT",
    shares: 4,
    orderType: "Market Order",
    status: "Executed",
    price: "$506.30",
  },
];

export default function OrdersPage() {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
          Paper Trading
        </div>
        <h1 className="mt-1 text-2xl font-bold text-white">Orders</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Open" value="2" tone="blue" />
        <StatCard label="Executed" value="12" tone="emerald" />
        <StatCard label="Cancelled" value="1" tone="red" />
      </div>

      <div className="dark-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Recent Orders</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Activity
          </span>
        </div>

        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={`${order.side}-${order.symbol}-${order.orderType}`}
              className="rounded-2xl border border-[#1e2027] bg-[#0d0e12] px-4 py-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${order.side === "BUY" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}
                    >
                      {order.side}
                    </span>
                    <span className="font-mono text-sm font-bold text-white">
                      {order.symbol}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    {order.shares} shares • {order.orderType}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-white">
                    {order.price}
                  </div>
                  <div
                    className={`mt-1 text-[10px] font-semibold ${order.status === "Executed" ? "text-emerald-400" : "text-amber-400"}`}
                  >
                    {order.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "emerald" | "red";
}) {
  const classes = {
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-300",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    red: "border-red-500/30 bg-red-500/5 text-red-300",
  };

  return (
    <div className={`rounded-2xl border p-4 ${classes[tone]}`}>
      <div className="text-[10px] uppercase tracking-[0.2em]">{label}</div>
      <div className="mt-2 text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}
