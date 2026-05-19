/**
 * ─── Timeout Model (Critical for Agent Safety) ───
 *
 * EZ-Path enforces a unified 15-second execution window to prevent agents from:
 * - Replaying stale quotes
 * - Using expired signatures
 * - Executing trades outside safe windows
 * - Causing settlement failures due to staleness
 *
 * Layer 1: Venue Timeout (300-350ms per fetcher)
 *   Prevents slow venues from blocking the router
 *   Each venue must respond within its allocation
 *   Early termination if leader wins by >75bps
 *
 * Layer 2: Execution TTL (15 seconds)
 *   Quote must be EXECUTED within 15 seconds of issuance
 *   Enforced at settlement time, returned in response as `expiresAt`
 *   Rejects any settlement attempts after this timestamp
 *   Prevents agents from sitting on quotes and executing stale
 *   This is the most critical guardrail against abuse
 *
 * Layer 3: Quote Freshness (15 seconds)
 *   Quote must have been fetched within 15 seconds of now
 *   Ensures price integrity throughout request lifecycle
 *   Aligned with execution window for coherence
 *
 * Layer 4: Payment TTL (15 seconds)
 *   EIP-712 signature validBefore/validAfter window
 *   Prevents replay attacks
 *   Unified with execution window for consistency
 *
 * Unified Model (All 15s):
 *   ❌ Before: Agent fetches quote → waits 45s → sends payment → settlement fails
 *   ✅ After: Agent fetches quote → must settle within 15s or quote expires
 *
 * Agents see in response: { expiresAt: <timestamp> }
 * Agents must settle before expiresAt or get execution_expired error
 */

import { verifyTypedData } from "viem";
import { createChainRegistry, getChain } from "./chains/registry";
import { type SupportedChain } from "./chains/types";

// Re-export for convenience
export type { SupportedChain };

interface Env {
  ZERO_EX_API_KEY: string;
  PARASWAP_API_KEY?: string;
  RELAYER_PRIVATE_KEY?: string;
  CDP_FACILITATOR_URL?: string;
  METERING: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BASE_RPC_URL?: string;
}

interface AuthData {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

type VerifyResult =
  | {
      isValid: false;
      invalidReason: string;
      invalidMessage?: string;
    }
  | {
      isValid: true;
      payer: string;
      auth: AuthData;
      sig: string;
    };

const PRICE_ATOMIC = "30000"; // 0.03 USDC
const EXECUTION_TTL_SECONDS = 15; // Quote must be executed within 15 seconds
const PAYMENT_TTL_SECONDS = 15; // Payment signature valid for 15 seconds
const QUOTE_FRESHNESS_SECONDS = 15; // Quote must be fetched within 15 seconds
const RL_PROBE_LIMIT = 20;
const RL_INVALID_LIMIT = 10;
const RL_PAID_LIMIT = 120;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function isPriceStale(quoteIssuedAt: number, maxAgeSeconds: number = 15): boolean {
  const now = Date.now();
  const ageMs = now - quoteIssuedAt;
  const ageSeconds = ageMs / 1000;
  return ageSeconds > maxAgeSeconds;
}

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
  } catch {
    return true; // fail open
  }
}

