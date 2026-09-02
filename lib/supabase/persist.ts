import { getSupabaseBrowser } from "./client";
import type { Holding, PriceAlert, Transaction } from "@/lib/types";

// Background (fire-and-forget) write-through helpers. The store updates local
// state synchronously first, then calls these; failures are logged, and local
// state is re-hydrated from Supabase on the next login/reload. Keeping these
// out of the synchronous store path is what lets the WebMCP tools call
// buyStock/sellStock synchronously (lib/webmcp.ts is off-limits).

function warn(context: string, message: string) {
  console.error(`[stockpilot] Supabase persist (${context}) failed: ${message}`);
}

export async function persistBuy(
  userId: string,
  holding: Holding,
  balance: number,
  tx: Transaction,
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const [h, p, t] = await Promise.all([
    supabase.from("holdings").upsert(
      {
        user_id: userId,
        symbol: holding.symbol,
        company_name: holding.companyName,
        quantity: holding.quantity,
        average_buy_price: holding.averageBuyPrice,
      },
      { onConflict: "user_id,symbol" },
    ),
    supabase.from("profiles").update({ virtual_balance: balance }).eq("id", userId),
    supabase.from("transactions").insert({
      user_id: userId,
      symbol: tx.symbol,
      type: tx.type,
      quantity: tx.quantity,
      price: tx.price,
    }),
  ]);
  if (h.error) warn("buy/holding", h.error.message);
  if (p.error) warn("buy/balance", p.error.message);
  if (t.error) warn("buy/transaction", t.error.message);
}

export async function persistSell(
  userId: string,
  symbol: string,
  remainingQuantity: number,
  balance: number,
  tx: Transaction,
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const holdingOp =
    remainingQuantity > 0
      ? supabase
          .from("holdings")
          .update({ quantity: remainingQuantity })
          .eq("user_id", userId)
          .eq("symbol", symbol)
      : supabase.from("holdings").delete().eq("user_id", userId).eq("symbol", symbol);
  const [h, p, t] = await Promise.all([
    holdingOp,
    supabase.from("profiles").update({ virtual_balance: balance }).eq("id", userId),
    supabase.from("transactions").insert({
      user_id: userId,
      symbol: tx.symbol,
      type: tx.type,
      quantity: tx.quantity,
      price: tx.price,
    }),
  ]);
  if (h.error) warn("sell/holding", h.error.message);
  if (p.error) warn("sell/balance", p.error.message);
  if (t.error) warn("sell/transaction", t.error.message);
}

export async function persistReset(userId: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const [h, t, p] = await Promise.all([
    supabase.from("holdings").delete().eq("user_id", userId),
    supabase.from("transactions").delete().eq("user_id", userId),
    supabase.from("profiles").update({ virtual_balance: 100000 }).eq("id", userId),
  ]);
  if (h.error) warn("reset/holdings", h.error.message);
  if (t.error) warn("reset/transactions", t.error.message);
  if (p.error) warn("reset/balance", p.error.message);
}

export async function addWatchlist(userId: string, symbol: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const { error } = await supabase
    .from("watchlist")
    .upsert({ user_id: userId, symbol }, { onConflict: "user_id,symbol" });
  if (error) warn("watchlist/add", error.message);
}

export async function removeWatchlist(userId: string, symbol: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", userId)
    .eq("symbol", symbol);
  if (error) warn("watchlist/remove", error.message);
}

export async function addAlert(userId: string, alert: PriceAlert): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const { error } = await supabase.from("price_alerts").insert({
    id: alert.id,
    user_id: userId,
    symbol: alert.symbol,
    target_price: alert.targetPrice,
    condition: alert.condition,
    triggered: alert.triggered,
  });
  if (error) warn("alert/add", error.message);
}

export async function removeAlert(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  const { error } = await supabase
    .from("price_alerts")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) warn("alert/remove", error.message);
}
