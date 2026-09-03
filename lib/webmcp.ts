import {
  getMultipleQuotes,
  getStockQuote,
  getCompanyNews,
  getMarketNews,
  getCompanyProfile,
  getSECFilings,
  getRecommendationTrends,
  getFinancialsReported,
  getEarningsCalendar,
} from "@/lib/finnhub/client";
import { getLocalOhlcv } from "@/lib/ohlcv";
import {
  annualizedVolatility,
  maxDrawdown,
  riskScore as computeRiskScore,
  compositeRisk,
  type FilingAnalysis,
  type FilingSignals,
} from "@/lib/sec-analysis";
import { pearson, pivotLevels, localSwings, runBacktest } from "@/lib/ta";
import {
  analyzeComparison,
  detectPatternsForSymbol,
  type ChartDrawing,
  type ComparisonChartStyle,
  type ChartToolId,
} from "@/lib/comparison-analysis";
import { usePortfolioStore } from "@/lib/portfolio-store";
import type {
  ElliottWaveResult,
  ChartPatternType,
  ElliottWaveType,
  ScreenerResult,
  PortfolioRiskMetrics,
  BacktestResult,
} from "@/lib/types";

export type WebMcpTool = {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
  execute: (
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }> | unknown;
};

export type WebMcpToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: WebMcpTool) => Promise<unknown> | unknown;
      getTools?: () => Promise<WebMcpTool[]>;
    };
  }
}

// ─── Shared universe of stocks ────────────────────────────────────────────────
// The 10 symbols we hold real OHLCV data for in Supabase. Betas are computed
// from ~2,500 days of daily returns vs an equal-weight basket of this universe
// (see scripts/compute-betas — not guessed).
const STOCK_UNIVERSE = [
  { symbol: "AAPL", sector: "Technology", beta: 0.84 },
  { symbol: "MSFT", sector: "Technology", beta: 0.81 },
  { symbol: "AMD", sector: "Technology", beta: 1.56 },
  { symbol: "CSCO", sector: "Technology", beta: 0.59 },
  { symbol: "QCOM", sector: "Technology", beta: 1.05 },
  { symbol: "AMZN", sector: "Consumer Cyclical", beta: 0.96 },
  { symbol: "TSLA", sector: "Consumer Cyclical", beta: 1.5 },
  { symbol: "SBUX", sector: "Consumer Cyclical", beta: 0.64 },
  { symbol: "META", sector: "Communication Services", beta: 1.04 },
  { symbol: "NFLX", sector: "Communication Services", beta: 1.0 },
];

function normalizeSecReportText(rawText: string, kind: string): string {
  const text = (rawText ?? "").trim();
  if (!text) {
    return "No SEC report payload was returned.";
  }

  if (kind === "xml") {
    try {
      if (typeof DOMParser !== "undefined") {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "application/xml");
        const parseError = doc.querySelector("parsererror");

        if (!parseError) {
          const issuer =
            doc.querySelector("issuerName")?.textContent?.trim() ?? "N/A";
          const ticker =
            doc.querySelector("issuerTradingSymbol")?.textContent?.trim() ??
            "N/A";
          const owner =
            doc.querySelector("rptOwnerName")?.textContent?.trim() ?? "N/A";
          const title =
            doc.querySelector("officerTitle")?.textContent?.trim() ?? "N/A";
          const date =
            doc.querySelector("transactionDate value")?.textContent?.trim() ??
            "N/A";
          const security =
            doc.querySelector("securityTitle value")?.textContent?.trim() ??
            "N/A";
          const code =
            doc.querySelector("transactionCode")?.textContent?.trim() ?? "N/A";
          const shares =
            doc.querySelector("transactionShares value")?.textContent?.trim() ??
            "N/A";
          const price =
            doc
              .querySelector("transactionPricePerShare value")
              ?.textContent?.trim() ?? "N/A";
          const ownedAfter =
            doc
              .querySelector("sharesOwnedFollowingTransaction value")
              ?.textContent?.trim() ?? "N/A";
          const footnotes = Array.from(doc.querySelectorAll("footnote"))
            .map((node) => node.textContent?.trim())
            .filter(Boolean)
            .slice(0, 6);

          const lines = [
            "Important facts:",
            `Issuer: ${issuer}`,
            `Ticker: ${ticker}`,
            `Reporting owner: ${owner}`,
            `Officer title: ${title}`,
            `Transaction date: ${date}`,
            `Security: ${security}`,
            `Transaction code: ${code}`,
            `Shares: ${shares}`,
            `Price/share: ${price}`,
            `Owned after transaction: ${ownedAfter}`,
            "",
            "Footnotes:",
            ...footnotes.map((note) => `- ${note}`),
          ];

          return lines.join("\n");
        }
      }
    } catch {
      return text;
    }
  }

  return text.slice(0, 12000);
}

