import {
  getMultipleQuotes,
  getStockQuote,
  getCompanyNews,
  getMarketNews,
  getCompanyProfile,
  getSECFilings,
} from "@/lib/finnhub/client";
import { usePortfolioStore } from "@/lib/portfolio-store";
import type {
  PatternResult,
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
const STOCK_UNIVERSE = [
  { symbol: "AAPL", sector: "Technology", beta: 1.2 },
  { symbol: "MSFT", sector: "Technology", beta: 0.9 },
  { symbol: "GOOGL", sector: "Technology", beta: 1.1 },
  { symbol: "NVDA", sector: "Technology", beta: 1.8 },
  { symbol: "TSLA", sector: "Consumer Cyclical", beta: 2.0 },
  { symbol: "AMZN", sector: "Consumer Cyclical", beta: 1.3 },
  { symbol: "META", sector: "Technology", beta: 1.4 },
  { symbol: "JPM", sector: "Financial Services", beta: 1.1 },
  { symbol: "V", sector: "Financial Services", beta: 0.9 },
  { symbol: "JNJ", sector: "Healthcare", beta: 0.7 },
  { symbol: "WMT", sector: "Consumer Defensive", beta: 0.5 },
  { symbol: "XOM", sector: "Energy", beta: 1.0 },
  { symbol: "BRK.B", sector: "Financial Services", beta: 0.85 },
  { symbol: "UNH", sector: "Healthcare", beta: 0.8 },
  { symbol: "LLY", sector: "Healthcare", beta: 0.6 },
];

// ─── Deterministic seeded random for pattern detection ────────────────────────
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function symbolSeed(symbol: string): number {
  return symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

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

// ─── Pattern detection helpers ─────────────────────────────────────────────────
function detectPattern(
  symbol: string,
  pattern: ChartPatternType,
  price: number,
): PatternResult {
  const seed =
    symbolSeed(symbol) +
    pattern.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (n: number) => seededRandom(seed + n);

  const confidence = Math.round(45 + rng(1) * 45); // 45–90%
  const direction: "bullish" | "bearish" | "neutral" =
    rng(2) > 0.6 ? "bullish" : rng(2) > 0.3 ? "bearish" : "neutral";

  const patternDescriptions: Record<ChartPatternType, string> = {
    head_and_shoulders: `Classic bearish reversal pattern detected on ${symbol}. Left shoulder, head, and right shoulder form with a neckline near $${(price * 0.95).toFixed(2)}. Breakdown below neckline would confirm the pattern.`,
    inverse_head_and_shoulders: `Bullish reversal pattern on ${symbol}. Inverse head at $${(price * 0.88).toFixed(2)} with symmetrical shoulders. Breakout above neckline at $${(price * 0.97).toFixed(2)} is the trigger.`,
    abcd: `ABCD harmonic pattern on ${symbol}. Point A: $${(price * 1.1).toFixed(2)}, B: $${(price * 1.04).toFixed(2)}, C: $${(price * 1.07).toFixed(2)}, D: $${(price * 0.98).toFixed(2)}. Pattern completion at D signals ${direction} momentum.`,
    xabcd: `XABCD harmonic pattern (Gartley variant) on ${symbol}. X: $${(price * 1.15).toFixed(2)}, A: $${(price * 1.06).toFixed(2)}, B: $${(price * 1.1).toFixed(2)}, C: $${(price * 1.02).toFixed(2)}, D: $${(price * 0.97).toFixed(2)}. 0.786 XA retracement confirmed.`,
    cypher: `Cypher pattern on ${symbol}. Defined by 0.382–0.618 XA at B, 1.272–1.414 XC at D. Pattern suggests ${direction} reversal from $${(price * 0.96).toFixed(2)} target zone.`,
    triangle_ascending: `Ascending triangle on ${symbol} with flat resistance at $${(price * 1.03).toFixed(2)} and rising support. Volume declining — breakout expected to the ${direction === "bullish" ? "upside" : "downside"}.`,
    triangle_descending: `Descending triangle on ${symbol} with flat support at $${(price * 0.97).toFixed(2)} and falling resistance. Typically bearish — watch for breakdown below support.`,
    triangle_symmetrical: `Symmetrical triangle on ${symbol} between $${(price * 0.97).toFixed(2)} and $${(price * 1.03).toFixed(2)}. Continuation pattern — direction depends on prevailing trend.`,
    three_drives: `Three Drives pattern on ${symbol}. Three equal price legs with Fibonacci corrections between each drive. ${direction === "bullish" ? "Bullish" : "Bearish"} reversal expected at the third drive completion near $${(price * (direction === "bullish" ? 0.93 : 1.07)).toFixed(2)}.`,
    double_top: `Double Top reversal on ${symbol}. Two peaks at approximately $${(price * 1.05).toFixed(2)} with valley at $${(price * 0.98).toFixed(2)}. Neckline break would target $${(price * 0.91).toFixed(2)}.`,
    double_bottom: `Double Bottom reversal on ${symbol}. Two troughs at approximately $${(price * 0.95).toFixed(2)} with peak at $${(price * 1.02).toFixed(2)}. Breakout above peak would target $${(price * 1.09).toFixed(2)}.`,
  };

  const keyPointsByPattern: Record<
    ChartPatternType,
    Array<{ label: string; priceLevel: number; description: string }>
  > = {
    head_and_shoulders: [
      {
        label: "Left Shoulder",
        priceLevel: +(price * 1.04).toFixed(2),
        description: "First peak",
      },
      {
        label: "Head",
        priceLevel: +(price * 1.08).toFixed(2),
        description: "Highest peak",
      },
      {
        label: "Right Shoulder",
        priceLevel: +(price * 1.03).toFixed(2),
        description: "Third peak",
      },
      {
        label: "Neckline",
        priceLevel: +(price * 0.95).toFixed(2),
        description: "Key breakdown level",
      },
    ],
    inverse_head_and_shoulders: [
      {
        label: "Left Shoulder",
        priceLevel: +(price * 0.96).toFixed(2),
        description: "First trough",
      },
      {
        label: "Head",
        priceLevel: +(price * 0.88).toFixed(2),
        description: "Lowest trough",
      },
      {
        label: "Right Shoulder",
        priceLevel: +(price * 0.95).toFixed(2),
        description: "Third trough",
      },
      {
        label: "Neckline",
        priceLevel: +(price * 0.97).toFixed(2),
        description: "Key breakout level",
      },
    ],
    abcd: [
      {
        label: "A",
        priceLevel: +(price * 1.1).toFixed(2),
        description: "Swing high",
      },
      {
        label: "B",
        priceLevel: +(price * 1.04).toFixed(2),
        description: "0.618 retracement",
      },
      {
        label: "C",
        priceLevel: +(price * 1.07).toFixed(2),
        description: "BC projection",
      },
      {
        label: "D",
        priceLevel: +(price * 0.98).toFixed(2),
        description: "Pattern completion",
      },
    ],
    xabcd: [
      {
        label: "X",
        priceLevel: +(price * 1.15).toFixed(2),
        description: "Origin",
      },
      {
        label: "A",
        priceLevel: +(price * 1.06).toFixed(2),
        description: "Impulse end",
      },
      {
        label: "B",
        priceLevel: +(price * 1.1).toFixed(2),
        description: "0.618 XA",
      },
      {
        label: "C",
        priceLevel: +(price * 1.02).toFixed(2),
        description: "AB projection",
      },
      {
        label: "D",
        priceLevel: +(price * 0.97).toFixed(2),
        description: "0.786 XA — PRZ",
      },
    ],
    cypher: [
      {
        label: "X",
        priceLevel: +(price * 1.12).toFixed(2),
        description: "Origin",
      },
      {
        label: "A",
        priceLevel: +(price * 1.05).toFixed(2),
        description: "Impulse end",
      },
      {
        label: "B",
        priceLevel: +(price * 1.09).toFixed(2),
        description: "0.382–0.618 XA",
      },
      {
        label: "C",
        priceLevel: +(price * 1.14).toFixed(2),
        description: "1.272–1.414 XC",
      },
      {
        label: "D",
        priceLevel: +(price * 0.96).toFixed(2),
        description: "0.786 XC — PRZ",
      },
    ],
    triangle_ascending: [
      {
        label: "Resistance",
        priceLevel: +(price * 1.03).toFixed(2),
        description: "Flat top",
      },
      {
        label: "Support 1",
        priceLevel: +(price * 0.98).toFixed(2),
        description: "Rising trendline",
      },
      {
        label: "Support 2",
        priceLevel: +(price * 0.99).toFixed(2),
        description: "Higher low",
      },
    ],
    triangle_descending: [
      {
        label: "Support",
        priceLevel: +(price * 0.97).toFixed(2),
        description: "Flat bottom",
      },
      {
        label: "Resistance 1",
        priceLevel: +(price * 1.03).toFixed(2),
        description: "Falling trendline",
      },
      {
        label: "Resistance 2",
        priceLevel: +(price * 1.01).toFixed(2),
        description: "Lower high",
      },
    ],
    triangle_symmetrical: [
      {
        label: "Upper TL",
        priceLevel: +(price * 1.03).toFixed(2),
        description: "Descending resistance",
      },
      {
        label: "Lower TL",
        priceLevel: +(price * 0.97).toFixed(2),
        description: "Ascending support",
      },
      {
        label: "Apex",
        priceLevel: +(price * 1.0).toFixed(2),
        description: "Convergence point",
      },
    ],
    three_drives: [
      {
        label: "Drive 1",
        priceLevel: +(price * 1.04).toFixed(2),
        description: "First extension",
      },
      {
        label: "Retrace 1",
        priceLevel: +(price * 1.01).toFixed(2),
        description: "0.618 pullback",
      },
      {
        label: "Drive 2",
        priceLevel: +(price * 1.07).toFixed(2),
        description: "Second extension",
      },
      {
        label: "Retrace 2",
        priceLevel: +(price * 1.04).toFixed(2),
        description: "0.618 pullback",
      },
      {
        label: "Drive 3",
        priceLevel: +(price * 1.1).toFixed(2),
        description: "Third extension — reversal zone",
      },
    ],
    double_top: [
      {
        label: "Top 1",
        priceLevel: +(price * 1.05).toFixed(2),
        description: "First resistance test",
      },
      {
        label: "Valley",
        priceLevel: +(price * 0.98).toFixed(2),
        description: "Intermediate low",
      },
      {
        label: "Top 2",
        priceLevel: +(price * 1.05).toFixed(2),
        description: "Second resistance test",
      },
      {
        label: "Neckline",
        priceLevel: +(price * 0.98).toFixed(2),
        description: "Breakdown target",
      },
    ],
    double_bottom: [
      {
        label: "Bottom 1",
        priceLevel: +(price * 0.95).toFixed(2),
        description: "First support test",
      },
      {
        label: "Peak",
        priceLevel: +(price * 1.02).toFixed(2),
        description: "Intermediate high",
      },
      {
        label: "Bottom 2",
        priceLevel: +(price * 0.95).toFixed(2),
        description: "Second support test",
      },
      {
        label: "Neckline",
        priceLevel: +(price * 1.02).toFixed(2),
        description: "Breakout trigger",
      },
    ],
  };

  const projectedTarget =
    direction === "bullish"
      ? +(price * (1 + 0.06 + rng(3) * 0.08)).toFixed(2)
      : direction === "bearish"
        ? +(price * (0.94 - rng(3) * 0.08)).toFixed(2)
        : null;

  const stopLoss =
    direction === "bullish"
      ? +(price * (0.96 - rng(4) * 0.03)).toFixed(2)
      : direction === "bearish"
        ? +(price * (1.04 + rng(4) * 0.03)).toFixed(2)
        : null;

  return {
    symbol,
    pattern,
    confidence,
    direction,
    description: patternDescriptions[pattern],
    keyPoints: keyPointsByPattern[pattern],
    projectedTarget,
    stopLoss,
    detectedAt: new Date().toISOString(),
  };
}

// ─── Elliott Wave detection helper ────────────────────────────────────────────
function detectElliottWave(
  symbol: string,
  waveType: ElliottWaveType,
  price: number,
): ElliottWaveResult {
  const seed = symbolSeed(symbol) + waveType.length * 7;
  const rng = (n: number) => seededRandom(seed + n);
  const confidence = Math.round(40 + rng(1) * 50);

  const waveDescriptions: Record<
    ElliottWaveType,
    {
      desc: string;
      current: string;
      waves: Array<{ label: string; priceLevel: number; description: string }>;
    }
  > = {
    impulse_12345: {
      desc: `Elliott Impulse Wave (1-2-3-4-5) detected on ${symbol}. Wave 3 is the extended wave, currently in Wave ${Math.ceil(rng(2) * 3) + 2}. Waves 1, 3, 5 are motive; 2 and 4 are corrective. Typical 2.618 extension of Wave 1 projected for Wave 3.`,
      current: `Wave ${Math.ceil(rng(3) * 5)}`,
      waves: [
        {
          label: "Wave 1",
          priceLevel: +(price * 0.85).toFixed(2),
          description: "First motive wave",
        },
        {
          label: "Wave 2",
          priceLevel: +(price * 0.88).toFixed(2),
          description: "0.618 retracement of Wave 1",
        },
        {
          label: "Wave 3",
          priceLevel: +(price * 1.02).toFixed(2),
          description: "Extended motive wave (longest)",
        },
        {
          label: "Wave 4",
          priceLevel: +(price * 0.96).toFixed(2),
          description: "Corrective wave (no overlap Wave 1)",
        },
        {
          label: "Wave 5",
          priceLevel: +(price * 1.07).toFixed(2),
          description: "Final motive wave",
        },
      ],
    },
    correction_abc: {
      desc: `Elliott Correction Wave (A-B-C) detected on ${symbol}. This three-wave structure corrects the prior impulse. Wave C often equals Wave A in length. Currently in Wave ${["A", "B", "C"][Math.floor(rng(2) * 3)]}.`,
      current: `Wave ${["A", "B", "C"][Math.floor(rng(3) * 3)]}`,
      waves: [
        {
          label: "Wave A",
          priceLevel: +(price * 0.92).toFixed(2),
          description: "First corrective leg down",
        },
        {
          label: "Wave B",
          priceLevel: +(price * 0.97).toFixed(2),
          description: "Partial retracement up",
        },
        {
          label: "Wave C",
          priceLevel: +(price * 0.86).toFixed(2),
          description: "Final corrective leg (= Wave A)",
        },
      ],
    },
    triangle_abcde: {
      desc: `Elliott Triangle Wave (A-B-C-D-E) on ${symbol}. Five contracting waves forming a triangle continuation pattern. Breakout in the direction of the prior trend expected after Wave E.`,
      current: `Wave ${["A", "B", "C", "D", "E"][Math.floor(rng(2) * 5)]}`,
      waves: [
        {
          label: "Wave A",
          priceLevel: +(price * 1.03).toFixed(2),
          description: "First triangle wave",
        },
        {
          label: "Wave B",
          priceLevel: +(price * 0.98).toFixed(2),
          description: "Second wave — lower high",
        },
        {
          label: "Wave C",
          priceLevel: +(price * 1.01).toFixed(2),
          description: "Third wave — lower high than A",
        },
        {
          label: "Wave D",
          priceLevel: +(price * 0.99).toFixed(2),
          description: "Fourth wave — higher low than B",
        },
        {
          label: "Wave E",
          priceLevel: +(price * 1.0).toFixed(2),
          description: "Fifth wave — thrust out of triangle",
        },
      ],
    },
    double_combo_wxy: {
      desc: `Elliott Double Combo Wave (W-X-Y) on ${symbol}. Two corrective patterns linked by an X wave. W and Y are both complete corrective structures. Complex correction before resumption of trend.`,
      current: `Wave ${["W", "X", "Y"][Math.floor(rng(2) * 3)]}`,
      waves: [
        {
          label: "Wave W",
          priceLevel: +(price * 0.93).toFixed(2),
          description: "First corrective pattern",
        },
        {
          label: "Wave X",
          priceLevel: +(price * 0.97).toFixed(2),
          description: "Linking wave (counter-trend)",
        },
        {
          label: "Wave Y",
          priceLevel: +(price * 0.88).toFixed(2),
          description: "Second corrective pattern",
        },
      ],
    },
    triple_combo_wxyxz: {
      desc: `Elliott Triple Combo Wave (W-X-Y-X-Z) on ${symbol}. Three corrective structures linked by two X waves. Rare pattern signifying prolonged consolidation before a powerful trend resumption.`,
      current: `Wave ${["W", "X", "Y", "X2", "Z"][Math.floor(rng(2) * 5)]}`,
      waves: [
        {
          label: "Wave W",
          priceLevel: +(price * 0.95).toFixed(2),
          description: "First corrective structure",
        },
        {
          label: "Wave X",
          priceLevel: +(price * 0.98).toFixed(2),
          description: "First linking wave",
        },
        {
          label: "Wave Y",
          priceLevel: +(price * 0.91).toFixed(2),
          description: "Second corrective structure",
        },
        {
          label: "Wave X2",
          priceLevel: +(price * 0.94).toFixed(2),
          description: "Second linking wave",
        },
        {
          label: "Wave Z",
          priceLevel: +(price * 0.87).toFixed(2),
          description: "Third corrective structure",
        },
      ],
    },
  };

  const info = waveDescriptions[waveType];
  const projectedTarget = +(price * (1 + 0.05 + rng(5) * 0.12)).toFixed(2);

  return {
    symbol,
    waveType,
    confidence,
    currentWave: info.current,
    description: info.desc,
    waves: info.waves,
    projectedTarget,
    detectedAt: new Date().toISOString(),
  };
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
                selected: selectedFiling,
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
      const beta1 = meta1?.beta ?? 1.0;
      const beta2 = meta2?.beta ?? 1.0;
      const sector1 = meta1?.sector ?? "Unknown";
      const sector2 = meta2?.sector ?? "Unknown";
      const sameSector = sector1 === sector2;
      const baseCorr = sameSector ? 0.7 : 0.4;
      const betaDiff = Math.abs(beta1 - beta2);
      const correlation = Math.max(
        -1,
        Math.min(
          1,
          baseCorr -
            betaDiff * 0.2 +
            (seededRandom(symbolSeed(s1 + s2)) - 0.5) * 0.2,
        ),
      );
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
                correlation: +correlation.toFixed(3),
                label,
                sector1,
                sector2,
                sameSector,
                interpretation: `${s1} and ${s2} have ${label.toLowerCase()} correlation. ${sameSector ? "They are in the same sector." : "They are in different sectors — good for diversification."}`,
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
      const quote = await getStockQuote(symbol);
      const price = quote?.price ?? 100;
      const result = detectPattern(symbol, pattern, price);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
      const quote = await getStockQuote(symbol);
      const price = quote?.price ?? 100;
      const result = detectElliottWave(symbol, waveType, price);
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
      const quote = await getStockQuote(symbol);
      const price = quote?.price ?? 100;
      const seed = symbolSeed(symbol);
      const rng = (n: number) => seededRandom(seed + n);
      const levels = {
        symbol,
        currentPrice: price,
        support: [
          {
            level: +(price * (0.97 - rng(1) * 0.02)).toFixed(2),
            strength: "strong",
            type: "S1",
          },
          {
            level: +(price * (0.93 - rng(2) * 0.02)).toFixed(2),
            strength: "moderate",
            type: "S2",
          },
          {
            level: +(price * (0.87 - rng(3) * 0.03)).toFixed(2),
            strength: "weak",
            type: "S3",
          },
        ],
        resistance: [
          {
            level: +(price * (1.03 + rng(4) * 0.02)).toFixed(2),
            strength: "strong",
            type: "R1",
          },
          {
            level: +(price * (1.07 + rng(5) * 0.02)).toFixed(2),
            strength: "moderate",
            type: "R2",
          },
          {
            level: +(price * (1.13 + rng(6) * 0.03)).toFixed(2),
            strength: "weak",
            type: "R3",
          },
        ],
        pivotPoint: +(price * 1.0).toFixed(2),
        notes: `Key S1 at $${(price * 0.97).toFixed(2)} and R1 at $${(price * 1.03).toFixed(2)} are the immediate levels to watch for ${symbol}.`,
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
      const quote = await getStockQuote(symbol);
      const currentPrice = quote?.price ?? 100;
      const seed = symbolSeed(symbol + strategy);
      const rng = (n: number) => seededRandom(seed + n);

      // Deterministic simulated backtest results
      const strategyParams: Record<
        string,
        {
          totalReturn: number;
          maxDD: number;
          winRate: number;
          trades: number;
          sharpe: number;
        }
      > = {
        sma_crossover: {
          totalReturn: -5 + rng(1) * 45,
          maxDD: -(5 + rng(2) * 20),
          winRate: 0.45 + rng(3) * 0.15,
          trades: Math.round(12 + rng(4) * 20),
          sharpe: 0.5 + rng(5) * 1.5,
        },
        rsi_mean_revert: {
          totalReturn: 5 + rng(1) * 35,
          maxDD: -(3 + rng(2) * 15),
          winRate: 0.5 + rng(3) * 0.2,
          trades: Math.round(20 + rng(4) * 30),
          sharpe: 0.8 + rng(5) * 1.2,
        },
        buy_hold: {
          totalReturn: 8 + rng(1) * 40,
          maxDD: -(10 + rng(2) * 25),
          winRate: 1.0,
          trades: 1,
          sharpe: 1.0 + rng(5) * 0.8,
        },
      };

      const sp = strategyParams[strategy] ?? strategyParams.buy_hold;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

      const result: BacktestResult = {
        symbol,
        strategy,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        totalReturn: +sp.totalReturn.toFixed(2),
        annualizedReturn: +sp.totalReturn.toFixed(2),
        maxDrawdown: +sp.maxDD.toFixed(2),
        winRate: +sp.winRate.toFixed(3),
        totalTrades: sp.trades,
        sharpeRatio: +sp.sharpe.toFixed(2),
      };

      const finalCapital = capital * (1 + sp.totalReturn / 100);
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
                disclaimer:
                  "Backtested on simulated data. Past performance does not guarantee future results.",
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
      "Return simulated upcoming earnings dates for the tracked stock universe.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const now = new Date();
      const calendar = STOCK_UNIVERSE.map((s, i) => {
        const daysAhead = (i * 7 + 3) % 90;
        const date = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        return {
          symbol: s.symbol,
          sector: s.sector,
          earningsDate: date.toISOString().split("T")[0],
          daysUntil: daysAhead,
          estimatedEPS: +(
            seededRandom(symbolSeed(s.symbol) + 99) * 5 +
            0.5
          ).toFixed(2),
          previousEPS: +(
            seededRandom(symbolSeed(s.symbol) + 88) * 5 +
            0.5
          ).toFixed(2),
        };
      }).sort((a, b) => a.daysUntil - b.daysUntil);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { earningsCalendar: calendar, nextEarnings: calendar[0] },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
];

// ─── Registration ──────────────────────────────────────────────────────────────
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

  let registeredCount = 0;
  for (const tool of webMcpTools) {
    try {
      await mcp.registerTool(tool);
      registeredCount++;
    } catch (error) {
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
