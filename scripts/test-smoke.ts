/**
 * EZ-Path Smoke Test — Live Endpoint Verification
 * Run: npm run test:smoke
 *
 * Hits the live deployed worker and checks that everything is operating correctly.
 * Safe to run anytime — only makes no-payment (402) probe requests.
 */

const BASE = "https://ezpath.myezverse.xyz";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const TOLL = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ ${description}${detail ? `\n    → ${detail}` : ""}`);
    failed++;
  }
}

// ─── 402 Response ──────────────────────────────────────────────────────────

console.log("\n── 402 Payment Required ──");

const res402 = await fetch(`${BASE}/api/v1/quote?sellToken=${USDC}&buyToken=${WETH}&sellAmount=1000000`);
const body402 = await res402.json() as any;

assert("Returns HTTP 402", res402.status === 402, `got ${res402.status}`);
assert("x402Version = 2", body402.x402Version === 2);
assert("accepts array present", Array.isArray(body402.accepts) && body402.accepts.length > 0);
assert("accepts[0].scheme = exact", body402.accepts?.[0]?.scheme === "exact");
assert("accepts[0].network = base", body402.accepts?.[0]?.network === "base");
assert("accepts[0].payTo = toll address", body402.accepts?.[0]?.payTo?.toLowerCase() === TOLL.toLowerCase());
assert("accepts[0].asset = USDC", body402.accepts?.[0]?.asset?.toLowerCase() === USDC.toLowerCase());
assert("accepts[0].maxAmountRequired is string", typeof body402.accepts?.[0]?.maxAmountRequired === "string");
assert("accepts[0].maxAmountRequired = 30000", body402.accepts?.[0]?.maxAmountRequired === "30000");
assert("accepts[0].maxTimeoutSeconds = 300", body402.accepts?.[0]?.maxTimeoutSeconds === 300);
assert("accepts[0].mimeType = application/json", body402.accepts?.[0]?.mimeType === "application/json");
assert("accepts[0].extra.name = USD Coin", body402.accepts?.[0]?.extra?.name === "USD Coin");
assert("accepts[0].extra.version = 2", body402.accepts?.[0]?.extra?.version === "2");
assert("tiers present (basic, resilient, institutional)",
  body402.tiers?.basic && body402.tiers?.resilient && body402.tiers?.institutional
);
assert("basic min_atomic = 30000", body402.tiers?.basic?.min_atomic === "30000");
assert("resilient min_atomic = 100000", body402.tiers?.resilient?.min_atomic === "100000");
assert("institutional min_atomic = 500000", body402.tiers?.institutional?.min_atomic === "500000");
assert("request_id present", typeof body402.request_id === "string" && body402.request_id.length > 0);

// Check X-Payment-* headers
const xPaymentAddr = res402.headers.get("X-Payment-Address");
const xPaymentToken = res402.headers.get("X-Payment-Token");
assert("X-Payment-Address header = toll", xPaymentAddr?.toLowerCase() === TOLL.toLowerCase(), xPaymentAddr ?? "missing");
assert("X-Payment-Token header = USDC", xPaymentToken?.toLowerCase() === USDC.toLowerCase(), xPaymentToken ?? "missing");
assert("WWW-Authenticate header present", res402.headers.has("WWW-Authenticate"));

// ─── Discovery Endpoints ────────────────────────────────────────────────────

console.log("\n── Discovery Endpoints ──");

const agentJson = await fetch(`${BASE}/.well-known/agent.json`).then(r => r.json()) as any;
assert("agent.json: x402_version = 1", agentJson.x402_version === 1);
assert("agent.json: payment.payTo = toll", agentJson.payment?.address?.toLowerCase() === TOLL.toLowerCase());
assert("agent.json: mentions 10 venues", agentJson.description?.includes("10"));

const openApiJson = await fetch(`${BASE}/openapi.json`).then(r => r.json()) as any;
assert("openapi.json: /api/v1/quote endpoint present", !!openApiJson.paths?.["/api/v1/quote"]);
assert("openapi.json: security scheme x402 present", !!openApiJson.components?.securitySchemes?.x402);

const llmsMd = await fetch(`${BASE}/llms.md`).then(r => r.text());
assert("llms.md: mentions 10 venues", /10 venues/.test(llmsMd));
assert("llms.md: correct toll address", llmsMd.includes(TOLL));

// ─── 400 Error Handling ────────────────────────────────────────────────────

console.log("\n── Error Handling ──");

// Payment-first semantics (required for x402 Bazaar discovery): an UNPAID request
// returns 402 with payment instructions even when params are incomplete. Param
// validation happens AFTER payment is verified, so it returns 400 only to paying
// clients that omit a param.
const res402b = await fetch(`${BASE}/api/v1/quote?sellToken=${USDC}&buyToken=${WETH}`); // missing sellAmount, unpaid
assert("Unpaid + missing param → 402 (payment-first)", res402b.status === 402);

const res401 = await fetch(`${BASE}/api/v1/quote?sellToken=${USDC}&buyToken=${WETH}&sellAmount=1000000`, {
  headers: { "X-Payment": "invalid_garbage_base64" },
});
assert("Invalid payment → 401", res401.status === 401);

// ─── CORS ──────────────────────────────────────────────────────────────────

console.log("\n── CORS ──");

const corsRes = await fetch(`${BASE}/api/v1/quote?sellToken=${USDC}&buyToken=${WETH}&sellAmount=1000000`);
assert("CORS Access-Control-Allow-Origin: *", corsRes.headers.get("Access-Control-Allow-Origin") === "*");

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Live endpoint: ${BASE}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\n⚠️  ${failed} check(s) failed — endpoint is not fully operational`);
  process.exit(1);
} else {
  console.log(`\n✅  All live checks passed — endpoint is healthy`);
}