// ─── Tool Registry ─────────────────────────────────────────────────────────────
export const webMcpTools: WebMcpTool[] = [
  // ─── MARKET DATA ─────────────────────────────────────────────────────────────
  {
    name: "search_stock",
    category: "Market Data",
    description: "Search the stock universe for companies or symbols.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search text for symbol or company name",
        },
      },
      required: ["query"],
    },
    async execute(params) {
      const query = String(params.query ?? "")
        .trim()
        .toLowerCase();
      if (!query) return { content: [{ type: "text", text: "[]" }] };
      const results = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );
      const items = results.filter(
        (item) =>
          item.symbol.toLowerCase().includes(query) ||
          item.companyName.toLowerCase().includes(query),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    },
  },

  {
    name: "get_stock_details",
    category: "Market Data",
    description:
      "Retrieve a full stock quote, company profile, and metadata for a given ticker symbol.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Ticker symbol like AAPL or MSFT",
        },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      if (!symbol) return { content: [{ type: "text", text: "null" }] };
      const [quote, profile] = await Promise.all([
        getStockQuote(symbol),
        getCompanyProfile(symbol),
      ]);
      return {
        content: [
          { type: "text", text: JSON.stringify({ quote, profile }, null, 2) },
        ],
      };
    },
  },

  {
    name: "get_stock_news",
    category: "Market Data",
    description: "Fetch the latest news articles for a specific stock symbol.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol like AAPL" },
        days: {
          type: "number",
          description: "Number of past days to fetch news for (default 7)",
        },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const days = Number(params.days ?? 7);
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      const news = await getCompanyNews(symbol, fmt(from), fmt(to));
      return {
        content: [
          { type: "text", text: JSON.stringify(news.slice(0, 10), null, 2) },
        ],
      };
    },
  },

  {
    name: "analyze_sec_filings",
    category: "Market Data",
    description:
      "Fetch recent SEC filings for a symbol, pick the most material filing (largest report or latest), fetch the XML/HTML report, and return the normalized content for LLM analysis.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol like AAPL" },
        days: {
          type: "number",
          description: "Lookback window in days (default 30)",
        },
        limit: {
          type: "number",
          description: "Number of recent filings to consider (default 10)",
        },
        highlight: {
          type: "array",
          items: { type: "string" },
          description:
            "Key phrases or full sentences FROM the filing to highlight in yellow for the user — e.g. the specific risk statements, revenue drivers, guidance, or figures relevant to their question. Copy the exact text so it can be matched. If omitted, the report opens with no highlights.",
        },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "")
        .trim()
        .toUpperCase();
      if (!symbol) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "Missing symbol." }),
            },
          ],
        };
      }

      const days = Number(params.days ?? 30);
      const limit = Number(params.limit ?? 10);
      const highlight = Array.isArray(params.highlight)
        ? params.highlight.map((h) => String(h))
        : [];
      const to = new Date();
      const from = new Date(
        to.getTime() - Math.max(1, days) * 24 * 60 * 60 * 1000,
      );
      const filings = await getSECFilings({
        symbol,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      });

      const ranked = filings
        .slice(0, Math.max(1, limit))
        .map((filing) => {
          const form = (filing.form ?? "").toUpperCase();
          let score = 0;
          if (form.includes("10-K")) score += 100;
          if (form.includes("10-Q")) score += 95;
          if (form.includes("8-K")) score += 80;
          if (form.includes("4")) score += 55;
          if (form.includes("S-")) score += 60;
          if (form.includes("DEF")) score += 25;
          if (filing.reportUrl) score += 10;
          if (filing.filingUrl) score += 5;

          const filedDate = new Date(filing.filedDate ?? Date.now()).getTime();
          const recencyBoost = Math.max(
            0,
            30 - (Date.now() - filedDate) / 86_400_000,
          );
          score += recencyBoost;

          return { filing, score, filedDate };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.filedDate - a.filedDate;
        });

      const selectedFiling = ranked[0]?.filing ?? filings[0] ?? null;

      if (!selectedFiling) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol,
                  windowDays: days,
                  filings: [],
                  selected: null,
                  analysis: "No recent SEC filings were found for this symbol.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const reportUrl = selectedFiling.reportUrl ?? selectedFiling.filingUrl;
      let reportPayload: {
        kind?: string;
        rawText?: string;
        error?: string;
      } = { kind: "text", rawText: "No report text available." };

      if (reportUrl) {
        try {
          const response = await fetch(
            `/api/sec/report?url=${encodeURIComponent(reportUrl)}`,
          );
          reportPayload = (await response.json()) as typeof reportPayload;
        } catch {
          reportPayload = {
            kind: "text",
            rawText: "Unable to fetch report payload.",
            error: "Unable to fetch report payload.",
          };
        }
      }

      const normalizedText = normalizeSecReportText(
        reportPayload.rawText ?? "",
        reportPayload.kind ?? "text",
      );

      // ── StockPilot: risk score + inline UI highlight. Best-effort and fully
      // guarded so this addition can never break the existing tool output. ──
      let riskAnalysis: FilingAnalysis | null = null;
      try {
        const ohlcv = await getLocalOhlcv([symbol]);
        const closes = ohlcv[0]?.candles?.map((c) => c.close) ?? [];
        const [profile, recs] = await Promise.all([
          getCompanyProfile(symbol),
          getRecommendationTrends(symbol),
        ]);
        const latestRec = recs?.[0] ?? null;
        const totalRec = latestRec
          ? latestRec.strongBuy + latestRec.buy + latestRec.hold + latestRec.sell + latestRec.strongSell
          : 0;
        const bullishRatio =
          latestRec && totalRec > 0 ? (latestRec.strongBuy + latestRec.buy) / totalRec : null;
        const volatility = annualizedVolatility(closes);
        const drawdown = maxDrawdown(closes);
        const risk = computeRiskScore({ volatility, drawdown, bullishRatio });

        // ── Signals across the latest 10 filings ──────────────────────────
        const latest10 = filings.slice(0, 10);
        const materialEvents = latest10.filter((f) =>
          (f.form ?? "").toUpperCase().includes("8-K"),
        ).length;
        const form4s = latest10.filter((f) => (f.form ?? "").includes("4"));
        let buyTxns = 0;
        let sellTxns = 0;
        if (typeof window !== "undefined" && form4s.length) {
          const buyCodes = new Set(["P", "A"]);
          const sellCodes = new Set(["S", "D", "F"]);
          const reports = await Promise.all(
            form4s.map(async (f) => {
              const u = f.reportUrl ?? f.filingUrl;
              if (!u) return "";
              try {
                const res = await fetch(`/api/sec/report?url=${encodeURIComponent(u)}`);
                const json = (await res.json()) as { rawText?: string };
                return typeof json.rawText === "string" ? json.rawText : "";
              } catch {
                return "";
              }
            }),
          );
          for (const xml of reports) {
            if (!xml) continue;
            try {
              const doc = new DOMParser().parseFromString(xml, "application/xml");
              doc
                .querySelectorAll("nonDerivativeTransaction, derivativeTransaction")
                .forEach((t) => {
                  const code = (
                    t.querySelector("transactionCoding transactionCode") ||
                    t.querySelector("transactionCode")
                  )?.textContent
                    ?.trim()
                    .toUpperCase();
                  if (code && buyCodes.has(code)) buyTxns++;
                  else if (code && sellCodes.has(code)) sellTxns++;
                });
            } catch {
              // ignore unparseable filings
            }
          }
        }
        const filingSignals: FilingSignals = {
          filingsAnalyzed: latest10.length,
          buyTxns,
          sellTxns,
          materialEvents,
          form4Count: form4s.length,
        };
        const composite = compositeRisk(risk.score, filingSignals);

        riskAnalysis = {
          symbol,
          score: composite.score,
          rating: composite.rating,
          volatility: +volatility.toFixed(1),
          maxDrawdown: +drawdown.toFixed(1),
          components: risk.components,
          marketCap: profile?.marketCapitalization ?? null,
          industry: profile?.finnhubIndustry ?? null,
          recommendation: latestRec
            ? {
                strongBuy: latestRec.strongBuy,
                buy: latestRec.buy,
                hold: latestRec.hold,
                sell: latestRec.sell,
                strongSell: latestRec.strongSell,
              }
            : null,
          filings: filingSignals,
          filingScore: composite.filingScore,
        };
        if (typeof window !== "undefined") {
          const takeawayFor = (form?: string | null): string => {
            const fm = (form ?? "").toUpperCase();
            if (fm.includes("10-K")) return "Annual report (10-K)";
            if (fm.includes("10-Q")) return "Quarterly report (10-Q)";
            if (fm.includes("8-K")) return "Material event (8-K)";
            if (fm.includes("144")) return "Proposed insider sale (Form 144)";
            if (fm.includes("3")) return "Initial insider ownership (Form 3)";
            if (fm.includes("5")) return "Annual insider ownership (Form 5)";
            if (fm.includes("4")) return "Insider transaction (Form 4)";
            if (fm.startsWith("S-") || fm.includes("S-1")) return "Securities registration";
            if (fm.includes("DEF")) return "Proxy statement";
            return form ?? "Filing";
          };
          window.dispatchEvent(
            new CustomEvent("stockpilot:sec-review", {
              detail: {
                symbol,
                highlight,
                analysis: riskAnalysis,
                filings: latest10.map((f) => ({
                  form: f.form ?? null,
                  filedDate: f.filedDate ?? null,
                  accessNumber: f.accessNumber ?? null,
                  reportUrl: f.reportUrl ?? null,
                  filingUrl: f.filingUrl ?? null,
                  takeaway: takeawayFor(f.form),
                })),
              },
            }),
          );
        }
      } catch {
        // Risk scoring / UI highlight is best-effort; never break the tool.
      }

      const keyFacts = [
        `symbol=${selectedFiling.symbol ?? symbol}`,
        `form=${selectedFiling.form ?? "N/A"}`,
        `filedDate=${selectedFiling.filedDate ?? "N/A"}`,
        `acceptedDate=${selectedFiling.acceptedDate ?? "N/A"}`,
        `accessNumber=${selectedFiling.accessNumber ?? "N/A"}`,
      ];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbol,
                windowDays: days,
                filingsConsidered: filings.slice(0, Math.max(1, limit)).length,
                latestFilings: filings.slice(0, 10).map((f) => ({
                  form: f.form ?? null,
                  filedDate: f.filedDate ?? null,
                  accessNumber: f.accessNumber ?? null,
                })),
                selected: selectedFiling,
                riskAnalysis,
                chosenReason: `Selected the highest-ranked material filing by form size and recency.`,
                keyFacts,
                report: {
                  kind: reportPayload.kind ?? "text",
                  sourceUrl: reportUrl ?? null,
                  error: reportPayload.error ?? null,
                  normalizedText,
                  rawText: reportPayload.rawText ?? "",
                },
                analysisPrompt: [
                  "Please summarize the most important events in this SEC filing.",
                  "Highlight any trading, governance, leadership, or capital allocation changes.",
                  "Call out risk factors, legal disclosures, or unusual ownership activity.",
                  "Keep the answer concise but specific to executives, capital structure, and operational impact.",
                ].join(" "),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_market_news_summary",
    category: "Market Data",
    description:
      "Fetch a digest of the latest general market news across all categories.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "News category: general | forex | crypto | merger",
        },
      },
    },
    async execute(params) {
      const category = String(params.category ?? "general") as
        | "general"
        | "forex"
        | "crypto"
        | "merger";
      const validCategories = ["general", "forex", "crypto", "merger"];
      const cat = validCategories.includes(category) ? category : "general";
      const news = await getMarketNews(
        cat as "general" | "forex" | "crypto" | "merger",
      );
      return {
        content: [
          { type: "text", text: JSON.stringify(news.slice(0, 8), null, 2) },
        ],
      };
    },
  },

  {
    name: "rank_stocks",
    category: "Market Data",
    description:
      "Rank the curated stock universe by a supported metric (performance, volume, price).",
    inputSchema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          description: "Metric: performance | volume | price",
        },
        limit: {
          type: "number",
          description: "How many stocks to return (default 10)",
        },
      },
      required: ["metric"],
    },
    async execute(params) {
      const metric = String(params.metric ?? "performance");
      const limit = Number(params.limit ?? 10);
      const quotes = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );
      const ranked = quotes
        .map((q) => ({
          symbol: q.symbol,
          companyName: q.companyName,
          price: q.price,
          percentChange: q.percentChange,
          metricValue:
            metric === "volume"
              ? (q.volume ?? 0)
              : metric === "price"
                ? q.price
                : q.percentChange,
        }))
        .sort((a, b) => Number(b.metricValue) - Number(a.metricValue))
        .slice(0, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(ranked, null, 2) }],
      };
    },
  },

  {
    name: "screen_stocks",
    category: "Market Data",
    description:
      "Screen stocks from the universe by price range, percent change, or sector.",
    inputSchema: {
      type: "object",
      properties: {
        minPrice: { type: "number", description: "Minimum stock price" },
        maxPrice: { type: "number", description: "Maximum stock price" },
        minPercentChange: {
          type: "number",
          description: "Minimum daily % change",
        },
        maxPercentChange: {
          type: "number",
          description: "Maximum daily % change",
        },
        sector: {
          type: "string",
          description: "Sector filter e.g. Technology, Healthcare, Energy",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
    },
    async execute(params) {
      const minPrice = params.minPrice != null ? Number(params.minPrice) : null;
      const maxPrice = params.maxPrice != null ? Number(params.maxPrice) : null;
      const minPct =
        params.minPercentChange != null
          ? Number(params.minPercentChange)
          : null;
      const maxPct =
        params.maxPercentChange != null
          ? Number(params.maxPercentChange)
          : null;
      const sector = params.sector ? String(params.sector).toLowerCase() : null;
      const limit = Number(params.limit ?? 10);

      const quotes = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );
      let results: ScreenerResult[] = quotes.map((q) => {
        const meta = STOCK_UNIVERSE.find((s) => s.symbol === q.symbol);
        return {
          symbol: q.symbol,
          companyName: q.companyName,
          price: q.price,
          percentChange: q.percentChange,
          sector: meta?.sector,
          score: q.percentChange,
        };
      });

      if (minPrice !== null)
        results = results.filter((r) => r.price >= minPrice);
      if (maxPrice !== null)
        results = results.filter((r) => r.price <= maxPrice);
      if (minPct !== null)
        results = results.filter((r) => r.percentChange >= minPct);
      if (maxPct !== null)
        results = results.filter((r) => r.percentChange <= maxPct);
      if (sector)
        results = results.filter((r) =>
          r.sector?.toLowerCase().includes(sector),
        );

      results = results.sort((a, b) => b.score - a.score).slice(0, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  },

  {
    name: "get_sector_performance",
    category: "Market Data",
    description:
      "Return a breakdown of average performance by market sector from the tracked universe.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const quotes = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );
      const sectorMap: Record<string, number[]> = {};
      quotes.forEach((q) => {
        const meta = STOCK_UNIVERSE.find((s) => s.symbol === q.symbol);
        const sec = meta?.sector ?? "Unknown";
        if (!sectorMap[sec]) sectorMap[sec] = [];
        sectorMap[sec].push(q.percentChange);
      });
      const sectors = Object.entries(sectorMap)
        .map(([sector, changes]) => ({
          sector,
          avgChange: +(
            changes.reduce((a, b) => a + b, 0) / changes.length
          ).toFixed(2),
          stockCount: changes.length,
          performance:
            changes.reduce((a, b) => a + b, 0) / changes.length >= 0
              ? "positive"
              : "negative",
        }))
        .sort((a, b) => b.avgChange - a.avgChange);
      return {
        content: [{ type: "text", text: JSON.stringify(sectors, null, 2) }],
      };
    },
  },

  {
    name: "get_market_sentiment",
    category: "Market Data",
    description:
      "Return an AI-estimated market sentiment score (0-100) based on price momentum across the universe.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const quotes = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );
      const avgChange =
        quotes.reduce((s, q) => s + q.percentChange, 0) / (quotes.length || 1);
      const bullCount = quotes.filter((q) => q.percentChange > 0).length;
      const bearCount = quotes.filter((q) => q.percentChange < 0).length;
      const score = Math.round(50 + avgChange * 5);
      const clamped = Math.max(0, Math.min(100, score));
      const label =
        clamped > 65
          ? "Greed"
          : clamped > 55
            ? "Mild Greed"
            : clamped < 35
              ? "Fear"
              : clamped < 45
                ? "Mild Fear"
                : "Neutral";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sentimentScore: clamped,
                label,
                avgDailyChange: +avgChange.toFixed(3),
                bullishStocks: bullCount,
                bearishStocks: bearCount,
                summary: `Market is showing ${label} sentiment with an average daily move of ${avgChange.toFixed(2)}%.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_top_performers",
    category: "Market Data",
    description:
      "Return the top N best-performing stocks from the universe over the session.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of top performers to return (default 5)",
        },
        direction: {
          type: "string",
          description: "gainers | losers (default: gainers)",
        },
      },
    },
    async execute(params) {
      const limit = Number(params.limit ?? 5);
      const direction = String(params.direction ?? "gainers");
      const quotes = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );
      const sorted = [...quotes].sort((a, b) =>
        direction === "losers"
          ? a.percentChange - b.percentChange
          : b.percentChange - a.percentChange,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(sorted.slice(0, limit), null, 2),
          },
        ],
      };
    },
  },

  {
    name: "compare_stocks",
    category: "Market Data",
    description:
      "Compare multiple stocks side by side — price, change, and relative performance summary.",
    inputSchema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Symbols to compare (2–5)",
        },
      },
      required: ["symbols"],
    },
    async execute(params) {
      const symbols = Array.isArray(params.symbols)
        ? params.symbols.map((s) => String(s).toUpperCase()).slice(0, 5)
        : [];
      if (!symbols.length) return { content: [{ type: "text", text: "[]" }] };
      const quotes = await getMultipleQuotes(symbols);
      const best = quotes.reduce(
        (a, b) => (b.percentChange > a.percentChange ? b : a),
        quotes[0],
      );
      const worst = quotes.reduce(
        (a, b) => (b.percentChange < a.percentChange ? b : a),
        quotes[0],
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                comparison: quotes,
                bestPerformer: best?.symbol,
                worstPerformer: worst?.symbol,
                spread: +(
                  (best?.percentChange ?? 0) - (worst?.percentChange ?? 0)
                ).toFixed(2),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_correlation",
    category: "Market Data",
    description:
      "Estimate the price correlation between two stocks based on their beta values. Returns a correlation coefficient from -1 to 1.",
    inputSchema: {
      type: "object",
      properties: {
        symbol1: { type: "string", description: "First ticker" },
        symbol2: { type: "string", description: "Second ticker" },
      },
      required: ["symbol1", "symbol2"],
    },
    async execute(params) {
      const s1 = String(params.symbol1 ?? "").toUpperCase();
      const s2 = String(params.symbol2 ?? "").toUpperCase();
      const meta1 = STOCK_UNIVERSE.find((s) => s.symbol === s1);
      const meta2 = STOCK_UNIVERSE.find((s) => s.symbol === s2);
      const sector1 = meta1?.sector ?? "Unknown";
      const sector2 = meta2?.sector ?? "Unknown";
      const sameSector = sector1 === sector2;

      // Real Pearson correlation of daily returns over the overlapping window.
      const series = await getLocalOhlcv([s1, s2]);
      const c1 = series.find((x) => x.symbol === s1)?.candles ?? [];
      const c2 = series.find((x) => x.symbol === s2)?.candles ?? [];
      const m1 = new Map(c1.map((c) => [c.date, c.close]));
      const m2 = new Map(c2.map((c) => [c.date, c.close]));
      const dates = [...m1.keys()].filter((d) => m2.has(d)).sort();
      const r1: number[] = [];
      const r2: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        const a0 = m1.get(dates[i - 1])!;
        const a1 = m1.get(dates[i])!;
        const b0 = m2.get(dates[i - 1])!;
        const b1 = m2.get(dates[i])!;
        if (a0 > 0 && b0 > 0) {
          r1.push((a1 - a0) / a0);
          r2.push((b1 - b0) / b0);
        }
      }
      const correlation = +pearson(r1, r2).toFixed(3);
      const label =
        correlation > 0.7
          ? "High positive"
          : correlation > 0.4
            ? "Moderate positive"
            : correlation > 0
              ? "Low positive"
              : correlation > -0.4
                ? "Low negative"
                : "High negative";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbol1: s1,
                symbol2: s2,
                correlation,
                label,
                sampleDays: r1.length,
                sector1,
                sector2,
                sameSector,
                method: "Pearson correlation of daily returns from historical closes.",
                interpretation:
                  r1.length < 20
                    ? `Not enough overlapping history to compute a reliable correlation for ${s1} and ${s2}.`
                    : `${s1} and ${s2} have ${label.toLowerCase()} correlation (r=${correlation}) over ${r1.length} trading days. ${sameSector ? "Same sector." : "Different sectors — better for diversification."}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  // ─── CHART PATTERN DETECTION ──────────────────────────────────────────────────
  {
    name: "detect_chart_pattern",
    category: "Chart Patterns",
    description: `Detect technical chart patterns on a stock. Supported patterns: head_and_shoulders, inverse_head_and_shoulders, abcd, xabcd, cypher, triangle_ascending, triangle_descending, triangle_symmetrical, three_drives, double_top, double_bottom.`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol to analyze" },
        pattern: {
          type: "string",
          description:
            "Pattern to detect (e.g. head_and_shoulders, xabcd, cypher)",
        },
      },
      required: ["symbol", "pattern"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const pattern = String(
        params.pattern ?? "",
      ).toLowerCase() as ChartPatternType;
      const validPatterns: ChartPatternType[] = [
        "head_and_shoulders",
        "inverse_head_and_shoulders",
        "abcd",
        "xabcd",
        "cypher",
        "triangle_ascending",
        "triangle_descending",
        "triangle_symmetrical",
        "three_drives",
        "double_top",
        "double_bottom",
      ];
      if (!validPatterns.includes(pattern)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown pattern '${pattern}'. Valid: ${validPatterns.join(", ")}`,
              }),
            },
          ],
        };
      }
      const series = await getLocalOhlcv([symbol]);
      const candles = series[0]?.candles ?? [];
      const detected = detectPatternsForSymbol(symbol, candles);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
      const wanted = norm(pattern);
      const match =
        detected.find((p) => norm(p.name).includes(wanted) || wanted.includes(norm(p.name))) ?? null;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbol,
                requestedPattern: pattern,
                present: Boolean(match),
                match,
                detectedPatterns: detected.map((p) => ({
                  name: p.name,
                  direction: p.direction,
                  confidence: p.confidence,
                  entryPrice: p.entryPrice ?? null,
                  targetPrice: p.targetPrice ?? null,
                  stopLoss: p.stopLoss ?? null,
                  rationale: p.rationale,
                })),
                method: "Detected from real swing structure in the historical price series.",
                note: match
                  ? `A ${match.name} pattern is present on ${symbol}.`
                  : detected.length
                    ? `No ${pattern} detected on ${symbol}; ${detected.length} other pattern(s) were found.`
                    : `No significant chart patterns detected on ${symbol} in the available history.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "detect_elliott_wave",
    category: "Chart Patterns",
    description: `Detect Elliott Wave structures on a stock chart. Types: impulse_12345 (1-2-3-4-5), correction_abc (A-B-C), triangle_abcde (A-B-C-D-E), double_combo_wxy (W-X-Y), triple_combo_wxyxz (W-X-Y-X-Z).`,
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol to analyze" },
        wave_type: {
          type: "string",
          description:
            "Wave type: impulse_12345 | correction_abc | triangle_abcde | double_combo_wxy | triple_combo_wxyxz",
        },
      },
      required: ["symbol", "wave_type"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const waveType = String(
        params.wave_type ?? "",
      ).toLowerCase() as ElliottWaveType;
      const validWaves: ElliottWaveType[] = [
        "impulse_12345",
        "correction_abc",
        "triangle_abcde",
        "double_combo_wxy",
        "triple_combo_wxyxz",
      ];
      if (!validWaves.includes(waveType)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown wave type '${waveType}'. Valid: ${validWaves.join(", ")}`,
              }),
            },
          ],
        };
      }
      const series = await getLocalOhlcv([symbol]);
      const candles = series[0]?.candles ?? [];
      const closes = candles.map((c) => c.close);
      const window = Math.max(3, Math.floor(closes.length / 40));
      const swings = localSwings(closes, window);
      const labelsByType: Record<ElliottWaveType, string[]> = {
        impulse_12345: ["Wave 1", "Wave 2", "Wave 3", "Wave 4", "Wave 5"],
        correction_abc: ["Wave A", "Wave B", "Wave C"],
        triangle_abcde: ["Wave A", "Wave B", "Wave C", "Wave D", "Wave E"],
        double_combo_wxy: ["Wave W", "Wave X", "Wave Y"],
        triple_combo_wxyxz: ["Wave W", "Wave X", "Wave Y", "Wave X2", "Wave Z"],
      };
      const labels = labelsByType[waveType];
      const chosen = swings.slice(-labels.length);
      const waves = labels.map((label, i) => {
        const sw = chosen[i];
        return {
          label,
          priceLevel: sw ? +sw.price.toFixed(2) : 0,
          description: sw
            ? `${sw.type === "high" ? "Swing high" : "Swing low"} from real price action`
            : "Insufficient swing data",
        };
      });
      const confidence = Math.round(Math.min(90, (chosen.length / labels.length) * 80 + 10));
      const lastPrice = closes[closes.length - 1] ?? 0;
      const firstWave = waves[0]?.priceLevel ?? lastPrice;
      const projectedTarget =
        firstWave > 0
          ? +(lastPrice * (1 + ((lastPrice - firstWave) / firstWave) * 0.5)).toFixed(2)
          : null;
      const result: ElliottWaveResult = {
        symbol,
        waveType,
        confidence,
        currentWave: waves[waves.length - 1]?.label ?? labels[labels.length - 1],
        description: `Elliott ${waveType} labelled onto the ${chosen.length} most recent swing pivots detected in ${symbol}'s real price history. Wave labelling is heuristic; pivot prices are actual.`,
        waves,
        projectedTarget,
        detectedAt: new Date().toISOString(),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },

  {
    name: "get_support_resistance",
    category: "Chart Patterns",
    description:
      "Calculate key support and resistance price levels for a stock based on current price.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const series = await getLocalOhlcv([symbol]);
      const candles = series[0]?.candles ?? [];
      const last = candles[candles.length - 1];
      if (!last) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `No price history for ${symbol}.` }) }],
        };
      }
      const piv = pivotLevels(last.high, last.low, last.close);
      const recent = candles.slice(-60);
      const recentHigh = Math.max(...recent.map((c) => c.high));
      const recentLow = Math.min(...recent.map((c) => c.low));
      const levels = {
        symbol,
        currentPrice: +last.close.toFixed(2),
        method: "Classic floor-trader pivots from the latest bar, plus the 60-day range.",
        pivotPoint: +piv.pivot.toFixed(2),
        support: [
          { level: +piv.s1.toFixed(2), strength: "strong", type: "S1" },
          { level: +piv.s2.toFixed(2), strength: "moderate", type: "S2" },
          { level: +piv.s3.toFixed(2), strength: "weak", type: "S3" },
        ],
        resistance: [
          { level: +piv.r1.toFixed(2), strength: "strong", type: "R1" },
          { level: +piv.r2.toFixed(2), strength: "moderate", type: "R2" },
          { level: +piv.r3.toFixed(2), strength: "weak", type: "R3" },
        ],
        recent60DayHigh: +recentHigh.toFixed(2),
        recent60DayLow: +recentLow.toFixed(2),
        notes: `S1 at $${piv.s1.toFixed(2)} and R1 at $${piv.r1.toFixed(2)} are the immediate pivot levels for ${symbol}. 60-day range: $${recentLow.toFixed(2)}–$${recentHigh.toFixed(2)}.`,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(levels, null, 2) }],
      };
    },
  },

  {
    name: "get_trend_direction",
    category: "Chart Patterns",
    description:
      "Determine the current trend direction for a stock: Uptrend, Downtrend, or Sideways consolidation.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const quote = await getStockQuote(symbol);
      const change = quote?.percentChange ?? 0;
      const price = quote?.price ?? 100;
      const meta = STOCK_UNIVERSE.find((s) => s.symbol === symbol);
      const beta = meta?.beta ?? 1.0;
      const trend =
        change > 0.5 ? "Uptrend" : change < -0.5 ? "Downtrend" : "Sideways";
      const strength =
        Math.abs(change) > 1.5
          ? "Strong"
          : Math.abs(change) > 0.5
            ? "Moderate"
            : "Weak";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbol,
                price,
                percentChange: change,
                trend,
                strength,
                beta,
                summary: `${symbol} is in a ${strength} ${trend} with a daily change of ${change.toFixed(2)}%. Beta ${beta} indicates ${beta > 1.5 ? "high" : beta > 1 ? "moderate" : "low"} volatility relative to the market.`,
                tradingAdvice:
                  trend === "Uptrend"
                    ? "Consider buying dips, use trailing stops."
                    : trend === "Downtrend"
                      ? "Wait for reversal confirmation before buying."
                      : "Range-bound — consider buying support, selling resistance.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  // ─── PORTFOLIO ────────────────────────────────────────────────────────────────
  {
    name: "get_portfolio",
    category: "Portfolio",
    description:
      "Return the full virtual portfolio state including balance, holdings, and transaction history.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const state = usePortfolioStore.getState();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                virtualBalance: state.virtualBalance,
                holdings: state.holdings,
                transactions: state.transactions.slice(0, 20),
                holdingsCount: state.holdings.length,
                transactionCount: state.transactions.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "analyze_portfolio",
    category: "Portfolio",
    description:
      "Return portfolio performance statistics: total value, P&L, return %, and holding breakdown.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const state = usePortfolioStore.getState();
      const quotes =
        state.holdings.length > 0
          ? await getMultipleQuotes(state.holdings.map((h) => h.symbol))
          : [];
      const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

      const holdingDetails = state.holdings.map((h) => {
        const currentPrice = priceMap.get(h.symbol) ?? h.averageBuyPrice;
        const currentValue = currentPrice * h.quantity;
        const costBasis = h.averageBuyPrice * h.quantity;
        const pnl = currentValue - costBasis;
        const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        return {
          symbol: h.symbol,
          quantity: h.quantity,
          averageBuyPrice: h.averageBuyPrice,
          currentPrice,
          currentValue,
          costBasis,
          pnl: +pnl.toFixed(2),
          pnlPct: +pnlPct.toFixed(2),
        };
      });

      const totalValue = holdingDetails.reduce((s, h) => s + h.currentValue, 0);
      const totalCost = holdingDetails.reduce((s, h) => s + h.costBasis, 0);
      const totalPnl = totalValue - totalCost;
      const returnPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                virtualBalance: state.virtualBalance,
                portfolioValue: +totalValue.toFixed(2),
                totalAssets: +(state.virtualBalance + totalValue).toFixed(2),
                totalCost: +totalCost.toFixed(2),
                totalPnl: +totalPnl.toFixed(2),
                returnPct: +returnPct.toFixed(2),
                holdings: holdingDetails,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_portfolio_risk",
    category: "Portfolio",
    description:
      "Analyze portfolio risk: concentration, diversification score, estimated beta, and sector exposure.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const state = usePortfolioStore.getState();
      if (state.holdings.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Portfolio is empty. Buy some stocks first.",
              }),
            },
          ],
        };
      }
      const quotes = await getMultipleQuotes(
        state.holdings.map((h) => h.symbol),
      );
      const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));
      const holdingValues = state.holdings.map((h) => ({
        symbol: h.symbol,
        value: (priceMap.get(h.symbol) ?? h.averageBuyPrice) * h.quantity,
      }));
      const totalValue = holdingValues.reduce((s, h) => s + h.value, 0);
      const weights = holdingValues.map((h) => ({
        symbol: h.symbol,
        weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
      }));
      const topWeight = Math.max(...weights.map((w) => w.weight));
      const concentration: "low" | "medium" | "high" =
        topWeight > 50 ? "high" : topWeight > 30 ? "medium" : "low";
      const sectorExposure: Record<string, number> = {};
      weights.forEach(({ symbol, weight }) => {
        const meta = STOCK_UNIVERSE.find((s) => s.symbol === symbol);
        const sec = meta?.sector ?? "Unknown";
        sectorExposure[sec] = (sectorExposure[sec] ?? 0) + weight;
      });
      const estBeta = state.holdings.reduce((sum, h) => {
        const meta = STOCK_UNIVERSE.find((s) => s.symbol === h.symbol);
        const w = weights.find((w) => w.symbol === h.symbol)?.weight ?? 0;
        return sum + (meta?.beta ?? 1.0) * (w / 100);
      }, 0);
      const diversificationScore = Math.round(
        Math.min(
          100,
          (Object.keys(sectorExposure).length / 6) * 100 - (topWeight - 20),
        ),
      );

      const result: PortfolioRiskMetrics = {
        totalValue: +totalValue.toFixed(2),
        concentrationRisk: concentration,
        topHoldingWeight: +topWeight.toFixed(1),
        diversificationScore: Math.max(0, diversificationScore),
        estimatedBeta: +estBeta.toFixed(2),
        sectorExposure: Object.fromEntries(
          Object.entries(sectorExposure).map(([k, v]) => [k, +v.toFixed(1)]),
        ),
        recommendation:
          concentration === "high"
            ? "Portfolio is highly concentrated. Consider diversifying across more sectors and stocks."
            : concentration === "medium"
              ? "Moderate concentration. Adding 2-3 more stocks in different sectors would improve risk balance."
              : "Good diversification. Portfolio is well-spread across sectors.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },

  {
    name: "buy_stock",
    category: "Portfolio",
    description:
      "Simulate buying a stock with virtual funds from the portfolio balance.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol to buy" },
        quantity: { type: "number", description: "Number of shares to buy" },
      },
      required: ["symbol", "quantity"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const quantity = Number(params.quantity ?? 0);
      const quote = await getStockQuote(symbol);
      const price = quote?.price ?? 0;
      if (!price)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `Could not fetch price for ${symbol}.`,
              }),
            },
          ],
        };
      const result = usePortfolioStore
        .getState()
        .buyStock(symbol, quote?.companyName ?? symbol, quantity, price);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...result,
                symbol,
                quantity,
                price,
                totalCost: +(quantity * price).toFixed(2),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "sell_stock",
    category: "Portfolio",
    description: "Simulate selling a stock from the virtual portfolio.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol to sell" },
        quantity: { type: "number", description: "Number of shares to sell" },
      },
      required: ["symbol", "quantity"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const quantity = Number(params.quantity ?? 0);
      const quote = await getStockQuote(symbol);
      const price = quote?.price ?? 0;
      const result = usePortfolioStore
        .getState()
        .sellStock(symbol, quantity, price);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...result,
                symbol,
                quantity,
                price,
                proceeds: +(quantity * price).toFixed(2),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "auto_invest",
    category: "Portfolio",
    description:
      "Automatically invest a budget across top stocks by strategy. Strategy options: momentum (top gainers), diversified (spread across sectors), conservative (low beta), aggressive (high beta/growth).",
    inputSchema: {
      type: "object",
      properties: {
        budget: {
          type: "number",
          description: "Total amount to invest in USD",
        },
        strategy: {
          type: "string",
          description: "momentum | diversified | conservative | aggressive",
        },
        stock_count: {
          type: "number",
          description: "Number of stocks to spread across (default 5)",
        },
      },
      required: ["budget", "strategy"],
    },
    async execute(params) {
      const budget = Number(params.budget ?? 0);
      const strategy = String(params.strategy ?? "diversified").toLowerCase();
      const count = Math.min(Number(params.stock_count ?? 5), 10);
      const state = usePortfolioStore.getState();

      if (budget <= 0)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "Budget must be positive.",
              }),
            },
          ],
        };
      if (budget > state.virtualBalance)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `Insufficient balance. Available: $${state.virtualBalance.toFixed(2)}`,
              }),
            },
          ],
        };

      const quotes = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );
      let selected = [...quotes];

      if (strategy === "momentum") {
        selected = selected
          .sort((a, b) => b.percentChange - a.percentChange)
          .slice(0, count);
      } else if (strategy === "conservative") {
        selected = selected
          .sort((a, b) => {
            const ba =
              STOCK_UNIVERSE.find((s) => s.symbol === a.symbol)?.beta ?? 1;
            const bb =
              STOCK_UNIVERSE.find((s) => s.symbol === b.symbol)?.beta ?? 1;
            return ba - bb;
          })
          .slice(0, count);
      } else if (strategy === "aggressive") {
        selected = selected
          .sort((a, b) => {
            const ba =
              STOCK_UNIVERSE.find((s) => s.symbol === a.symbol)?.beta ?? 1;
            const bb =
              STOCK_UNIVERSE.find((s) => s.symbol === b.symbol)?.beta ?? 1;
            return bb - ba;
          })
          .slice(0, count);
      } else {
        // diversified — pick one per sector
        const seen = new Set<string>();
        selected = selected
          .filter((q) => {
            const meta = STOCK_UNIVERSE.find((s) => s.symbol === q.symbol);
            if (!meta || seen.has(meta.sector)) return false;
            seen.add(meta.sector);
            return true;
          })
          .slice(0, count);
      }

      const perStock = budget / selected.length;
      const results: {
        symbol: string;
        quantity: number;
        price: number;
        invested: number;
        result: { success: boolean; message: string };
      }[] = [];

      for (const q of selected) {
        if (q.price <= 0) continue;
        const qty = Math.floor(perStock / q.price);
        if (qty < 1) continue;
        const res = usePortfolioStore
          .getState()
          .buyStock(q.symbol, q.companyName, qty, q.price);
        results.push({
          symbol: q.symbol,
          quantity: qty,
          price: q.price,
          invested: +(qty * q.price).toFixed(2),
          result: res,
        });
      }

      const totalInvested = results.reduce((s, r) => s + r.invested, 0);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                strategy,
                budget,
                totalInvested: +totalInvested.toFixed(2),
                remaining: +(budget - totalInvested).toFixed(2),
                positions: results,
                summary: `Invested $${totalInvested.toFixed(2)} across ${results.length} stocks using ${strategy} strategy.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "optimize_portfolio",
    category: "Portfolio",
    description:
      "Suggest an optimal stock allocation for a given budget to maximize simulated return with risk management.",
    inputSchema: {
      type: "object",
      properties: {
        budget: {
          type: "number",
          description: "Total budget to allocate in USD",
        },
        risk_level: {
          type: "string",
          description: "low | medium | high (default medium)",
        },
      },
      required: ["budget"],
    },
    async execute(params) {
      const budget = Number(params.budget ?? 0);
      const risk = String(params.risk_level ?? "medium").toLowerCase();
      const quotes = await getMultipleQuotes(
        STOCK_UNIVERSE.map((s) => s.symbol),
      );

      const scored = quotes
        .map((q) => {
          const meta = STOCK_UNIVERSE.find((s) => s.symbol === q.symbol);
          const beta = meta?.beta ?? 1.0;
          const riskScore =
            risk === "low"
              ? -Math.abs(beta - 0.7)
              : risk === "high"
                ? beta
                : -Math.abs(beta - 1.0);
          return {
            ...q,
            beta,
            sector: meta?.sector,
            score: q.percentChange * 0.5 + riskScore * 10,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      const totalScore = scored.reduce((s, q) => s + Math.max(0, q.score), 0);
      const allocation = scored.map((q) => {
        const weight =
          totalScore > 0
            ? Math.max(q.score, 0) / totalScore
            : 1 / scored.length;
        const amount = budget * weight;
        const quantity = q.price > 0 ? Math.floor(amount / q.price) : 0;
        return {
          symbol: q.symbol,
          sector: q.sector,
          beta: q.beta,
          allocationPct: +(weight * 100).toFixed(1),
          suggestedAmount: +amount.toFixed(2),
          estimatedShares: quantity,
          pricePerShare: q.price,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                budget,
                riskLevel: risk,
                allocation,
                totalAllocated: +allocation
                  .reduce((s, a) => s + a.estimatedShares * a.pricePerShare, 0)
                  .toFixed(2),
                tip: `Use 'auto_invest' with budget=${budget} and strategy='${risk === "low" ? "conservative" : risk === "high" ? "aggressive" : "diversified"}' to execute this plan.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "rebalance_portfolio",
    category: "Portfolio",
    description:
      "Suggest rebalancing actions to equalize holdings or match a target equal-weight allocation.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const state = usePortfolioStore.getState();
      if (state.holdings.length < 2) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Need at least 2 holdings to suggest rebalancing.",
              }),
            },
          ],
        };
      }
      const quotes = await getMultipleQuotes(
        state.holdings.map((h) => h.symbol),
      );
      const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));
      const holdingValues = state.holdings.map((h) => ({
        symbol: h.symbol,
        quantity: h.quantity,
        value: (priceMap.get(h.symbol) ?? h.averageBuyPrice) * h.quantity,
        currentPrice: priceMap.get(h.symbol) ?? h.averageBuyPrice,
      }));
      const totalValue = holdingValues.reduce((s, h) => s + h.value, 0);
      const targetValue = totalValue / state.holdings.length;
      const actions = holdingValues.map((h) => {
        const diff = h.value - targetValue;
        const sharesToAdjust = Math.floor(Math.abs(diff) / h.currentPrice);
        return {
          symbol: h.symbol,
          currentValue: +h.value.toFixed(2),
          targetValue: +targetValue.toFixed(2),
          action: diff > 0 ? "sell" : "buy",
          sharesToAdjust,
          estimatedDiff: +Math.abs(diff).toFixed(2),
        };
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalPortfolioValue: +totalValue.toFixed(2),
                equalWeightTarget: +targetValue.toFixed(2),
                rebalancingActions: actions,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "calculate_position_size",
    category: "Portfolio",
    description:
      "Calculate the optimal position size given account size, risk percentage, and stop-loss level.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        risk_percent: {
          type: "number",
          description: "Percentage of account to risk (e.g. 1 for 1%)",
        },
        stop_loss_price: {
          type: "number",
          description: "Stop-loss price level",
        },
      },
      required: ["symbol", "risk_percent", "stop_loss_price"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const riskPct = Number(params.risk_percent ?? 1);
      const stopLoss = Number(params.stop_loss_price ?? 0);
      const state = usePortfolioStore.getState();
      const quote = await getStockQuote(symbol);
      const currentPrice = quote?.price ?? 0;
      const accountSize = state.virtualBalance;
      const riskAmount = accountSize * (riskPct / 100);
      const priceRisk = currentPrice - stopLoss;
      if (priceRisk <= 0)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Stop-loss must be below current price.",
              }),
            },
          ],
        };
      const shares = Math.floor(riskAmount / priceRisk);
      const totalCost = shares * currentPrice;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbol,
                currentPrice,
                stopLoss,
                riskPercent: riskPct,
                accountSize,
                riskAmount: +riskAmount.toFixed(2),
                recommendedShares: shares,
                totalPositionCost: +totalCost.toFixed(2),
                positionSizePercent: +((totalCost / accountSize) * 100).toFixed(
                  1,
                ),
                riskRewardNote: `Risking $${riskAmount.toFixed(2)} (${riskPct}% of account) for a ${shares}-share position.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "calculate_profit_loss",
    category: "Portfolio",
    description:
      "Calculate the P&L for a position given an entry price, current price, and quantity.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        entry_price: {
          type: "number",
          description: "Price at which you bought",
        },
        quantity: { type: "number", description: "Number of shares held" },
      },
      required: ["symbol", "entry_price", "quantity"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const entryPrice = Number(params.entry_price ?? 0);
      const qty = Number(params.quantity ?? 0);
      const quote = await getStockQuote(symbol);
      const currentPrice = quote?.price ?? entryPrice;
      const pnl = (currentPrice - entryPrice) * qty;
      const pnlPct =
        entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                symbol,
                entryPrice,
                currentPrice,
                quantity: qty,
                costBasis: +(entryPrice * qty).toFixed(2),
                currentValue: +(currentPrice * qty).toFixed(2),
                pnl: +pnl.toFixed(2),
                pnlPercent: +pnlPct.toFixed(2),
                status: pnl >= 0 ? "profit" : "loss",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "suggest_diversification",
    category: "Portfolio",
    description:
      "Given current holdings, suggest new stocks to add for better sector diversification.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const state = usePortfolioStore.getState();
      const heldSymbols = new Set(state.holdings.map((h) => h.symbol));
      const heldSectors = new Set(
        state.holdings.map(
          (h) =>
            STOCK_UNIVERSE.find((s) => s.symbol === h.symbol)?.sector ??
            "Unknown",
        ),
      );
      const suggestions = STOCK_UNIVERSE.filter(
        (s) => !heldSymbols.has(s.symbol) && !heldSectors.has(s.sector),
      ).slice(0, 5);
      const quotes = suggestions.length
        ? await getMultipleQuotes(suggestions.map((s) => s.symbol))
        : [];
      const result = quotes.map((q) => ({
        ...q,
        sector: suggestions.find((s) => s.symbol === q.symbol)?.sector,
        reason: `Adds ${suggestions.find((s) => s.symbol === q.symbol)?.sector} sector exposure not currently in portfolio.`,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                currentSectors: [...heldSectors],
                missingSectors: STOCK_UNIVERSE.map((s) => s.sector)
                  .filter((sec) => !heldSectors.has(sec))
                  .filter((v, i, a) => a.indexOf(v) === i),
                suggestions: result,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "reset_portfolio",
    category: "Portfolio",
    description:
      "Reset the virtual portfolio to the starting $100,000 balance, clearing all holdings and transactions.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      usePortfolioStore.getState().resetPortfolio();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message:
                "Portfolio reset to $100,000 virtual balance. All holdings and transactions cleared.",
            }),
          },
        ],
      };
    },
  },

  // ─── WATCHLIST & ALERTS ───────────────────────────────────────────────────────
  {
    name: "get_watchlist",
    category: "Watchlist & Alerts",
    description:
      "Return the user's current watchlist (favorited stocks) with live quotes.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const state = usePortfolioStore.getState();
      const favorites = state.favorites;
      if (!favorites.length)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                watchlist: [],
                message: "Watchlist is empty.",
              }),
            },
          ],
        };
      const quotes = await getMultipleQuotes(favorites);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { watchlist: quotes, count: quotes.length },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "add_to_watchlist",
    category: "Watchlist & Alerts",
    description: "Add a stock symbol to the user's watchlist.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol to add" },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const state = usePortfolioStore.getState();
      if (state.favorites.includes(symbol)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `${symbol} is already in your watchlist.`,
              }),
            },
          ],
        };
      }
      state.toggleFavorite(symbol);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `${symbol} added to watchlist.`,
            }),
          },
        ],
      };
    },
  },

  {
    name: "remove_from_watchlist",
    category: "Watchlist & Alerts",
    description: "Remove a stock symbol from the user's watchlist.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol to remove" },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const state = usePortfolioStore.getState();
      if (!state.favorites.includes(symbol)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `${symbol} is not in your watchlist.`,
              }),
            },
          ],
        };
      }
      state.toggleFavorite(symbol);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `${symbol} removed from watchlist.`,
            }),
          },
        ],
      };
    },
  },

  {
    name: "set_price_alert",
    category: "Watchlist & Alerts",
    description:
      "Set a virtual price alert for a stock symbol. You will be notified when the AI next checks the price.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        target_price: {
          type: "number",
          description: "Target price to alert at",
        },
        condition: { type: "string", description: "above | below" },
      },
      required: ["symbol", "target_price", "condition"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const targetPrice = Number(params.target_price ?? 0);
      const condition = String(params.condition ?? "above") as
        | "above"
        | "below";
      if (!["above", "below"].includes(condition)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "Condition must be 'above' or 'below'.",
              }),
            },
          ],
        };
      }
      const result = usePortfolioStore
        .getState()
        .setAlert(symbol, targetPrice, condition);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },

  {
    name: "get_price_alerts",
    category: "Watchlist & Alerts",
    description:
      "Return all active price alerts with their current status checked against live prices.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const state = usePortfolioStore.getState();
      const alerts = state.alerts;
      if (!alerts.length)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                alerts: [],
                message: "No active alerts.",
              }),
            },
          ],
        };
      const symbols = [...new Set(alerts.map((a) => a.symbol))];
      const quotes = await getMultipleQuotes(symbols);
      const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));
      const withStatus = alerts.map((a) => {
        const currentPrice = priceMap.get(a.symbol) ?? null;
        const triggered =
          currentPrice !== null
            ? a.condition === "above"
              ? currentPrice >= a.targetPrice
              : currentPrice <= a.targetPrice
            : false;
        return { ...a, currentPrice, triggered };
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { alerts: withStatus, count: alerts.length },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  // ─── AI STRATEGY ──────────────────────────────────────────────────────────────
  {
    name: "backtest_strategy",
    category: "AI Strategy",
    description:
      "Simulate a simple trading strategy on a stock. Strategies: sma_crossover (20/50 day MA), rsi_mean_revert (buy oversold, sell overbought), buy_hold.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        strategy: {
          type: "string",
          description: "sma_crossover | rsi_mean_revert | buy_hold",
        },
        initial_capital: {
          type: "number",
          description: "Starting capital (default $10,000)",
        },
      },
      required: ["symbol", "strategy"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const strategy = String(params.strategy ?? "buy_hold").toLowerCase();
      const capital = Number(params.initial_capital ?? 10000);
      const series = await getLocalOhlcv([symbol]);
      const candles = series[0]?.candles ?? [];
      const closes = candles.map((c) => c.close);
      const metrics = runBacktest(closes, strategy);

      const result: BacktestResult = {
        symbol,
        strategy,
        startDate: candles[0]?.date ?? "",
        endDate: candles[candles.length - 1]?.date ?? "",
        totalReturn: metrics.totalReturn,
        annualizedReturn: metrics.annualizedReturn,
        maxDrawdown: metrics.maxDrawdown,
        winRate: metrics.winRate,
        totalTrades: metrics.totalTrades,
        sharpeRatio: metrics.sharpeRatio,
      };

      const finalCapital = capital * (1 + metrics.totalReturn / 100);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...result,
                initialCapital: capital,
                finalCapital: +finalCapital.toFixed(2),
                profitLoss: +(finalCapital - capital).toFixed(2),
                dataPoints: closes.length,
                disclaimer:
                  "Backtested on real historical daily closes from the dataset. Past performance does not guarantee future results.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  // ─── NAVIGATION ───────────────────────────────────────────────────────────────
  {
    name: "navigate_to",
    category: "Navigation",
    description:
      "Navigate the user's browser to a page in the StockPilot app. Pages: /, /markets, /portfolio, /watchlist, /orders, /news, /ipos, /compare, /stock/SYMBOL, /learn.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The page path to navigate to, e.g. /portfolio or /stock/AAPL",
        },
      },
      required: ["path"],
    },
    async execute(params) {
      const path = String(params.path ?? "/");
      const allowedPrefixes = [
        "/",
        "/markets",
        "/portfolio",
        "/watchlist",
        "/orders",
        "/news",
        "/ipos",
        "/compare",
        "/stock/",
        "/learn",
        "/admin",
      ];
      const isAllowed = allowedPrefixes.some(
        (p) => path === p || path.startsWith(p),
      );
      if (!isAllowed)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `Path '${path}' is not a recognized StockPilot page.`,
              }),
            },
          ],
        };
      if (typeof window !== "undefined") {
        window.location.href = path;
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Navigating to ${path}...`,
              path,
            }),
          },
        ],
      };
    },
  },

  {
    name: "open_stock",
    category: "Navigation",
    description:
      "Navigate directly to a stock's detail page with its live chart, profile, and buy/sell controls.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol to open" },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      if (!symbol)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "Symbol is required.",
              }),
            },
          ],
        };
      if (typeof window !== "undefined")
        window.location.href = `/stock/${symbol}`;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Opening ${symbol} stock page...`,
              path: `/stock/${symbol}`,
            }),
          },
        ],
      };
    },
  },

  {
    name: "open_compare",
    category: "Navigation",
    description:
      "Open the stock comparison page, optionally with pre-selected symbols to compare.",
    inputSchema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Symbols to pre-select in compare (optional)",
        },
      },
    },
    async execute(params) {
      const symbols = Array.isArray(params.symbols)
        ? params.symbols.map((s) => String(s).toUpperCase())
        : [];
      const path =
        symbols.length > 0
          ? `/compare?symbols=${symbols.join(",")}`
          : "/compare";
      if (typeof window !== "undefined") window.location.href = path;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Opening comparison for ${symbols.length > 0 ? symbols.join(", ") : "default stocks"}...`,
              path,
            }),
          },
        ],
      };
    },
  },

  // ─── UNIFIED CHART CANVAS & COMPARISON TOOL ───────────────────────────────────
  {
    name: "compare_chart_canvas",
    category: "Chart Canvas & Comparison",
    description:
      "All-in-one comparison chart and technical canvas controller. Configures chart style ('candles', 'bars', 'line', 'area', 'compare', 'split'), active stock symbols, focused stock, timeframe range ('1M', '3M', '6M', '1Y', '5Y'), indicators (SMA, EMA, Bollinger Bands, Volume, RSI, MACD), and canvas drawings (lines, rectangles, text, measure, chart patterns). Can also execute comprehensive multi-company AI analysis with reported financials, recommendation trends, and auto-drawn pattern detection.",
    inputSchema: {
      type: "object",
      properties: {
        chartStyle: {
          type: "string",
          enum: ["candles", "bars", "line", "area", "compare", "split"],
          description:
            "Chart display style: 'compare' & 'split' display multi-stocks simultaneously. 'candles', 'bars', 'line', 'area' display the focused single-stock with indicators and canvas overlays.",
        },
        symbols: {
          type: "array",
          items: { type: "string" },
          description:
            "List of company symbols to benchmark (e.g. ['AAPL', 'MSFT', 'TSLA']).",
        },
        focusSymbol: {
          type: "string",
          description:
            "Stock symbol to focus on for single-stock styles, indicators, and canvas annotations (e.g. 'AAPL').",
        },
        range: {
          type: "string",
          enum: ["1M", "3M", "6M", "1Y", "5Y"],
          description:
            "Historical timeframe period: '1M', '3M', '6M', '1Y', or '5Y'.",
        },
        normalized: {
          type: "boolean",
          description:
            "In 'compare' mode: true = indexed return (base 100), false = actual dollar price.",
        },
        indicators: {
          type: "object",
          properties: {
            sma: { type: "boolean", description: "SMA (20) moving average" },
            ema: {
              type: "boolean",
              description: "EMA (50) exponential moving average",
            },
            bollinger: {
              type: "boolean",
              description: "Bollinger Bands overlay",
            },
            volume: { type: "boolean", description: "Volume histogram" },
            rsi: {
              type: "boolean",
              description: "RSI (14) momentum oscillator",
            },
            macd: {
              type: "boolean",
              description: "MACD trend/momentum indicator",
            },
          },
          description:
            "Technical indicators to enable/disable (applies to focused single-stock style).",
        },
        drawings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool: {
                type: "string",
                enum: [
                  "trendline",
                  "ray",
                  "horizontal",
                  "channel",
                  "rectangle",
                  "text",
                  "measure",
                  "abcd",
                  "xabcd",
                  "cypher",
                  "headshoulders",
                  "triangle",
                  "threedrives",
                ],
                description:
                  "Drawing shape: line (trendline, ray, horizontal, channel), rectangle, text label, measure target, or chart pattern.",
              },
              points: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    time: {
                      type: "string",
                      description: "Date in YYYY-MM-DD format",
                    },
                    price: {
                      type: "number",
                      description: "Price coordinate in USD",
                    },
                  },
                  required: ["time", "price"],
                },
                description:
                  "Array of coordinate points { time, price } for this drawing.",
              },
              color: {
                type: "string",
                description: "Hex color code (e.g. '#38bdf8')",
              },
              text: {
                type: "string",
                description: "Text label or annotation callout",
              },
            },
            required: ["tool", "points"],
          },
          description:
            "Array of drawing annotations to plot onto the chart overlay canvas.",
        },
        clearDrawings: {
          type: "boolean",
          description:
            "If true, clears existing drawings before applying new ones.",
        },
        runAiAnalysis: {
          type: "boolean",
          description:
            "If true, runs complete AI multi-company comparative analysis (growth matrix, news catalysts, recommendation trends, reported financials, and pattern detection).",
        },
        autoDrawPatterns: {
          type: "boolean",
          description:
            "If true, automatically detects technical patterns on the focused stock and plots them on the canvas.",
        },
      },
    },
    async execute(params) {
      const symbols = Array.isArray(params.symbols) && params.symbols.length > 0
        ? params.symbols.map((s) => String(s).toUpperCase())
        : ["AAPL", "MSFT"];

      let focusSymbol = params.focusSymbol
        ? String(params.focusSymbol).toUpperCase()
        : symbols[0] || "AAPL";

      let chartStyle = (params.chartStyle as ComparisonChartStyle) || "candles";
      const range = (params.range as string) || "1Y";
      const normalized = Boolean(params.normalized);

      const indicators = (params.indicators as Record<string, boolean>) || {
        volume: true,
      };

      let drawings: ChartDrawing[] = Array.isArray(params.drawings)
        ? (params.drawings as any[]).map((d, i) => ({
            id: `draw-${Date.now()}-${i}`,
            tool: d.tool,
            points: d.points,
            color: d.color || (["headshoulders", "triangle", "abcd"].includes(d.tool) ? "#fbbf24" : "#38bdf8"),
            text: d.text,
          }))
        : [];

      const clearDrawings = Boolean(params.clearDrawings);
      const runAiAnalysis = Boolean(params.runAiAnalysis);
      const autoDrawPatterns = Boolean(params.autoDrawPatterns);

      // 1. Fetch OHLCV data
      const allSeries = await getLocalOhlcv(symbols);
      const focusSeries = allSeries.find((s) => s.symbol === focusSymbol) || allSeries[0];

      // 2. Auto-detect patterns if requested
      if (autoDrawPatterns && focusSeries) {
        const detected = detectPatternsForSymbol(focusSymbol, focusSeries.candles);
        if (detected.length > 0) {
          const autoDrawings = detected.flatMap((p) => p.drawings);
          drawings = clearDrawings ? autoDrawings : [...drawings, ...autoDrawings];
        }
      }

      // 3. Multi-company AI analysis if requested
      let analysisResult = null;
      let recMap: Record<string, any> = {};
      let finMap: Record<string, any> = {};

      if (runAiAnalysis) {
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

        const [newsEntries, recEntries, finEntries] = await Promise.all([
          Promise.all(symbols.map(async (s) => [s, await getCompanyNews(s, from, to)] as const)),
          Promise.all(symbols.map(async (s) => [s, await getRecommendationTrends(s)] as const)),
          Promise.all(symbols.map(async (s) => [s, await getFinancialsReported({ symbol: s, freq: "quarterly" })] as const)),
        ]);

        const newsMap = Object.fromEntries(newsEntries);
        recMap = Object.fromEntries(recEntries);
        finMap = Object.fromEntries(finEntries);

        analysisResult = analyzeComparison({
          series: allSeries,
          newsMap,
          recommendationsMap: recMap,
          financialsMap: finMap,
        });

        if (drawings.length === 0 && analysisResult.detectedPatterns.length > 0) {
          const topPattern = analysisResult.detectedPatterns[0];
          focusSymbol = topPattern.symbol;
          drawings = topPattern.drawings;
        }
      }

      // 4. Dispatch unified event to UI if running in browser
      if (typeof window !== "undefined") {
        if (window.location.pathname !== "/compare") {
          const query = new URLSearchParams();
          if (symbols.length) query.set("symbols", symbols.join(","));
          window.location.href = `/compare?${query.toString()}`;
        }

        window.dispatchEvent(
          new CustomEvent("stockpilot:compare:sync", {
            detail: {
              chartStyle,
              symbols,
              focusSymbol,
              range,
              normalized,
              indicators,
              drawings,
              clearDrawings,
            },
          }),
        );
      }

      // 5. Build clean, descriptive output
      const isMultiStock = ["compare", "split"].includes(chartStyle);
      const activeIndicatorList = Object.entries(indicators)
        .filter(([, v]) => v)
        .map(([k]) => k.toUpperCase());

      const displayDescription = isMultiStock
        ? chartStyle === "compare"
          ? `Multi-stock single-axis compare chart displaying ${symbols.join(", ")} (${normalized ? "indexed to 100" : "actual USD close"}) over ${range}.`
          : `Multi-stock split-view grid displaying synchronized individual panes for ${symbols.join(", ")} over ${range}.`
        : `${chartStyle.charAt(0).toUpperCase() + chartStyle.slice(1)} chart focusing on ${focusSymbol} over ${range} with ${activeIndicatorList.length > 0 ? activeIndicatorList.join(", ") : "default volume"} and ${drawings.length} canvas annotations.`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                chartState: {
                  chartStyle,
                  displayMode: isMultiStock ? "multi-stock" : "single-stock",
                  description: displayDescription,
                  timeframe: range,
                  symbols,
                  focusedSymbol: focusSymbol,
                  normalized,
                  indicators: {
                    sma: Boolean(indicators.sma || (indicators as any).sma20),
                    ema: Boolean(indicators.ema || (indicators as any).ema50),
                    bollinger: Boolean(indicators.bollinger),
                    volume: indicators.volume !== false,
                    rsi: Boolean(indicators.rsi || (indicators as any).rsi14),
                    macd: Boolean(indicators.macd),
                  },
                  canvasDrawingsCount: drawings.length,
                  canvasDrawings: drawings.map((d: any) => ({
                    id: d.id,
                    tool: d.tool,
                    text: d.text,
                    pointsCount: d.points?.length ?? 0,
                    points: d.points,
                  })),
                },
                aiAnalysis: analysisResult
                  ? {
                      verdict: analysisResult.aiVerdict,
                      matrixLeaders: analysisResult.matrixLeaders,
                      metricsSummary: analysisResult.metrics.map((m) => ({
                        symbol: m.symbol,
                        price: `$${m.price.toFixed(2)}`,
                        return: `${m.returnPct >= 0 ? "+" : ""}${m.returnPct.toFixed(2)}%`,
                        volatility: `${m.volatility}%`,
                        sharpeRatio: m.sharpeRatio,
                        technicalScore: `${m.technicalHealth}/100`,
                        analystRating: m.analystConsensus
                          ? `${m.analystConsensus.consensusScore}/5 (${m.analystConsensus.bullishRatio}% bullish)`
                          : "N/A",
                        reportedFinancials: m.reportedFinancials?.period ?? "Standard filing",
                        newsSentiment:
                          m.newsSummary.sentimentScore > 0.15
                            ? "Bullish"
                            : m.newsSummary.sentimentScore < -0.15
                            ? "Bearish"
                            : "Neutral",
                      })),
                      detectedPatterns: analysisResult.detectedPatterns.map((p) => ({
                        symbol: p.symbol,
                        patternName: p.name,
                        tool: p.tool,
                        direction: p.direction,
                        confidence: `${p.confidence}%`,
                        targetPrice: p.targetPrice ? `$${p.targetPrice}` : undefined,
                        stopLoss: p.stopLoss ? `$${p.stopLoss}` : undefined,
                        rationale: p.rationale,
                      })),
                      recommendations: symbols.map((s) => ({
                        symbol: s,
                        trends: recMap[s] ?? [],
                      })),
                      financialsReported: symbols.map((s) => ({
                        symbol: s,
                        data: finMap[s]?.data?.[0] ?? null,
                      })),
                      newsComparison: analysisResult.newsComparison,
                    }
                  : undefined,
                success: true,
                message: `Comparison chart configured to ${chartStyle} (${focusSymbol || symbols.join(", ")}, ${range}).`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_stock_recommendation_trends",
    category: "Market Data",
    description:
      "Get latest analyst recommendation trends for one or more companies from Finnhub (strongBuy, buy, hold, sell, strongSell, period).",
    inputSchema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "List of stock ticker symbols (e.g. ['AAPL', 'TSLA'])",
        },
      },
      required: ["symbols"],
    },
    async execute(params) {
      const symbols = Array.isArray(params.symbols)
        ? params.symbols.map((s) => String(s).toUpperCase())
        : [];
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const trends = await getRecommendationTrends(symbol);
          return { symbol, trends };
        }),
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    },
  },

  {
    name: "get_financials_reported",
    category: "Market Data",
    description:
      "Get SEC financials as reported for a company from Finnhub, including income statement (ic), balance sheet (bs), and cash flow (cf).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol (e.g. AAPL)" },
        freq: {
          type: "string",
          enum: ["annual", "quarterly"],
          description: "Frequency of filings (default quarterly)",
        },
      },
      required: ["symbol"],
    },
    async execute(params) {
      const symbol = String(params.symbol ?? "").toUpperCase();
      const freq = params.freq ? String(params.freq) : "quarterly";
      const result = await getFinancialsReported({ symbol, freq });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              result ?? {
                symbol,
                error: "No reported financials found.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },

  // ─── LEGACY TOOLS (enhanced) ─────────────────────────────────────────────────
  {
    name: "start_beginner_tutorial",
    category: "Education",
    description:
      "Start a guided investing tutorial on a topic. Topics: intro, candlesticks, portfolio, riskmanagement, technicalanalysis, fundamentals, elliottwaves, patterns.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Tutorial topic to learn about" },
      },
      required: ["topic"],
    },
    async execute(params) {
      const topic = String(params.topic ?? "intro")
        .toLowerCase()
        .replace(/\s+/g, "");
      const tutorials: Record<
        string,
        { title: string; steps: string[]; tip: string }
      > = {
        intro: {
          title: "Stock Market Basics",
          steps: [
            "Understand what stocks are and why companies issue them",
            "Learn market hours, exchanges (NYSE, NASDAQ)",
            "Understand market cap, P/E ratio, and earnings",
            "Practice buying your first stock with virtual funds using 'buy_stock'",
          ],
          tip: "Start by using 'screen_stocks' to find stocks under $50.",
        },
        candlesticks: {
          title: "Reading Candlestick Charts",
          steps: [
            "Open, High, Low, Close (OHLC) explained",
            "Green candle = bullish day; Red candle = bearish day",
            "Doji, Hammer, Engulfing patterns",
            "Volume confirmation of price moves",
          ],
          tip: "Open any stock with 'open_stock' and observe the TradingView candlestick chart.",
        },
        portfolio: {
          title: "Building a Portfolio",
          steps: [
            "Diversification across sectors and asset classes",
            "Position sizing — never risk more than 2-5% per trade",
            "Use 'calculate_position_size' to size entries correctly",
            "Track P&L with 'analyze_portfolio'",
          ],
          tip: "Use 'auto_invest' with strategy='diversified' to build a starter portfolio.",
        },
        riskmanagement: {
          title: "Risk Management",
          steps: [
            "Stop-loss orders protect capital",
            "Risk/Reward ratio should be at least 1:2",
            "Never invest more than you can afford to lose",
            "Use 'get_portfolio_risk' to monitor concentration",
          ],
          tip: "Set stop-losses 5-8% below entry price for swing trades.",
        },
        technicalanalysis: {
          title: "Technical Analysis",
          steps: [
            "Support and resistance levels",
            "Moving averages (SMA/EMA)",
            "RSI, MACD momentum indicators",
            "Chart patterns: Head & Shoulders, ABCD, Triangles",
          ],
          tip: "Use 'detect_chart_pattern' to identify patterns on any stock.",
        },
        elliottwaves: {
          title: "Elliott Wave Theory",
          steps: [
            "Markets move in 5 waves (impulse) + 3 waves (correction)",
            "Wave 3 is always the longest motive wave",
            "Fibonacci ratios define wave relationships",
            "Complex corrections: flats, zigzags, triangles",
          ],
          tip: "Use 'detect_elliott_wave' to identify wave structures on AAPL or TSLA.",
        },
        patterns: {
          title: "Chart Patterns Masterclass",
          steps: [
            "Reversal patterns: H&S, Double Top/Bottom, XABCD, Cypher",
            "Continuation patterns: Triangles, Flags, Three Drives",
            "Harmonic patterns use Fibonacci ratios precisely",
            "Volume must confirm all pattern breakouts",
          ],
          tip: "Try 'detect_chart_pattern' with pattern='xabcd' on NVDA.",
        },
        fundamentals: {
          title: "Fundamental Analysis",
          steps: [
            "Revenue, earnings, and profit margins",
            "P/E ratio, EPS, Price/Book",
            "Competitive moat and industry position",
            "Balance sheet: debt, cash flow, equity",
          ],
          tip: "Use 'get_stock_details' to see company profile and market cap.",
        },
      };
      const tut = tutorials[topic] ?? tutorials.intro;
      return {
        content: [
          { type: "text", text: JSON.stringify({ topic, ...tut }, null, 2) },
        ],
      };
    },
  },

  {
    name: "get_earnings_calendar",
    category: "Education",
    description:
      "Return upcoming earnings dates (next ~120 days) for the tracked stock universe, from Finnhub's earnings calendar.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + 120);
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      const perSymbol = await Promise.all(
        STOCK_UNIVERSE.map((s) => getEarningsCalendar(fmt(from), fmt(to), s.symbol)),
      );
      const sectorOf = new Map(STOCK_UNIVERSE.map((s) => [s.symbol, s.sector]));
      const items = perSymbol
        .flat()
        .filter((e) => e.date && e.symbol)
        .map((e) => ({
          symbol: e.symbol,
          sector: sectorOf.get(String(e.symbol)) ?? null,
          earningsDate: e.date,
          hour: e.hour ?? null,
          epsEstimate: e.epsEstimate ?? null,
          epsActual: e.epsActual ?? null,
          revenueEstimate: e.revenueEstimate ?? null,
        }))
        .sort((a, b) => String(a.earningsDate).localeCompare(String(b.earningsDate)));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                source: "Finnhub earnings calendar",
                count: items.length,
                earningsCalendar: items,
                nextEarnings: items[0] ?? null,
                note: items.length
                  ? undefined
                  : "No upcoming earnings returned (the data provider may not cover these dates on the free tier).",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
];

