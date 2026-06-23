# EZ-Path Agent Integration Guide

**Live Endpoint:** `https://api.myezverse.xyz/api/v1/quote`  
**Status:** ✅ Production-ready (as of 2026-06-23)

---

## Quick Start: 3 Ways to Integrate

### Option 1: MCP Server (Easiest for Claude/LangChain Agents)

Install and use the official MCP server:

```bash
npm install mcp-ezpath
```

Then configure in your MCP settings:

```json
{
  "mcpServers": {
    "mcp-ezpath": {
      "command": "npx",
      "args": ["mcp-ezpath"],
      "env": {
        "EZPATH_WALLET_KEY": "0x<your-base-wallet-private-key>"
      }
    }
  }
}
```

**Two tools are now available to your agent:**

```typescript
// 1. Free probe (HTTP 402)
await ezpath_probe({
  sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC
  buyToken:  "0xf43eb8de897fbc7f2502483b2bef7bb9ea179229",  // ZEN
  sellAmount: "1000000"  // 1 USDC
});
// Returns: { x402Version, estimatedPrice, priceUsdEstimate, tiers, ... }

// 2. Paid quote (HTTP 200 + X-Payment)
await ezpath_quote({
  sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  buyToken:  "0xf43eb8de897fbc7f2502483b2bef7bb9ea179229",
  sellAmount: "1000000",
  tier: "basic"  // $0.03 USDC per request
});
// Returns: { status: "ok", price, priceUsd, buyAmount, expiresAt, ... }
```

**Cost:** $0.03-0.50 USDC per paid quote (depending on tier)  
**No wallet key needed:** Optional — can also use Base MCP's `initiate_x402_request`

---

### Option 2: Direct HTTP (Any Language)

**For agents that can't use MCP**, make HTTP requests directly:

```bash
# 1. Probe (FREE — just check pricing)
curl -X GET "https://api.myezverse.xyz/api/v1/quote\
  ?sellToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\
  &buyToken=0xf43eb8de897fbc7f2502483b2bef7bb9ea179229\
  &sellAmount=1000000"

# Response: HTTP 402 with live pricing data
{
  "x402Version": 2,
  "estimatedPrice": "0.223",
  "priceUsdEstimate": "4.485",
  "tiers": {
    "basic": {"usd": "0.03", "min_atomic": "30000"},
    "resilient": {"usd": "0.10", "min_atomic": "100000"},
    "institutional": {"usd": "0.50", "min_atomic": "500000"}
  },
  "resource": {...},
  "extensions": {"bazaar": {...}}
}
```

```bash
# 2. Quote (PAID — requires X-Payment header with EIP-712 signature)
curl -X GET "https://api.myezverse.xyz/api/v1/quote\
  ?sellToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\
  &buyToken=0xf43eb8de897fbc7f2502483b2bef7bb9ea179229\
  &sellAmount=1000000" \
  -H "X-Payment: <base64-encoded-eip712-signature>"

# Response: HTTP 200 with confirmed quote
{
  "status": "ok",
  "request_id": "uuid",
  "buyAmount": "998500000000000000",
  "price": "0.9985",
  "priceUsd": "1.0015",
  "expiresAt": 1718614215000,
  "slippageGuarantee": {
    "worstCase": "0.9905",
    "confidence": 0.68,
    "secondsValid": 15
  }
}
```

**Signature help:** Use viem/ethers EIP-712 signing. See `/mcp-server/src/signer.ts` for reference implementation.

---

### Option 3: CLI (One-Off Queries)

For quick testing or simple use cases:

```bash
# Install x402 CLI tool
npm install -g @x402/awal

# Make a quote request
awal x402 pay "https://api.myezverse.xyz/api/v1/quote" \
  --query '{
    "sellToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "buyToken": "0xf43eb8de897fbc7f2502483b2bef7bb9ea179229",
    "sellAmount": "1000000"
  }'

# User approves in Coinbase Wallet → quote returned
```

---

## Integration Patterns

### Pattern 1: Cost-Optimal (Recommended for Agents)

Minimize costs by using **FREE probes** for detection + **PAID quotes** only on breach:

```typescript
// Every 3-5 minutes: FREE
const probe = await ezpath_probe({sellToken, buyToken, sellAmount});
const currentPrice = parseFloat(probe.priceUsdEstimate);

// Check if price breached your thresholds
if (currentPrice > UPPER_BRACKET || currentPrice < LOWER_BRACKET) {
  // Breach detected! Get confirmed quote: $0.03
  const quote = await ezpath_quote({sellToken, buyToken, sellAmount, tier: "basic"});
  
  // Verify still breached (avoid slippage from quote time to execution)
  if (parseFloat(quote.slippageGuarantee.worstCase) > yourMinimumAcceptablePrice) {
    // Execute trade
    await executeTrade(quote);
  }
}
```

