"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { makeQueryClient } from "@/lib/query-client";
import { registerWebMcpTools } from "@/lib/webmcp";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { usePortfolioStore } from "@/lib/portfolio-store";
import { useEffect, useState } from "react";

// Keeps the portfolio store in sync with the Supabase auth session:
// hydrate from the DB on sign-in, clear on sign-out.
function AuthSync() {
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const { hydrate, clear } = usePortfolioStore.getState();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void hydrate(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void hydrate(session.user.id);
      else clear();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  useEffect(() => {
    registerWebMcpTools();

    // Secondary attempt in case Chrome WebMCP extension/flag initializes slightly after page load
    const timer = setTimeout(() => {
      registerWebMcpTools();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      {children}
      <Toaster richColors position="top-right" closeButton />
    </QueryClientProvider>
  );
}
