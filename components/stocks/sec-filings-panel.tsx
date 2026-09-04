"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search, ChevronDown, ChevronRight, ChevronLeft, ExternalLink, ShieldAlert, Play, Pause, X } from "lucide-react";
import { getSECFilings, type SECFiling } from "@/lib/finnhub/client";
import type { FilingAnalysis } from "@/lib/sec-analysis";
import { importantSentences } from "@/lib/sec-highlights";
import { formatCompact } from "@/lib/format";
import { Panel, Button, Badge, EmptyState, Skeleton } from "@/components/ui/kit";

const PAGE_SIZE = 10;

type ReportState = {
  loading: boolean;
  error?: string;
  kind: "xml" | "html" | "text";
  rawText: string;
};

type ReviewFiling = {
  form: string | null;
  filedDate: string | null;
  accessNumber: string | null;
  reportUrl: string | null;
  filingUrl: string | null;
  takeaway: string;
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

  // Guided review: agent-triggered auto-advancing walkthrough of the latest filings.
  const [review, setReview] = useState<{ filings: ReviewFiling[]; agentTerms: string[] } | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [reviewDoc, setReviewDoc] = useState<{ loading: boolean; error?: string; html: string } | null>(null);

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

  // ── Shared state-setter: apply a sec-review payload whether it came from a
  //    live CustomEvent (panel already mounted) or from sessionStorage restore
  //    (panel just mounted after a cross-page navigation).
  function applyReview(d: Record<string, unknown>) {
    if (!d) return;
    if (d.symbol) setSelectedSymbol(String(d.symbol).toUpperCase());
    setAnalysis((d.analysis as FilingAnalysis) ?? null);
    const incomingFilings: ReviewFiling[] = Array.isArray(d.filings)
      ? (d.filings as ReviewFiling[])
      : [];
    if (!incomingFilings.length) return;
    setExpandedKey(null);
    setReview({
      filings: incomingFilings,
      agentTerms: Array.isArray(d.highlight)
        ? (d.highlight as unknown[]).map(String)
        : [],
    });
    setReviewIndex(0);
    setReviewPlaying(true);
  }

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

  // WebMCP tool → start a guided review (live path: panel already on screen).
  useEffect(() => {
    function onReview(event: Event) {
      applyReview((event as CustomEvent).detail);
    }
    window.addEventListener("stockpilot:sec-review", onReview);
    return () => window.removeEventListener("stockpilot:sec-review", onReview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: restore a pending review the tool stored before navigating here.
  // Calls applyReview directly — no CustomEvent re-dispatch, no timing race.
  useEffect(() => {
    const raw = sessionStorage.getItem("stockpilot:pending-sec-review");
    if (!raw) return;
    sessionStorage.removeItem("stockpilot:pending-sec-review");
    try {
      applyReview(JSON.parse(raw));
    } catch {
      // Malformed payload — ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazily fetch + highlight the current filing in the review.
  useEffect(() => {
    if (!review) {
      setReviewDoc(null);
      return;
    }
    const filing = review.filings[reviewIndex];
    const url = filing?.reportUrl ?? filing?.filingUrl;
    if (!url) {
      setReviewDoc({ loading: false, error: "No document available for this filing.", html: "" });
      return;
    }
    let cancelled = false;
    setReviewDoc({ loading: true, html: "" });
    fetch(`/api/sec/report?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((p: { error?: string; kind?: ReportState["kind"]; rawText?: string }) => {
        if (cancelled) return;
        if (p.error) {
          setReviewDoc({ loading: false, error: p.error, html: "" });
          return;
        }
        const kind = p.kind ?? "text";
        const rawText = p.rawText ?? "";

        // For plain-text filings, produce structured HTML first so the review
        // is readable; then highlight on top of it.
        let baseHtml: string;
        if (kind === "html") {
          baseHtml = sanitizeHtml(rawText);
        } else if (kind === "xml") {
          baseHtml =
            xmlToReadableHtml(rawText) ??
            `<pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(stripTags(rawText))}</pre>`;
        } else {
          baseHtml = secTextToHtml(rawText);
        }

        // For sentence extraction still use plain text
        const plain = toPlainText(rawText, kind).slice(0, 40000);
        const terms = [...importantSentences(plain), ...review.agentTerms];
        const regex = buildReviewRegex(terms.map((t) => escapeHtml(t)));
        const highlighted = highlightHtml(baseHtml, regex);
        setReviewDoc({ loading: false, html: buildHtmlDoc(highlighted) });
      })
      .catch((e) => {
        if (!cancelled) setReviewDoc({ loading: false, error: String(e), html: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [review, reviewIndex]);

  // Auto-advance once the current filing has rendered.
  useEffect(() => {
    if (!review || !reviewPlaying || !reviewDoc || reviewDoc.loading) return;
    const timer = window.setTimeout(() => {
      setReviewIndex((i) => {
        if (i < review.filings.length - 1) return i + 1;
        setReviewPlaying(false);
        return i;
      });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [review, reviewPlaying, reviewIndex, reviewDoc]);

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

      {review && (
        <div className="space-y-3 border-b border-hairline bg-app/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-accent">
              <span className="uppercase tracking-[0.18em]">Guided review</span>
              <span className="text-txt-mute">
                {reviewIndex + 1} / {review.filings.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setReviewIndex((i) => Math.max(0, i - 1))} disabled={reviewIndex === 0}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReviewPlaying((p) => !p)}>
                {reviewPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReviewIndex((i) => Math.min(review.filings.length - 1, i + 1))} disabled={reviewIndex >= review.filings.length - 1}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setReview(null); setReviewDoc(null); setReviewPlaying(false); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {analysis && <RiskScorecard analysis={analysis} />}

          {(() => {
            const f = review.filings[reviewIndex];
            return (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{f?.form ?? "Filing"}</Badge>
                  <div>
                    <div className="font-mono text-sm font-semibold text-txt">{f?.takeaway}</div>
                    <div className="text-[11px] text-txt-mute">Filed {formatDate(f?.filedDate ?? undefined)}</div>
                  </div>
                </div>
                {f?.filingUrl && (
                  <a href={f.filingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-hover">
                    Original <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            );
          })()}

          {reviewDoc?.loading ? (
            <Skeleton className="h-72 w-full" />
          ) : reviewDoc?.error ? (
            <div className="rounded-lg border border-down/30 bg-[color:rgba(234,57,67,0.08)] p-3 text-sm text-down">{reviewDoc.error}</div>
          ) : (
            <DocFrame doc={reviewDoc?.html ?? ""} height={420} />
          )}
        </div>
      )}

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
      {analysis.filings && analysis.filings.filingsAnalyzed > 0 && (
        <div className="mt-3 border-t border-hairline pt-3 text-[11px] text-txt-dim">
          <span className="font-semibold text-txt">Across {analysis.filings.filingsAnalyzed} recent filings:</span>{" "}
          insider buys {analysis.filings.buyTxns} · sells {analysis.filings.sellTxns} ·{" "}
          {analysis.filings.materialEvents} 8-K event{analysis.filings.materialEvents === 1 ? "" : "s"}
          {analysis.filingScore != null && (
            <>
              {" "}· filing risk <span className="font-mono text-txt">{analysis.filingScore}/100</span>
            </>
          )}
        </div>
      )}
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

  // HTML filings (10-K/10-Q) render as the document itself.
  if (report.kind === "html") {
    const doc = buildHtmlDoc(highlightHtml(sanitizeHtml(report.rawText), regex));
    return <DocFrame doc={doc} />;
  }

  // XML filings (Form 4/144) — render a readable document, not raw code.
  if (report.kind === "xml") {
    const readable =
      xmlToReadableHtml(report.rawText) ??
      `<pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(stripTags(report.rawText))}</pre>`;
    const doc = buildHtmlDoc(highlightHtml(readable, regex));
    return <DocFrame doc={doc} />;
  }

  // Plain-text filings (8-K cover pages, some 10-Q/10-K text returns, etc.)
  // Convert to structured readable HTML instead of a raw <pre> dump.
  const structuredHtml = secTextToHtml(report.rawText || "No report content.");
  const doc = buildHtmlDoc(highlightHtml(structuredHtml, regex));
  return <DocFrame doc={doc} />;
}

function DocFrame({ doc, height = 560 }: { doc: string; height?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <iframe title="SEC report" sandbox="" srcDoc={doc} className="w-full bg-white" style={{ height }} />
    </div>
  );
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Turn an SEC ownership (Form 4/144) XML doc into a readable HTML summary.
// Returns null if it doesn't look like an ownership filing (caller falls back).
function xmlToReadableHtml(xml: string): string | null {
  if (typeof window === "undefined" || !xml) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return null;
  }
  if (doc.querySelector("parsererror")) return null;
  const esc = (s: string) => escapeHtml(s ?? "");
  const text = (sel: string) => doc.querySelector(sel)?.textContent?.trim() ?? "";
  const issuer = text("issuerName");
  const owner = text("rptOwnerName");
  if (!issuer && !owner) return null; // not an ownership filing

  const ticker = text("issuerTradingSymbol");
  const title = text("officerTitle");
  const docType = text("documentType");
  const rows = [...doc.querySelectorAll("nonDerivativeTransaction, derivativeTransaction")]
    .map((t) => {
      const q = (s: string) => t.querySelector(s)?.textContent?.trim() ?? "";
      return {
        date: q("transactionDate value"),
        security: q("securityTitle value"),
        code: q("transactionCoding transactionCode") || q("transactionCode"),
        shares: q("transactionShares value"),
        price: q("transactionPricePerShare value"),
        owned: q("sharesOwnedFollowingTransaction value"),
      };
    })
    .map(
      (t) =>
        `<tr><td>${esc(t.date)}</td><td>${esc(t.security)}</td><td>${esc(t.code)}</td><td>${esc(t.shares)}</td><td>${t.price ? "$" + esc(t.price) : ""}</td><td>${esc(t.owned)}</td></tr>`,
    )
    .join("");
  const footnotes = [...doc.querySelectorAll("footnote")]
    .map((f) => f.textContent?.trim())
    .filter(Boolean)
    .map((f) => `<li>${esc(f as string)}</li>`)
    .join("");

  return `
    <h2>SEC Form ${esc(docType || "4")} — Statement of Changes in Beneficial Ownership</h2>
    <p><strong>Issuer:</strong> ${esc(issuer)}${ticker ? ` (${esc(ticker)})` : ""}</p>
    <p><strong>Reporting owner:</strong> ${esc(owner)}${title ? ` — ${esc(title)}` : ""}</p>
    ${rows ? `<h3>Transactions</h3><table><thead><tr><th>Date</th><th>Security</th><th>Code</th><th>Shares</th><th>Price</th><th>Owned after</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No transaction lines in this filing.</p>"}
    ${footnotes ? `<h3>Footnotes</h3><ul>${footnotes}</ul>` : ""}
  `;
}

// ── Highlighting helpers ─────────────────────────────────────────────────────
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Highlighting is agent-driven: we only mark the exact phrases/sentences the
// agent passed via the tool's `highlight` argument. With no prompt (a manual
// open) there are no terms, so the document renders clean — no default noise.
function buildHighlightRegex(terms: string[]): RegExp | null {
  const custom = terms.filter(Boolean).map((t) => escapeRegExp(t));
  if (custom.length === 0) return null;
  return new RegExp(`(${custom.join("|")})`, "gi");
}

const REVIEW_FIGURES = ["\\$[0-9][0-9,]*(?:\\.[0-9]+)?", "[0-9]+(?:\\.[0-9]+)?%", "\\b\\d{4,}\\b"];
// The guided review always highlights concrete figures, plus the important
// sentences / agent terms passed in. Returns a regex even with no terms.
function buildReviewRegex(terms: string[]): RegExp {
  const parts = [...terms.filter(Boolean).map((t) => escapeRegExp(t)), ...REVIEW_FIGURES];
  return new RegExp(`(${parts.join("|")})`, "gi");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;|&lsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#\d+;/g, " ");
}

// Normalize a filing into clean, readable plain text for the guided review,
// where whole-sentence highlighting lands reliably (interleaved HTML doesn't).
function toPlainText(rawText: string, kind: ReportState["kind"]): string {
  if (kind === "xml") {
    const readable = xmlToReadableHtml(rawText);
    return decodeEntities(stripTags(readable ?? rawText));
  }
  if (kind === "html") return decodeEntities(stripTags(rawText));
  return rawText.replace(/\s+/g, " ").trim();
}

// Wrap each match in a <mark> carrying a staggered index (--i) so highlights
// animate in sequentially (see the sp-hl keyframes). Capped so it never drags.
const MAX_STAGGER = 40;
function markMatches(text: string, regex: RegExp, counter: { n: number }): string {
  return text.replace(regex, (m) => {
    const i = Math.min(counter.n++, MAX_STAGGER);
    return `<mark class="sp-hl" style="--i:${i}">${m}</mark>`;
  });
}

// Tag-aware: only highlight text between tags, never inside them.
function highlightHtml(html: string, regex: RegExp | null): string {
  if (!regex) return html;
  const counter = { n: 0 };
  return html
    .split(/(<[^>]+>)/g)
    .map((token) => (token.startsWith("<") ? token : markMatches(token, regex, counter)))
    .join("");
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

/**
 * secTextToHtml — convert a raw SEC plain-text filing into readable, structured
 * HTML. Handles 8-K cover pages, 10-Q/10-K text renditions, and XBRL-prefixed
 * documents (the header blob of CIK/member lines before the human-readable part).
 *
 * Strategy:
 *  1. Strip the machine-readable XBRL header block (lines before "UNITED STATES").
 *  2. Detect and tag section titles (ALL CAPS lines, "Item N.NN …", form headings).
 *  3. Detect two-column key/value pairs and render them as a definition list.
 *  4. Detect exhibit tables (lines like "99.1  Press release …").
 *  5. Detect signature blocks.
 *  6. Wrap everything else as paragraphs (collapsing blank-line groups).
 */
function secTextToHtml(raw: string): string {
  // ── 1. Strip XBRL header blob ──────────────────────────────────────────
  // The blob looks like:
  //   aapl-20260730 bazadebezol…
  //   false 0000320193 …
  //   0000320193 us-gaap:CommonStockMember …
  // Stop stripping when we hit "UNITED STATES" or the main form heading.
  const HUMAN_START = /^(UNITED STATES|FORM\s+\d|SECURITIES AND EXCHANGE|Item\s+\d)/im;
  const startIdx = HUMAN_START.exec(raw)?.index ?? 0;
  const text = raw.slice(startIdx).trim();

  // ── 2. Tokenise into lines ─────────────────────────────────────────────
  const lines = text.split(/\r?\n/);

  // ── 3. Classify and render each line ──────────────────────────────────
  const parts: string[] = [];
  let i = 0;

  // helpers
  const esc = escapeHtml;

  // Patterns
  const BLANK = /^\s*$/;
  const FORM_TITLE = /^(UNITED STATES|SECURITIES AND EXCHANGE COMMISSION|FORM\s+\d+[-\w]*|CURRENT REPORT|ANNUAL REPORT|QUARTERLY REPORT)/i;
  const SECTION_CAPS = /^[A-Z][A-Z\s\d,.\-–—:()&/]{8,}$/; // all-caps heading
  const ITEM_HEADING = /^(Item\s+\d+[\d.]*\s+\S.{4,})/i;
  const SEC_HEADING  = /^(SIGNATURE|EXHIBIT INDEX|FINANCIAL STATEMENTS|PART\s+[IVX]+\b)/i;
  const KV_LINE      = /^([A-Za-z][A-Za-z\s()./,#-]{2,40})\s{2,}(.+)$/;
  const EXHIBIT_LINE = /^(\d{2,3}(?:\.\d+)?)\s{2,}(.+)$/;
  const DASHES       = /^[-─═*]{10,}$/;
  const BY_LINE      = /^By:\s*\/s\//i;
  const SIGNATURE_BLOCK = /^\s*\/s\//i;

  // Track whether we are inside a <ul> exhibit list or <dl> kv block
  let inList: "ul" | "dl" | null = null;

  function closeList() {
    if (inList === "ul") { parts.push("</ul>"); inList = null; }
    if (inList === "dl") { parts.push("</dl>"); inList = null; }
  }

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    // blank line — close any open list, emit a paragraph break
    if (BLANK.test(line)) {
      closeList();
      i++;
      continue;
    }

    // horizontal rules / decorative dashes — skip
    if (DASHES.test(line.trim())) { i++; continue; }

    const trimmed = line.trim();

    // Form-level title (centered uppercase banner lines)
    if (FORM_TITLE.test(trimmed)) {
      closeList();
      parts.push(`<h1 class="form-title">${esc(trimmed)}</h1>`);
      i++;
      continue;
    }

    // SEC section headings (SIGNATURE, PART I, EXHIBIT INDEX …)
    if (SEC_HEADING.test(trimmed)) {
      closeList();
      parts.push(`<h2 class="sec-section">${esc(trimmed)}</h2>`);
      i++;
      continue;
    }

    // Item N.NN headings
    if (ITEM_HEADING.test(trimmed)) {
      closeList();
      parts.push(`<h3 class="item-heading">${esc(trimmed)}</h3>`);
      i++;
      continue;
    }

    // All-caps headings (company name banner, "CHECK THE APPROPRIATE BOX", etc.)
    if (SECTION_CAPS.test(trimmed) && trimmed.length < 120) {
      closeList();
      // Very short all-caps that look like company names → h2; otherwise h3
      const tag = trimmed.length < 50 ? "h2" : "h3";
      parts.push(`<${tag} class="caps-heading">${esc(trimmed)}</${tag}>`);
      i++;
      continue;
    }

    // Exhibit table rows: "99.1   Press release issued by Apple…"
    const exhibitMatch = EXHIBIT_LINE.exec(trimmed);
    if (exhibitMatch && !KV_LINE.test(trimmed)) {
      if (inList !== "ul") {
        closeList();
        parts.push('<ul class="exhibit-list">');
        inList = "ul";
      }
      parts.push(`<li><span class="exhibit-num">${esc(exhibitMatch[1])}</span> ${esc(exhibitMatch[2])}</li>`);
      i++;
      continue;
    }

    // Key–value pairs: "Commission File Number    001-36743"
    const kvMatch = KV_LINE.exec(trimmed);
    if (kvMatch && trimmed.length < 200) {
      if (inList !== "dl") {
        closeList();
        parts.push('<dl class="kv-block">');
        inList = "dl";
      }
      parts.push(`<div class="kv-row"><dt>${esc(kvMatch[1].trim())}</dt><dd>${esc(kvMatch[2].trim())}</dd></div>`);
      i++;
      continue;
    }

    // Signature lines
    if (BY_LINE.test(trimmed) || SIGNATURE_BLOCK.test(trimmed)) {
      closeList();
      parts.push(`<p class="sig-line">${esc(trimmed)}</p>`);
      i++;
      continue;
    }

    // ── Paragraph accumulation ─────────────────────────────────────────
    // Collect consecutive non-blank, non-heading lines into one <p>.
    closeList();
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      !BLANK.test(lines[i]) &&
      !FORM_TITLE.test(lines[i].trim()) &&
      !SEC_HEADING.test(lines[i].trim()) &&
      !ITEM_HEADING.test(lines[i].trim()) &&
      !DASHES.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trimEnd());
      i++;
    }
    if (paraLines.length) {
      const content = paraLines.map((l) => esc(l.trim())).join(" ");
      parts.push(`<p>${content}</p>`);
    }
  }

  closeList();
  return parts.join("\n");
}

function buildHtmlDoc(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0; padding: 24px 28px; background: #f8f9fb; color: #1a1d25;
        font-size: 13px; line-height: 1.65;
      }

      /* ── Typography ── */
      h1.form-title {
        text-align: center; font-size: 15px; font-weight: 700; letter-spacing: .04em;
        text-transform: uppercase; color: #0f1117; margin: 20px 0 8px;
        border-bottom: 2px solid #0057e7; padding-bottom: 6px;
      }
      h2.sec-section {
        font-size: 13px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .06em; color: #0057e7; margin: 22px 0 6px;
        border-left: 3px solid #0057e7; padding-left: 8px;
      }
      h2.caps-heading {
        font-size: 13px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .05em; color: #0f1117; margin: 18px 0 5px;
      }
      h3.item-heading {
        font-size: 13px; font-weight: 600; color: #14171f; margin: 18px 0 5px;
        padding: 6px 10px; background: #edf1fb; border-radius: 4px;
      }
      h3.caps-heading {
        font-size: 12px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .04em; color: #555c70; margin: 14px 0 4px;
      }
      p { margin: 0 0 8px; color: #2b3040; }

      /* ── Key-value pairs (company details, address, identifiers) ── */
      dl.kv-block { margin: 10px 0 14px; display: grid; gap: 0; }
      .kv-row {
        display: grid; grid-template-columns: minmax(160px, 260px) 1fr;
        gap: 0 16px; padding: 4px 8px; border-bottom: 1px solid #e4e7ef;
      }
      .kv-row:first-child { border-top: 1px solid #e4e7ef; }
      dt { font-weight: 600; color: #555c70; font-size: 11.5px; }
      dd { margin: 0; font-family: "SF Mono", "Consolas", monospace; font-size: 11.5px; color: #1a1d25; }

      /* ── Exhibit list ── */
      ul.exhibit-list { list-style: none; margin: 8px 0 14px; padding: 0; }
      ul.exhibit-list li {
        padding: 5px 10px; border-bottom: 1px solid #e4e7ef;
        font-size: 12px; color: #2b3040;
      }
      ul.exhibit-list li:first-child { border-top: 1px solid #e4e7ef; }
      .exhibit-num {
        display: inline-block; min-width: 44px;
        font-family: "SF Mono", "Consolas", monospace;
        font-size: 11px; font-weight: 600; color: #0057e7; margin-right: 10px;
      }

      /* ── Signature lines ── */
      p.sig-line { font-style: italic; color: #555c70; font-size: 12px; margin: 4px 0; }

      /* ── Tables (fallback for any inline tables in HTML filings) ── */
      table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12px; }
      td, th {
        border: 1px solid #d0d5e3; padding: 5px 10px; vertical-align: top; text-align: left;
      }
      th { background: #edf1fb; font-weight: 600; }
      tr:nth-child(even) td { background: #f4f5f9; }

      /* ── Images ── */
      img { max-width: 100%; height: auto; }

      /* ── AI highlights ── */
      mark.sp-hl {
        color: #14171f; padding: 0 2px; border-radius: 2px; background: #ffe14d;
        animation: sp-hl-in 0.35s ease both;
        animation-delay: calc(var(--i, 0) * 0.06s);
      }
      @keyframes sp-hl-in {
        from { background: transparent; box-shadow: 0 0 0 rgba(245,183,10,0); }
        50%  { box-shadow: 0 0 8px rgba(245,183,10,0.7); }
        to   { background: #ffe14d; box-shadow: 0 0 0 rgba(245,183,10,0); }
      }
      @media (prefers-reduced-motion: reduce) { mark.sp-hl { animation: none; } }
    </style></head><body>${body}</body></html>`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