**Cost Model:**
- **Without EZ-Path:** Poll every second → 86,400 queries × $0.03 = **$2,592/day**
- **With EZ-Path:** Probe every 3 min (free) + 5-10 quotes/day → **$0.15-0.30/day**
- **Savings: 99%** 🎉

---

### Pattern 2: Simple Query

Just get the best quote for a swap:

```typescript
const quote = await ezpath_quote({
  sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC
  buyToken: "0x4200000000000000000000000000000000000006",   // WETH
  sellAmount: "100000000",  // 100 USDC (in atomic: 6 decimals)
  tier: "resilient"  // $0.10 — better routing than basic
});

console.log(`Best quote: ${quote.buyAmount} WETH at $${quote.price}/WETH`);
console.log(`Worst case: $${quote.slippageGuarantee.worstCase}/WETH (68% confidence)`);
console.log(`Execute within ${quote.slippageGuarantee.secondsValid}s or quote expires`);
```

---

## Response Formats

### Probe Response (HTTP 402)

Returned when you call WITHOUT payment. Useful for checking costs and getting live prices.

```json
{
  "x402Version": 2,
  "estimatedPrice": "0.223",           // Asset per USDC (raw)
  "priceUsdEstimate": "4.485",         // ← Use this! USDC per asset
  "resource": {
    "url": "https://api.myezverse.xyz/api/v1/quote",
    "description": "EZ-Path DEX quote",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "base",
      "amount": "30000",                // Basic tier: 0.03 USDC (in atomic)
      "asset": "0x833589...",           // USDC
      "payTo": "0x13dDE7...",           // Toll address
      "maxTimeoutSeconds": 300
    }
  ],
  "tiers": {
    "basic": {"min_atomic": "30000", "usd": "0.03", "description": "direct 0x"},
    "resilient": {"min_atomic": "100000", "usd": "0.10", "description": "4-venue race"},
    "institutional": {"min_atomic": "500000", "usd": "0.50", "description": "all 10 venues"}
  },
  "extensions": {
    "bazaar": {
      "resourceServerExtension": true,
      "discoveryExtension": true,
      "info": {...},
      "schema": {...}
    }
  }
}
```

**Agent Usage:**
```typescript
const probe = await ezpath_probe(...);
const zenPrice = parseFloat(probe.priceUsdEstimate);  // Ready to use!
const costToQuote = parseFloat(probe.tiers.basic.usd);  // $0.03
```

---

### Quote Response (HTTP 200)

Returned when you provide valid X-Payment header. Contains confirmed swap details.

```json
{
  "status": "ok",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "sellToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "buyToken": "0x4200000000000000000000000000000000000006",
  "sellAmount": "100000000",
  "buyAmount": "57859903012768600",     // In atomic units (18 decimals for WETH)
  "price": "0.000578",                  // Raw: asset per USDC
  "priceUsd": "1729.22",                // ← Use this! USDC per asset
  "sources": [
    {"name": "0x", "proportion": "0.70"},
    {"name": "Uniswap V3", "proportion": "0.30"}
  ],
  "routingEngine": "0x",
  "tier": "basic",
  "expiresAt": 1718614215000,           // Unix timestamp (ms)
  "slippageGuarantee": {
    "worstCase": "0.000570",            // Worst-case execution price (68% confidence)
    "confidence": 0.68,
    "secondsValid": 15
  }
}
```

**Agent Usage:**
```typescript
const quote = await ezpath_quote(...);
const worstCasePrice = parseFloat(quote.slippageGuarantee.worstCase);
const timeRemaining = quote.expiresAt - Date.now();

if (worstCasePrice < yourMinimumPrice) {
  console.error("Slippage too high, skipping");
  return;
}

if (timeRemaining < 2000) {
  console.error("Quote expiring soon, requesting fresh one");
  return;
}

// Safe to execute!
await executeSwap(quote);
```

---

## Token Addresses (Base Mainnet)

Common tokens agents use:

| Token | Address | Decimals |
|-------|---------|----------|
| **USDC** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| **WETH** | `0x4200000000000000000000000000000000000006` | 18 |
| **ZEN** | `0xf43eb8de897fbc7f2502483b2bef7bb9ea179229` | 18 |
| **AERO** | `0x940181a94A35A4569E400762A40599b551257c27` | 18 |
| **CBETH** | `0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22` | 18 |

