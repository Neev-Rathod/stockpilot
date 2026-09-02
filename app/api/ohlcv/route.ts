import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPPORTED_SYMBOLS = new Set(["AAPL", "SBUX", "MSFT", "CSCO", "QCOM", "META", "AMZN", "TSLA", "AMD", "NFLX"]);

type CsvRow = { date: string; close: number; volume: number; open: number; high: number; low: number };

function toNumber(value: string) { return Number(value.replace(/[$,]/g, "")); }

function parseCsv(csv: string): CsvRow[] {
  return csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, close, volume, open, high, low] = line.split(",");
    return { date: new Date(`${date} 12:00:00 UTC`).toISOString().slice(0, 10), close: toNumber(close), volume: toNumber(volume), open: toNumber(open), high: toNumber(high), low: toNumber(low) };
  }).filter((row) => row.date && Number.isFinite(row.close)).sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request: NextRequest) {
  const symbols = [...new Set((request.nextUrl.searchParams.get("symbols") ?? "").split(",").map((symbol) => symbol.trim().toUpperCase()).filter((symbol) => SUPPORTED_SYMBOLS.has(symbol)))];
  if (!symbols.length) return NextResponse.json({ error: "Provide at least one supported symbol." }, { status: 400 });
  try {
    const data = await Promise.all(symbols.map(async (symbol) => {
      const csv = await readFile(path.join(process.cwd(), "ohclv", `${symbol.toLowerCase()}.csv`), "utf8");
      return { symbol, candles: parseCsv(csv) };
    }));
    return NextResponse.json({ data });
  } catch { return NextResponse.json({ error: "Local OHLCV data could not be read." }, { status: 500 }); }
}
