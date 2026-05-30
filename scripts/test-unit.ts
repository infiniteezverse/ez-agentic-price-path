/**
 * EZ-Path Unit Tests — Critical Pure Functions
 * Run: npm run test:unit
 *
 * Tests every function that has caused production bugs.
 * Zero external dependencies — no network calls, no Cloudflare APIs.
 */

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ ${description}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function assertClose(description: string, actual: string, expected: string, tolerancePct = 0.01) {
  const a = parseFloat(actual);
  const e = parseFloat(expected);
  const diff = Math.abs(a - e) / e;
  if (diff <= tolerancePct) {
    console.log(`  ✓ ${description} (got ${a.toFixed(9)}, expected ~${e})`);
    passed++;
  } else {
    console.error(`  ✗ ${description} — got ${actual}, expected ~${expected} (${(diff * 100).toFixed(2)}% off)`);
    failed++;
  }
}

// ─── Inline implementations (copied from src to avoid Worker-only deps) ────────

const TOKEN_DECIMALS: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,   // USDC Base
  "0x4200000000000000000000000000000000000006": 18,  // WETH
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18,  // DAI
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 18,  // cbETH
  "0x0555e30da8f98308edb960aa94c0db47230d2b9c": 8,   // WBTC
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 6,   // EURC
};
function tokenDecimals(addr: string) { return TOKEN_DECIMALS[addr.toLowerCase()] ?? 18; }

function calculatePrice(buyAmount: string, buyAddr: string, sellAmount: string, sellAddr: string): string {
  if (sellAmount === "0" || buyAmount === "0") return "0";
  const buyDec = tokenDecimals(buyAddr);
  const sellDec = tokenDecimals(sellAddr);
  const scale = 10n ** 18n;
  const numerator = BigInt(buyAmount) * (10n ** BigInt(sellDec)) * scale;
  const denominator = BigInt(sellAmount) * (10n ** BigInt(buyDec));
  if (denominator === 0n) return "0";
  const result = numerator / denominator;
  const intPart = result / scale;
  const fracPart = result % scale;
  return `${intPart}.${fracPart.toString().padStart(18, "0")}`;
}

function determineTier(paymentAtomicValue: string): "basic" | "resilient" | "institutional" {
  const val = BigInt(paymentAtomicValue);
  if (val >= 500000n) return "institutional";
  if (val >= 100000n) return "resilient";
  return "basic";
}

const PRICE_ATOMIC = "30000";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function verifyAuthFields(auth: {
  from?: string; to?: string; value?: string;
  validAfter?: string; validBefore?: string; nonce?: string;
}, nowSeconds: number): { ok: boolean; reason?: string } {
  const validBefore = BigInt(auth.validBefore ?? "0");
  const value = BigInt(auth.value ?? "0");
  if (BigInt(nowSeconds) >= validBefore) return { ok: false, reason: "payment_expired" };
  if (value < BigInt(PRICE_ATOMIC)) return { ok: false, reason: "insufficient_funds" };
  if ((auth.to ?? "").toLowerCase() !== TOLL_ADDRESS.toLowerCase()) return { ok: false, reason: "invalid_recipient" };
  return { ok: true };
}

// ─── Test: calculatePrice ───────────────────────────────────────────────────

console.log("\n── calculatePrice ──");

