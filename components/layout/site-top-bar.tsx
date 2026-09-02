"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut, LogIn } from "lucide-react";
import { toast } from "sonner";
import { StockSearch } from "@/components/stocks/stock-search";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function SiteTopBar() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await supabase?.auth.signOut();
    toast.success("Signed out.");
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-[#1b1c23] bg-[#090a0d] px-6 sm:px-8">
      <div className="w-72 sm:w-96">
        <StockSearch />
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/alerts"
          aria-label="Price alerts"
          className="text-txt-mute transition-colors hover:text-txt"
        >
          <Bell className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-3 border-l border-hairline pl-4">
          {!ready ? (
            <div className="h-8 w-24 animate-pulse rounded-full bg-elevated" />
          ) : email ? (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-xs font-bold text-accent ring-1 ring-hairline">
                {email.slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden max-w-[140px] truncate text-xs font-medium text-txt-dim sm:inline-block">
                {email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated px-2.5 py-1.5 text-xs font-medium text-txt-dim transition hover:text-txt"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-[color:var(--on-accent)] transition hover:bg-accent-hover"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
