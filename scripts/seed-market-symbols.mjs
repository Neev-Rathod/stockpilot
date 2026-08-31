import { promises as fs } from "node:fs";
import path from "node:path";

const API_KEY = process.env.TWELVE_DATA_API_KEY;
const BASE_URL = "https://api.twelvedata.com";
const TYPES = ["stock", "etf", "index", "forex", "crypto"];
const PREFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const MIN_DELAY_MS = 7500;

if (!API_KEY) {
  console.error("Missing TWELVE_DATA_API_KEY in environment.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}) for ${url}: ${text}`);
  }

  return response.json();
}

async function fetchCatalogForType(type) {
  const map = new Map();

  for (const prefix of PREFIXES) {
    const url = new URL(`${BASE_URL}/symbol_search`);
    url.searchParams.set("symbol", prefix);
    url.searchParams.set("type", type);
    url.searchParams.set("apikey", API_KEY);
    url.searchParams.set("outputsize", "100");

    try {
      const payload = await fetchJson(url.toString());
      const items = Array.isArray(payload?.data) ? payload.data : [];

      for (const item of items) {
        const symbol = String(item.symbol || "")
          .trim()
          .toUpperCase();
        if (!symbol) continue;

        map.set(symbol, {
          symbol,
          name: item.name || symbol,
          exchange: item.exchange || "",
          currency: item.currency || "",
          type: item.type || type,
          marketType: type,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch ${type} prefix ${prefix}:`, error.message);
    }

    await sleep(MIN_DELAY_MS);
  }

  return [...map.values()];
}

async function main() {
  const catalog = { generatedAt: new Date().toISOString(), items: [] };

  for (const type of TYPES) {
    console.log(`Fetching ${type} symbols...`);
    const items = await fetchCatalogForType(type);
    catalog.items.push(...items);
    console.log(`Saved ${items.length} ${type} symbols.`);
  }

  const filePath = path.join(process.cwd(), "data", "market-catalog.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(catalog, null, 2), "utf8");

  console.log(`Catalog written to ${filePath}`);
  console.log(`Total symbols: ${catalog.items.length}`);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
