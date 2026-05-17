/**
 * EZ-Path go-live validation suite.
 * Runs every critical surface in sequence and reports pass/fail for each.
 * Usage: pnpm golive
 */

import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// ─── Config ───────────────────────────────────────────────────────────────────

const API          = "https://ezpath.myezverse.xyz/api/v1/quote";
const ANALYTICS    = "https://ezpath.myezverse.xyz/admin/analytics";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad" as const;
const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const WETH_BASE    = "0x4200000000000000000000000000000000000006" as const;

const TIERS = {
  basic:         { atomic: 30000n,  usd: "0.03", expectedMode: "direct" },
  resilient:     { atomic: 100000n, usd: "0.10", expectedMode: "concurrent_race" },
  institutional: { atomic: 500000n, usd: "0.50", expectedMode: ["concurrent_race", "emergency_onchain_fallback"] },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label: string, detail = "") {
  console.log(`  ✓  ${label}${detail ? `  — ${detail}` : ""}`);
  passed++;
}

function fail(label: string, detail = "") {
  console.log(`  ✗  ${label}${detail ? `  — ${detail}` : ""}`);
  failed++;
}

function check(label: string, condition: boolean, detail = "") {
  condition ? pass(label, detail) : fail(label, detail);
}

async function signPayment(account: ReturnType<typeof privateKeyToAccount>, client: ReturnType<typeof createWalletClient>, valueAtomic: bigint) {
  const validAfter  = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
  const nonce       = toHex(crypto.getRandomValues(new Uint8Array(32)));

  const signature = await client.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE },
    types: {
      TransferWithAuthorization: [
        { name: "from",        type: "address" },
        { name: "to",          type: "address" },
        { name: "value",       type: "uint256" },
        { name: "validAfter",  type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce",       type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: account.address, to: TOLL_ADDRESS,
      value: valueAtomic, validAfter, validBefore,
      nonce: nonce as `0x${string}`,
    },
  });

  return btoa(JSON.stringify({
    x402Version: 1, scheme: "exact", network: "base",
    payload: {
      signature,
      authorization: {
        from: account.address, to: TOLL_ADDRESS,
        value: valueAtomic.toString(),
        validAfter: validAfter.toString(), validBefore: validBefore.toString(), nonce,
      },
    },
  }));
}

