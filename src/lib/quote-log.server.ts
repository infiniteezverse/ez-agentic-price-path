// Helpers to log /api/v1/quote calls into the public.quote_calls table.
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { VerifyResult } from "./receipt-verify.server";

export type LogQuoteCallInput = {
  chainId: number;
  sellSymbol: string;
  buySymbol: string;
  sellAmount: string;
  receipt: string | null;
  verification: VerifyResult;
  unlocked: boolean;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

function hashIp(ip?: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function logQuoteCall(input: LogQuoteCallInput): Promise<void> {
  try {
    await supabaseAdmin.from("quote_calls").insert({
      chain_id: input.chainId,
      sell_token: input.sellSymbol,
      buy_token: input.buySymbol,
      sell_amount: input.sellAmount,
      pair: `${input.sellSymbol}/${input.buySymbol}`,
      receipt_tx_hash: input.receipt,
      payer_address: input.verification.payer ?? null,
      payment_chain: input.verification.chainName ?? null,
      payment_amount_usdc: input.verification.amountUsdc ?? null,
      unlocked: input.unlocked,
      verification_status: input.verification.status,
      verification_error: input.verification.error ?? null,
      client_ip_hash: hashIp(input.ip),
      user_agent: input.userAgent?.slice(0, 200) ?? null,
    });
  } catch (e) {
    // Never block the API on logging failures
    console.error("[quote-log] insert failed:", e);
  }
}
