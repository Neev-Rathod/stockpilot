"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bookmark,
  CalendarRange,
  FileText,
  GitCompareArrows,
  LayoutGrid,
  Newspaper,
  ReceiptText,
  ScanSearch,
  Wallet,
} from "lucide-react";

const navGroups = [
  {
    label: "Trade",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutGrid },
      { label: "Markets", href: "/markets", icon: BarChart3 },
      { label: "Watchlist", href: "/watchlist", icon: Bookmark },
      { label: "Portfolio", href: "/portfolio", icon: Wallet },
      { label: "Orders", href: "/orders", icon: ReceiptText },
      { label: "Alerts", href: "/alerts", icon: Bell },
    ],
  },
  {
    label: "Research",
    items: [
      { label: "Compare", href: "/compare", icon: GitCompareArrows },
      { label: "Analysis", href: "/analysis", icon: ScanSearch },
      { label: "News", href: "/news", icon: Newspaper },
      { label: "IPOs", href: "/ipos", icon: CalendarRange },
      { label: "SEC Filings", href: "/sec-filings", icon: FileText },
    ],
  },
];

export function SiteHeader() {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <aside className="w-56 shrink-0 border-r border-hairline bg-panel p-4 min-h-screen">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[color:var(--on-accent)]">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M12 2L2 12l10 10 10-10L12 2zm0 4.5l6.5 6.5-6.5 6.5-6.5-6.5L12 6.5z" />
          </svg>
        </div>
        <span className="text-base font-bold tracking-tight text-txt">StockPilot</span>
      </Link>

      <nav className="mt-4 flex flex-col gap-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-txt-mute">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={label}
                    href={href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
                      active
                        ? "bg-elevated text-txt font-semibold"
                        : "text-txt-dim hover:bg-elevated/60 hover:text-txt"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-accent" : "text-txt-mute"}`} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
