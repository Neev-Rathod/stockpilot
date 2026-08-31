"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CircleAlert,
  Clock3,
  Database,
  TrendingUp,
} from "lucide-react";

type AdminCall = {
  timestamp: string;
  endpoint: string;
  path: string;
  symbol?: string;
  responseStatus: number;
  durationMs: number;
  success: boolean;
};

type AvailableApi = {
  name: string;
  path: string;
};

type AdminStats = {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTimeMs: number;
  uniqueSymbols: string[];
  endpointBreakdown: Record<string, number>;
  recentCalls: AdminCall[];
  availableApis: AvailableApi[];
};

async function fetchAdminStats(): Promise<AdminStats> {
  const response = await fetch("/api/finnhub?type=stats");
  if (!response.ok) {
    throw new Error("Unable to load admin metrics.");
  }
  return response.json();
}

export default function AdminPage() {
  const { data, isLoading, isError, error } = useQuery<AdminStats>({
    queryKey: ["finnhub-admin-stats"],
    queryFn: fetchAdminStats,
    refetchInterval: 30_000,
  });

  const stats: AdminStats = data ?? {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    successRate: 0,
    averageResponseTimeMs: 0,
    uniqueSymbols: [],
    endpointBreakdown: {},
    recentCalls: [],
    availableApis: [],
  };

  const endpointRows = Object.entries(stats.endpointBreakdown ?? {});

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-blue-400">
            Admin Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Finnhub API Overview
          </h1>
        </div>
        <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
          Live metrics
        </div>
      </div>

      {isLoading && (
        <div className="dark-card p-6 text-sm text-slate-300">
          Loading API telemetry...
        </div>
      )}

      {isError && (
        <div className="dark-card border-red-500/30 bg-red-500/5 p-6 text-sm text-red-200">
          <div className="flex items-center gap-2 font-semibold">
            <CircleAlert className="h-4 w-4" />
            Could not load metrics.
          </div>
          <div className="mt-2 text-red-300">
            {error instanceof Error ? error.message : "Unknown error"}
          </div>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<Database className="h-4 w-4 text-blue-400" />}
              label="Total Requests"
              value={stats.totalRequests}
            />
            <MetricCard
              icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
              label="Successful Calls"
              value={stats.successfulRequests}
            />
            <MetricCard
              icon={<Activity className="h-4 w-4 text-amber-400" />}
              label="Failure Rate"
              value={`${stats.failedRequests} failed`}
            />
            <MetricCard
              icon={<Clock3 className="h-4 w-4 text-violet-400" />}
              label="Avg Latency"
              value={`${stats.averageResponseTimeMs} ms`}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="dark-card p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                Endpoint Usage
              </div>
              <div className="space-y-3">
                {endpointRows.length > 0 ? (
                  endpointRows.map(([name, count]) => (
                    <div key={name}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                        <span className="font-mono">{name}</span>
                        <span>{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-linear-to-r from-blue-500 to-cyan-400"
                          style={{
                            width: `${Math.max(8, (Number(count) / Math.max(1, Number(endpointRows[0]?.[1] ?? 1))) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">
                    No endpoint requests recorded yet.
                  </p>
                )}
              </div>
            </div>

            <div className="dark-card p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                Success Metrics
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Success Rate
                  </div>
                  <div className="mt-2 text-3xl font-bold text-white">
                    {Number(stats.successRate ?? 0).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Symbols Watched
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">
                    {stats.uniqueSymbols.length}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Recent Calls
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {stats.recentCalls.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="dark-card p-5">
            <div className="mb-4 text-sm font-semibold text-white">
              Available APIs
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {stats.availableApis.length ? (
                stats.availableApis.map((api, idx) => (
                  <div
                    key={`${api.name}-${idx}`}
                    className="rounded-xl border border-[#1c1d25] bg-[#0d0e12] p-3"
                  >
                    <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400">
                      {api.name}
                    </div>
                    <div className="mt-2 break-all text-xs text-slate-300 font-mono">
                      {api.path}
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-sm text-slate-400">
                  No API routes are registered yet.
                </div>
              )}
            </div>
          </div>

          <div className="dark-card p-5">
            <div className="mb-4 text-sm font-semibold text-white">
              Recent Request Log
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Endpoint</th>
                    <th className="py-2 pr-4">Symbol</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#181921] font-mono">
                  {stats.recentCalls.length > 0 ? (
                    stats.recentCalls.map((call, index) => (
                      <tr
                        key={`${call.timestamp}-${index}`}
                        className="text-slate-300"
                      >
                        <td className="py-2 pr-4">
                          {new Date(call.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 pr-4">{call.endpoint}</td>
                        <td className="py-2 pr-4">{call.symbol ?? "—"}</td>
                        <td
                          className={`py-2 pr-4 ${call.success ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {call.success ? "OK" : "ERROR"}
                        </td>
                        <td className="py-2 pr-4">{call.durationMs} ms</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-slate-500"
                      >
                        No requests have been tracked yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="dark-card p-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-3 text-xl font-bold text-white">{value}</div>
    </div>
  );
}
