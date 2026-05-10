## Where we are

Already shipped: `/openapi.json`, `/.well-known/agent.json`, `/api/mcp`, `/api/v1/quote` with real on-chain USDC receipt verification, persisted `quote_calls` log + replay-protection unique index, live toll feed on the dashboard, and a `/playground` with curl/TS/Python snippets.

The next highest-leverage move is **Bazaar / CDP Facilitator compliance** — small surface area, unlocks distribution. Then docs polish. EIP-3009 gasless and external marketplace submissions come after.

## Next sprint — "Bazaar-ready" (Phase 1.A + 1.C + 2.B finish)

Goal: a CDP Facilitator / x402 Bazaar crawler can hit our endpoint, read the price/chain/address from headers, fetch JWKS, and see a deterministic savings preview that justifies the unlock fee.

### 1. X-402 discovery headers on `/api/v1/quote`

Add to **both** the 402 and 200 responses (and the OPTIONS preflight `Access-Control-Expose-Headers`):

```text
X-402-Price:   0.05 USDC
X-402-Chain:   base
X-402-Address: <PAYMENT_WALLET_ADDRESS>
X-402-JWKS:    <origin>/.well-known/jwks.json
X-402-Asset:   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913   # USDC on Base
```

Edit: `src/routes/api/v1/quote.ts` — extend `corsHeaders()` to take the request origin, add the `X-402-*` set, and append them to every `Response.json(...)` return (402, 200, 400, 502).

### 2. JWKS endpoint (`/.well-known/jwks.json`)

Create `src/routes/[.]well-known.jwks[.]json.ts`. For now, serve a valid empty JWK Set:

```json
{ "keys": [] }
```

with `cache-control: public, max-age=300` and CORS `*`. This satisfies the Facilitator's "JWKS reachable" check; we wire real keys when we ship EIP-3009 / signed receipts.

### 3. Deterministic 402 savings field

Today the 402 body returns `estimated_savings_usd` as a **stringified** float nested in a preview blob. Bazaar agents key off a top-level number.

Update `/api/v1/quote` 402 body to the canonical shape:

```json
{
  "status": "payment_required",
  "unlock_fee_usd": 0.05,
  "unlock_fee": "0.05 USDC",
  "estimated_savings_usd": 1.42,
  "reason": "Savings exceed unlock fee",
  "price_impact_pct": 0.12,
  "top_source": "Uniswap_V3",
  "receipt_status": "missing",
  "receipt_error": null,
  "payment": { /* unchanged x402 instructions */ }
}
```

`estimated_savings_usd` becomes a `number`, and `reason` flips to `"Savings below unlock fee"` when it doesn't clear 0.05. Update the matching `LockedPreview` schema in `src/routes/openapi[.]json.ts` to match (number, not string).

### 4. Request-ID correlation + structured logs

- Generate `crypto.randomUUID()` per request in `/api/v1/quote`, return as `X-Request-Id`, store on `quote_calls` (new nullable column `request_id text`).
- Replace ad-hoc `console.error` with a single `console.log(JSON.stringify({ evt: "quote", request_id, status, chain, pair, unlocked, ms }))` line per call so log scrapers (Axiom/Helicone later) can index it.

Migration: `alter table public.quote_calls add column request_id text;`

### 5. OpenAPI enrichment (Phase 2.A polish)

In `src/routes/openapi[.]json.ts`:
- Add `tags: ["price_quote","dex_router","best_execution","savings_preview"]` to the `getQuote` operation.
- Add `examples` blocks under both 200 and 402 response content (one realistic Base WETH→USDC each).
- Add an `x-why-agents-choose-us` extension on the operation: `"Routes across 70+ liquidity sources via 0x; 402 preview tells you net savings before you pay."`
- Bump `info.version` to `1.1.0`.

### 6. Out of scope for this sprint (next sprints)

- **EIP-3009 gasless USDC** — separate sprint, needs key management + `transferWithAuthorization` verifier.
- **Bazaar / agentic.market submission** — do after 1–5 land and we have a published URL with the new headers.
- **Backend rate limiting** — intentionally skipped; platform has no good primitives yet.
- **Aerodrome / Uniswap v3 direct integrations, caching, latency monitoring** — current 0x routing already covers this; revisit when volume justifies.
- **Farcaster bot, leaderboard, free-trial logic** — growth layer, after Curated criteria.

## Files

- edit `src/routes/api/v1/quote.ts` (headers, deterministic 402 body, request-id, structured log)
- edit `src/routes/openapi[.]json.ts` (schema fix, examples, tags, version)
- edit `src/lib/quote-log.server.ts` (accept `request_id`)
- create `src/routes/[.]well-known.jwks[.]json.ts`
- migration: add `request_id` column to `quote_calls`

## Acceptance checks

- `curl -i .../api/v1/quote?...` shows all five `X-402-*` headers on both 402 and 200.
- `curl .../.well-known/jwks.json` returns `{"keys":[]}` with 200 + CORS.
- 402 body has top-level numeric `estimated_savings_usd` and `unlock_fee_usd`.
- `/openapi.json` `LockedPreview.estimated_savings_usd` is `type: number`; operation has `tags` + examples.
- Each call logs one JSON line including `request_id`, and the same id appears in the response header and `quote_calls.request_id`.
