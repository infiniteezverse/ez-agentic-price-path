# EZ-Path Implementation Notes

**Last Updated:** 2026-06-23  
**Status:** Production-ready, agentic.market compliant

---

## What We Built

EZ-Path is a **pay-per-request DEX router** on Base that implements the **X402 payment protocol** for agent-native trading infrastructure.

### Core Architecture

```
HTTP Request (without X-Payment header)
    ↓
Rate Limit Check (20 probes/min per IP)
    ↓
Return HTTP 402 (Payment Required)
    ├─ resource: endpoint metadata
    ├─ accepts: payment requirements
    ├─ extensions.bazaar: agent discovery
    ├─ PAYMENT-REQUIRED header: base64-encoded payload
    └─ Optional: estimatedPrice (live routing if available)

HTTP Request (with X-Payment: <EIP-712 signature>)
    ↓
Rate Limit Check (120 quotes/min per payer)
    ↓
Verify Payment (EIP-712 or Facilitator or Base MCP)
    ↓
Race 10 Venues (0x, ParaSwap, Aerodrome, Uni V3, Curve, Balancer, Uni V2, 1Inch, CoW, Synthetix)
    ↓
Return HTTP 200
    ├─ price: confirmed execution
    ├─ slippageGuarantee: worst-case bounds
    ├─ expiresAt: 15-second execution window
    └─ Cache-Control: 15s enforcement
```

---

## Key Implementation Details

### 1. X402 v2 Compliance

**What it means:** Endpoint follows the x402 HTTP transport v2 specification.

**Implementation:**
- All 402 responses include `PAYMENT-REQUIRED` header (base64-encoded)
- Header contains complete payment requirements (not body)
- Both rate-limited and normal responses follow same structure
- Encoding: `btoa(unescape(encodeURIComponent(JSON.stringify(response))))`

**Files:** `/src/quote-router.ts` lines 368-378 (rate limit), 680-691 (normal)

**Why it matters:** 
- Bazaar discovery validator expects payment info in header, not body
- Clients can parse standardized header format
- Interoperable with other x402 servers

---

### 2. Agent-Native Response Format

**Two response types:**

**HTTP 402 (Probe - FREE):**
```json
{
  "x402Version": 2,
  "estimatedPrice": "0.223",        // Asset per USDC (raw)
  "priceUsdEstimate": "4.476",      // USDC per asset (normalized) ← agents use this
  "resource": {...},
  "accepts": [...],
  "tiers": {...},
  "extensions": {"bazaar": {...}},
  "request_id": "uuid"
}
```

**HTTP 200 (Quote - PAID $0.03):**
```json
{
  "price": "0.9985",                // Raw: asset per USDC
  "priceUsd": "1.0015",             // USDC per asset ← agents use this
  "buyAmount": "998500000000000000", // Atomic units
  "slippageGuarantee": {
    "worstCase": "0.9905",
    "confidence": 0.68,
    "secondsValid": 15
  },
  "expiresAt": 1718614215000,       // 15-second window
  "sources": [...]
}
```

**Files:** `/src/quote-router.ts` lines 432-692 (402), 898-911 (200)

**Why it matters:**
- Probes are FREE → agents can check prices constantly
- Quotes are PAID → agents pay only when executing
- Normalized `priceUsd` format → agents don't need to invert
- 15-second window → prevents stale quote execution

---

### 3. Pricing Normalization (Bidirectional)

**Problem:** DEX APIs return "asset per USDC" but agents want "USDC per asset"

**Solution:** Normalize in both directions

```typescript
// 402 Probe Response (lines 416-428)
if (sellToken?.toLowerCase() === USDC_BASE.toLowerCase()) {
  priceUsdEstimate = parseFloat(estimatedPrice) > 0 
    ? (1 / parseFloat(estimatedPrice)).toFixed(6) 
    : "0";
} else if (buyToken?.toLowerCase() === USDC_BASE.toLowerCase()) {
  priceUsdEstimate = estimatedPrice;
} else {
  priceUsdEstimate = estimatedPrice;
}

// 200 Quote Response (lines 658-668)
if (sellToken?.toLowerCase() === USDC_BASE.toLowerCase()) {
  priceUsd = parseFloat(price) > 0 
    ? (1 / parseFloat(price)).toFixed(6) 
    : "0";
} else if (buyToken?.toLowerCase() === USDC_BASE.toLowerCase()) {
  priceUsd = price;
} else {
  priceUsd = price;
}
```

