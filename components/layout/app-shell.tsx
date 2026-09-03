"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteTopBar } from "@/components/layout/site-top-bar";

// Routes that render full-bleed with no app chrome (sidebar / top bar).
const BARE_ROUTES = new Set(["/", "/login", "/signup"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (BARE_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <SiteHeader />
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <SiteTopBar />
        <main className="flex-1 bg-app p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
