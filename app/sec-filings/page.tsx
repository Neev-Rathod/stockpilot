import { SECFilingsPanel } from "@/components/stocks/sec-filings-panel";

export default function SecFilingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-txt-mute">Research</div>
        <h1 className="mt-1 text-xl font-bold text-txt">SEC Filings</h1>
        <p className="mt-0.5 text-xs text-txt-mute">
          Open a filing to read it inline. Ask the agent to analyze one and it will highlight the key
          passages and score the risk.
        </p>
      </div>
      <SECFilingsPanel />
    </div>
  );
}
