import { createFileRoute } from "@tanstack/react-router";
import { paymentRequirements } from "@/lib/cdp-facilitator.server";
import { bazaarExtension } from "@/lib/dashboard.functions";
import { UNLOCK_FEE_DOLLARS } from "@/lib/utils";

export const Route = createFileRoute("/.well-known/agent.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const wallet = process.env.PAYMENT_WALLET_ADDRESS ?? null;
        const requirements = paymentRequirements(origin);

        // ⭐ Your toll‑booth manifest
        const manifest = {
          schema_version: "0.2",
          id: "myezverse-tollbooth",
          name: "EZ Agentic Price Path",
          description:
            "A toll booth that provides price path computation with x402 payments.",
          version: "1.0.0",
          author: "Tyler Miller",

          // JWKS for signature verification
          jwks_uri: `${origin}/.well-known/jwks.json`,

          // Quote + settle endpoints
          endpoints: {
            quote: `${origin}/api/v1/quote`,
            settle: `${origin}/api/v1/settle`,
          },

          // Payment configuration
          payment: {
            currency: "USDC",
            chain: "base",
            address: "0xDE331946DeDb6318FAe10BDD566C48ad4c623F65",
          },
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

