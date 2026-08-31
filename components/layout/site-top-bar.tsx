"use client";

import { useState } from "react";
import { Search, Mail, Bell } from "lucide-react";
import { StockSearch } from "@/components/stocks/stock-search";

export function SiteTopBar() {
  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-[#1b1c23] bg-[#090a0d] px-6 sm:px-8">
      {/* Search Bar Input (Matching Reference Images) */}
      <div className="w-72 sm:w-96">
        <StockSearch />
      </div>

      {/* User Actions & Profile (Matching Reference Images) */}
      <div className="flex items-center gap-5">
        <button
          type="button"
          aria-label="Messages"
          className="text-slate-400 hover:text-white transition-colors"
        >
          <Mail className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="text-slate-400 hover:text-white transition-colors relative"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500" />
        </button>

        {/* User Profile Avatar & Name */}
        <div className="flex items-center gap-3 border-l border-[#1f2029] pl-5">
          <div className="h-8 w-8 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
              alt="John Marker Ui"
              className="h-full w-full object-cover"
            />
          </div>
          <span className="text-xs font-medium text-slate-200 hidden sm:inline-block">
            John Marker Ui
          </span>
        </div>
      </div>
    </header>
  );
}
