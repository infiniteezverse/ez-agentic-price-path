## Goal

Make the API trivially try-able by humans and auto-importable by agent frameworks (LangChain, LlamaIndex, CrewAI, OpenAI tools).

## Deliverables

### 1. `/openapi.json` — OpenAPI 3.1 spec

New server route `src/routes/openapi[.]json.ts` returning a static JSON document describing `GET /api/v1/quote`.

Includes:
- `info`: title "Agentic Liquidity API", version, description, contact
- `servers`: published URL
- One path `/api/v1/quote` with query params (`chainId`, `sellToken`, `buyToken`, `sellAmount`) and header `X-Payment-Receipt`
- Two response schemas: `200 Unlocked` and `402 Locked` (with payment instructions)
- Reusable components: `Token`, `Source`, `PaymentInstructions`, `UnlockedQuote`, `LockedPreview`
- `x-mcp-server`: `/api/mcp` extension hint
- CORS headers so browser-based importers can fetch it

### 2. `/playground` — interactive try-it page

New route `src/routes/playground.tsx`. Single-page form, no auth, calls our own `/api/v1/quote`.

Layout (uses existing design tokens, shadcn `Card`, `Input`, `Select`, `Button`, `Tabs`):

```text
┌─────────────────────────────────────────────┐
│ Playground                                  │
│ Try the quote endpoint live. No signup.     │
├──────────────────┬──────────────────────────┤
│ Chain  [Base ▾]  │ Response (live)          │
│ Sell   [WETH ▾]  │ ┌──────────────────────┐ │
│ Buy    [USDC ▾]  │ │ {                    │ │
│ Amount [1.0    ] │ │   "status":"Locked", │ │
│ Receipt[0x... ] │ │   ...                │ │
│ [ Get Quote → ]  │ └──────────────────────┘ │
│                  │                          │
│ Snippets:        │ Status: 402 • 412 ms     │
│ [curl][TS][Py]   │                          │
└──────────────────┴──────────────────────────┘
```

Behaviour:
- Token symbol presets per chain (ETH/WETH/USDC/USDT/DAI/WBTC); amount input auto-converts to base units using known decimals
- "Get Quote" hits `/api/v1/quote` from the browser; pretty-prints JSON, shows status code + latency
- Receipt field optional; populated → adds `X-Payment-Receipt` header
- Three copy-to-clipboard snippet tabs (`curl`, `TypeScript fetch`, `Python requests`) regenerate from the current form
- Footer links: `OpenAPI spec → /openapi.json`, `MCP server → /api/mcp`, `Agent card → /.well-known/agent.json`

### 3. Landing page hookup

In `src/routes/index.tsx`, add two small links/buttons in the hero or developer section: "Try in Playground" → `/playground`, "OpenAPI" → `/openapi.json`. No other changes.

## Out of scope

- No DB writes from the playground beyond what `/api/v1/quote` already logs
- No new auth, no rate-limiting changes
- No edits to MCP, receipt verification, or quote logic

## Files

- create `src/routes/openapi[.]json.ts`
- create `src/routes/playground.tsx`
- edit  `src/routes/index.tsx` (two links only)
