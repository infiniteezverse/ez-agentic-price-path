import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type FeedRow = {
  id: string;
  created_at: string;
  chain_id: number;
  pair: string;
  payer_address: string | null;
  payment_chain: string | null;
  payment_amount_usdc: number | null;
  receipt_tx_hash: string | null;
  unlocked: boolean;
};

export const getRecentTolls = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("quote_calls")
    .select("id, created_at, chain_id, pair, payer_address, payment_chain, payment_amount_usdc, receipt_tx_hash, unlocked")
    .eq("unlocked", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[feed] fetch failed:", error);
    return { rows: [] as FeedRow[], total24h: 0 };
  }
  // Count for last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("quote_calls")
    .select("id", { count: "exact", head: true })
    .eq("unlocked", true)
    .gte("created_at", since);
  return { rows: (data ?? []) as FeedRow[], total24h: count ?? 0 };
});