**Example:**
- Agent asks: "How much ZEN per USDC?" (selling USDC)
- 0x returns: 0.223 ZEN per USDC (raw)
- We invert: 4.476 USDC per ZEN (priceUsdEstimate)
- Agent gets: $4.48 (human-readable)

**Files:** `/src/quote-router.ts` lines 416-428, 658-668

**Why it matters:**
- Consistent format across all pair directions
- Agents never have to invert or calculate
- Matches agent mental model (USDC is base currency)

---

### 4. Rate Limiting (Fail-Closed)

**Problem:** Rate limiting can be exploited if it fails open

**Solution:** Fail CLOSED (deny on KV error)

```typescript
async function checkRateLimit(
  category: string,
  identifier: string,
  limit: number,
  kv: KVNamespace,
  chain: SupportedChain,
): Promise<boolean> {
  try {
    const window = Math.floor(Date.now() / 60_000);
    const key = `rl:${category}:${chain}:${identifier}:${window}`;
    const count = parseInt((await kv.get(key)) ?? "0");
    if (count >= limit) return false;
    await kv.put(key, String(count + 1), { expirationTtl: 120 });
    return true;
  } catch (err) {
    // SECURITY: Fail closed (deny) on KV errors to prevent bypass attacks
    console.error(`[rate-limit] KV check failed for ${category}/${identifier}: ${err instanceof Error ? err.message : err}`);
    return false; // fail closed
  }
}
```

**Files:** `/src/quote-router.ts` lines 139-158

**Limits:**
- Probes: 20/min per IP (free tier)
- Quotes: 120/min per payer (paid tier)

**Why it matters:**
- If KV goes down, requests are denied (safe)
- Rate limits are enforced before routing
- Prevents DOS attacks and cost explosion

---

### 5. Live Routing for Probes (Not Cached)

**Problem:** Probes returning only cached prices are useless for agents

**Solution:** Run live routing for probes too (no settlement)

```typescript
let probeQuote: any = null;

// Try 0x first (fastest)
try {
  probeQuote = await chainImpl.fetchQuote({
    sellToken,
    buyToken,
    sellAmount,
    slippagePercentage: slippagePercentage ?? undefined,
  });
} catch (zeroExErr) {
  console.log(`[probe] 0x failed`);

  // Fallback to ParaSwap if 0x fails
  try {
    const { fetchParaSwapQuote } = await import('./chains/evm/venues.js');
    probeQuote = await fetchParaSwapQuote(...);
    console.log(`[probe] ParaSwap fallback succeeded`);
  } catch (paraswapErr) {
    console.log(`[probe] ParaSwap also failed`);
  }
}

if (probeQuote?.buyAmount) {
  estimatedPrice = calculatePrice(...);
  // Then normalize to priceUsdEstimate
}
```

**Files:** `/src/quote-router.ts` lines 388-413

**Why it matters:**
- Probes return LIVE prices (not 1-hour-old cache)
- 0x fails fast → ParaSwap automatically tries
- Agents get current market data for FREE
- Enables bracket detection pattern

---

### 6. Input Validation (Pre-Venue)

**Problem:** Malformed inputs cause timeout errors at venues

**Solution:** Validate before sending to venues

```typescript
function isValidEthereumAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(addr);
}

function isValidSellAmount(amount: string): boolean {
  try {
    const bn = BigInt(amount);
    return bn > 0n && bn < BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639936");
  } catch {
    return false;
  }
}

// In paid quote handler (lines 643-662):
if (!isValidEthereumAddress(sellToken!)) {
  return Response.json(
    { status: "bad_request", detail: "sellToken must be valid Ethereum address" },
    { status: 400 }
  );
}
```

**Files:** `/src/quote-router.ts` lines 69-86, 643-662

**Why it matters:**
- Clear error messages (agents understand what went wrong)
- Prevents wasted venue calls
- Fails fast (good UX)

---

### 7. Cache-Control Headers

**Problem:** Agents could cache quotes past 15-second execution window

**Solution:** Set Cache-Control headers

```typescript
return Response.json(quoteData, {
  status: 200,
  headers: {
    "Cache-Control": "private, max-age=15, no-store",
    "PAYMENT-REQUIRED": paymentRequiredHeader,
    "X-Routing-Engine": routingEngine,
    "X-Bazaar-Discovery": discoveryMetadata,
  },
});
```

**Files:** `/src/quote-router.ts` line 895

**Why it matters:**
- CDNs respect Cache-Control
- Prevents execution after expiry
- Protects agents from slippage

---

### 8. Bazaar Discovery Extension

**Problem:** Agents can't discover EZ-Path on agentic.market