// ─── Auth gate ───────────────────────────────────────────────────────────────
// Portfolio, watchlist, and price-alert tools are per-user: block them (reads
// AND writes) unless there's a signed-in Supabase session. Applied centrally by
// wrapping each tool's execute, so no personal action works while logged out.
const AUTH_REQUIRED_CATEGORIES = new Set(["Portfolio", "Watchlist & Alerts"]);

for (const tool of webMcpTools) {
  if (!AUTH_REQUIRED_CATEGORIES.has(tool.category)) continue;
  const runTool = tool.execute;
  tool.execute = async (params) => {
    if (!usePortfolioStore.getState().userId) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                "Not signed in. Portfolio, watchlist, and price-alert features require logging into StockPilot first.",
              action: "Ask the user to sign in, then retry.",
            }),
          },
        ],
      };
    }
    return runTool(params);
  };
}

// ─── Registration ──────────────────────────────────────────────────────────────
// Track which tools have already been registered so repeated calls (React
// mounts, retries, the panel button, dev HMR) don't re-register and trigger the
// WebMCP runtime's "duplicate tool name" error. The dedup set lives on `window`
// so it survives Fast-Refresh module reloads (a module-level set would not).
const REGISTERED_KEY = "__stockpilotRegisteredTools";

export async function registerWebMcpTools() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return webMcpTools;
  }

  const mcp =
    (document as any).modelContext ||
    (navigator as any).modelContext ||
    (window as any).modelContext;

  if (!mcp) {
    console.warn(
      "⚠️ WebMCP is not available. Ensure chrome://flags/#enable-webmcp-testing is Enabled and you are on localhost/HTTPS.",
    );
    return webMcpTools;
  }

  const w = window as unknown as Record<string, Set<string>>;
  const registered = (w[REGISTERED_KEY] ??= new Set<string>());

  let registeredCount = 0;
  for (const tool of webMcpTools) {
    if (registered.has(tool.name)) continue;
    // Claim the name BEFORE awaiting so concurrent callers can't double-register.
    registered.add(tool.name);
    try {
      await mcp.registerTool(tool);
      registeredCount++;
    } catch (error) {
      registered.delete(tool.name); // genuine failure — allow a later retry
      console.error(`❌ Failed to register WebMCP tool '${tool.name}':`, error);
    }
  }

  if (registeredCount > 0) {
    console.log(
      `%c[WebMCP]: Successfully registered ${registeredCount} tools across ${new Set(webMcpTools.map((t) => t.category)).size} categories!`,
      "color: #00ff00; font-weight: bold; background: #111; padding: 6px 12px; border-radius: 4px;",
    );
    if (typeof mcp.getTools === "function") {
      try {
        const tools = await mcp.getTools();
        console.log("[WebMCP] Active tools on page:", tools);
      } catch {
        // Ignore
      }
    }
  }

  return webMcpTools;
}

export const webMcpCategories = [
  ...new Set(webMcpTools.map((t) => t.category)),
];
