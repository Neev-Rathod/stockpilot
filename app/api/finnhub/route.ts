import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = "https://finnhub.io/api/v1";

const requestLog: Array<{
  timestamp: string;
  endpoint: string;
  path: string;
  symbol?: string;
  responseStatus: number;
  durationMs: number;
  success: boolean;
  responseData?: unknown;
}> = [];

const endpointCounts = new Map<string, number>();
const symbolCounts = new Map<string, number>();

function formatResponseData(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload === undefined) {
    return "null";
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function recordCall({
  endpoint,
  path,
  symbol,
  responseStatus,
  durationMs,
  success,
  responseData,
}: {
  endpoint: string;
  path: string;
  symbol?: string;
  responseStatus: number;
  durationMs: number;
  success: boolean;
  responseData?: unknown;
}) {
  requestLog.push({
    timestamp: new Date().toISOString(),
    endpoint,
    path,
    symbol,
    responseStatus,
    durationMs,
    success,
    responseData,
  });

  endpointCounts.set(endpoint, (endpointCounts.get(endpoint) ?? 0) + 1);

  if (symbol) {
    symbolCounts.set(
      symbol.toUpperCase(),
      (symbolCounts.get(symbol.toUpperCase()) ?? 0) + 1,
    );
  }

  if (requestLog.length > 100) {
    requestLog.shift();
  }
}

async function proxyFinnhub(
  path: string,
  params: Record<string, string | undefined>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  if (!API_KEY) {
    return {
      ok: false,
      status: 503,
      body: { error: "FINNHUB_API_KEY is not configured." },
    };
  }

  const url = new URL(`${BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const startedAt = Date.now();

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "X-Finnhub-Token": API_KEY,
      },
    });

    const text = await response.text();
    let payload: unknown;

    try {
      payload = JSON.parse(text);
    } catch {
      payload = text || { error: "Finnhub request failed." };
    }

    const durationMs = Date.now() - startedAt;
    const endpoint = path.replace(/^\//, "");
    const symbol = params.symbol;

    recordCall({
      endpoint,
      path,
      symbol: typeof symbol === "string" ? symbol : undefined,
      responseStatus: response.status,
      durationMs,
      success: response.ok,
      responseData: payload,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body:
          typeof payload === "object" && payload !== null
            ? payload
            : { error: payload },
      };
    }

    return {
      ok: true,
      status: 200,
      body: payload,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const endpoint = path.replace(/^\//, "");
    recordCall({
      endpoint,
      path,
      symbol: typeof params.symbol === "string" ? params.symbol : undefined,
      responseStatus: 500,
      durationMs,
      success: false,
      responseData: {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected Finnhub request error.",
      },
    });

    return {
      ok: false,
      status: 500,
      body: {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected Finnhub request error.",
      },
    };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "quote";

  if (type === "stats") {
    const totalRequests = requestLog.length;
    const successfulRequests = requestLog.filter((item) => item.success).length;
    const failedRequests = requestLog.filter((item) => !item.success).length;
    const averageResponseTimeMs =
      totalRequests > 0
        ? requestLog.reduce((sum, item) => sum + item.durationMs, 0) /
          totalRequests
        : 0;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate:
        totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      averageResponseTimeMs: Number(averageResponseTimeMs.toFixed(1)),
      uniqueSymbols: Array.from(symbolCounts.keys()).sort(),
      endpointBreakdown: Object.fromEntries(
        [...endpointCounts.entries()].sort((left, right) => right[1] - left[1]),
      ),
      recentCalls: requestLog.slice(-20).reverse(),
      availableApis: [
        { name: "Quote", path: "/api/finnhub?type=quote&symbol=AAPL" },
        { name: "Profile", path: "/api/finnhub?type=profile&symbol=AAPL" },
        {
          name: "Company News",
          path: "/api/finnhub?type=company-news&symbol=AAPL&from=2024-01-01&to=2024-12-31",
        },
        {
          name: "Market News",
          path: "/api/finnhub?type=market-news&category=general",
        },
        {
          name: "IPO Calendar",
          path: "/api/finnhub?type=ipo-calendar&from=2024-01-01&to=2024-12-31",
        },
        {
          name: "Bulk Quote",
          path: "/api/finnhub?type=bulk-quote&symbols=AAPL,MSFT,GOOGL",
        },
      ],
    });
  }

  const symbol = searchParams.get("symbol") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const cik = searchParams.get("cik") ?? undefined;
  const accessNumber = searchParams.get("accessNumber") ?? undefined;
  const form = searchParams.get("form") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  try {
    if (type === "quote") {
      if (!symbol) {
        return NextResponse.json({ error: "Missing symbol." }, { status: 400 });
      }

      const result = await proxyFinnhub("/quote", { symbol });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (type === "bulk-quote") {
      const symbols = searchParams.get("symbols") ?? "";
      if (!symbols) {
        return NextResponse.json(
          { error: "Missing symbols." },
          { status: 400 },
        );
      }

      const list = [
        ...new Set(
          symbols
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ];
      const payload = await Promise.all(
        list.map(async (item) => {
          const quoteResult = await proxyFinnhub("/quote", { symbol: item });

          if (!quoteResult.ok) {
            return null;
          }

          const quoteBody =
            typeof quoteResult.body === "object" && quoteResult.body !== null
              ? (quoteResult.body as Record<string, unknown>)
              : {};

          return {
            symbol: item,
            companyName: item,
            ...quoteBody,
          };
        }),
      );

      return NextResponse.json(payload.filter(Boolean), { status: 200 });
    }

    if (type === "search") {
      const q = searchParams.get("q") ?? "";
      const exchange = searchParams.get("exchange") ?? undefined;

      if (!q) {
        return NextResponse.json({ error: "Missing q." }, { status: 400 });
      }

      const result = await proxyFinnhub("/search", { q, exchange });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (type === "stock-symbol") {
      const exchange = searchParams.get("exchange") ?? undefined;
      const mic = searchParams.get("mic") ?? undefined;
      const securityType = searchParams.get("securityType") ?? undefined;
      const currency = searchParams.get("currency") ?? undefined;

      if (!exchange) {
        return NextResponse.json(
          { error: "Missing exchange." },
          { status: 400 },
        );
      }

      const result = await proxyFinnhub("/stock/symbol", {
        exchange,
        mic,
        securityType,
        currency,
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (type === "profile") {
      if (!symbol) {
        return NextResponse.json({ error: "Missing symbol." }, { status: 400 });
      }

      const result = await proxyFinnhub("/stock/profile2", { symbol });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (type === "market-news") {
      if (!category) {
        return NextResponse.json(
          { error: "Missing category." },
          { status: 400 },
        );
      }

      const result = await proxyFinnhub("/news", { category });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (type === "company-news") {
      if (!symbol || !from || !to) {
        return NextResponse.json(
          { error: "Missing symbol, from, or to." },
          { status: 400 },
        );
      }

      const result = await proxyFinnhub("/company-news", { symbol, from, to });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (type === "ipo-calendar") {
      if (!from || !to) {
        return NextResponse.json(
          { error: "Missing from or to date." },
          { status: 400 },
        );
      }

      const result = await proxyFinnhub("/calendar/ipo", { from, to });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (type === "sec-filings") {
      const result = await proxyFinnhub("/stock/filings", {
        symbol,
        cik,
        accessNumber,
        form,
        from,
        to,
      });

      if (!result.ok) {
        return NextResponse.json(result.body, { status: result.status });
      }

      const payload = Array.isArray(result.body) ? result.body : [];
      return NextResponse.json(payload.slice(0, 250), { status: 200 });
    }

    return NextResponse.json(
      { error: "Unsupported Finnhub API type." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while calling Finnhub.",
      },
      { status: 500 },
    );
  }
}
