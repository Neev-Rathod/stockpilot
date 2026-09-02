"use client";

import { registerWebMcpTools, webMcpTools, webMcpCategories } from "@/lib/webmcp";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Cpu,
  TrendingUp,
  Wallet,
  Bell,
  Navigation,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";

const categoryIcons: Record<string, React.ElementType> = {
  "Market Data": TrendingUp,
  "Chart Patterns": Cpu,
  "Chart Canvas & Comparison": Layers,
  Portfolio: Wallet,
  "Watchlist & Alerts": Bell,
  Navigation: Navigation,
  "AI Strategy": Bot,
  Education: GraduationCap,
};

const categoryColors: Record<string, { badge: string; dot: string; border: string }> = {
  "Market Data": { badge: "bg-blue-500/10 text-blue-400", dot: "bg-blue-400", border: "border-blue-500/20" },
  "Chart Patterns": { badge: "bg-purple-500/10 text-purple-400", dot: "bg-purple-400", border: "border-purple-500/20" },
  "Chart Canvas & Comparison": { badge: "bg-indigo-500/10 text-indigo-400", dot: "bg-indigo-400", border: "border-indigo-500/20" },
  Portfolio: { badge: "bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-500/20" },
  "Watchlist & Alerts": { badge: "bg-amber-500/10 text-amber-400", dot: "bg-amber-400", border: "border-amber-500/20" },
  Navigation: { badge: "bg-cyan-500/10 text-cyan-400", dot: "bg-cyan-400", border: "border-cyan-500/20" },
  "AI Strategy": { badge: "bg-rose-500/10 text-rose-400", dot: "bg-rose-400", border: "border-rose-500/20" },
  Education: { badge: "bg-orange-500/10 text-orange-400", dot: "bg-orange-400", border: "border-orange-500/20" },
};

export function WebMcpPanel() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["Chart Patterns", "Chart Canvas & Comparison", "AI Strategy"]),
  );

  const checkAndRegister = async () => {
    setRegistering(true);
    const mcp =
      (typeof document !== "undefined" && (document as any).modelContext) ||
      (typeof navigator !== "undefined" && (navigator as any).modelContext) ||
      (typeof window !== "undefined" && (window as any).modelContext);

    const available = !!mcp;
    setIsAvailable(available);

    if (available) {
      await registerWebMcpTools();
      toast.success(`${webMcpTools.length} WebMCP tools registered!`);
    } else {
      toast.error("WebMCP API not detected. Enable chrome://flags/#enable-webmcp-testing.");
    }
    setRegistering(false);
  };

  useEffect(() => {
    const mcp =
      (typeof document !== "undefined" && (document as any).modelContext) ||
      (typeof navigator !== "undefined" && (navigator as any).modelContext) ||
      (typeof window !== "undefined" && (window as any).modelContext);
    setIsAvailable(!!mcp);

    if (mcp) {
      registerWebMcpTools();
    }
  }, []);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const toolsByCategory = webMcpCategories.map((cat) => ({
    category: cat,
    tools: webMcpTools.filter((t) => t.category === cat),
  }));

  return (
    <div className="rounded-3xl border border-white/[0.06] bg-[#0d0e12] p-5">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <Bot className="h-3.5 w-3.5" />
            AI Tools · WebMCP
          </div>
          <h3 className="mt-1.5 text-lg font-semibold text-white">
            Agent Tool Registry
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {webMcpTools.length} tools across {webMcpCategories.length} categories
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isAvailable
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : isAvailable === false
                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                : "bg-slate-800 text-slate-400 border border-white/[0.04]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isAvailable ? "bg-emerald-400 animate-pulse" : isAvailable === false ? "bg-red-400" : "bg-slate-500"
              }`}
            />
            {isAvailable ? "WebMCP Active" : isAvailable === false ? "WebMCP Inactive" : "Checking…"}
          </span>

          <button
            onClick={checkAndRegister}
            disabled={registering}
            className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {registering ? "Registering…" : "Register Tools"}
          </button>
        </div>
      </div>

      {/* Category Groups */}
      <div className="space-y-2">
        {toolsByCategory.map(({ category, tools }) => {
          const Icon = categoryIcons[category] ?? Bot;
          const colors = categoryColors[category] ?? { badge: "bg-slate-800 text-slate-400", dot: "bg-slate-400", border: "border-white/[0.06]" };
          const isExpanded = expandedCategories.has(category);

          return (
            <div
              key={category}
              className={`rounded-2xl border ${colors.border} overflow-hidden`}
            >
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${colors.badge}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-semibold text-slate-200">{category}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${colors.badge}`}>
                    {tools.length}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                )}
              </button>

              {isExpanded && (
                <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
                  {tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 transition hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />
                        <div>
                          <div className="font-mono text-[11px] font-semibold text-slate-200">
                            {tool.name}
                          </div>
                          <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                            {tool.description.split(".")[0]}.
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="mt-4 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3">
        <p className="text-[10px] leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-400">How to use:</span> Enable{" "}
          <code className="rounded bg-white/[0.06] px-1 text-slate-300">chrome://flags/#enable-webmcp-testing</code>{" "}
          in Chrome Canary, then any AI model on the page can call these tools to analyze charts, trade stocks, detect patterns, and navigate the app.
        </p>
      </div>
    </div>
  );
}
