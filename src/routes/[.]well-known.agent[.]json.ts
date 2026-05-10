import { createFileRoute } from "@tanstack/react-router";
import { paymentRequirements, bazaarExtension, UNLOCK_FEE_DOLLARS } from "@/lib/cdp-facilitator.server";

export const Route = createFileRoute("/.well-known/agent.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const wallet = process.env.PAYMENT_WALLET_ADDRESS ?? null;
        const requirements = paymentRequirements(origin);

        // x402 / Bazaar v0.2 manifest. Kept backward-compatible by retaining
        // the legacy `endpoints[].auth` block alongside the canonical x402
        // `payment.accepts` array (what CDP/Bazaar indexers consume).
        const manifest = {
          schema_version: "0.2",
          name: "Agentic Liquidity",
          description: bazaarExtension.bazaar.description,
          provider: { organization: "Agentic Liquidity", url: origin },
          quality: {
            uptime_target: 0.995,
            p50_latency_ms: 450,
            p95_latency_ms: 1200,
            cache_ttl_seconds: 0,
            data_sources: ["0x v2 aggregator", "70+ DEX liquidity sources"],
          },
          discovery: bazaarExtension.bazaar,
          endpoints: [
            {
              id: "quote",
              method: "GET",
              url: `${origin}/api/v1/quote`,
              description: "Return the best DEX route for a token pair.",
              input_schema: bazaarExtension.bazaar.inputSchema,
              output_schema: bazaarExtension.bazaar.outputSchema,
              payment: {
                protocol: "x402",
                version: 1,
                facilitator: "https://api.cdp.coinbase.com",
                accepts: [requirements],
                preferred_header: "X-PAYMENT",
                response_header: "X-PAYMENT-RESPONSE",
              },
              // Legacy compat for early clients still using receipt-tx flow.
              auth: {
                type: "x402",
                scheme: "HTTP 402 Payment Required",
                unlock_fee: `${UNLOCK_FEE_DOLLARS} USDC`,
                accepted_networks: [
                  { chain: "base", chainId: 8453, asset: "USDC" },
                  { chain: "ethereum", chainId: 1, asset: "USDC" },
                ],
                pay_to: wallet,
                receipt_header: "X-Payment-Receipt",
                receipt_format: "EVM transaction hash (0x + 64 hex chars)",
                docs:
                  "Preferred: send the x402 `X-PAYMENT` header (verified via CDP). Legacy: pay on-chain and resend with `X-Payment-Receipt: <txhash>`.",
              },
              affiliate_fee: {
                bps: Number(process.env.ZEROX_FEE_BPS ?? "25"),
                recipient: wallet,
                description:
                  "Quotes route through 0x with an integrator fee. Fee is taken in buyToken on swap settlement.",
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
