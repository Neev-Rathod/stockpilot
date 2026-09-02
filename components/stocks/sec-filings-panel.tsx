"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, FileText, Search, X } from "lucide-react";
import { getSECFilings, type SECFiling } from "@/lib/finnhub/client";

type ReportPreview = {
  title: string;
  url: string;
  kind: "xml" | "html" | "text";
  rawText: string;
  summary: string[];
  loading: boolean;
  error?: string;
};

export function SECFilingsPanel({ symbol }: { symbol?: string }) {
  const [selectedSymbol, setSelectedSymbol] = useState(
    symbol?.toUpperCase() ?? "AAPL",
  );
  const [selectedReport, setSelectedReport] = useState<ReportPreview | null>(
    null,
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

  async function openReport(filing: SECFiling) {
    const reportUrl = filing.reportUrl ?? filing.filingUrl;
    if (!reportUrl) return;

    const summary = summarizeFiling(filing) ?? [
      "Filing available for review",
      `Filed on ${formatDate(filing.filedDate)}`,
    ];

    setSelectedReport({
      title: filing.symbol ? `${filing.symbol} filing` : "SEC filing",
      url: reportUrl,
      kind: "text",
      rawText: "Loading report…",
      summary,
      loading: true,
    });

    try {
      const response = await fetch(
        `/api/sec/report?url=${encodeURIComponent(reportUrl)}`,
      );
      const payload = (await response.json()) as {
        error?: string;
        kind?: "xml" | "html" | "text";
        rawText?: string;
      };

      if (!response.ok || payload.error) {
        setSelectedReport({
          title: filing.symbol ? `${filing.symbol} filing` : "SEC filing",
          url: reportUrl,
          kind: "text",
          rawText: payload.error ?? "Unable to load the report.",
          summary,
          loading: false,
          error: payload.error ?? "Unable to load the report.",
        });
        return;
      }

      const rawText = payload.rawText ?? "";
      const previewKind = payload.kind ?? "text";
      const prettyText = prettifyReport(rawText, previewKind);

      setSelectedReport({
        title: filing.symbol ? `${filing.symbol} filing` : "SEC filing",
        url: reportUrl,
        kind: previewKind,
        rawText,
        summary,
        loading: false,
        error: undefined,
      });

      if (previewKind === "xml") {
        setSelectedReport((current) =>
          current
            ? {
                ...current,
                rawText,
                summary: summarizeXmlReport(rawText, summary),
                loading: false,
                error: undefined,
              }
            : current,
        );
      }

      if (previewKind === "text") {
        setSelectedReport((current) =>
          current
            ? {
                ...current,
                rawText: prettyText || rawText,
                resource: undefined,
              }
            : current,
        );
      }
    } catch (error) {
      setSelectedReport({
        title: filing.symbol ? `${filing.symbol} filing` : "SEC filing",
        url: reportUrl,
        kind: "text",
        rawText:
          error instanceof Error
            ? error.message
            : "Unexpected error while loading the report.",
        summary,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while loading the report.",
      });
    }
  }

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
        <div className="space-y-3">
          {limitedFilings.map((filing, index) => {
            const summary = summarizeFiling(filing) ?? [
              "Filing available for review",
              `Filed on ${formatDate(filing.filedDate)}`,
            ];
            const hasReport = Boolean(filing.filingUrl || filing.reportUrl);

            return (
              <article
                key={`${filing.accessNumber ?? filing.filingUrl ?? filing.form ?? "filing"}-${index}`}
                className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
                        {filing.form ?? getFilingDisplayLabel(filing)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {filing.symbol ?? selectedSymbol}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
                      <Meta
                        label="Filed"
                        value={formatDate(filing.filedDate)}
                      />
                      <Meta
                        label="Accepted"
                        value={formatDate(filing.acceptedDate)}
                      />
                      <Meta
                        label="Access #"
                        value={filing.accessNumber ?? "—"}
                      />
                      <Meta label="Form type" value={filing.form ?? "—"} />
                    </div>

                    <div className="mt-3 rounded-lg border border-[#1d1f28] bg-[#0b0d12] p-3 text-sm text-slate-200">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                        Report highlights
                      </div>
                      <ul className="space-y-1.5">
                        {summary.map((item) => (
                          <li
                            key={item}
                            className="leading-relaxed text-slate-300"
                          >
                            • {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    {filing.filingUrl && (
                      <a
                        href={filing.filingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-200 hover:bg-blue-500/20"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Filing
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    )}

                    {hasReport && (
                      <button
                        type="button"
                        onClick={() => openReport(filing)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                      >
                        Open report
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-4 text-sm text-slate-400">
          No SEC filings are available for {selectedSymbol || "this company"}{" "}
          right now.
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#1c1d25] bg-[#0b0d12] shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-[#1c1d25] bg-[#101319] px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                  Form 4 report preview
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {selectedReport.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="rounded-lg border border-[#2a2e39] bg-[#131722] p-2 text-slate-300 transition hover:text-white"
                aria-label="Close report preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="mb-4 rounded-xl border border-[#1d1f28] bg-[#0d0e12] p-4">
                <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                  Filing summary
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  {selectedReport.summary.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              {selectedReport.loading && (
                <div className="rounded-xl border border-[#1d1f28] bg-[#0d0e12] p-5 text-sm text-slate-400">
                  Loading report preview…
                </div>
              )}

              {selectedReport.error && !selectedReport.loading && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
                  {selectedReport.error}
                </div>
              )}

              {!selectedReport.loading && !selectedReport.error && (
                <>
                  {selectedReport.kind === "html" ? (
                    <div className="rounded-xl border border-[#1d1f28] bg-white p-2">
                      <iframe
                        title={selectedReport.title}
                        srcDoc={buildInlineHtmlFrame(selectedReport.rawText)}
                        className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#1d1f28] bg-[#0d0e12] p-4">
                      <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-amber-300">
                        {selectedReport.kind === "xml"
                          ? "XML source"
                          : "Report content"}
                      </div>
                      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-6 text-slate-300">
                        {prettifyReport(
                          selectedReport.rawText,
                          selectedReport.kind,
                        ) || selectedReport.rawText}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#1d1f28] bg-[#0b0d12] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-white">
        {value}
      </div>
    </div>
  );
}

function getFilingDisplayLabel(filing: SECFiling) {
  if (filing.form) return filing.form;

  const url = filing.filingUrl ?? filing.reportUrl ?? "";
  const lastSegment = url.split("/").filter(Boolean).at(-1) ?? "Filing";
  const clean = decodeURIComponent(lastSegment).replace(/\.[^.]+$/, "");

  return clean || "Filing";
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

function summarizeFiling(filing: SECFiling): string[] | null {
  const reportUrl = filing.reportUrl ?? filing.filingUrl;
  if (!reportUrl) return null;

  try {
    const url = new URL(reportUrl);
    const filename = url.pathname.split("/").filter(Boolean).at(-1) ?? "report";
    const lower = filename.toLowerCase();

    if (lower.includes("4") || filing.form?.includes("4")) {
      return [
        `Form 4 filing for ${filing.symbol ?? "this issuer"}`,
        `Filed on ${formatDate(filing.filedDate)}`,
        `Access number: ${filing.accessNumber ?? "not available"}`,
      ];
    }

    return [
      `Filing type: ${filing.form ?? "document"}`,
      `Filed on ${formatDate(filing.filedDate)}`,
      `Report URL available for review`,
    ];
  } catch {
    return [
      `Filing type: ${filing.form ?? "document"}`,
      `Filed on ${formatDate(filing.filedDate)}`,
      `Report URL available for review`,
    ];
  }
}

function prettifyReport(rawText: string, kind: "xml" | "html" | "text") {
  if (!rawText) return "";

  if (kind === "xml") {
    try {
      const parser = new DOMParser();
      const document = parser.parseFromString(rawText, "application/xml");
      const parseError = document.querySelector("parsererror");

      if (parseError) {
        return rawText;
      }

      const issuer = document.querySelector("issuerName")?.textContent?.trim();
      const ticker = document
        .querySelector("issuerTradingSymbol")
        ?.textContent?.trim();
      const owner = document.querySelector("rptOwnerName")?.textContent?.trim();
      const title = document.querySelector("officerTitle")?.textContent?.trim();
      const date = document
        .querySelector("transactionDate value")
        ?.textContent?.trim();
      const security = document
        .querySelector("securityTitle value")
        ?.textContent?.trim();
      const code = document
        .querySelector("transactionCode")
        ?.textContent?.trim();
      const shares = document
        .querySelector("transactionShares value")
        ?.textContent?.trim();
      const price = document
        .querySelector("transactionPricePerShare value")
        ?.textContent?.trim();
      const ownedAfter = document
        .querySelector("sharesOwnedFollowingTransaction value")
        ?.textContent?.trim();
      const notes = Array.from(document.querySelectorAll("footnote"))
        .map((item) => item.textContent?.trim())
        .filter(Boolean)
        .slice(0, 6);

      const lines = [
        `Issuer: ${issuer ?? "N/A"}`,
        `Ticker: ${ticker ?? "N/A"}`,
        `Reporting owner: ${owner ?? "N/A"}`,
        `Title: ${title ?? "N/A"}`,
        `Transaction date: ${date ?? "N/A"}`,
        `Security: ${security ?? "N/A"}`,
        `Transaction code: ${code ?? "N/A"}`,
        `Shares: ${shares ?? "N/A"}`,
        `Price/share: ${price ?? "N/A"}`,
        `Owned following transaction: ${ownedAfter ?? "N/A"}`,
        "",
        "Notes:",
        ...notes.map((note) => `- ${note}`),
      ];

      return lines.join("\n");
    } catch {
      return rawText;
    }
  }

  if (kind === "html") {
    return rawText;
  }

  return rawText.trim();
}

function summarizeXmlReport(rawText: string, fallback: string[]) {
  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(rawText, "application/xml");
    if (document.querySelector("parsererror")) {
      return fallback;
    }

    const issuer = document.querySelector("issuerName")?.textContent?.trim();
    const ticker = document
      .querySelector("issuerTradingSymbol")
      ?.textContent?.trim();
    const owner = document.querySelector("rptOwnerName")?.textContent?.trim();
    const title = document.querySelector("officerTitle")?.textContent?.trim();
    const shares = document
      .querySelector("transactionShares value")
      ?.textContent?.trim();
    const date = document
      .querySelector("transactionDate value")
      ?.textContent?.trim();

    return [
      `Issuer: ${issuer ?? "N/A"}`,
      `Ticker: ${ticker ?? "N/A"}`,
      `Owner: ${owner ?? "N/A"}`,
      `Title: ${title ?? "N/A"}`,
      `Date: ${date ?? "N/A"}`,
      `Shares: ${shares ?? "N/A"}`,
    ];
  } catch {
    return fallback;
  }
}

function buildInlineHtmlFrame(rawText: string) {
  const safeHtml = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #dfe7f1; padding: 8px 10px; text-align: left; }
          pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; }
          .info { color: #0f172a; font-weight: 700; }
        </style>
      </head>
      <body>
        ${safeHtml}
      </body>
    </html>`;
}
