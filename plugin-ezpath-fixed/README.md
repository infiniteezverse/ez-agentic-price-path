# @ezpath/plugin-ezpath — Security-Hardened Edition

**Production-ready Eliza plugin for EZ-Path DEX meta-router on Base mainnet.**

Implements **all P1 security fixes** from elizaOS/eliza#7735 code review.

---

## What's Fixed

### ✅ Fix 1: Tier Default Bug
- **Changed**: `.default("basic")` → `.optional()`
- **Effect**: Runtime `EZPATH_TIER` environment variable is now actually used
- **Location**: `src/actions/getQuote.ts` line 26

### ✅ Fix 2: Loose Match Prevention
- **Changed**: Generic keyword array → Strict command triggers
- **Effect**: Plugin only activates on explicit commands (`/ezpath`, `ezpath quote`, etc.), not casual words like "buy", "sell", "price"
- **Result**: No accidental USDC wallet drain on everyday chat
- **Location**: `src/actions/getQuote.ts` lines 7-15

### ✅ Fix 3: Toll Address Validation
- **Changed**: Accepts any address from HTTP header → Validates against hardcoded production address
- **Effect**: Prevents DNS spoofing or MITM attacks redirecting USDC to attacker wallet
- **Location**: `src/client.ts` lines 61-73

### ✅ Fix 4: TypeScript Strict Mode
- **Changed**: `"strict": false` → `"strict": true`
- **Effect**: Full type safety for code handling private keys and EIP-3009 signatures
- **Location**: `tsconfig.json` lines 13-22

---

## Installation

```bash
npm install @ezpath/plugin-ezpath
```

Or in your Eliza agent's `plugins` directory:

```bash
git clone https://github.com/infiniteezverse/plugin-ezpath-fixed.git
npm install
npm run build
```

---

## Configuration

Add to your Eliza agent runtime settings:

```env
# Required: Your Base wallet private key (must hold USDC)
EZPATH_WALLET_PRIVATE_KEY=0x...

# Optional: Execution tier (default: "basic")
# - "basic": 0x only, $0.03 per quote
# - "resilient": 0x + ParaSwap race, $0.10 per quote
# - "institutional": All 10 venues, $0.50 per quote
EZPATH_TIER=resilient
```

---

## Usage

### Automatic (Agent Activation)

Agent will only respond to explicit commands:

```
User: "ezpath quote 100 USDC to WETH"
Agent: [Fetches quote, signs EIP-3009 payment, returns best rate]

User: "swap 50 DAI for USDC at institutional tier"
Agent: [Uses $0.50 tier, races all 10 venues]

User: "/ezpath get price WETH in USDC"
Agent: [Triggered via explicit slash command]
```

### Manual (Via Code)

```typescript
import { EZPathClient } from "@ezpath/plugin-ezpath";

const client = new EZPathClient(process.env.EZPATH_WALLET_PRIVATE_KEY);

const quote = await client.getQuote({
  sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  buyToken: "0x4200000000000000000000000000000000000006",  // WETH
  sellAmount: "100000000", // 100 USDC (6 decimals)
  tier: "resilient",
});

console.log(quote.buyAmount); // e.g., "449123456789012"
console.log(quote.routingEngine); // e.g., "paraswap"
console.log(quote.sources); // ["Uniswap_V3", "CoW_Swap"]
```

---

## Security Properties

| Property | Before | After |
|----------|--------|-------|
| **Toll Address** | Unvalidated header | Hardcoded whitelist check |
| **Tier Setting** | Always ignored | Runtime env var works |
| **Activation** | Loose keywords | Explicit command triggers |
| **Type Safety** | Disabled | Strict mode enabled |
| **Risk of Fund Loss** | High | Minimal |

---

## Testing

```bash
npm run build
npm run test
```

Example test vectors:

```
✅ "ezpath quote 100 USDC to WETH" → Triggers quote
✅ "/ezpath swap" → Triggers quote
✅ "what's the inflation rate?" → Does NOT trigger (prevents accidental spend)
✅ "I want to buy groceries" → Does NOT trigger (prevents accidental spend)
```

---

## Endpoint Reference

- **Endpoint**: `https://ezpath.myezverse.xyz/api/v1/quote`
- **Chain**: Base mainnet (8453)
- **Payment**: x402 v2 (EIP-3009 USDC TransferWithAuthorization)
- **Latency**: <350ms (venue racing + settlement)
- **Venues**: 0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, 1Inch, CoW Swap, Synthetix

---

## Differences from Original PR

| Issue | Original | Fixed |
|-------|----------|-------|
| Tier default | `.default("basic")` | `.optional()` |
| Validation | Loose keyword array | Strict command triggers |
| Toll address | Unvalidated | Whitelist validated |
| TypeScript | `strict: false` | `strict: true` |

---

## License

MIT

---

## Support

- **Endpoint Status**: https://ezpath.myezverse.xyz/.well-known/agent.json
- **Base Explorer**: https://basescan.org
- **EZ-Path Docs**: https://ezpath.myezverse.xyz
