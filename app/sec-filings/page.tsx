import { SECFilingsPanel } from "@/components/stocks/sec-filings-panel";

export default function SecFilingsPage() {
  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Market data
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">SEC Filings</h1>
        </div>
      </div>

      <SECFilingsPanel />
    </div>
  );
}
