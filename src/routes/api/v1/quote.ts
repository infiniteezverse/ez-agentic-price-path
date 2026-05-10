import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { fetch0xQuote, resolveToken } from "@/lib/liquidity.server";
import { verifyOnChainReceipt } from "@/lib/receipt-verify.server";
import { logQuoteCall } from "@/lib/quote-log.server";

const QuerySchema = z.object({
  buyToken: z.string().min(1).max(64),
  sellToken: z.string().min(1).max(64),
  sellAmount: z.string().regex(/^\d{1,40}$/, "sellAmount must be base-units integer"),
  chainId: z.coerce.number().int().refine((c) => c === 1 || c === 8453, "chainId must be 1 or 8453").default(1),
});

const PAYMENT_HEADER = "x-payment";
const RECEIPT_HEADER = "x-payment-receipt";
const UNLOCK_FEE_USDC = "0.05";
const UNLOCK_FEE_USD_NUM = 0.05;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function x402Headers(origin: string) {
  const wallet = process.env.PAYMENT_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000000";
  return {
    "x-402-price": `${UNLOCK_FEE_USDC} USDC`,
    "x-402-chain": "base",
    "x-402-address": wallet,
    "x-402-asset": USDC_BASE,
    "x-402-jwks": `${origin}/.well-known/jwks.json`,
  };
}

function corsHeaders(origin: string, requestId?: string) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, x-payment, x-payment-receipt",
    "access-control-expose-headers":
      "x-payment-required, x-payment-instructions, x-request-id, x-402-price, x-402-chain, x-402-address, x-402-asset, x-402-jwks",
    ...x402Headers(origin),
    ...(requestId ? { "x-request-id": requestId } : {}),
  };
}

export const Route = createFileRoute("/api/v1/quote")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const url = new URL(request.url);
        return new Response(null, { status: 204, headers: corsHeaders(`${url.protocol}//${url.host}`) });
      },
      GET: async ({ request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const requestId = crypto.randomUUID();
        const baseHeaders = corsHeaders(origin, requestId);

        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          console.log(JSON.stringify({ evt: "quote", request_id: requestId, status: 400, ms: Date.now() - t0 }));
          return Response.json(
            { error: "Invalid params", details: parsed.error.flatten() },
            { status: 400, headers: baseHeaders },
          );
        }
        const { chainId, buyToken, sellToken, sellAmount } = parsed.data;

        const sellTok = resolveToken(chainId, sellToken);
        const buyTok = resolveToken(chainId, buyToken);
        if (!sellTok || !buyTok) {
          console.log(JSON.stringify({ evt: "quote", request_id: requestId, status: 400, chain: chainId, ms: Date.now() - t0 }));
          return Response.json(
            { error: `Unknown token symbol on chain ${chainId}. Pass an address or known symbol.` },
            { status: 400, headers: baseHeaders },
          );
        }

        let quote;
        try {
          quote = await fetch0xQuote({
            chainId,
            sellToken: sellTok.address,
            buyToken: buyTok.address,
            sellAmount,
          });
        } catch (err) {
          console.log(JSON.stringify({
            evt: "quote", request_id: requestId, status: 502, chain: chainId,
            pair: `${sellTok.symbol}/${buyTok.symbol}`, ms: Date.now() - t0,
            error: err instanceof Error ? err.message : "unknown",
          }));
          return Response.json(
            { error: "Upstream quote failed", message: err instanceof Error ? err.message : "unknown" },
            { status: 502, headers: baseHeaders },
          );
        }

        const receipt = request.headers.get(RECEIPT_HEADER) ?? request.headers.get(PAYMENT_HEADER);
        const verification = await verifyOnChainReceipt(receipt);
        const valid = verification.ok;
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
        const userAgent = request.headers.get("user-agent");

        await logQuoteCall({
          chainId,
          sellSymbol: sellTok.symbol,
          buySymbol: buyTok.symbol,
          sellAmount,
          receipt,
          verification,
          unlocked: valid,
          ip,
          userAgent,
          requestId,
        });

        const savings = Number(quote.estimatedSavingsUsd ?? 0);
        const ms = Date.now() - t0;

        if (!valid) {
          const wallet = process.env.PAYMENT_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000000";
          const instructions = {
            scheme: "x402",
            version: 1,
            unlock_fee: `${UNLOCK_FEE_USDC} USDC`,
            networks: [
              { chain: "base", chainId: 8453, asset: "USDC", assetAddress: USDC_BASE, payTo: wallet, amount: UNLOCK_FEE_USDC },
              { chain: "ethereum", chainId: 1, asset: "USDC", assetAddress: USDC_ETH, payTo: wallet, amount: UNLOCK_FEE_USDC },
            ],
            instructions:
              "Send the unlock fee to the payTo address, then resend your request including header `X-Payment-Receipt: <tx-hash>`.",
          };
          const preview = {
            status: "payment_required",
            unlock_fee_usd: UNLOCK_FEE_USD_NUM,
            unlock_fee: `${UNLOCK_FEE_USDC} USDC`,
            estimated_savings_usd: Number(savings.toFixed(4)),
            reason: savings > UNLOCK_FEE_USD_NUM ? "Savings exceed unlock fee" : "Savings below unlock fee",
            price_impact_pct: quote.priceImpactPct,
            top_source: quote.sources?.[0]?.name ?? null,
            receipt_status: receipt ? verification.status : "missing",
            receipt_error: verification.error ?? null,
            request_id: requestId,
            payment: instructions,
          };
          console.log(JSON.stringify({
            evt: "quote", request_id: requestId, status: 402, chain: chainId,
            pair: `${sellTok.symbol}/${buyTok.symbol}`, unlocked: false,
            savings_usd: preview.estimated_savings_usd, receipt_status: preview.receipt_status, ms,
          }));
          return Response.json(preview, {
            status: 402,
            headers: {
              ...baseHeaders,
              "x-payment-required": "true",
              "x-payment-instructions": JSON.stringify(instructions),
            },
          });
        }

        const rawAny = quote.raw as any;
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
          evt: "quote", request_id: requestId, status: 200, chain: chainId,
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
          { status: 200, headers: baseHeaders },
        );
      },
    },
  },
});
