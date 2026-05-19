// ─── FIX 1: getQuote.ts ───────────────────────────────────────────────────

// BEFORE (BUGGY):
// tier: z.enum(["basic", "resilient", "institutional"]).default("basic")

// AFTER (FIXED):
const QuoteParamsSchema = z.object({
  sellToken: z.string().describe("Token to sell (0x address or symbol)"),
  buyToken: z.string().describe("Token to buy (0x address or symbol)"),
  sellAmount: z.string().describe("Amount to sell (in atomic units or decimal)"),
  slippagePercentage: z.string().optional().describe("Max slippage %"),
  tier: z.enum(["basic", "resilient", "institutional"]).optional()  // ← CHANGE: .optional() not .default("basic")
    .describe("Execution tier — basic ($0.03), resilient ($0.10), institutional ($0.50)"),
});

// ─── FIX 2: getQuote.ts validateFunction ───────────────────────────────────

// BEFORE (TOO BROAD - triggers on "rate", "price", "buy", "sell"):
// const QUOTE_KEYWORDS = [
//   "quote", "price", "swap", "trade", "exchange", "convert",
//   "how much", "rate", "sell", "buy", "weth", "usdc",
// ];

// AFTER (FIXED - only explicit commands):
const COMMAND_TRIGGERS = [
  "/ezpath",
  "ezpath quote",
  "swap rate",
  "ezpath swap",
  "get quote",
  "price quote"
];

function looksLikeQuoteRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return COMMAND_TRIGGERS.some(trigger => lower.includes(trigger));
}

// Result:
// ❌ "What's the inflation rate?" → Does NOT trigger (good)
// ❌ "I want to buy groceries" → Does NOT trigger (good)
// ✅ "ezpath quote USDC to WETH" → TRIGGERS (correct)
// ✅ "/ezpath swap" → TRIGGERS (correct)

// ─── FIX 3: client.ts ──────────────────────────────────────────────────────

// BEFORE (UNSAFE - accepts any address from HTTP header):
// const tollAddress = probe.headers.get("X-402-Address");
// // Directly used in EIP-3009 signature with NO validation

// AFTER (FIXED - validates against production address):
const PRODUCTION_TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad".toLowerCase();

// Inside your getQuote() or payment handler:
const tollAddress = probe.headers.get("X-402-Address");
if (!tollAddress?.toLowerCase().match(/^0x[a-f0-9]{40}$/)) {
  throw new Error("SECURITY: Invalid toll address format from server response");
}

if (tollAddress.toLowerCase() !== PRODUCTION_TOLL_ADDRESS) {
  throw new Error(
    `SECURITY FAULT: Destination payment wallet mismatch. ` +
    `Expected ${PRODUCTION_TOLL_ADDRESS}, got ${tollAddress.toLowerCase()}. ` +
    `This could indicate DNS spoofing or MITM attack. Connection unsafe.`
  );
}

// Safe to use tollAddress in EIP-3009 signature now
const auth = {
  from: walletAddress,
  to: tollAddress,  // ← Now validated
  value: paymentAmount,
  validAfter: Math.floor(Date.now() / 1000),
  validBefore: Math.floor(Date.now() / 1000) + 15,
  nonce: nonceHex,
};