**Amount formatting examples:**
- 1 USDC = `1000000` (6 decimals)
- 1 WETH = `1000000000000000000` (18 decimals)
- 0.5 USDC = `500000`

---

## Error Handling

### Probe Errors (HTTP 402)

Probes always return 402 (it's the feature, not an error). Check for live pricing:

```typescript
const probe = await ezpath_probe(...);
if (probe.priceUsdEstimate === null) {
  console.warn("No live pricing available, using cached price");
  // Fallback to cached/previous price
}
```

### Quote Errors

```typescript
try {
  const quote = await ezpath_quote(...);
  if (quote.status === "ok") {
    // Good to execute
  } else if (quote.status === "invalid_payment") {
    console.error(`Payment failed: ${quote.detail}`);
  } else if (quote.status === "routing_failed") {
    console.error(`DEX routing failed: ${quote.detail}`);
  }
} catch (err) {
  console.error(`Network error: ${err.message}`);
  // Retry with backoff
}
```

### Rate Limiting

If you get HTTP 429:

```typescript
const response = await fetch(url, {...});
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After");
  console.log(`Rate limited. Retry after ${retryAfter}s`);
  // Wait and retry
}
```

---

## Best Practices

### ✅ DO

- **Use probes for detection** — They're free! Check prices every 3-5 minutes
- **Only quote on breach** — Call the paid endpoint when you detect a price movement
- **Respect expiresAt** — Quotes are only valid for 15 seconds
- **Check slippageGuarantee** — Make sure worst-case execution price is acceptable before trading
- **Cache responses** — Reuse the same quote for 15s to avoid paying twice
- **Use priceUsdEstimate** — It's always in USDC per asset (easier for agents)

### ❌ DON'T

- Poll constantly — You'll waste money. Use the hybrid pattern instead.
- Ignore expiresAt — Quote will fail if you settle after 15 seconds
- Use raw `price` field — It's in asset per USDC, confusing. Use `priceUsd` instead
- Assume multi-step execution is free — Each quote is a separate payment
- Forget that probes can be null — Market conditions might prevent routing; have a fallback

---

## Support & Resources

| Resource | Link |
|----------|------|
| **Live API** | https://api.myezverse.xyz/api/v1/quote |
| **MCP Package** | https://www.npmjs.com/package/mcp-ezpath |
| **GitHub** | https://github.com/infiniteezverse/ez-agentic-price-path |
| **Agentic Market** | https://agentic.market (search: "EZ-Path") |
| **X402 Spec** | https://docs.cdp.coinbase.com/x402/bazaar |

---

## FAQ

**Q: Do I need a wallet to use EZ-Path?**  
A: For probes (free) — no. For quotes (paid) — yes, you need USDC on Base. You can use Coinbase Wallet or any Base-compatible wallet.

**Q: How much does each quote cost?**  
A: Basic tier: $0.03 USDC. Resilient: $0.10. Institutional: $0.50. You can also test with probes for free.

**Q: What if I run out of USDC?**  
A: Probes will still work (free). Quotes will fail. Refill your wallet on Uniswap or another DEX.

**Q: Can I use EZ-Path on other chains?**  
A: Currently Base mainnet only. X402 is supported on other chains but EZ-Path focuses on Base.

**Q: What if my quote expires?**  
A: Just call `ezpath_quote` again. You'll pay $0.03 for a fresh quote.

**Q: How do I sign X-Payment headers?**  
A: Use viem's `signTypedData` or ethers' `_signTypedData`. Reference: `/mcp-server/src/signer.ts`

---

## Getting Started in 5 Minutes

1. **Install MCP server:**
   ```bash
   npm install mcp-ezpath
   ```

2. **Add to Claude/LangChain:**
   ```json
   {
     "env": {
       "EZPATH_WALLET_KEY": "0x<your-base-wallet-private-key>"
     }
   }
   ```

3. **Use in your agent:**
   ```typescript
   const probe = await ezpath_probe({
     sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
     buyToken: "0x4200000000000000000000000000000000000006",
     sellAmount: "1000000"
   });
   console.log(`Price: $${probe.priceUsdEstimate}`);
   ```

4. **Get USDC on Base** (if running quotes):
   - Visit https://app.uniswap.org
   - Connect Base wallet
   - Swap some ETH or other token for USDC

5. **Deploy and watch the savings!** 🚀

---

**Ready to integrate?** Start with the MCP server — it's the easiest path.  
**Have questions?** Check the agentic.market docs or open an issue on GitHub.
