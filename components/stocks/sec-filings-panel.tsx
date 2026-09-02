"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, FileText, Search } from "lucide-react";
import { getSECFilings, type SECFiling } from "@/lib/finnhub/client";

export function SECFilingsPanel({ symbol }: { symbol?: string }) {
  const [selectedSymbol, setSelectedSymbol] = useState(
    symbol?.toUpperCase() ?? "AAPL",
  );

  useEffect(() => {
    if (symbol) {
      setSelectedSymbol(symbol.toUpperCase());
    }
  }, [symbol]);

  const { data: filings = [], isLoading } = useQuery({
    queryKey: ["sec-filings", selectedSymbol],
    queryFn: () => getSECFilings({ symbol: selectedSymbol }),
    staleTime: 60 * 60 * 1000,
    enabled: Boolean(selectedSymbol),
  });

  const limitedFilings = useMemo(() => filings.slice(0, 250), [filings]);

  return (
    <section className="dark-card p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400">
            SEC filings
          </div>
          <h2 className="mt-1 text-lg font-bold text-white">
            Latest filing activity
          </h2>
        </div>

        {!symbol && (
          <label className="flex items-center gap-2 rounded-xl border border-[#1d1f28] bg-[#0d0e12] px-3 py-2 text-xs text-slate-300">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={selectedSymbol}
              onChange={(event) => setSelectedSymbol(event.target.value.trim())}
              placeholder="Search symbol"
              className="w-28 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-4 text-sm text-slate-400">
          Loading SEC filings…
        </div>
      ) : limitedFilings.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[#1c1d25] bg-[#0d0e12]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-[#11141a] text-[10px] uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th className="px-3 py-3 font-medium">Form</th>
                  <th className="px-3 py-3 font-medium">Filed</th>
                  <th className="px-3 py-3 font-medium">Accepted</th>
                  <th className="px-3 py-3 font-medium">Access #</th>
                  <th className="px-3 py-3 font-medium">Document</th>
                </tr>
              </thead>
              <tbody>
                {limitedFilings.map((filing, index) => (
                  <tr
                    key={`${filing.accessNumber ?? filing.filingUrl ?? filing.form ?? "filing"}-${index}`}
                    className="border-t border-[#1b1d25]"
                  >
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold text-white">
                        {filing.form ?? getFilingDisplayLabel(filing)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {filing.symbol ?? selectedSymbol}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-300">
                      {formatDate(filing.filedDate)}
                    </td>
                    <td className="px-3 py-3 align-top text-slate-300">
                      {formatDate(filing.acceptedDate)}
                    </td>
                    <td className="px-3 py-3 align-top text-slate-300">
                      {filing.accessNumber ?? "—"}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="space-y-1 text-[11px] text-slate-300">
                        {filing.filingUrl && (
                          <a
                            href={filing.filingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {getUrlLabel(filing.filingUrl)}
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                        {filing.reportUrl && (
                          <a
                            href={filing.reportUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-emerald-300 hover:text-emerald-200"
                          >
                            Report link
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-4 text-sm text-slate-400">
          No SEC filings are available for {selectedSymbol || "this company"}{" "}
          right now.
        </div>
      )}
    </section>
  );
}

function getFilingDisplayLabel(filing: SECFiling) {
  if (filing.form) return filing.form;

  const url = filing.filingUrl ?? filing.reportUrl ?? "";
  const lastSegment = url.split("/").filter(Boolean).at(-1) ?? "Filing";
  const clean = decodeURIComponent(lastSegment).replace(/\.[^.]+$/, "");

  return clean || "Filing";
}

function getUrlLabel(url: string) {
  try {
    const parsed = new URL(url);
    const lastSegment =
      parsed.pathname.split("/").filter(Boolean).at(-1) ?? "filing";
    return decodeURIComponent(lastSegment).replace(/\.[^.]+$/, "") || "filing";
  } catch {
    return url
      .replace(/^https?:\/\//, "")
      .split("/")
      .slice(0, 4)
      .join("/");
  }
}

function formatDate(value?: string) {
  if (!value) return "—";

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
