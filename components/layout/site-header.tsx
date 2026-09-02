"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  CalendarRange,
  FileText,
  LayoutGrid,
  Newspaper,
  ReceiptText,
  Wallet,
} from "lucide-react";

const mainNavItems = [
  { label: "Overview", href: "/", icon: LayoutGrid },
  { label: "Markets", href: "/markets", icon: BarChart3 },
  { label: "Watchlist", href: "/watchlist", icon: Bookmark },
  { label: "Portfolio", href: "/portfolio", icon: Wallet },
  { label: "Orders", href: "/orders", icon: ReceiptText },
  { label: "News", href: "/news", icon: Newspaper },
  { label: "IPOs", href: "/ipos", icon: CalendarRange },
  { label: "SEC Filings", href: "/sec-filings", icon: FileText },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-[#1a1b22] bg-[#0d0e12] p-4 min-h-screen">
      <Link href="/" className="flex items-center gap-2.5 px-3 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[#f59e0b] text-[#0d0e12]">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M12 2L2 12l10 10 10-10L12 2zm0 4.5l6.5 6.5-6.5 6.5-6.5-6.5L12 6.5z" />
          </svg>
        </div>
        <span className="text-base font-bold tracking-tight text-white">
          StockPilot
        </span>
      </Link>

      <nav className="mt-6 flex flex-col gap-1">
        {mainNavItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname === href ||
                pathname?.startsWith(`/${href.split("/")[1] ?? ""}`);

          return (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-[#18191e] text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:bg-[#15161b] hover:text-slate-200"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400"}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
