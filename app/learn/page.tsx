"use client";

import Link from "next/link";
import { GraduationCap, ArrowRight, Lightbulb } from "lucide-react";
import { Panel } from "@/components/ui/kit";

const topics = [
  { tag: "Fundamentals", title: "What is a stock?", description: "A stock represents fractional ownership in a corporation. Shareholders participate in the company's equity value and price movements.", targetUrl: "/stock/AAPL", targetLabel: "Inspect AAPL" },
  { tag: "Execution", title: "How does buying a stock work?", description: "Orders execute at the current market price. Your position value then moves with supply, demand, earnings, and news.", targetUrl: "/stock/MSFT", targetLabel: "Try a virtual buy" },
  { tag: "Risk", title: "What is volatility?", description: "Volatility measures how quickly a price moves over time. Higher volatility means larger swings and wider risk.", targetUrl: "/compare", targetLabel: "Compare volatility" },
  { tag: "Technicals", title: "What is a candlestick chart?", description: "Candlesticks visualize the open, high, low, and close (OHLC) for each period — the foundation of chart analysis.", targetUrl: "/stock/NVDA", targetLabel: "View a live chart" },
  { tag: "Technicals", title: "What are moving averages & RSI?", description: "Moving averages smooth price to reveal trend; RSI gauges momentum (overbought above 70, oversold below 30). Toggle them on any chart.", targetUrl: "/stock/TSLA", targetLabel: "Add indicators" },
  { tag: "Accounting", title: "What is profit & loss (P&L)?", description: "Profit is realized when exit value exceeds your cost basis; loss is the reverse. Track it live on your portfolio.", targetUrl: "/portfolio", targetLabel: "Check portfolio P&L" },
  { tag: "Risk Management", title: "What is diversification?", description: "Spreading capital across non-correlated sectors reduces concentration risk. See your mix in the allocation chart.", targetUrl: "/portfolio", targetLabel: "View allocation" },
  { tag: "Corporate", title: "What is an IPO?", description: "An Initial Public Offering is a company's first sale of shares to public investors.", targetUrl: "/ipos", targetLabel: "See upcoming IPOs" },
];

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <Panel className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[color:var(--accent-soft)] blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-txt-mute">
            <GraduationCap className="h-4 w-4 text-accent" />
            Academy
          </div>
          <h1 className="mt-2 text-2xl font-bold text-txt">Investing & trading basics</h1>
          <p className="mt-1 max-w-2xl text-sm text-txt-dim">
            Learn the essentials, then practice risk-free with virtual funds and real market data.
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topics.map((topic) => (
          <Panel key={topic.title} className="group flex flex-col justify-between transition hover:border-hairline-strong">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-[color:rgba(245,183,10,0.2)] bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-accent">
                  {topic.tag}
                </span>
                <Lightbulb className="h-4 w-4 text-txt-mute" />
              </div>
              <h2 className="mt-3 text-base font-bold text-txt">{topic.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-txt-dim">{topic.description}</p>
            </div>
            <div className="mt-5 border-t border-hairline pt-3">
              <Link href={topic.targetUrl} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-hover">
                {topic.targetLabel} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
