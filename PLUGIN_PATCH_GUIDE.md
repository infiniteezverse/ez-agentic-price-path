# Plugin P1 Security Fixes — Copy-Paste Ready

**Three surgical changes. 10 minutes. Zero scope creep.**

---

## Fix 1: Tier Default Bug (1 word)

**File:** `plugins/plugin-ezpath/src/actions/getQuote.ts`

**Line ~22** in QuoteParamsSchema:

```diff
- tier: z.enum(["basic", "resilient", "institutional"]).default("basic")
+ tier: z.enum(["basic", "resilient", "institutional"]).optional()
```

**Why:** `.optional()` makes tier undefined when not specified, so the fallback to runtime `EZPATH_TIER` env var actually works.

---

## Fix 2: Loose Match Prevention (3 lines)

**File:** `plugins/plugin-ezpath/src/actions/getQuote.ts`

**Lines ~44-55** - Replace the entire QUOTE_KEYWORDS block:

```diff
- const QUOTE_KEYWORDS = [
-   "quote", "price", "swap", "trade", "exchange", "convert",
-   "how much", "rate", "sell", "buy", "weth", "usdc",
- ];
- function looksLikeQuoteRequest(text: string): boolean {
-   const lower = text.toLowerCase();
-   return QUOTE_KEYWORDS.some(kw => lower.includes(kw));
- }

+ const COMMAND_TRIGGERS = [
+   "/ezpath", "ezpath quote", "swap rate", "ezpath swap", "get quote", "price quote"
+ ];
+ function looksLikeQuoteRequest(text: string): boolean {
+   const lower = text.toLowerCase();
+   return COMMAND_TRIGGERS.some(trigger => lower.includes(trigger));
+ }
```

**Why:** Exact command matching only. No accidental triggers on everyday words.

**Test vectors:**
- ✅ `/ezpath swap USDC to WETH` → Triggers
- ✅ `ezpath quote 100 USDC` → Triggers
- ❌ `what's the inflation rate?` → Does NOT trigger (prevents wallet drain)
- ❌ `I want to buy groceries` → Does NOT trigger (prevents accidental spend)

---

## Fix 3: Toll Address Validation (5 lines)

**File:** `plugins/plugin-ezpath/src/client.ts`

**Lines ~73-76** - Add validation after getting the header:

```diff
  const tollAddress = probe.headers.get("X-402-Address");
  if (!tollAddress) throw new Error("ezpath: 402 response missing X-402-Address header");
  
+ // Hardcode your production toll address
+ const PRODUCTION_TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad".toLowerCase();
+ if (tollAddress.toLowerCase() !== PRODUCTION_TOLL_ADDRESS) {
+   throw new Error(`SECURITY FAULT: Toll address mismatch. Expected ${PRODUCTION_TOLL_ADDRESS}, got ${tollAddress.toLowerCase()}`);
+ }
  
  const probeBody = await probe.json() as PaymentRequiredBody;
```

**Why:** Prevents DNS spoofing or MITM attacks from redirecting USDC to attacker wallet.

---

## That's It

Three changes. Zero architectural additions. One commit.

```bash
git add plugins/plugin-ezpath/src/actions/getQuote.ts plugins/plugin-ezpath/src/client.ts
git commit -m "Fix P1 security: tier default, loose validation, toll address anchor"
```

**Next:** Test with mock Eliza agent. Submit to Agentic Market.
