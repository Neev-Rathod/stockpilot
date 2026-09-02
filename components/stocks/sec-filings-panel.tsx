"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search, ChevronDown, ChevronRight, ExternalLink, ShieldAlert } from "lucide-react";
import { getSECFilings, type SECFiling } from "@/lib/finnhub/client";
import type { FilingAnalysis } from "@/lib/sec-analysis";
import { formatCompact } from "@/lib/format";
import { Panel, Button, Badge, EmptyState, Skeleton } from "@/components/ui/kit";

const PAGE_SIZE = 10;

type ReportState = {
  loading: boolean;
  error?: string;
  kind: "xml" | "html" | "text";
  rawText: string;
};

function filingKey(f: SECFiling, index: number): string {
  return f.accessNumber ?? f.reportUrl ?? f.filingUrl ?? `idx-${index}`;
}

export function SECFilingsPanel({ symbol }: { symbol?: string }) {
  const [selectedSymbol, setSelectedSymbol] = useState(symbol?.toUpperCase() ?? "AAPL");
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [report, setReport] = useState<ReportState | null>(null);
  const [highlightTerms, setHighlightTerms] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<FilingAnalysis | null>(null);
  const pendingOpen = useRef<{ accessNumber?: string | null; reportUrl?: string | null } | null>(null);

  useEffect(() => {
    if (symbol) setSelectedSymbol(symbol.toUpperCase());
  }, [symbol]);

  const { data: filings = [], isLoading } = useQuery({
    queryKey: ["sec-filings", selectedSymbol],
    queryFn: () => getSECFilings({ symbol: selectedSymbol }),
    staleTime: 60 * 60 * 1000,
    enabled: Boolean(selectedSymbol),
  });

  const totalPages = Math.max(1, Math.ceil(filings.length / PAGE_SIZE));
  const pageFilings = useMemo(
    () => filings.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filings, page],
  );

  // WebMCP tool → open a specific filing, highlight it, show the scorecard.
  useEffect(() => {
    function onAnalyze(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      if (detail.symbol) setSelectedSymbol(String(detail.symbol).toUpperCase());
      setHighlightTerms(Array.isArray(detail.highlight) ? detail.highlight.map(String) : []);
      setAnalysis(detail.analysis ?? null);
      pendingOpen.current = { accessNumber: detail.accessNumber, reportUrl: detail.reportUrl };
    }
    window.addEventListener("stockpilot:sec-analyze", onAnalyze);
    return () => window.removeEventListener("stockpilot:sec-analyze", onAnalyze);
  }, []);

  // Resolve a pending agent-triggered open once the right filings have loaded.
  useEffect(() => {
    const pending = pendingOpen.current;
    if (!pending || filings.length === 0) return;
    const idx = filings.findIndex(
      (f) =>
        (pending.accessNumber && f.accessNumber === pending.accessNumber) ||
        (pending.reportUrl && (f.reportUrl === pending.reportUrl || f.filingUrl === pending.reportUrl)),
    );
    const target = idx >= 0 ? idx : 0;
    setPage(Math.floor(target / PAGE_SIZE));
    setExpandedKey(filingKey(filings[target], target));
    pendingOpen.current = null;
  }, [filings]);

  // Fetch the report whenever a filing is expanded.
  useEffect(() => {
    if (!expandedKey) {
      setReport(null);
      return;
    }
    const index = filings.findIndex((f, i) => filingKey(f, i) === expandedKey);
    const filing = index >= 0 ? filings[index] : null;
    const url = filing?.reportUrl ?? filing?.filingUrl;
    if (!url) {
      setReport({ loading: false, error: "No report URL for this filing.", kind: "text", rawText: "" });
      return;
    }
    let cancelled = false;
    setReport({ loading: true, kind: "text", rawText: "" });
    fetch(`/api/sec/report?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((payload: { error?: string; kind?: ReportState["kind"]; rawText?: string }) => {
        if (cancelled) return;
        if (payload.error) {
          setReport({ loading: false, error: payload.error, kind: "text", rawText: "" });
          return;
        }
        setReport({ loading: false, kind: payload.kind ?? "text", rawText: payload.rawText ?? "" });
      })
      .catch((e) => {
        if (!cancelled) setReport({ loading: false, error: String(e), kind: "text", rawText: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [expandedKey, filings]);

  function toggle(f: SECFiling, index: number) {
    const key = filingKey(f, index);
    setExpandedKey((cur) => (cur === key ? null : key));
    if (expandedKey !== key) {
      setHighlightTerms([]);
      setAnalysis(null);
    }
  }

  return (
    <Panel padded={false}>
      <div className="flex flex-col gap-3 border-b border-hairline p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent">SEC filings</div>
          <h2 className="mt-0.5 text-lg font-bold text-txt">Latest filing activity</h2>
        </div>
        {!symbol && (
          <label className="flex items-center gap-2 rounded-lg border border-hairline bg-elevated px-3 py-2 text-xs text-txt-dim">
            <Search className="h-3.5 w-3.5 text-txt-mute" />
            <input
              value={selectedSymbol}
              onChange={(e) => {
                setSelectedSymbol(e.target.value.trim().toUpperCase());
                setPage(0);
                setExpandedKey(null);
              }}
              placeholder="Symbol"
              className="w-24 bg-transparent font-mono text-sm text-txt outline-none placeholder:text-txt-mute"
            />
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filings.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={`No filings for ${selectedSymbol}`}
          hint="Try another symbol, or add a FINNHUB_API_KEY to enable filings."
        />
      ) : (
        <>
          <div className="divide-y divide-hairline">
            {pageFilings.map((filing, i) => {
              const index = page * PAGE_SIZE + i;
              const key = filingKey(filing, index);
              const open = expandedKey === key;
              const hasReport = Boolean(filing.reportUrl || filing.filingUrl);
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => hasReport && toggle(filing, index)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-elevated disabled:cursor-default"
                    disabled={!hasReport}
                  >
                    <div className="flex items-center gap-3">
                      {hasReport ? (
                        open ? <ChevronDown className="h-4 w-4 text-txt-mute" /> : <ChevronRight className="h-4 w-4 text-txt-mute" />
                      ) : (
                        <span className="w-4" />
                      )}
                      <Badge tone="accent">{filing.form ?? "Filing"}</Badge>
                      <div>
                        <div className="font-mono text-sm font-semibold text-txt">{filing.symbol ?? selectedSymbol}</div>
                        <div className="text-[11px] text-txt-mute">Filed {formatDate(filing.filedDate)} · Acc# {filing.accessNumber ?? "—"}</div>
                      </div>
                    </div>
                    {filing.filingUrl && (
                      <a
                        href={filing.filingUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-hover"
                      >
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </button>

                  {open && (
                    <div className="space-y-4 border-t border-hairline bg-app/40 p-5">
                      {analysis && analysis.symbol === (filing.symbol ?? selectedSymbol) && (
                        <RiskScorecard analysis={analysis} />
                      )}
                      <ReportView report={report} terms={highlightTerms} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
              <span className="text-xs text-txt-mute">
                Page {page + 1} of {totalPages} · {filings.length} filings
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => { setPage((p) => Math.max(0, p - 1)); setExpandedKey(null); }}>
                  Prev
                </Button>
                <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => { setPage((p) => Math.min(totalPages - 1, p + 1)); setExpandedKey(null); }}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Risk scorecard ─────────────────────────────────────────────────────────
function RiskScorecard({ analysis }: { analysis: FilingAnalysis }) {
  const tone = analysis.rating === "Low" ? "up" : analysis.rating === "High" ? "down" : "accent";
  const rec = analysis.recommendation;
  const totalRec = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const bullPct = rec && totalRec ? Math.round(((rec.strongBuy + rec.buy) / totalRec) * 100) : null;

  return (
    <div className="rounded-xl border border-hairline bg-panel p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent">
        <ShieldAlert className="h-3.5 w-3.5" /> AI risk & fundamentals
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div>
          <div className="font-mono text-3xl font-bold tnum text-txt">{analysis.score}<span className="text-base text-txt-mute">/100</span></div>
          <Badge tone={tone as "up" | "down" | "accent"}>{analysis.rating} risk</Badge>
        </div>
        <div className="flex-1 space-y-2 min-w-[220px]">
          <Bar label="Volatility" value={analysis.components.volatility} note={`${analysis.volatility}% annualized`} />
          <Bar label="Drawdown" value={analysis.components.drawdown} note={`${analysis.maxDrawdown}% max`} />
          {analysis.components.sentiment != null && (
            <Bar label="Analyst risk" value={analysis.components.sentiment} note={bullPct != null ? `${bullPct}% bullish` : ""} />
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-2 border-t border-hairline pt-3 text-xs text-txt-dim sm:grid-cols-3">
        <Fact label="Market cap" value={analysis.marketCap ? `$${formatCompact(analysis.marketCap * 1_000_000)}` : "—"} />
        <Fact label="Industry" value={analysis.industry ?? "—"} />
        <Fact label="Analysts" value={totalRec ? String(totalRec) : "—"} />
      </div>
    </div>
  );
}

function Bar({ label, value, note }: { label: string; value: number; note?: string }) {
  const color = value < 34 ? "var(--up)" : value < 67 ? "var(--accent)" : "var(--down)";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-txt-dim">{label}</span>
        <span className="text-txt-mute">{note}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-txt-mute">{label}</div>
      <div className="mt-0.5 truncate font-mono text-txt">{value}</div>
    </div>
  );
}

// ── Report viewer (inline, highlighted) ──────────────────────────────────────
function ReportView({ report, terms }: { report: ReportState | null; terms: string[] }) {
  if (!report || report.loading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (report.error) {
    return <div className="rounded-lg border border-down/30 bg-[color:rgba(234,57,67,0.08)] p-3 text-sm text-down">{report.error}</div>;
  }

  const regex = buildHighlightRegex(terms);

  if (report.kind === "html") {
    const doc = buildHtmlDoc(highlightHtml(sanitizeHtml(report.rawText), regex));
    return (
      <div className="overflow-hidden rounded-lg border border-hairline">
        <iframe title="SEC report" sandbox="" srcDoc={doc} className="h-[560px] w-full bg-white" />
      </div>
    );
  }

  const text = highlightText(report.rawText || "No report content.", regex);
  return (
    <pre
      className="sp-report max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-hairline bg-app p-4 text-[12px] leading-6 text-txt-dim"
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}

// ── Highlighting helpers ─────────────────────────────────────────────────────
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHighlightRegex(terms: string[]): RegExp {
  const auto = [
    "\\$[0-9][0-9,]*(?:\\.[0-9]+)?", // dollar amounts
    "[0-9]+(?:\\.[0-9]+)?%", // percentages
    "\\b\\d{4}-\\d{2}-\\d{2}\\b", // ISO dates
    "\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4}\\b",
    "\\b(?:risk|risks|litigation|lawsuit|adverse|decline|declined|uncertain|uncertainty|going concern|default|impairment|breach|investigation|liabilit\\w*|material weakness)\\b",
  ];
  const custom = terms.filter(Boolean).map((t) => escapeRegExp(t));
  return new RegExp(`(${[...custom, ...auto].join("|")})`, "gi");
}

const MARK_OPEN = '<mark class="sp-hl">';
const MARK_CLOSE = "</mark>";

// Tag-aware: only highlight text between tags, never inside them.
function highlightHtml(html: string, regex: RegExp): string {
  return html
    .split(/(<[^>]+>)/g)
    .map((token) => (token.startsWith("<") ? token : token.replace(regex, `${MARK_OPEN}$&${MARK_CLOSE}`)))
    .join("");
}

function highlightText(raw: string, regex: RegExp): string {
  return escapeHtml(raw).replace(regex, `${MARK_OPEN}$&${MARK_CLOSE}`);
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(iframe|link|meta|base|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function buildHtmlDoc(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; margin: 0; padding: 20px; background: #f7f8fa; color: #14171f; font-size: 13px; line-height: 1.6; }
      table { border-collapse: collapse; max-width: 100%; }
      td, th { border: 1px solid #d7dde6; padding: 6px 9px; }
      img { max-width: 100%; height: auto; }
      mark.sp-hl { background: #ffe14d; color: #14171f; padding: 0 2px; border-radius: 2px; }
    </style></head><body>${body}</body></html>`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
