"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { getIPOCalendar } from "@/lib/finnhub/client";
import { Panel, PanelHeader, Badge, EmptyState } from "@/components/ui/kit";

export default function IposPage() {
  const window = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, []);

  const { data: ipos = [] } = useQuery({
    queryKey: ["ipo-calendar", window.from, window.to],
    queryFn: () => getIPOCalendar(window.from, window.to),
    staleTime: 60 * 60_000,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-12">
      <h1 className="text-xl font-bold text-txt">IPO calendar</h1>

      <Panel padded={false}>
        <div className="p-5 pb-3">
          <PanelHeader title="Recent & upcoming IPOs" hint="Rolling 6-month window" />
        </div>
        {ipos.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<CalendarRange className="h-6 w-6" />}
              title="No IPO events"
              hint="Add a FINNHUB_API_KEY to .env to enable the IPO calendar."
            />
          </div>
        ) : (
          <div className="divide-y divide-hairline">
            {ipos.slice(0, 15).map((ipo, i) => (
              <div key={`${ipo.symbol ?? "ipo"}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-txt">{ipo.name ?? ipo.symbol ?? "IPO"}</div>
                  <div className="text-[11px] text-txt-mute">
                    {ipo.symbol ?? "—"} · {ipo.exchange ?? "—"} · {ipo.date ?? "TBD"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm tnum text-txt">{ipo.price ? `$${ipo.price}` : "TBD"}</span>
                  <Badge tone="accent">{(ipo.status ?? "expected").toUpperCase()}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
