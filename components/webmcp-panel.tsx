"use client";

import { registerWebMcpTools, webMcpTools } from "@/lib/webmcp";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function WebMcpPanel() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);

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
      toast.success("WebMCP tools registered successfully!");
    } else {
      toast.error("WebMCP API not detected in browser.");
    }
    setRegistering(false);
  };

  useEffect(() => {
    const mcp =
      (typeof document !== "undefined" && (document as any).modelContext) ||
      (typeof navigator !== "undefined" && (navigator as any).modelContext) ||
      (typeof window !== "undefined" && (window as any).modelContext);
    setIsAvailable(!!mcp);
  }, []);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            AI tools
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
            WebMCP registry
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isAvailable
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isAvailable ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {isAvailable ? "WebMCP Active" : "WebMCP Inactive / Not Found"}
          </span>

          <button
            onClick={checkAndRegister}
            disabled={registering}
            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {registering ? "Registering..." : "Register WebMCP"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {webMcpTools.slice(0, 6).map((tool) => (
          <div
            key={tool.name}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="text-sm font-medium text-slate-900 dark:text-white">
              {tool.name}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {tool.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