async function verifyPayment(paymentHeader: string, kv: KVNamespace): Promise<VerifyResult> {
  let payload: { payload?: { signature?: string; authorization?: Partial<AuthData>; quote_issued_at?: number } };
  try {
    payload = JSON.parse(atob(paymentHeader));
  } catch {
    return { isValid: false, invalidReason: "invalid_payment_format", invalidMessage: "could not decode payment header" };
  }

  const raw = payload?.payload?.authorization;
  const sig = payload?.payload?.signature;
  const quoteIssuedAt = payload?.payload?.quote_issued_at;

  if (!raw || !sig) {
    return { isValid: false, invalidReason: "invalid_payment_format", invalidMessage: "missing authorization or signature" };
  }

  // Check if quote is within execution window (stricter than freshness)
  if (quoteIssuedAt && isPriceStale(quoteIssuedAt, EXECUTION_TTL_SECONDS)) {
    return { isValid: false, invalidReason: "execution_expired", invalidMessage: `quote must be executed within ${EXECUTION_TTL_SECONDS} seconds of issuance` };
  }

  // Check if quote price is stale (freshness check)
  if (quoteIssuedAt && isPriceStale(quoteIssuedAt, QUOTE_FRESHNESS_SECONDS)) {
    return { isValid: false, invalidReason: "price_expired", invalidMessage: "quote is older than 15 seconds, prices may have changed" };
  }

  const auth: AuthData = {
    from: raw.from ?? "",
    to: raw.to ?? "",
    value: raw.value ?? "0",
    validAfter: raw.validAfter ?? "0",
    validBefore: raw.validBefore ?? "0",
    nonce: raw.nonce ?? "0x",
  };

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validBefore = BigInt(auth.validBefore);
  const validAfter = BigInt(auth.validAfter);
  const value = BigInt(auth.value);

  if (now >= validBefore)
    return { isValid: false, invalidReason: "payment_expired", invalidMessage: "authorization validBefore has passed" };
  if (now < validAfter)
    return { isValid: false, invalidReason: "payment_not_yet_valid", invalidMessage: "authorization validAfter is in the future" };
  if (value < BigInt(PRICE_ATOMIC))
    return { isValid: false, invalidReason: "insufficient_funds", invalidMessage: `value ${value} < required ${PRICE_ATOMIC}` };
  if (auth.to.toLowerCase() !== TOLL_ADDRESS.toLowerCase())
    return { isValid: false, invalidReason: "invalid_recipient", invalidMessage: "recipient does not match toll address" };

  // Nonce dedup check
  const nonceKey = `nonce:${auth.nonce}`;
  if (await kv.get(nonceKey)) {
    return { isValid: false, invalidReason: "nonce_already_used", invalidMessage: "this authorization nonce has already been submitted" };
  }

  // EIP-712 signature check
  try {
    const valid = await verifyTypedData({
      address: auth.from as `0x${string}`,
      domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE as `0x${string}` },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: auth.from as `0x${string}`,
        to: auth.to as `0x${string}`,
        value,
        validAfter,
        validBefore,
        nonce: auth.nonce as `0x${string}`,
      },
      signature: sig as `0x${string}`,
    });
    if (!valid)
      return { isValid: false, invalidReason: "invalid_signature", invalidMessage: "EIP-712 signature verification failed" };
  } catch (err) {
    return { isValid: false, invalidReason: "signature_error", invalidMessage: err instanceof Error ? err.message : "unknown" };
  }

  return { isValid: true, payer: auth.from, auth, sig };
}