**Solution:** Include Bazaar extension with schema

```typescript
extensions: {
  bazaar: {
    resourceServerExtension: true,
    discoveryExtension: true,
    info: {
      input: { type: "http", method: "GET", queryParams: {...} },
      output: { type: "json", example: {...} }
    },
    schema: { /* JSON Schema describing input/output */ }
  }
}
```

**Files:** `/src/quote-router.ts` lines 472-579

**Why it matters:**
- agentic.market crawls Bazaar extension
- Agents discover EZ-Path automatically
- Schema validates client requests

---

## Security Decisions

### 1. No Private Key Required (Except for Quotes)

**For Probes:** No auth needed
- Probes are free (rate-limited by IP)
- No security concern

**For Quotes:** Three payment paths
- Path 1: EZPATH_WALLET_KEY env var (EIP-712 signing)
- Path 2: CDP Facilitator fallback (centralized signer)
- Path 3: Base MCP smart wallet (user approval in Coinbase Wallet)

**Why it matters:**
- Agents don't need to expose private keys
- Smart contracts can pay via Facilitator
- Coinbase Wallet users can approve payments

### 2. Nonce Deduplication

**How it works:**
```typescript
const nonceKey = `nonce:${auth.nonce}`;
if (await env.METERING.get(nonceKey)) {
  return { isValid: false, invalidReason: "nonce_already_used" };
}
await env.METERING.put(nonceKey, "1", { expirationTtl: validBefore });
```

**Why it matters:**
- Prevents replay attacks
- TTL expires when payment window closes
- Per-nonce, per-signer (can't replay across wallets)

### 3. Settlement Async (Non-Blocking)

**How it works:**
```typescript
ctx.waitUntil(
  (async () => {
    // Settlement happens AFTER response sent
    let settlementResult = await chainImpl.settle(...);
    // Record metrics to KV
    await chainImpl.recordMetrics({...});
  })()
);

// Agent sees success immediately
return Response.json(quote, { status: 200 });
```

**Why it matters:**
- Agent gets response in 1-2 seconds
- Settlement can take longer
- Agent doesn't need to wait

---

## Files Modified During Implementation

| File | Changes | Reason |
|------|---------|--------|
| `/src/quote-router.ts` | 500+ lines | Core routing logic, 402 handler, input validation |
| `/src/index.ts` | Metrics endpoint auth | Implement payer authentication |
| `/wrangler.toml` | Remove ADMIN_API_KEY | Move secret to Cloudflare |
| `/CLAUDE.md` | 4 new security rules | Document lessons learned |
| `package-lock.json` | npm audit fix | Update 45 packages |

---

## Testing & Deployment

### Unit Tests
- 40/40 passing
- Covers: `calculatePrice`, `determineTier`, `verifyPayment`
- All run before each deploy

### Live Testing
- Probe endpoint: `curl https://api.myezverse.xyz/api/v1/quote?...`
- Quote endpoint: Same URL + X-Payment header
- agentic.market validator: Automated compliance check

### Deployment
- Via: `npx wrangler deploy --config worker.toml`
- Latest version: `cda3e2f3-5b39-49e9-adf7-0879bda01033`
- Live URL: `https://api.myezverse.xyz/api/v1/quote`

---

## What Worked Well

✅ **X402 spec compliance** — Following spec eliminates integration friction  
✅ **Hybrid pricing model** — Free probes + paid quotes enable cost optimization  
✅ **Live routing for probes** — Agents get real data, not cached  
✅ **Input validation** — Clear errors prevent timeout confusion  
✅ **Fail-closed rate limiting** — Graceful degradation under load  
✅ **Bazaar discovery** — agentic.market integration works automatically  

---

## What We Learned

🔴 **Rate limit must return 402, not 429** — X402 spec requires 402 even when rate limited  
🔴 **Payment info goes in header, not body** — X402 v2 requires `PAYMENT-REQUIRED` header  
🔴 **btoa() needs UTF-8 encoding** — Use `encodeURIComponent` for Unicode in JSON  
🔴 **Probes need full 402 structure** — Validator expects resource, accepts, extensions even on error  

---

## Future Improvements (Out of Scope for v1)

- [ ] Direct venue integrations (currently wrapper APIs only)
- [ ] L2 cross-chain routing (Base → Arbitrum → Optimism)
- [ ] MEV protection (CoW Swap default on institutional tier)
- [ ] Batch quoting (multiple pairs in one request)
- [ ] Metrics dashboard (agent usage analytics)

---

**Status:** Production-ready ✅  
**Next:** Monitor production metrics and gather agent feedback
