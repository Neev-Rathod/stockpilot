"use client";

import { Suspense } from "react";
import { CompareDashboard } from "@/components/comparison/compare-dashboard";

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-96 items-center justify-center text-sm text-slate-400">
          Loading comparison dashboard…
        </div>
      }
    >
      <CompareDashboard />
    </Suspense>
  );
}
