"use client";

import Link from "next/link";
import { BookOpen, GraduationCap, ArrowRight, Lightbulb, CheckCircle, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const topics = [
  {
    tag: "Fundamentals",
    title: "What is a stock?",
    description:
      "A stock represents fractional ownership in a corporation. Shareholders participate in corporate equity value and market price movements.",
    targetUrl: "/stock/AAPL",
    targetLabel: "Inspect AAPL Stock",
  },
  {
    tag: "Execution",
    title: "How does buying a stock work?",
    description:
      "Orders are submitted at current market or limit prices. Stock positions fluctuate with market supply, demand, earnings, and news.",
    targetUrl: "/stock/MSFT",
    targetLabel: "Try Virtual Buy",
  },
  {
    tag: "Risk",
    title: "What is volatility?",
    description:
      "Volatility quantifies the rate of price movement over time. High volatility indicates larger standard deviation and rapid price swings.",
    targetUrl: "/compare",
    targetLabel: "Compare Volatility",
  },
  {
    tag: "Technical Analysis",
    title: "What is a candlestick chart?",
    description:
      "Candlestick charts visualize price action during a period, depicting the open, high, low, and closing values (OHLC).",
    targetUrl: "/stock/NVDA",
    targetLabel: "View Live Chart",
  },
  {
    tag: "Trading Styles",
    title: "What is intraday trading?",
    description:
      "Intraday or day trading involves entering and liquidating asset positions within a single market session without overnight exposure.",
    targetUrl: "/",
    targetLabel: "Check Live Feed",
  },
  {
    tag: "Corporate Actions",
    title: "What is an IPO?",
    description:
      "An Initial Public Offering (IPO) is the inaugural offering of private corporate equity to institutional and retail investors.",
    targetUrl: "/",
    targetLabel: "Explore Markets",
  },
  {
    tag: "Accounting",
    title: "What is profit and loss (P/L)?",
    description:
      "Profit occurs when realized asset exit value exceeds entry purchase price. Loss reflects negative net value difference.",
    targetUrl: "/portfolio",
    targetLabel: "Check Portfolio P/L",
  },
  {
    tag: "Risk Management",
    title: "What is asset diversification?",
    description:
      "Diversification allocates capital across non-correlated sectors and asset classes to reduce unsystematic portfolio concentration risk.",
    targetUrl: "/portfolio",
    targetLabel: "View Allocation Chart",
  },
];

export default function LearnPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6 pb-12"
    >
      {/* Header Banner */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            <GraduationCap className="h-4 w-4 text-blue-400" />
            Educational Academy
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Investing & Trading Mastery
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl leading-relaxed">
            Master market terminology, technical chart analysis, and risk management strategies risk-free using StockPilot's virtual simulator.
          </p>
        </div>
      </div>

      {/* Topics Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topics.map((topic) => (
          <article
            key={topic.title}
            className="glass-card group flex flex-col justify-between rounded-3xl p-6 border border-white/[0.08] transition-all hover:-translate-y-1 hover:border-blue-500/40"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold font-mono text-blue-400 border border-blue-500/20">
                  {topic.tag}
                </span>
                <Lightbulb className="h-4 w-4 text-amber-400/80 group-hover:text-amber-400 transition-colors" />
              </div>
              <h2 className="mt-3 text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                {topic.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                {topic.description}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <Link
                href={topic.targetUrl}
                className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                {topic.targetLabel} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </motion.div>
  );
}
