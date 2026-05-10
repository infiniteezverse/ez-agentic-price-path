import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { fetch0xQuote, resolveToken } from "@/lib/liquidity.server";
import { verifyOnChainReceipt } from "@/lib/receipt-verify.server";
import { logQuoteCall } from "@/lib/quote-log.server";
import {
  paymentRequirements,
  tryDecodePayment,
  verifyWithCdp,
  settleWithCdp,
  UNLOCK_FEE_DOLLARS,
} from "@/lib/cdp-facilitator.server";
import type { VerifyResult } from "@/lib/receipt-verify.server";

const QuerySchema = z.object({
  buyToken: z.string().min(1).max(64),
  sellToken: z.string().min(1).max(64),
  sellAmount: z.string().regex(/^\d{1,40}$/, "sellAmount must be base-units integer"),
  chainId: z.coerce.number().int().refine((c) => c === 1 || c === 8453, "chainId must be 1 or 8453").default(1),
});

const X_PAYMENT = "x-payment";
const X_PAYMENT_RESPONSE = "x-payment-response";
const LEGACY_RECEIPT_HEADER = "x-payment-receipt";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function corsHeaders(requestId?: string) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, x-payment, x-payment-receipt",
    "access-control-expose-headers":
      "x-payment-response, x-payment-required, x-request-id",
    ...(requestId ? { "x-request-id": requestId } : {}),
  };
}

function payRequiredBody(origin: string, reason: string, extra?: Record<string, unknown>) {
  const wallet = process.env.PAYMENT_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000000";
  return {
    x402Version: 1,
    error: reason,
    accepts: [paymentRequirements(origin)],
    // Backward-compatible legacy hint for receipt-style callers
    legacy: {
      scheme: "x-payment-receipt",
      unlock_fee: `${UNLOCK_FEE_DOLLARS} USDC`,
      networks: [
        { chain: "base", chainId: 8453, asset: "USDC", assetAddress: USDC_BASE, payTo: wallet, amount: String(UNLOCK_FEE_DOLLARS) },
        { chain: "ethereum", chainId: 1, asset: "USDC", assetAddress: USDC_ETH, payTo: wallet, amount: String(UNLOCK_FEE_DOLLARS) },
      ],
      instructions:
        "Send the unlock fee on-chain, then resend with header `X-Payment-Receipt: <tx-hash>`. Or use x402 X-PAYMENT header (preferred).",
    },
    ...(extra ?? {}),
  };
}

