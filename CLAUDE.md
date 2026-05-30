# EZ-Path — Claude Development Rules

## Project Identity
- **What it is:** Pay-per-request DEX meta-router on Base mainnet, deployed as a Cloudflare Worker
- **Deploy command:** `npx wrangler deploy --config worker.toml` — NOT `wrangler.toml` (that's the Pages frontend)
- **Live URL:** https://ezpath.myezverse.xyz
- **GitHub:** https://github.com/infiniteezverse/ez-agentic-price-path

---

## Rules — Learned from Real Bugs

### 1. Always test `calculatePrice()` when touching pricing logic
The price returned in the quote response must be decimal-adjusted human-readable units.
For USDC (6 dec) → WETH (18 dec): `buyAmount=502955357336017, sellAmount=1000000` → price ≈ `0.000503`
Raw atomic division (buyAmount/sellAmount) produces `502,955,357` — completely wrong.
**Rule:** Any change to `calculatePrice` in `src/quote-router.ts` must be verified with `npm run test:unit` before deploying.

### 2. Every `ctx.waitUntil` block must call ALL intended async operations
When adding async post-response work (settlement, metrics, logging), check the entire `ctx.waitUntil` block. A missing call is a silent bug — no error, no warning, just dead code.
**Rule:** Before any deploy, confirm `ctx.waitUntil` in `quote-router.ts` calls both `settle()` AND `recordMetrics()`.

### 3. KV TTL must be ≥ 2× the longest gap to the ETL cron
The ETL cron runs at 2AM UTC (`0 2 * * *`). Metrics written at 00:01 must survive ~26 hours to be read by the ETL.
Current metrics TTL: **172800s (48h)** — do not lower this below 90000s (25h).
**Rule:** Never change `expirationTtl` in `EVMChain.ts` recordMetrics without verifying the ETL cron gap.

### 4. ETL KV list must use `prefix: "metrics:"`
`METERING.list({ prefix: "" })` scans ALL keys including nonces and rate-limit entries.
`METERING.list({ prefix: "metrics:" })` scans only metrics keys.
**Rule:** The prefix in `etl.ts discoverKVKeys()` must always be `"metrics:"`.

### 5. Cron triggers must be in `worker.toml`, not `wrangler.toml`
`wrangler.toml` is for the TanStack/Pages frontend build. `worker.toml` is used for all Worker deploys.
The scheduled ETL handler will silently never fire if `[triggers]` is only in `wrangler.toml`.
**Rule:** `worker.toml` must always contain `[triggers] crons = ["0 2 * * *"]`. Confirm "schedule:" appears in deploy output.

### 6. Never claim a feature that is not implemented in the code path
Claimed in descriptions/docs = implemented in code. If not implemented, say "planned" or remove the claim.
Previous false claims removed: "Flashbots MEV protection" (never wired up).
**Rule:** Before adding any feature claim to `src/discovery.ts`, `src/llms.ts`, or `src/landing.ts`, verify the code path exists.

### 7. New venue APIs must be tested live before claiming them
A venue that returns 4xx or redirects counts as broken. Broken venues fail silently (timeout wrapper catches all errors), but they waste the race budget.
**Rule:** When adding/modifying a venue in `src/chains/evm/venues.ts`, run `npm run test:venues` to confirm the API returns a valid non-zero buyAmount.

---

## Pre-Deploy Checklist
Before running `npx wrangler deploy --config worker.toml`:

- [ ] Run `npm run test:unit` — calculatePrice, determineTier, verifyPayment must pass
- [ ] Run `npm run test:smoke` — live 402 response must have x402Version, accepts, tiers
- [ ] Confirm `[triggers] crons = ["0 2 * * *"]` is in `worker.toml`
- [ ] Confirm deploy output shows `schedule: 0 2 * * *`
- [ ] If changing tier descriptions: verify they match what `EVMChain.ts` actually does

---

## Key Addresses (do not change without updating ALL references)
```
USDC on Base:    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
Toll address:    0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad
Relayer EOA:     0x48Ccd1fF2903483B12298760eA9b5D6106E999E9
Aerodrome:       0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
Aero Factory:    0x420DD381b31aEf6683db6B902084cB0FFECe40Da
UniV3 QuoterV2:  0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
UniV2 Router:    0x8909Dc15e40953b386FA8f445ea5F6a3d2313a1d
```

## Key Constants (must stay in sync across files)
| Constant | Value | Files |
|----------|-------|-------|
| PRICE_ATOMIC | "30000" | quote-router.ts, discovery.ts, facilitator.ts |
| TIER_RESILIENT | "100000" | quote-router.ts, EVMChain.ts, mcp-server |
| TIER_INSTITUTIONAL | "500000" | quote-router.ts, EVMChain.ts, mcp-server |
| EXECUTION_TTL | 15s | quote-router.ts |

## Secrets (all must be set in Cloudflare Worker)
```
ZERO_EX_API_KEY          required
RELAYER_PRIVATE_KEY      required (relayer must have ETH on Base for gas)
BASE_RPC_URL             required (Alchemy URL)
SUPABASE_SERVICE_ROLE_KEY required
ADMIN_API_KEY            required
CDP_API_KEY_NAME         optional
CDP_API_KEY_PRIVATE_KEY  optional
PARASWAP_API_KEY         optional (ParaSwap works without it)
```
**Relayer ETH warning:** If relayer balance drops below 0.001 ETH, settlement will fail silently.
Check: `cast balance 0x48Ccd1fF2903483B12298760eA9b5D6106E999E9 --rpc-url https://mainnet.base.org`
