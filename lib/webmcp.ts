import { getMultipleQuotes, getStockQuote } from "@/lib/finnhub/client";
import { usePortfolioStore } from "@/lib/portfolio-store";

export type WebMcpTool = {
  name: string;
  description: string;
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

export const webMcpTools: WebMcpTool[] = [
  {
    name: "search_stock",
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
      const query = String(params.query ?? "").trim();
      if (!query) {
        return { content: [{ type: "text", text: "[]" }] };
      }

      const results = await getMultipleQuotes([
        "AAPL",
        "MSFT",
        "GOOGL",
        "NVDA",
        "TSLA",
      ]);

      const items = results.filter(
        (item) =>
          item.symbol.toLowerCase().includes(query.toLowerCase()) ||
          item.companyName.toLowerCase().includes(query.toLowerCase()),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    },
  },
  {
    name: "get_stock_details",
    description: "Retrieve a normalized stock quote and summary metadata.",
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
      if (!symbol) {
        return { content: [{ type: "text", text: "null" }] };
      }

      const quote = await getStockQuote(symbol);
      return {
        content: [{ type: "text", text: JSON.stringify(quote, null, 2) }],
      };
    },
  },
  {
    name: "compare_stocks",
    description: "Compare a set of stocks over a period and return a summary.",
    inputSchema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Symbols to compare",
        },
        period: {
          type: "string",
          description: "Time range such as 1M, 6M, 1Y",
        },
      },
      required: ["symbols", "period"],
    },
    async execute(params) {
      const symbols = Array.isArray(params.symbols)
        ? params.symbols.map((symbol) => String(symbol).toUpperCase())
        : [];
      const period = String(params.period ?? "1Y");

      if (!symbols.length) {
        return { content: [{ type: "text", text: "[]" }] };
      }

      const entries = await Promise.all(
        symbols.map(async (symbol) => {
          const quote = await getStockQuote(symbol);
          const change = quote?.percentChange ?? 0;
          return { symbol, change, candles: 1 };
        }),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
      };
    },
  },
  {
    name: "get_portfolio",
    description:
      "Return the simulated portfolio state and performance summary.",
    inputSchema: {
      type: "object",
      properties: {},
    },
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
                transactions: state.transactions,
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
    name: "buy_stock",
    description: "Simulate buying a stock with virtual funds.",
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
      const price = (await getStockQuote(symbol))?.price ?? 0;
      const result = usePortfolioStore
        .getState()
        .buyStock(symbol, symbol, quantity, price);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },
  {
    name: "sell_stock",
    description: "Simulate selling a stock from the portfolio.",
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
      const price = (await getStockQuote(symbol))?.price ?? 0;
      const result = usePortfolioStore
        .getState()
        .sellStock(symbol, quantity, price);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },
  {
    name: "start_beginner_tutorial",
    description:
      "Start a guided onboarding tour for a stock investing concept.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Beginner investing topic to teach",
        },
      },
      required: ["topic"],
    },
    async execute(params) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                started: true,
                topic: String(params.topic ?? "intro"),
                steps: [
                  "Understand market basics",
                  "Learn how prices move",
                  "Practice with a virtual portfolio",
                ],
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
    name: "rank_stocks",
    description: "Rank the curated stock universe by a supported metric.",
    inputSchema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          description: "Metric to rank by, such as performance or volume",
        },
        period: {
          type: "string",
          description: "Time range for the ranking",
        },
      },
      required: ["metric", "period"],
    },
    async execute(params) {
      const metric = String(params.metric ?? "performance");
      const period = String(params.period ?? "1Y");
      const quotes = await getMultipleQuotes([
        "AAPL",
        "MSFT",
        "GOOGL",
        "NVDA",
        "TSLA",
      ]);

      const ranked = quotes
        .map((quote) => ({
          symbol: quote.symbol,
          metricValue:
            metric === "volume" ? (quote.volume ?? 0) : quote.percentChange,
        }))
        .sort((a, b) => Number(b.metricValue) - Number(a.metricValue))
        .map((entry) => ({ ...entry, period }));

      return {
        content: [{ type: "text", text: JSON.stringify(ranked, null, 2) }],
      };
    },
  },
  {
    name: "analyze_portfolio",
    description:
      "Return deterministic portfolio statistics for the virtual portfolio.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    async execute() {
      const state = usePortfolioStore.getState();
      const totalValue = state.holdings.reduce(
        (sum, holding) =>
          sum + holding.quantity * (holding.averageBuyPrice || 0),
        0,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                holdings: state.holdings.length,
                totalValue,
                virtualBalance: state.virtualBalance,
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
      `%c[WebMCP]: Successfully registered ${registeredCount} tools!`,
      "color: #00ff00; font-weight: bold; background: #222; padding: 4px;",
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
