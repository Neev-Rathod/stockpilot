"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIPOCalendar } from "@/lib/finnhub/client";

export default function IposPage() {
  const ipoWindow = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, []);

  const { data: ipoCalendar = [] } = useQuery({
    queryKey: ["ipo-calendar", ipoWindow.from, ipoWindow.to],
    queryFn: () => getIPOCalendar(ipoWindow.from, ipoWindow.to),
    staleTime: 60 * 60_000,
  });

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">IPO Calendar</h1>
      </div>

      <section className="dark-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Upcoming IPOs</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Next 6 months
          </span>
        </div>

        <div className="space-y-3">
          {ipoCalendar.length > 0 ? (
            ipoCalendar.slice(0, 12).map((ipo, index) => (
              <div
                key={`${ipo.symbol ?? "ipo"}-${index}`}
                className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {ipo.name ?? ipo.symbol ?? "IPO"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {ipo.symbol ?? "—"} • {ipo.exchange ?? "NYSE"}
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-bold uppercase text-blue-300">
                    {ipo.status ?? "expected"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{ipo.date ?? "TBD"}</span>
                  <span>{ipo.price ? `$${ipo.price}` : "Price TBD"}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-4 text-sm text-slate-400">
              No IPO events are currently scheduled for this period.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
