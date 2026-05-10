## Goal

Get this service into the Coinbase **x402 Bazaar** so the ~8k anonymous pings convert into discoverable, paying agent traffic. Bazaar indexing has hard requirements that our current homemade x402 flow doesn't satisfy, so we ship two things together: an upgraded `agent.json` (v2) **and** real CDP Facilitator integration so Bazaar will actually index us.

## Why our current setup is invisible

The Bazaar (CDP discovery layer) only indexes resources that:

1. Use the **CDP Facilitator** (`https://api.cdp.coinbase.com/platform/v2/x402`) for `verify` + `settle`.
2. Return a 402 body in the **canonical x402 `accepts[]` shape** (`scheme`, `network` as CAIP-2 like `eip155:8453`, `asset`, `amount` in atomic units, `payTo`, `maxTimeoutSeconds`).
3. Declare a Bazaar **discovery extension** (`description`, `input`, `inputSchema`, `output`) on each route.
4. Have completed at least **one successful settlement** through CDP.

Today we do none of these — we hand-verify USDC tx hashes, expose custom `X-402-*` headers, and our 402 body uses a custom `payment.networks[]` shape. That's why Bazaar search returns nothing for us.

`agent.json` is a separate, complementary signal (used by agent frameworks and our own MCP discovery). v0.1 is live; v0.2 adds richer, machine-actionable metadata that ranks better.

## Plan

### Step 1 — CDP account + secrets

User-side (one-time): create a CDP account, generate API key + secret, fund the toll wallet on Base.

We add three secrets via the secrets tool:

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `CDP_WALLET_PAY_TO` (already covered by existing `PAYMENT_WALLET_ADDRESS`; reuse if set)

Block the rest of the implementation until these are present.

### Step 2 — Switch `/api/v1/quote` to the CDP Facilitator x402 flow

Rewrite the 402 path in `src/routes/api/v1/quote.ts` to emit the canonical x402 v2 body:

```json
{
  "x402Version": 2,
  "error": "X-PAYMENT header required",
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "maxAmountRequired": "50000",
    "resource": "https://toll-bright-insight.lovable.app/api/v1/quote",
    "description": "Best DEX route across 0x liquidity sources",
    "mimeType": "application/json",
    "payTo": "<wallet>",
    "maxTimeoutSeconds": 60,
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "extra": { "name": "USDC", "version": "2" }
  }],
  "extensions": {
    "bazaar": { /* see Step 4 */ }
  }
}
```

Replace homemade verification with CDP Facilitator calls in a new `src/lib/cdp-facilitator.server.ts`:

- `POST /v2/x402/verify` with the buyer's `X-PAYMENT` payload before serving the quote.
- `POST /v2/x402/settle` after generating the quote, **before** returning 200.
- Forward the facilitator's `EXTENSION-RESPONSES` header back as `X-Extension-Responses` so we can confirm Bazaar accepted our metadata.
- Use Coinbase JWT auth (ES256 over the CDP API key) for verify/settle requests.

Keep `logQuoteCall` / TOCTOU replay guard intact, but key it on the facilitator's `transaction` field instead of our own tx-hash regex.

### Step 3 — Drop our custom `X-402-*` headers, add the standard ones

