import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/agent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const wallet = process.env.PAYMENT_WALLET_ADDRESS ?? null;

        const manifest = {
          schema_version: "0.1",
          name: "Agentic Liquidity",
          description:
            "X402-gated DEX quote API. Returns the best 0x aggregator route for an arbitrary token pair on Ethereum or Base, with price impact and savings vs single-venue baseline. Designed for autonomous agents.",
          provider: { organization: "Agentic Liquidity", url: origin },
          endpoints: [
            {
              id: "quote",
              method: "GET",
              url: `${origin}/api/v1/quote`,
              description: "Return the best DEX route for a token pair.",
              input_schema: {
                type: "object",
                required: ["buyToken", "sellToken", "sellAmount"],
                properties: {
                  buyToken: { type: "string", description: "Token symbol (e.g. USDC) or 0x address" },
                  sellToken: { type: "string", description: "Token symbol (e.g. WETH) or 0x address" },
                  sellAmount: { type: "string", description: "Base-units integer (wei / smallest unit)" },
                  chainId: { type: "integer", enum: [1, 8453], default: 1, description: "1 = Ethereum, 8453 = Base" },
                },
              },
              output_schema: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["Unlocked", "Locked"] },
                  buyAmount: { type: "string" },
                  price: { type: "string" },
                  priceImpactPct: { type: ["number", "null"] },
                  estimatedSavingsUsd: { type: "number" },
                  sources: { type: "array", items: { type: "object" } },
                },
              },
              auth: {
                type: "x402",
                scheme: "HTTP 402 Payment Required",
                unlock_fee: "0.05 USDC",
                accepted_networks: [
                  { chain: "base", chainId: 8453, asset: "USDC" },
                  { chain: "ethereum", chainId: 1, asset: "USDC" },
                ],
                pay_to: wallet,
                receipt_header: "X-Payment-Receipt",
                receipt_format: "EVM transaction hash (0x + 64 hex chars)",
                docs:
                  "Request without a receipt header returns HTTP 402 with a preview body and full payment instructions in `payment`. Resend with `X-Payment-Receipt: <txhash>` to unlock the full quote.",
              },
            },
          ],
          rate_limits: { anonymous_preview_per_minute: 60 },
        };

        return Response.json(manifest, {
          headers: {
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
