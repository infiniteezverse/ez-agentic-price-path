import { createFileRoute } from "@tanstack/react-router";

const PUBLISHED_URL = "https://toll-bright-insight.lovable.app";

function buildSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Agentic Liquidity API",
      version: "1.1.0",
      description:
        "Pay-per-quote DEX router for autonomous agents. One HTTP endpoint, best-execution across 0x liquidity sources on Ethereum and Base. Locked behind HTTP 402 — agents pay 0.05 USDC per unlock, no API keys, no accounts.",
      contact: { name: "agentic.liquidity", url: PUBLISHED_URL },
    },
    servers: [
      { url: origin, description: "Current host" },
      { url: PUBLISHED_URL, description: "Production" },
    ],
    "x-mcp-server": { url: `${origin}/api/mcp`, transport: "http" },
    "x-agent-card": `${origin}/.well-known/agent.json`,
    paths: {
      "/api/v1/quote": {
        get: {
          operationId: "getQuote",
          summary: "Get best DEX route for a token pair",
          description:
            "Returns a Locked preview (HTTP 402) until a valid USDC payment receipt is supplied via `X-Payment-Receipt`. Pay 0.05 USDC on Base or Ethereum to the tollbooth wallet, then resend with the tx hash.",
          parameters: [
            {
              name: "chainId",
              in: "query",
              required: false,
              schema: { type: "integer", enum: [1, 8453], default: 1 },
              description: "1 = Ethereum mainnet, 8453 = Base",
            },
            {
              name: "sellToken",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Symbol (ETH/WETH/USDC/USDT/DAI/WBTC) or 0x contract address",
              example: "WETH",
            },
            {
              name: "buyToken",
              in: "query",
              required: true,
              schema: { type: "string" },
              example: "USDC",
            },
            {
              name: "sellAmount",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^\\d{1,40}$" },
              description: "Base-units integer (wei for 18-decimals, 6 for USDC, 8 for WBTC)",
              example: "1000000000000000000",
            },
            {
              name: "X-Payment-Receipt",
              in: "header",
              required: false,
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" },
              description: "EVM tx hash for a 0.05 USDC transfer to the tollbooth wallet",
            },
          ],
          responses: {
            "200": {
              description: "Unlocked quote",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UnlockedQuote" },
                },
              },
            },
            "402": {
              description: "Payment required — locked preview returned",
              headers: {
                "x-payment-required": { schema: { type: "string" } },
                "x-payment-instructions": { schema: { type: "string" } },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LockedPreview" },
                },
              },
            },
            "400": { description: "Invalid params" },
            "502": { description: "Upstream quote failed" },
          },
        },
      },
    },
    components: {
      schemas: {
        Token: {
          type: "object",
          required: ["address", "decimals", "symbol"],
          properties: {
            address: { type: "string" },
            decimals: { type: "integer" },
            symbol: { type: "string" },
          },
        },
        Source: {
          type: "object",
          properties: {
            name: { type: "string" },
            proportion: { type: "string" },
          },
        },
        PaymentInstructions: {
          type: "object",
          properties: {
            scheme: { type: "string", example: "x402" },
            version: { type: "integer", example: 1 },
            unlock_fee: { type: "string", example: "0.05 USDC" },
            networks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chain: { type: "string" },
                  chainId: { type: "integer" },
                  asset: { type: "string" },
                  assetAddress: { type: "string" },
                  payTo: { type: "string" },
                  amount: { type: "string" },
                },
              },
            },
            instructions: { type: "string" },
          },
        },
        LockedPreview: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["Locked"] },
            unlock_fee: { type: "string" },
            estimated_savings_usd: { type: "string" },
            price_impact_pct: { type: ["number", "null"] },
            top_source: { type: ["string", "null"] },
            receipt_status: { type: "string" },
            receipt_error: { type: ["string", "null"] },
            payment: { $ref: "#/components/schemas/PaymentInstructions" },
          },
        },
        UnlockedQuote: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["Unlocked"] },
            chainId: { type: "integer" },
            sellToken: { $ref: "#/components/schemas/Token" },
            buyToken: { $ref: "#/components/schemas/Token" },
            sellAmount: { type: "string" },
            buyAmount: { type: "string" },
            price: { type: "string" },
            guaranteedPrice: { type: "string" },
            estimatedGas: { type: "string" },
            priceImpactPct: { type: ["number", "null"] },
            estimatedSavingsUsd: { type: "number" },
            sources: { type: "array", items: { $ref: "#/components/schemas/Source" } },
          },
        },
      },
    },
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
  };
}

export const Route = createFileRoute("/openapi.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        return new Response(JSON.stringify(buildSpec(origin), null, 2), {
          status: 200,
          headers: corsHeaders(),
        });
      },
    },
  },
});