Remove `X-402-Price` / `X-402-Chain` / `X-402-Address` / `X-402-Asset` / `X-402-JWKS` from the response (they're not part of the spec and Bazaar ignores them). Keep CORS, `X-Request-Id`, and add `X-Payment-Response` on 200 (base64 of facilitator settle result, per spec).

JWKS endpoint stays as a stub; we'll need it later if we self-facilitate, but it's not on the Bazaar critical path.

### Step 4 — Bazaar discovery extension on the quote route

Inline (no SDK — we're on a Worker, can't use `bazaarResourceServerExtension` Node middleware) build the extension object that the facilitator expects on every verify/settle call:

```ts
const bazaarExtension = {
  input: { chainId: 8453, sellToken: "WETH", buyToken: "USDC", sellAmount: "1000000000000000000" },
  inputSchema: {
    type: "object",
    required: ["sellToken", "buyToken", "sellAmount"],
    properties: {
      chainId: { type: "integer", enum: [1, 8453], default: 1 },
      sellToken: { type: "string", description: "Symbol or 0x address" },
      buyToken: { type: "string" },
      sellAmount: { type: "string", pattern: "^\\d{1,40}$" },
    },
  },
  output: {
    example: { status: "Unlocked", buyAmount: "3421750000", price: "3421.75", estimatedSavingsUsd: 1.42 },
    schema: { /* mirror of UnlockedQuote in openapi.json */ },
  },
  description: "X402-gated DEX router. 0.05 USDC → best route across 70+ liquidity sources on Ethereum and Base.",
};
```

Send it as a header `X-EXTENSION: bazaar=<base64-json>` on every facilitator call. CDP indexes the resource only after a successful settle that includes a passing extension.

### Step 5 — Upgrade `/.well-known/agent.json` to v0.2 shape

Rewrite `src/routes/[.]well-known.agent[.]json.ts`:

- `schema_version: "0.2"`.
- Add top-level `categories: ["defi", "dex", "router", "best-execution"]`, `tags`, `pricing_model: "pay-per-call"`, `branding: { logo_url, narrative }`, `social_proof: { total_calls, unique_payers, avg_savings_usd }` (pulled from `quote_calls_public`).
- Per-endpoint: add `mcp` block (`{ url: "/api/mcp", tool: "get_dex_quote" }`), `payment` block matching the new x402 body, `examples[]` with one preview-locked + one unlocked response, and `quality_metrics` (uptime %, p50 latency from logs).
- Keep CORS + cache headers.

### Step 6 — Trigger Bazaar indexing

Once Steps 2–4 ship, anyone calling `/api/v1/quote` and paying through CDP causes the facilitator to index us. To bootstrap:

1. Deploy.
2. Run a one-shot script (`/tmp/seed-bazaar.ts`, not committed) using `@x402/fetch` + a funded test wallet to make a real paid call against the live URL. Confirm the `EXTENSION-RESPONSES` header shows `bazaar: processing` (not `rejected`).
3. Wait ≤10 min, then `curl https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?query=dex+router+savings` and `?payTo=<wallet>` to confirm we're listed.

### Step 7 — Surface Bazaar status on the homepage

Small UI: under the existing "Recent tolls" feed in `src/routes/index.tsx`, add a "Discoverable on" row with a Bazaar badge that links to `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<wallet>`. Pure presentation, no business-logic changes outside Steps 2–4.

## Out of scope

- Self-hosted facilitator / EIP-3009 signed receipts (still future work; JWKS stays a stub).
- Real JWKS keys.
- New tables — `quote_calls` already captures everything we need.
- Auth / login flows.
- Any redesign beyond the small badge in Step 7.

## Acceptance checks

- `curl /api/v1/quote?...` with no payment returns HTTP 402 with `x402Version: 2`, `accepts[0].scheme === "exact"`, `accepts[0].network === "eip155:8453"`, atomic `maxAmountRequired`, and an `extensions.bazaar` object that validates against its own `inputSchema`.
- A real paid call via `@x402/fetch` + CDP Facilitator returns 200 with `X-Payment-Response` header and the facilitator log shows `bazaar: processing` in `EXTENSION-RESPONSES`.
- Within 10 min, `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<wallet>` returns our resource with our `description` and `inputSchema`.
- `GET /.well-known/agent.json` returns `schema_version: "0.2"` with `mcp`, `payment`, `examples`, `social_proof`, and `categories`.
- Replay of the same payment payload on a second call returns 402 `already_used` (existing TOCTOU guard still wired up).
- Homepage shows the Bazaar badge linking to the merchant discovery URL.
