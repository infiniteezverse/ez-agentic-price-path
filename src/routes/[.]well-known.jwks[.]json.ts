import { createFileRoute } from "@tanstack/react-router";

// JWK Set endpoint for x402 / CDP Facilitator discovery.
// Currently empty — will be populated when EIP-3009 signed receipts ship.
const JWKS = { keys: [] as unknown[] };

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
  };
}

export const Route = createFileRoute("/.well-known/jwks.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      GET: async () =>
        new Response(JSON.stringify(JWKS), { status: 200, headers: corsHeaders() }),
    },
  },
});
