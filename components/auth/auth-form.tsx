"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingUp, Loader2 } from "lucide-react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/kit";
import { AmbientBackground } from "@/components/ui/ambient-background";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";
  const configured = isSupabaseConfigured();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      toast.error("Supabase is not configured. Add keys to .env.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          toast.success("Account created. Check your email to confirm, then log in.");
          router.push("/login");
          return;
        }
        toast.success("Account created — you're in with $100,000 to trade.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      }
      const redirect = new URLSearchParams(window.location.search).get("redirect") || "/dashboard";
      router.push(redirect);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <AmbientBackground />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-hairline bg-panel p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[color:var(--on-accent)]">
            <TrendingUp className="h-4.5 w-4.5" />
          </span>
          <span className="text-lg font-bold text-txt">StockPilot</span>
        </div>

        <h1 className="text-xl font-bold text-txt">
          {isSignup ? "Create your account" : "Sign in"}
        </h1>
        <p className="mt-1 text-xs text-txt-dim">
          {isSignup
            ? "Start with $100,000 in virtual cash to trade real market data."
            : "Log in to access your portfolio, watchlist, and alerts."}
        </p>

        {!configured && (
          <p className="mt-4 rounded-lg border border-[color:rgba(245,183,10,0.2)] bg-[color:var(--accent-soft)] px-3 py-2 text-[11px] text-accent">
            Supabase keys are not set in <code>.env</code> yet — auth is disabled until they are.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-txt-dim">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-hairline bg-app px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-txt-dim">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="w-full rounded-lg border border-hairline bg-app px-3 py-2.5 text-sm text-txt outline-none transition focus:border-accent"
              placeholder="At least 6 characters"
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-txt-dim">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-accent hover:text-accent-hover">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to StockPilot?{" "}
              <Link href="/signup" className="font-semibold text-accent hover:text-accent-hover">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
