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

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, x-payment, x-payment-receipt",
    "access-control-expose-headers": "x-payment-required, x-payment-instructions",
  };
}

export const Route = createFileRoute("/api/v1/quote")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid params", details: parsed.error.flatten() },
            { status: 400, headers: corsHeaders() },
          );
        }
        const { chainId, buyToken, sellToken, sellAmount } = parsed.data;

        const sellTok = resolveToken(chainId, sellToken);
        const buyTok = resolveToken(chainId, buyToken);
        if (!sellTok || !buyTok) {
          return Response.json(
            { error: `Unknown token symbol on chain ${chainId}. Pass an address or known symbol.` },
            { status: 400, headers: corsHeaders() },
          );
        }

        // Fetch quote (always — needed both for preview and full response)
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
            { error: "Upstream quote failed", message: err instanceof Error ? err.message : "unknown" },
            { status: 502, headers: corsHeaders() },
          );
        }

        // X402 tollbooth — real on-chain verification
        const receipt = request.headers.get(RECEIPT_HEADER) ?? request.headers.get(PAYMENT_HEADER);
        const verification = await verifyOnChainReceipt(receipt);
        const valid = verification.ok;
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
        const userAgent = request.headers.get("user-agent");

        // Fire-and-forget log (await so serverless completes before response)
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
        });

        if (!valid) {
          const wallet = process.env.PAYMENT_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000000";
          const instructions = {
            scheme: "x402",
            version: 1,
            unlock_fee: `${UNLOCK_FEE_USDC} USDC`,
            networks: [
              {
                chain: "base",
                chainId: 8453,
                asset: "USDC",
                assetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                payTo: wallet,
                amount: UNLOCK_FEE_USDC,
              },
              {
                chain: "ethereum",
                chainId: 1,
                asset: "USDC",
                assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                payTo: wallet,
                amount: UNLOCK_FEE_USDC,
              },
            ],
            instructions:
              "Send the unlock fee to the payTo address, then resend your request including header `X-Payment-Receipt: <tx-hash>`.",
          };
          const preview = {
            estimated_savings_usd: quote.estimatedSavingsUsd.toFixed(2),
            price_impact_pct: quote.priceImpactPct,
            top_source: quote.sources?.[0]?.name ?? null,
            status: "Locked",
            unlock_fee: `${UNLOCK_FEE_USDC} USDC`,
            payment: instructions,
          };
          return Response.json(preview, {
            status: 402,
            headers: {
              ...corsHeaders(),
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

        return Response.json(
          {
            status: "Unlocked",
            chainId,
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
          { status: 200, headers: corsHeaders() },
        );
      },
    },
  },
});

