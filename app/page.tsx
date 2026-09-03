"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  TrendingUp,
  FileSearch,
  GitCompareArrows,
  LineChart,
  Bot,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AmbientBackground } from "@/components/ui/ambient-background";

const features = [
  { icon: FileSearch, title: "Reads SEC filings", body: "The agent opens a company's latest filings, highlights what matters, and scores the risk from real history." },
  { icon: LineChart, title: "Real technical analysis", body: "Support/resistance, correlation, indicators and backtests — computed from 10 years of real prices, not guessed." },
  { icon: GitCompareArrows, title: "Compares on command", body: "“Compare NVDA and AMD over a year” — the agent drives the chart while you watch." },
  { icon: TrendingUp, title: "Trades with you", body: "Buy, sell, rebalance and set alerts on a $100k paper account — you or the agent, same live state." },
];

const steps = [
  { n: "01", title: "Open in ChatGPT", body: "Load StockPilot in ChatGPT's in-app browser (or Chrome with WebMCP)." },
  { n: "02", title: "Ask the agent", body: "“Analyze AAPL's latest filing and highlight the risks,” or “buy me a diversified portfolio.”" },
  { n: "03", title: "Watch it work", body: "The agent calls the page's tools — the UI reacts live, and you stay in control." },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-app text-txt">
      <AmbientBackground />

      {/* nav */}
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[color:var(--on-accent)]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M12 2L2 12l10 10 10-10L12 2zm0 4.5l6.5 6.5-6.5 6.5-6.5-6.5L12 6.5z" />
            </svg>
          </span>
          <span className="text-base font-bold tracking-tight">StockPilot</span>
        </div>
        <Link href="/login" className="text-sm font-semibold text-txt-dim transition hover:text-txt">
          Sign in
        </Link>
      </header>

      {/* hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pt-10 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:rgba(245,183,10,0.25)] bg-[color:var(--accent-soft)] px-3 py-1 text-[11px] font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Built on WebMCP
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
            Trade with an AI agent that <span className="text-accent">reads the market</span> for you.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-txt-dim">
            StockPilot turns a full trading terminal into tools an AI agent can operate — analyzing
            SEC filings, running real backtests, comparing stocks, and placing paper trades, live,
            alongside you.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-[color:var(--on-accent)] transition hover:bg-accent-hover"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-elevated px-5 py-3 text-sm font-semibold text-txt-dim transition hover:text-txt"
            >
              Sign in
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-txt-mute">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            $100,000 virtual account · real market data · no real money
          </div>
        </motion.div>

        {/* hero mock */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="relative"
        >
          <div className="rounded-2xl border border-hairline bg-panel p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="font-mono text-sm font-bold">AAPL <span className="text-txt-mute">· NASDAQ</span></div>
              <div className="font-mono text-sm font-bold text-up">$325.13 ▲ 2.61%</div>
            </div>
            <svg viewBox="0 0 320 110" className="mt-3 h-28 w-full">
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(245,183,10,0.35)" />
                  <stop offset="100%" stopColor="rgba(245,183,10,0)" />
                </linearGradient>
              </defs>
              <path d="M0,80 L40,74 L80,84 L120,60 L160,66 L200,44 L240,52 L280,30 L320,20 L320,110 L0,110 Z" fill="url(#g)" />
              <path d="M0,80 L40,74 L80,84 L120,60 L160,66 L200,44 L240,52 L280,30 L320,20" fill="none" stroke="#f5b70a" strokeWidth="2" />
            </svg>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-[11px] text-txt-dim">
              <div className="rounded-lg border border-hairline bg-elevated py-1.5">O 316.98</div>
              <div className="rounded-lg border border-hairline bg-elevated py-1.5">H 327.30</div>
              <div className="rounded-lg border border-hairline bg-elevated py-1.5">L 314.73</div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="absolute -bottom-5 -right-3 flex max-w-[240px] items-start gap-2 rounded-xl border border-hairline bg-elevated px-3 py-2.5 shadow-xl"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-[color:var(--on-accent)]">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs leading-snug text-txt-dim">
              &ldquo;Analyze AAPL&apos;s latest 10-Q and <span className="rounded bg-[#ffe14d] px-1 text-[#14171f]">highlight the risks</span>.&rdquo;
            </span>
          </motion.div>
        </motion.div>
      </section>

      {/* features */}
      <section className="relative mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-hairline bg-panel p-5">
              <f.icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 text-sm font-bold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-txt-dim">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-center text-xl font-bold">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-xl border border-hairline bg-panel p-5">
              <div className="font-mono text-xs font-bold text-accent">{s.n}</div>
              <h3 className="mt-2 text-sm font-bold">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-txt-dim">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-[color:var(--on-accent)] transition hover:bg-accent-hover"
          >
            Create your account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="relative border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-txt-mute">
          <span>StockPilot · paper-trading demo · not financial advice</span>
          <span>MIT · built for the WebMCP hackathon</span>
        </div>
      </footer>
    </div>
  );
}
