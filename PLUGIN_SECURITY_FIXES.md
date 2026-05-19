# EZ Path Plugin Security Fixes

Reference: elizaOS/eliza#7735 code review by Greptile

## Executive Summary

Five security/quality issues identified in @elizaos/plugin-ezpath PR. Three are P1 (critical), two are P2 (important). All are fixable with code changes to three files.

---

## Issue 1: Toll Address Validation (CRITICAL - P1)

**Risk**: Fund redirection via spoofed HTTP response header

**Current Code** (unsafe):
```typescript
// src/client.ts line 73-76
const tollAddress = probe.headers.get("X-402-Address");
if (!tollAddress) throw new Error("ezpath: 402 response missing X-402-Address header");

// tollAddress is used directly in EIP-3009 signature without validation
// Attacker with DNS/BGP control can redirect to arbitrary address
```

**Fixed Code**:
```typescript
// src/client.ts - Add whitelist validation
const tollAddress = probe.headers.get("X-402-Address");
if (!tollAddress) throw new Error("ezpath: 402 response missing X-402-Address header");

// Validate against known EZ Path toll addresses
const KNOWN_TOLL_ADDRESSES: Record<string, string> = {
  "base:8453": "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad",
  // Add other chains as needed
  // "arbitrum:42161": "0x...",
  // "optimism:10": "0x...",
};

const chainKey = `${chain}:${chainId}`;
const expectedToll = KNOWN_TOLL_ADDRESSES[chainKey];

if (expectedToll && tollAddress.toLowerCase() !== expectedToll.toLowerCase()) {
  throw new Error(
    `ezpath: toll address mismatch. Expected ${expectedToll}, got ${tollAddress}. ` +
    `This could indicate endpoint spoofing or MITM attack. ` +
    `Verify address against https://ezpath.myezverse.xyz/.well-known/agent.json`
  );
}

// Safe to use tollAddress now
const auth = { from: walletAddress, to: tollAddress, ... };
```

**Why it matters**: USDC transfers are irreversible. A redirected payment cannot be recovered.

---

## Issue 2: Tier Setting Always Ignored (CRITICAL - P1)

**Risk**: Agent configuration completely bypassed; agents always get lowest-tier quotes

**Current Code** (buggy):
```typescript
// src/actions/getQuote.ts line 22
const QuoteParamsSchema = z.object({
  tier: z.enum(["basic", "resilient", "institutional"]).default("basic")
    .describe("Execution tier — basic ($0.03), resilient ($0.10), institutional ($0.50)"),
});

// Later in handler:
const tier = params.tier ?? runtime.getSetting("EZPATH_TIER") ?? "basic";
//            ^^^^^^^^^^ Never undefined due to .default(), so fallback never runs
```

**Fixed Code**:
```typescript
// src/actions/getQuote.ts line 22
const QuoteParamsSchema = z.object({
  tier: z.enum(["basic", "resilient", "institutional"]).optional()
    .describe("Execution tier — basic ($0.03), resilient ($0.10), institutional ($0.50)"),
});

// Later in handler:
const tier = params.tier ?? runtime.getSetting("EZPATH_TIER") ?? "basic";
//            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Now fallback chain works correctly:
// 1. Use message-provided tier if present
// 2. Use EZPATH_TIER runtime setting if not in message
// 3. Default to "basic" if neither specified
```

**Why it matters**: Users who configure `EZPATH_TIER=resilient` for better prices get silently downgraded to basic (0x only), losing access to concurrent racing and better routing.

---

## Issue 3: Over-Broad Validation Trigger (CRITICAL - P1)

**Risk**: Accidental USDC spending on completely unrelated messages

**Current Code** (too broad):
```typescript
// src/actions/getQuote.ts line 44-55
const QUOTE_KEYWORDS = [
  "quote", "price", "swap", "trade", "exchange", "convert",
  "how much", "rate", "sell", "buy", "weth", "usdc",
];

function looksLikeQuoteRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return QUOTE_KEYWORDS.some(kw => lower.includes(kw));
}