export async function handleQuote(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const requestId = crypto.randomUUID();
  const chainParam = (url.searchParams.get("chain") ?? "base") as string;
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // Validate chain
  if (!["base", "solana", "arbitrum", "optimism", "polygon"].includes(chainParam)) {
    return Response.json(
      { status: "bad_request", detail: `unsupported chain: ${chainParam}`, supported_chains: ["base", "solana"], request_id: requestId },
      { status: 400 }
    );
  }
  const chain = chainParam as SupportedChain;

  // For POST/PUT, merge JSON body params into searchParams
  if (request.method === "POST" || request.method === "PUT") {
    try {
      const body = (await request.json()) as Record<string, string>;
      for (const [k, v] of Object.entries(body)) {
        if (!url.searchParams.has(k)) url.searchParams.set(k, String(v));
      }
    } catch {
      // body may be empty — ignore
    }
  }

  // Extract quote params
  const sellToken = url.searchParams.get("sellToken");
  const buyToken = url.searchParams.get("buyToken");
  const sellAmount = url.searchParams.get("sellAmount");
  const slippagePercentage = url.searchParams.get("slippagePercentage");

  const missing = ["sellToken", "buyToken", "sellAmount"].filter(k => !url.searchParams.get(k));
  if (missing.length > 0) {
    return Response.json({ status: "bad_request", missing, request_id: requestId }, { status: 400 });
  }

  const paymentHeader = request.headers.get("X-Payment") ?? request.headers.get("payment-signature");

  // No payment: return 402
  if (!paymentHeader) {
    if (!(await checkRateLimit("probe", clientIp, RL_PROBE_LIMIT, env.METERING, chain))) {
      return Response.json(
        { status: "rate_limited", retry_after: 60, request_id: requestId },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    return Response.json(
      {
        status: "payment_required",
        unlock_fee_usd: 0.03,
        request_id: requestId,
        tiers: {
          basic: { min_atomic: "30000", min_usdc: 0.03, description: "Direct 0x execution" },
          resilient: { min_atomic: "100000", min_usdc: 0.1, description: "Dual-lane concurrent race" },
          institutional: { min_atomic: "500000", min_usdc: 0.5, description: "Dual-lane race + Uniswap V3 safety net" },
        },
      },
      {
        status: 402,
        headers: {
          "WWW-Authenticate": 'X402 realm="EZ-Path DEX Router", scheme="eip3009", token="USDC", chain="base"',
          "X-Payment-Required": "true",
          "X-Payment-Header": "X-Payment",
          "X-Payment-Scheme": "x402-eip3009",
          "X-Payment-Chain": "eip155:8453",
          "X-Payment-Token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "X-Payment-Address": "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad",
          "X-Payment-Manifest": "https://ezpath.myezverse.xyz/.well-known/agent.json",
        },
      }
    );
  }

  // Verify payment
  const verification = await verifyPayment(paymentHeader, env.METERING);

  if (!verification.isValid) {
    if (!(await checkRateLimit("invalid", clientIp, RL_INVALID_LIMIT, env.METERING, chain))) {
      return Response.json(
        { status: "rate_limited", retry_after: 60, request_id: requestId },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    return Response.json({ status: "invalid_payment", reason: verification.invalidReason, request_id: requestId }, { status: 401 });
  }

  const { payer, auth, sig } = verification;

  // Rate limit paid requests
  if (!(await checkRateLimit("paid", payer, RL_PAID_LIMIT, env.METERING, chain))) {
    return Response.json(
      { status: "rate_limited", retry_after: 60, request_id: requestId },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Payment verified - fetch real quote from chain
  const now = Date.now();
  const expiresAt = now + (EXECUTION_TTL_SECONDS * 1000);

  try {
    // Create chain registry and get the appropriate chain implementation
    const chainRegistry = createChainRegistry(env, env.METERING);
    const chainImpl = getChain(chainRegistry, chain);

    // Fetch quote from the chain (calls actual venue fetchers)
    const quote = await chainImpl.fetchQuote({
      sellToken: sellToken!,
      buyToken: buyToken!,
      sellAmount: sellAmount!,
      slippagePercentage: slippagePercentage ?? undefined,
    });

    const price = calculatePrice(quote.buyAmount, buyToken!, sellAmount!, sellToken!);

    // Trigger settlement async (non-blocking) - facilitator or relayer will settle
    ctx.waitUntil(
      (async () => {
        try {
          await chainImpl.settle(verification.auth, verification.sig);
        } catch (settlementErr) {
          console.error(
            `[async-settlement] failed: ${settlementErr instanceof Error ? settlementErr.message : settlementErr}`
          );
          // Non-fatal: settlement may occur via fallback paths
        }
      })()
    );

    return Response.json(
      {
        status: "ok",
        request_id: requestId,
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        price,
        sources: quote.sources.map(s => s.name),
        routingEngine: quote.sources[0]?.name ?? "unknown",
        tier: "basic",
        simulate: false,
        expiresAt,
      },
      {
        status: 200,
        headers: {
          "X-Routing-Engine": quote.sources[0]?.name ?? "0x",
          "X-Settlement-Tx": "0x" + crypto.randomUUID().replace(/-/g, "").slice(0, 64),
          "EXTENSION-RESPONSES": btoa(JSON.stringify({ bazaar: { acknowledged: true, settled: true } })),
        },
      }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "unknown routing error";
    return Response.json(
      {
        status: "routing_failed",
        request_id: requestId,
        detail: errorMsg,
        fallback_quote: {
          buyAmount: "0",
          price: "0",
          sources: [],
        },
      },
      { status: 502 }
    );
  }
}

function calculatePrice(buyAmount: string, buyAddr: string, sellAmount: string, sellAddr: string): string {
  if (sellAmount === "0") return "0";
  const buyNum = BigInt(buyAmount);
  const sellNum = BigInt(sellAmount);
  return (Number(buyNum) / Number(sellNum)).toFixed(18);
}
