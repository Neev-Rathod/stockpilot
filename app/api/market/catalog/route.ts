import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

const CATALOG_PATH = path.join(process.cwd(), "data", "market-catalog.json");

type MarketCatalogItem = {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  type?: string;
  marketType?: string;
};

async function readCatalog(): Promise<MarketCatalogItem[]> {
  try {
    const content = await fs.readFile(CATALOG_PATH, "utf8");
    const parsed = JSON.parse(content) as { items?: MarketCatalogItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim().toLowerCase();

  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const catalog = await readCatalog();
  const result = catalog
    .filter((item) => {
      const symbol = (item.symbol ?? "").toLowerCase();
      const name = (item.name ?? "").toLowerCase();
      const haystack = `${symbol} ${name}`;
      return haystack.includes(query);
    })
    .slice(0, 20)
    .map((item) => ({
      symbol: item.symbol,
      name: item.name ?? item.symbol,
      exchange: item.exchange,
      currency: item.currency,
      type: item.type ?? item.marketType,
    }));

  return NextResponse.json({ data: result });
}