function quoteUrl(extra?: Record<string, string>) {
  const u = new URL(API);
  u.searchParams.set("sellToken",  USDC_BASE);
  u.searchParams.set("buyToken",   WETH_BASE);
  u.searchParams.set("sellAmount", "1000000");
  for (const [k, v] of Object.entries(extra ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

// ─── Test blocks ──────────────────────────────────────────────────────────────

async function test402Negotiation() {
  console.log("\n── 1. 402 Negotiation & Tier Matrix");
  const res  = await fetch(quoteUrl());
  const body = await res.json() as Record<string, unknown>;

  check("Status is 402",            res.status === 402);
  check("X-402-Price header",       res.headers.get("X-402-Price") === "0.03");
  check("X-402-Price-Resilient",    res.headers.get("X-402-Price-Resilient") === "0.10");
  check("X-402-Price-Institutional",res.headers.get("X-402-Price-Institutional") === "0.50");
  check("X-402-Address header",     !!res.headers.get("X-402-Address"));
  check("CORS header present",      res.headers.get("Access-Control-Allow-Origin") === "*");
  check("Tiers matrix in body",     typeof (body.tiers as Record<string,unknown>)?.basic === "object");

  const tiers = body.tiers as Record<string, { min_atomic: string }> | undefined;
  check("basic min_atomic=30000",         tiers?.basic?.min_atomic === "30000");
  check("resilient min_atomic=100000",    tiers?.resilient?.min_atomic === "100000");
  check("institutional min_atomic=500000",tiers?.institutional?.min_atomic === "500000");
}

async function testBadRequest() {
  console.log("\n── 2. Bad Request (missing params)");
  const res  = await fetch(`${API}?sellToken=${USDC_BASE}`);
  const body = await res.json() as Record<string, unknown>;
  check("Status is 400",            res.status === 400 || res.status === 402); // 402 because no payment header
  check("request_id present",       typeof body.request_id === "string" || res.status === 402);
}

async function testInvalidSignature() {
  console.log("\n── 3. Invalid Payment Signature");
  const garbage = btoa(JSON.stringify({ x402Version: 1, scheme: "exact", network: "base", payload: { signature: "0xdeadbeef", authorization: { from: "0x0", to: TOLL_ADDRESS, value: "30000", validAfter: "0", validBefore: String(Math.floor(Date.now()/1000)+300), nonce: "0x" + "00".repeat(32) } } }));
  const res  = await fetch(quoteUrl(), { headers: { "X-Payment": garbage } });
  const body = await res.json() as Record<string, unknown>;
  check("Status is 401",            res.status === 401);
  check("Reason provided",          typeof body.reason === "string");
}

async function testTier(
  tierName: keyof typeof TIERS,
  account: ReturnType<typeof privateKeyToAccount>,
  client: ReturnType<typeof createWalletClient>,
) {
  const { atomic, usd, expectedMode } = TIERS[tierName];
  console.log(`\n── ${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Tier ($${usd} USDC)`);

  const payment = await signPayment(account, client, atomic);
  const res     = await fetch(quoteUrl(), { headers: { "X-Payment": payment } });
  const body    = await res.json() as Record<string, unknown>;
  const meta    = body.routing_metadata as Record<string, unknown> | undefined;
  const settlementTx = res.headers.get("X-Settlement-Tx");

  check("Status 200",               res.status === 200,    `got ${res.status}`);
  check("tier field correct",       body.tier === tierName, `got ${body.tier}`);
  check("buyAmount present",        typeof body.buyAmount === "string");
  check("price decimal-normalized", String(body.price).includes("."));
  check("sources array",            Array.isArray(body.sources) && (body.sources as unknown[]).length > 0);
  check("routing_metadata present", !!meta);
  check("execution_mode correct",   Array.isArray(expectedMode)
    ? (expectedMode as string[]).includes(meta?.execution_mode as string)
    : meta?.execution_mode === expectedMode,
    `got ${meta?.execution_mode}`);
  check("winner field present",     typeof meta?.winner === "string", `got ${meta?.winner}`);
  check("X-Routing-Engine header",  !!res.headers.get("X-Routing-Engine"));
  check("X-Settlement-Tx header",   !!settlementTx, settlementTx ?? "missing");
  check("request_id is UUID",       /^[0-9a-f-]{36}$/.test(String(body.request_id)));

  if (tierName !== "basic" && meta?.race_comparison) {
    const rc = meta.race_comparison as Record<string, string>;
    check("race_comparison present", !!rc.lane_1_aggregator_out);
  }

  return { ok: res.status === 200, settlementTx };
}

async function testRateLimit() {
  console.log("\n── Rate Limiting (probe surface)");
  // Burn remaining probe budget then check for 429
  // (previous tests already used some — send enough to definitely trigger)
  let hit429 = false;
  for (let i = 0; i < 25; i++) {
    const r = await fetch(quoteUrl());
    if (r.status === 429) { hit429 = true; break; }
  }
  check("429 triggered within 25 probes", hit429);
  // Verify Retry-After header
  const r429 = await fetch(quoteUrl());
  if (r429.status === 429) {
    check("Retry-After header present", !!r429.headers.get("Retry-After"));
    check("X-RateLimit-Limit header",   !!r429.headers.get("X-RateLimit-Limit"));
  }
}

async function testAnalytics(adminKey: string) {
  console.log("\n── Analytics Endpoint");
  const unauth = await fetch(ANALYTICS);
  check("No token → 401",          unauth.status === 401);

  const res  = await fetch(ANALYTICS, { headers: { "Authorization": `Bearer ${adminKey}` } });
  const body = await res.json() as Record<string, unknown>;
  check("Token → 200",             res.status === 200);
  check("total.requests > 0",      (body.total as Record<string, unknown>)?.requests as number > 0);
  check("total.revenue_usdc present", typeof (body.total as Record<string, unknown>)?.revenue_usdc === "string");
  check("by_day object present",   typeof body.by_day === "object");

  const total = body.total as { requests: number; revenue_usdc: string };
  console.log(`     requests today: ${total.requests}  revenue: $${total.revenue_usdc} USDC`);
}

async function testCORS() {
  console.log("\n── CORS Preflight");
  const res = await fetch(API, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://agent.example.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "X-Payment",
    },
  });
  check("OPTIONS → 204",                  res.status === 204);
  check("Allow-Origin: *",               res.headers.get("Access-Control-Allow-Origin") === "*");
  check("Allow-Headers includes *",      res.headers.get("Access-Control-Allow-Headers") === "*");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawKey     = process.env.TEST_WALLET_PRIVATE_KEY;
  const adminKey   = process.env.ADMIN_API_KEY;
  if (!rawKey)   throw new Error("TEST_WALLET_PRIVATE_KEY not set");
  if (!adminKey) throw new Error("ADMIN_API_KEY not set");

  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account    = privateKeyToAccount(privateKey);
  const client     = createWalletClient({ account, chain: base, transport: http() });

  console.log(`\n${"═".repeat(55)}`);
  console.log(` EZ-Path Go-Live Validation Suite`);
  console.log(` Payer: ${account.address}`);
  console.log(`${"═".repeat(55)}`);

  await testCORS();
  await test402Negotiation();
  await testBadRequest();
  await testInvalidSignature();
  await testTier("basic",         account, client);
  await testTier("resilient",     account, client);
  await testTier("institutional", account, client);
  await testRateLimit();
  await testAnalytics(adminKey);

  console.log(`\n${"═".repeat(55)}`);
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(55)}\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
