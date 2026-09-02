// One-time import of the local OHLCV CSVs into Supabase.
//
// Usage (Node 20.6+ can load .env directly):
//   node --env-file=.env scripts/import-csv-to-supabase.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
// The service-role key bypasses RLS and must NEVER be shipped to the browser.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env scripts/import-csv-to-supabase.mjs",
  );
  process.exit(1);
}

// symbol -> { name, sector }. Matches the 10 files in ohclv/.
const STOCK_META = {
  AAPL: { name: "Apple Inc.", sector: "Technology" },
  AMD: { name: "Advanced Micro Devices, Inc.", sector: "Technology" },
  AMZN: { name: "Amazon.com, Inc.", sector: "Consumer Cyclical" },
  CSCO: { name: "Cisco Systems, Inc.", sector: "Technology" },
  META: { name: "Meta Platforms, Inc.", sector: "Communication Services" },
  MSFT: { name: "Microsoft Corporation", sector: "Technology" },
  NFLX: { name: "Netflix, Inc.", sector: "Communication Services" },
  QCOM: { name: "QUALCOMM Incorporated", sector: "Technology" },
  SBUX: { name: "Starbucks Corporation", sector: "Consumer Cyclical" },
  TSLA: { name: "Tesla, Inc.", sector: "Consumer Cyclical" },
};

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function toNumber(value) {
  return Number(String(value).replace(/[$,]/g, ""));
}

// Input date is MM/DD/YYYY -> ISO YYYY-MM-DD.
function toIsoDate(value) {
  const [m, d, y] = value.trim().split("/");
  if (!m || !d || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseCsv(symbol, csv) {
  const lines = csv.trim().split(/\r?\n/).slice(1); // drop header
  const rows = [];
  for (const line of lines) {
    const [date, close, volume, open, high, low] = line.split(",");
    const iso = toIsoDate(date);
    const closeNum = toNumber(close);
    if (!iso || !Number.isFinite(closeNum)) continue;
    rows.push({
      symbol,
      date: iso,
      open: toNumber(open),
      high: toNumber(high),
      low: toNumber(low),
      close: closeNum,
      volume: Math.round(toNumber(volume)) || 0,
    });
  }
  return rows;
}

async function chunkedUpsert(table, rows, conflict, size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: conflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function main() {
  const dir = path.join(process.cwd(), "ohclv");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".csv"));
  if (!files.length) {
    console.error(`No CSV files found in ${dir}`);
    process.exit(1);
  }

  let totalPrices = 0;
  for (const file of files) {
    const symbol = path.basename(file, ".csv").toUpperCase();
    const meta = STOCK_META[symbol] ?? { name: symbol, sector: null };

    const { error: stockError } = await supabase
      .from("stocks")
      .upsert(
        { symbol, name: meta.name, sector: meta.sector, exchange: "NASDAQ", currency: "USD" },
        { onConflict: "symbol" },
      );
    if (stockError) throw new Error(`stocks upsert failed for ${symbol}: ${stockError.message}`);

    const csv = await fs.readFile(path.join(dir, file), "utf8");
    const rows = parseCsv(symbol, csv);
    await chunkedUpsert("stock_prices", rows, "symbol,date");
    totalPrices += rows.length;
    console.log(`Imported ${symbol}: ${rows.length} rows`);
  }

  console.log(`\nDone. ${files.length} symbols, ${totalPrices} price rows total.`);
}

main().catch((error) => {
  console.error("Import failed:", error.message);
  process.exit(1);
});