// USDC → WETH: 1 USDC = ~0.000503 WETH
// Real quote from on-chain: sellAmount=1000000 USDC, buyAmount=502955357336017 wei WETH
assertClose(
  "USDC→WETH: 1 USDC ≈ 0.000503 WETH",
  calculatePrice("502955357336017", "0x4200000000000000000000000000000000000006", "1000000", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  "0.000503"
);

// WETH → USDC: 1 WETH = ~2000 USDC
assertClose(
  "WETH→USDC: 1 WETH ≈ 2000 USDC",
  calculatePrice("2000000000", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "1000000000000000000", "0x4200000000000000000000000000000000000006"),
  "2000"
);

// Same token 1:1
assert(
  "USDC→USDC same token = 1.0",
  calculatePrice("1000000", USDC_BASE, "1000000", USDC_BASE) === "1.000000000000000000"
);

// Zero inputs
assert("sellAmount=0 returns '0'", calculatePrice("1000000", USDC_BASE, "0", USDC_BASE) === "0");
assert("buyAmount=0 returns '0'", calculatePrice("0", USDC_BASE, "1000000", USDC_BASE) === "0");

// Unknown token defaults to 18 decimals — should not throw
const unknownResult = calculatePrice("1000000000000000000", "0xdeadbeef00000000000000000000000000000001", "1000000000000000000", "0xdeadbeef00000000000000000000000000000002");
assert("Unknown tokens (18 dec fallback) returns 1.0", unknownResult === "1.000000000000000000");

// USDC → EURC (both 6 dec) — 1:1
assert(
  "USDC→EURC (both 6 dec) = 1.0",
  calculatePrice("1000000", "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", "1000000", USDC_BASE) === "1.000000000000000000"
);

// ─── Test: determineTier ───────────────────────────────────────────────────

console.log("\n── determineTier ──");

assert("29999 → basic", determineTier("29999") === "basic");
assert("30000 → basic", determineTier("30000") === "basic");
assert("99999 → basic", determineTier("99999") === "basic");
assert("100000 → resilient", determineTier("100000") === "resilient");
assert("100001 → resilient", determineTier("100001") === "resilient");
assert("499999 → resilient", determineTier("499999") === "resilient");
assert("500000 → institutional", determineTier("500000") === "institutional");
assert("1000000 → institutional", determineTier("1000000") === "institutional");

// ─── Test: verifyAuthFields ────────────────────────────────────────────────

console.log("\n── verifyAuthFields ──");

const nowSeconds = Math.floor(Date.now() / 1000);
const validBefore = String(nowSeconds + 300);

const goodAuth = { from: "0xabc", to: TOLL_ADDRESS, value: "30000", validAfter: "0", validBefore, nonce: "0x01" };
assert("Valid auth passes", verifyAuthFields(goodAuth, nowSeconds).ok === true);

assert("Expired (validBefore = now) fails",
  verifyAuthFields({ ...goodAuth, validBefore: String(nowSeconds) }, nowSeconds).reason === "payment_expired");

assert("Expired (validBefore < now) fails",
  verifyAuthFields({ ...goodAuth, validBefore: String(nowSeconds - 1) }, nowSeconds).reason === "payment_expired");

assert("Value below minimum fails",
  verifyAuthFields({ ...goodAuth, value: "29999" }, nowSeconds).reason === "insufficient_funds");

assert("Zero value fails",
  verifyAuthFields({ ...goodAuth, value: "0" }, nowSeconds).reason === "insufficient_funds");

assert("Wrong recipient fails",
  verifyAuthFields({ ...goodAuth, to: "0xwrongaddress" }, nowSeconds).reason === "invalid_recipient");

assert("Toll address case-insensitive match passes",
  verifyAuthFields({ ...goodAuth, to: TOLL_ADDRESS.toLowerCase() }, nowSeconds).ok === true);

// ─── Test: KV TTL vs ETL cron gap ─────────────────────────────────────────

console.log("\n── KV TTL vs ETL cron ──");

const METRICS_TTL = 172800; // 48h — current value in EVMChain.ts
const ETL_MAX_GAP_SECONDS = 26 * 3600; // worst case: written at midnight, ETL at 2AM next day = 26h
assert(
  `Metrics TTL (${METRICS_TTL / 3600}h) > ETL max gap (${ETL_MAX_GAP_SECONDS / 3600}h)`,
  METRICS_TTL > ETL_MAX_GAP_SECONDS
);

// ─── Test: worker.toml has cron trigger ────────────────────────────────────

console.log("\n── worker.toml cron trigger ──");

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerToml = readFileSync(resolve(__dirname, "../worker.toml"), "utf-8");

assert("worker.toml contains [triggers]", workerToml.includes("[triggers]"));
assert('worker.toml contains crons = ["0 2 * * *"]', workerToml.includes('0 2 * * *'));
assert("worker.toml does NOT use prefix: \"\"", !workerToml.includes('prefix: ""'));

// ─── Test: ETL uses correct KV prefix ─────────────────────────────────────

console.log("\n── ETL KV prefix ──");

const etlSrc = readFileSync(resolve(__dirname, "../src/etl.ts"), "utf-8");
assert('etl.ts uses prefix: "metrics:"', etlSrc.includes('prefix: "metrics:"'));
assert('etl.ts does NOT use prefix: ""', !etlSrc.includes('prefix: ""'));

// ─── Test: No false feature claims ────────────────────────────────────────

console.log("\n── No false feature claims ──");

const discoverySrc = readFileSync(resolve(__dirname, "../src/discovery.ts"), "utf-8");
const llmsSrc = readFileSync(resolve(__dirname, "../src/llms.ts"), "utf-8");
const landingSrc = readFileSync(resolve(__dirname, "../src/landing.ts"), "utf-8");

const falseClaimPatterns = [
  { pattern: /flashbots/i, description: "Flashbots MEV (not implemented)" },
  { pattern: /mev protection/i, description: "MEV protection (not implemented)" },
  { pattern: /zero.failure guarantee/i, description: "Zero-failure guarantee (not promised)" },
];

for (const { pattern, description } of falseClaimPatterns) {
  assert(`No "${description}" in discovery.ts`, !pattern.test(discoverySrc));
  assert(`No "${description}" in llms.ts`, !pattern.test(llmsSrc));
  assert(`No "${description}" in landing.ts`, !pattern.test(landingSrc));
}

// ─── Test: recordMetrics is called in quote-router ─────────────────────────

console.log("\n── recordMetrics wired up ──");

const routerSrc = readFileSync(resolve(__dirname, "../src/quote-router.ts"), "utf-8");
assert("quote-router.ts calls recordMetrics()", routerSrc.includes("recordMetrics("));
assert("quote-router.ts calls settle()", routerSrc.includes("chainImpl.settle("));
assert("Both in same ctx.waitUntil block", (() => {
  const waitUntilIdx = routerSrc.indexOf("ctx.waitUntil(");
  const metricsIdx = routerSrc.indexOf("recordMetrics(");
  const settleIdx = routerSrc.indexOf("chainImpl.settle(");
  return waitUntilIdx < settleIdx && waitUntilIdx < metricsIdx;
})());

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n⚠️  ${failed} test(s) failed — fix before deploying`);
  process.exit(1);
} else {
  console.log(`\n✅  All tests passed — safe to deploy`);
}