// This matches:
// ❌ "I want to buy groceries at a good price"
// ❌ "what's the rate of inflation?"
// ❌ "I'm selling my old car"
// ❌ "how much wood could a woodchuck chuck?"
// All of these trigger quote attempts and SPEND USDC
```

**Fixed Code**:
```typescript
// src/actions/getQuote.ts line 44-80
function looksLikeQuoteRequest(text: string): boolean {
  const lower = text.toLowerCase();
  
  // Require explicit swap/trade intent with token pairing
  const swapPatterns = [
    // "swap 100 USDC for WETH" or similar
    /swap\s+(\d+\.?\d*|\w+)\s+(to|for)\s+(\w+)/i,
    
    // "convert DAI to USDC"
    /convert\s+(\w+)\s+(to|into|for)\s+(\w+)/i,
    
    // "exchange ETH for USDC"
    /exchange\s+(\w+)\s+(for|to)\s+(\w+)/i,
    
    // "price of WETH in USDC" or "WETH to USDC price"
    /price\s+(of\s+)?(\w+)\s+(in|to)\s+(\w+)/i,
    
    // "how much USDC for 1 WETH" or "how much will I get if I sell 100 USDC"
    /how much\s+(\w+)\s+(for|if\s+i\s+sell|would\s+i\s+get)/i,
    
    // "quote for 0x[address]" or "quote for WETH"
    /quote\s+(for\s+)?(0x[a-f0-9]{40}|weth|usdc|dai|usdt|eth)/i,
  ];
  
  return swapPatterns.some(pattern => pattern.test(lower));
}

// Now only matches explicit swap intent:
// ✅ "swap 1 USDC for WETH"
// ✅ "convert 100 DAI to USDC"
// ✅ "what's the price of WETH in USDC?"
// ✅ "how much will I get if I sell 100 USDC for WETH?"
// ❌ "I want to buy groceries" (no token context)
// ❌ "what's the rate of inflation?" (no token pair)
// ❌ "I'm selling my car" (no token context)
```

**Why it matters**: Private conversations or unrelated queries could accidentally trigger USDC transfers.

---

## Issue 4: TypeScript Strict Mode Disabled (IMPORTANT - P2)

**File**: `tsconfig.json`

**Current**:
```json
{
  "strict": false,
  // Disables: strictNullChecks, noImplicitAny, strictFunctionTypes, etc.
}
```

**Fixed**:
```json
{
  "strict": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "noImplicitAny": true,
  "strictBindCallApply": true
}
```

**Why it matters**: Code handling private keys, EIP-3009 signatures, and USDC transfers needs maximum type safety.

---

## Issue 5: WalletClient Allocation on Every Call (IMPORTANT - P2)

**File**: `src/client.ts`

**Current** (inefficient):
```typescript
async function getQuote(privateKey: string, ...) {
  // Creates new WalletClient on EVERY call
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(), // New connection each time
  });
  
  // Use client once...
  await client.sendTransaction(...);
  // Client is discarded
}
```

**Fixed** (with caching):
```typescript
const walletClientCache = new Map<string, ReturnType<typeof createWalletClient>>();

async function getOrCreateWalletClient(privateKey: string, chainId: number) {
  const cacheKey = `${privateKey}:${chainId}`;
  
  if (!walletClientCache.has(cacheKey)) {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: chainId === 8453 ? base : arbitrum, // etc
      transport: http(getRpcUrl(chainId)),
    });
    walletClientCache.set(cacheKey, client);
  }
  
  return walletClientCache.get(cacheKey)!;
}

async function getQuote(privateKey: string, chainId: number, ...) {
  const client = await getOrCreateWalletClient(privateKey, chainId);
  // Reuse existing client
  await client.sendTransaction(...);
}
```

**Why it matters**: Reduces allocation overhead and RPC connection spam; improves latency.

---

## Implementation Checklist

- [ ] Fix Issue 1: Add KNOWN_TOLL_ADDRESSES whitelist validation in `src/client.ts`
- [ ] Fix Issue 2: Change `.default("basic")` to `.optional()` in `src/actions/getQuote.ts` QuoteParamsSchema
- [ ] Fix Issue 3: Replace keyword list with regex patterns in `looksLikeQuoteRequest()` in `src/actions/getQuote.ts`
- [ ] Fix Issue 4: Set `"strict": true` in `tsconfig.json`
- [ ] Fix Issue 5: Add walletClientCache and `getOrCreateWalletClient()` in `src/client.ts`
- [ ] Test: Unit tests for pattern matching (Issue 3)
- [ ] Test: Integration test with spoofed toll address (should reject)
- [ ] Test: Runtime EZPATH_TIER setting is actually used (Issue 2)
- [ ] Submit fixed PR to elizaOS/eliza when third-party registry opens

---

## References

- **elizaOS PR**: https://github.com/elizaOS/eliza/pull/7735
- **Greptile Review**: Inline comments on PR with detailed analysis
- **EZ Path Endpoint**: https://ezpath.myezverse.xyz/api/v1/quote