export const Route = createFileRoute("/api/v1/quote")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),

      GET: async ({ request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const requestId = crypto.randomUUID();
        const baseHeaders = corsHeaders(requestId);

        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid params", details: parsed.error.flatten() },
            { status: 400, headers: baseHeaders },
          );
        }
        const { chainId, buyToken, sellToken, sellAmount } = parsed.data;

        const sellTok = resolveToken(chainId, sellToken);
        const buyTok = resolveToken(chainId, buyToken);
        if (!sellTok || !buyTok) {
          return Response.json(
            { error: `Unknown token symbol on chain ${chainId}. Pass an address or known symbol.` },
            { status: 400, headers: baseHeaders },
          );
        }

        // ---- Payment resolution ----
        // Path A: x402 X-PAYMENT header verified via CDP facilitator (preferred).
        // Path B: legacy X-Payment-Receipt tx-hash verified on-chain.
        const xPaymentHeader = request.headers.get(X_PAYMENT);
        const legacyReceipt = request.headers.get(LEGACY_RECEIPT_HEADER);
        const requirements = paymentRequirements(origin);

        let unlocked = false;
        let settleResponseHeader: string | null = null;
        let paymentMode: "x402" | "legacy" | "none" = "none";
        let paymentReason = "missing";
        let logReceipt: string | null = null;
        let logVerification: VerifyResult = { ok: false, status: "missing" } as unknown as VerifyResult;

        if (xPaymentHeader) {
          paymentMode = "x402";
          const decoded = tryDecodePayment(xPaymentHeader);
          if (!decoded) {
            paymentReason = "invalid_x_payment_header";
          } else {
            try {
              const verifyResult = await verifyWithCdp(decoded, requirements);
              if (!verifyResult.isValid) {
                paymentReason = verifyResult.invalidReason ?? "verify_failed";
              } else {
                unlocked = true;
                logReceipt = verifyResult.payer ?? null;
                logVerification = { ok: true, status: "verified", payer: verifyResult.payer ?? null } as unknown as VerifyResult;
              }
            } catch (e) {
              paymentReason = e instanceof Error ? e.message : "verify_error";
            }
          }
        } else if (legacyReceipt) {
          paymentMode = "legacy";
          logReceipt = legacyReceipt;
          const v = await verifyOnChainReceipt(legacyReceipt);
          logVerification = { ok: v.ok, status: v.status, error: v.error };
          if (v.ok) unlocked = true;
          else paymentReason = v.error ?? v.status;
        }

        // Fetch quote regardless (we need savings for preview body)
        let quote;
        try {
          quote = await fetch0xQuote({
            chainId,
            sellToken: sellTok.address,
            buyToken: buyTok.address,
            sellAmount,
          });
        } catch (err) {
          return Response.json(
            { error: "Upstream quote failed", details: err instanceof Error ? err.message : "unknown" },
            { status: 502, headers: baseHeaders },
          );
        }

        // Replay protection on legacy receipts
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
        const userAgent = request.headers.get("user-agent");
        const logResult = await logQuoteCall({
          chainId,
          sellSymbol: sellTok.symbol,
          buySymbol: buyTok.symbol,
          sellAmount,
          receipt: logReceipt,
          verification: logVerification,
          unlocked,
          ip,
          userAgent,
          requestId,
        });
        if (paymentMode === "legacy" && logResult.duplicateReceipt) {
          unlocked = false;
          paymentReason = "receipt_already_used";
        }

        const savings = Number(quote.estimatedSavingsUsd ?? 0);
        const ms = Date.now() - t0;

        if (!unlocked) {
          const body = payRequiredBody(origin, paymentReason, {
            preview: {
              estimated_savings_usd: Number(savings.toFixed(4)),
              price_impact_pct: quote.priceImpactPct,
              top_source: quote.sources?.[0]?.name ?? null,
              unlock_fee_usd: UNLOCK_FEE_DOLLARS,
              reason:
                savings > UNLOCK_FEE_DOLLARS ? "Savings exceed unlock fee" : "Savings below unlock fee",
            },
            request_id: requestId,
          });
          console.log(JSON.stringify({
            evt: "quote", request_id: requestId, status: 402, chain: chainId, mode: paymentMode,
            pair: `${sellTok.symbol}/${buyTok.symbol}`, unlocked: false, savings_usd: body.preview.estimated_savings_usd, ms,
          }));
          return Response.json(body, {
            status: 402,
            headers: {
              ...baseHeaders,
              "x-payment-required": "true",
            },
          });
        }

        // Settle x402 payment AFTER successful work (per x402 spec).
        if (paymentMode === "x402" && xPaymentHeader) {
          try {
            const decoded = tryDecodePayment(xPaymentHeader)!;
            const settled = await settleWithCdp(decoded, requirements);
            // Encode settle result for X-PAYMENT-RESPONSE (base64 JSON per spec)
            settleResponseHeader = btoa(JSON.stringify({
              success: settled.success,
              transaction: settled.transaction,
              network: settled.network,
              payer: settled.payer,
            }));
          } catch (e) {
            // If settlement fails, surface it but still return the quote (caller already verified).
            console.log(JSON.stringify({ evt: "settle_failed", request_id: requestId, error: e instanceof Error ? e.message : "unknown" }));
          }
        }

        const rawAny = quote.raw as { fees?: { integratorFee?: { amount?: string; token?: string } } } | null;
        const integratorFee = rawAny?.fees?.integratorFee ?? null;
        const affiliateFee = integratorFee
          ? {
              recipient: process.env.PAYMENT_WALLET_ADDRESS ?? null,
              bps: Number(process.env.ZEROX_FEE_BPS ?? "25"),
              amount: integratorFee.amount ?? null,
              token: integratorFee.token ?? null,
            }
          : null;

        console.log(JSON.stringify({
          evt: "quote", request_id: requestId, status: 200, chain: chainId, mode: paymentMode,
          pair: `${sellTok.symbol}/${buyTok.symbol}`, unlocked: true, savings_usd: savings, ms,
        }));

        return Response.json(
          {
            status: "Unlocked",
            chainId,
            request_id: requestId,
            sellToken: sellTok,
            buyToken: buyTok,
            sellAmount: quote.sellAmount,
            buyAmount: quote.buyAmount,
            price: quote.price,
            guaranteedPrice: quote.guaranteedPrice,
            estimatedGas: quote.estimatedGas,
            priceImpactPct: quote.priceImpactPct,
            estimatedSavingsUsd: quote.estimatedSavingsUsd,
            sources: quote.sources,
            affiliateFee,
            raw: quote.raw,
          },
          {
            status: 200,
            headers: {
              ...baseHeaders,
              ...(settleResponseHeader ? { [X_PAYMENT_RESPONSE]: settleResponseHeader } : {}),
            },
          },
        );
      },
    },
  },
});
