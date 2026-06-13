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

import { verifyTypedData, hashTypedData, toBytes, toHex } from "viem";
import { createChainRegistry, getChain } from "./chains/registry";
import { type SupportedChain } from "./chains/types";
import { tokenDecimals } from "./chains/evm/venues";

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
      sig?: string;
      rawPayload?: unknown; // full decoded x402 payment object for Base MCP settlement
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

// Tier thresholds (in atomic units)
const TIER_BASIC_ATOMIC = "30000"; // 0.03 USDC
const TIER_RESILIENT_ATOMIC = "100000"; // 0.1 USDC
const TIER_INSTITUTIONAL_ATOMIC = "500000"; // 0.5 USDC

type TierType = "basic" | "resilient" | "institutional";

function determineTier(paymentAtomicValue: string): TierType {
  const val = BigInt(paymentAtomicValue);
  if (val >= BigInt(TIER_INSTITUTIONAL_ATOMIC)) return "institutional";
  if (val >= BigInt(TIER_RESILIENT_ATOMIC)) return "resilient";
  return "basic";
}

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

// ERC-1271: verify smart wallet signature (Coinbase Smart Wallet / Base MCP)
async function verifyERC1271(auth: AuthData, sig: string, rpcUrl: string): Promise<VerifyResult> {
  try {
    const hash = hashTypedData({
      domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE as `0x${string}` },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: auth.from as `0x${string}`,
        to: auth.to as `0x${string}`,
        value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore),
        nonce: auth.nonce as `0x${string}`,
      },
    });
    // ABI-encode isValidSignature(bytes32,bytes) call
    const sigBytes = toBytes(sig as `0x${string}`);
    const sigHex = toHex(sigBytes);
    // isValidSignature selector: 0x1626ba7e
    const calldata =
      "0x1626ba7e" +
      hash.slice(2) + // bytes32 hash (no offset needed, inline)
      "0000000000000000000000000000000000000000000000000000000000000040" + // offset for bytes
      (sigBytes.length).toString(16).padStart(64, "0") + // bytes length
      sigHex.slice(2).padEnd(Math.ceil(sigBytes.length / 32) * 64, "0"); // bytes data

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: auth.from, data: calldata }, "latest"],
      }),
    });
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (json.result && json.result.startsWith("0x1626ba7e")) {
      return { isValid: true, payer: auth.from, auth, sig };
    }
    return { isValid: false, invalidReason: "invalid_signature", invalidMessage: `ERC-1271 returned: ${json.result ?? JSON.stringify(json.error)}` };
  } catch (err) {
    return { isValid: false, invalidReason: "signature_error", invalidMessage: err instanceof Error ? err.message : "unknown" };
  }
}

// Fallback: verify via CDP facilitator (handles non-EIP-3009 schemes like Base MCP)
async function verifyViaFacilitator(
  paymentHeader: string,
  facilitatorUrl: string,
  requestUrl: string
): Promise<VerifyResult> {
  try {
    // Facilitator expects the decoded payment object, not the raw base64 string
    let paymentPayload: unknown = paymentHeader;
    try { paymentPayload = JSON.parse(atob(paymentHeader)); } catch { /* use raw string */ }

    const res = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload,
        paymentRequirements: {
          scheme: "exact",
          network: "base",
          maxAmountRequired: String(PRICE_ATOMIC),
          resource: "https://ezpath.myezverse.xyz/api/v1/quote",
          description: "EZ-Path DEX Quote",
          mimeType: "application/json",
          payTo: TOLL_ADDRESS,
          maxTimeoutSeconds: 300,
          asset: USDC_BASE,
          extra: { name: "USD Coin", version: "2" },
        },
      }),
    });
    const data = (await res.json()) as { isValid?: boolean; invalidReason?: string };
    if (data.isValid) {
      return { isValid: true, payer: "facilitator-verified" };
    }
    return { isValid: false, invalidReason: data.invalidReason ?? "facilitator_rejected", invalidMessage: "CDP facilitator rejected payment" };
  } catch (err) {
    return { isValid: false, invalidReason: "facilitator_error", invalidMessage: err instanceof Error ? err.message : "unknown" };
  }
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

  const paymentHeader = request.headers.get("X-Payment") ?? request.headers.get("payment-signature");

  // Extract quote params
  const sellToken = url.searchParams.get("sellToken");
  const buyToken = url.searchParams.get("buyToken");
  const sellAmount = url.searchParams.get("sellAmount");
  const slippagePercentage = url.searchParams.get("slippagePercentage");

  // No payment: return 402 (check payment BEFORE validating parameters)
  if (!paymentHeader) {
    if (!(await checkRateLimit("probe", clientIp, RL_PROBE_LIMIT, env.METERING, chain))) {
      return Response.json(
        { status: "rate_limited", retry_after: 60, request_id: requestId },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const paymentRequired = {
      // Standardized DEX quote fields (required by Bazaar discovery validator)
      sellToken: null,
      buyToken: null,
      sellAmount: null,
      buyAmount: null,
      price: null,
      sources: [],
      estimatedGas: null,
      // X402 v2 metadata
      x402Version: 2,
      resource: {
        url: "https://api.myezverse.xyz/api/v1/quote",
        description: "EZ-Path DEX Quote — races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returns the highest buyAmount",
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: "base",
          amount: String(PRICE_ATOMIC),
          // v1 back-compat: standard x402 clients read maxAmountRequired / extra / mimeType
          maxAmountRequired: String(PRICE_ATOMIC),
          asset: USDC_BASE,
          payTo: TOLL_ADDRESS,
          maxTimeoutSeconds: 300,
          mimeType: "application/json",
          extra: { name: "USD Coin", version: "2" },
        },
      ],
      // v1 back-compat: tiered pricing + request id for existing (pre-Bazaar) consumers
      tiers: {
        basic: { min_atomic: TIER_BASIC_ATOMIC, usd: "0.03", description: "direct 0x" },
        resilient: { min_atomic: TIER_RESILIENT_ATOMIC, usd: "0.10", description: "4-venue race" },
        institutional: { min_atomic: TIER_INSTITUTIONAL_ATOMIC, usd: "0.50", description: "all 10 venues" },
      },
      request_id: requestId,
      extensions: {
        bazaar: {
          resourceServerExtension: true,
          discoveryExtension: true,
          // Shape mandated by the x402 Go SDK's DiscoveryInfo union type
          // (go/extensions/types/types.go). For an HTTP endpoint the SDK reads
          // the method from info.input.method with info.input.type === "http".
          // Anything else throws "failed to extract method/toolName".
          info: {
            input: {
              type: "http",
              method: "GET",
              queryParams: {
                sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                buyToken: "0x4200000000000000000000000000000000000006",
                sellAmount: "1000000",
              },
            },
            output: {
              type: "json",
              // DEX Router Best Quote example response
              example: {
                sellToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                buyToken: "0x4200000000000000000000000000000000000006",
                sellAmount: "1000000",
                buyAmount: "998500000000000000",
                price: "0.9985",
                sources: [
                  { name: "0x", proportion: "0.70" },
                  { name: "Uniswap V3", proportion: "0.30" },
                ],
                estimatedGas: "210000",
              },
            },
          },
          // Schema validates the STRUCTURE of info (mirrors the SDK's
          // createQueryDiscoveryExtension output).
          schema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
              input: {
                type: "object",
                properties: {
                  type: { type: "string", const: "http" },
                  method: { type: "string", enum: ["GET"] },
                  queryParams: {
                    type: "object",
                    properties: {
                      sellToken: { type: "string" },
                      buyToken: { type: "string" },
                      sellAmount: { type: "string" },
                    },
                    required: ["sellToken", "buyToken", "sellAmount"],
                  },
                },
                required: ["type", "method"],
                additionalProperties: false,
              },
              output: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  example: {
                    type: "object",
                    properties: {
                      sellToken: { type: "string" },
                      buyToken: { type: "string" },
                      sellAmount: { type: "string" },
                      buyAmount: { type: "string" },
                      price: { type: "string" },
                      sources: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            proportion: { type: "string" },
                          },
                          required: ["name", "proportion"],
                        },
                      },
                      estimatedGas: { type: "string" },
                    },
                  },
                },
                required: ["type"],
              },
            },
            required: ["input"],
          },
        },
      },
    };

    const paymentJson = JSON.stringify(paymentRequired);
    const paymentBase64 = btoa(unescape(encodeURIComponent(paymentJson)));

    return Response.json(paymentRequired, {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": paymentBase64,
        "WWW-Authenticate": 'X402 realm="EZ-Path", scheme="eip3009", network="base"',
        // v1 back-compat headers for existing (pre-Bazaar) consumers
        "X-Payment-Address": TOLL_ADDRESS,
        "X-Payment-Token": USDC_BASE,
      },
    });
  }

  // Verify payment — 1) local EIP-3009, 2) CDP facilitator, 3) Base MCP smart wallet trust
  let verification = await verifyPayment(paymentHeader, env.METERING);
  if (!verification.isValid && (verification.invalidReason === "invalid_payment_format" || verification.invalidReason === "signature_error") && env.CDP_FACILITATOR_URL) {
    verification = await verifyViaFacilitator(paymentHeader, env.CDP_FACILITATOR_URL, request.url);
  }
  // Base MCP / Coinbase Smart Wallet path:
  // Counterfactual smart wallets can't be verified locally via ERC-1271.
  // Coinbase guarantees payment via their approval flow at keys.coinbase.com.
  // We validate authorization fields (recipient, value, expiry, nonce) and trust the payment.
  if (!verification.isValid && verification.invalidReason !== "nonce_already_used") {
    try {
      const decoded = JSON.parse(atob(paymentHeader)) as {
        x402Version?: number; scheme?: string; network?: string;
        payload?: { authorization?: Partial<AuthData>; signature?: string }
      };
      const raw = decoded?.payload?.authorization;
      const isBaseMcpFormat = decoded?.x402Version === 1 && decoded?.scheme === "exact" && decoded?.network === "base";
      if (isBaseMcpFormat && raw) {
        const now = BigInt(Math.floor(Date.now() / 1000));
        const validBefore = BigInt(raw.validBefore ?? "0");
        const value = BigInt(raw.value ?? "0");
        const nonce = raw.nonce ?? "0x";
        if (now >= validBefore)
          verification = { isValid: false, invalidReason: "payment_expired", invalidMessage: "authorization validBefore has passed" };
        else if (value < BigInt(PRICE_ATOMIC))
          verification = { isValid: false, invalidReason: "insufficient_funds", invalidMessage: `value ${value} < required ${PRICE_ATOMIC}` };
        else if ((raw.to ?? "").toLowerCase() !== TOLL_ADDRESS.toLowerCase())
          verification = { isValid: false, invalidReason: "invalid_recipient", invalidMessage: "recipient does not match toll address" };
        else if (await env.METERING.get(`nonce:${nonce}`))
          verification = { isValid: false, invalidReason: "nonce_already_used", invalidMessage: "nonce already used" };
        else {
          verification = { isValid: true, payer: raw.from ?? "base-mcp", auth: raw as AuthData, rawPayload: decoded };
        }
      }
    } catch { /* ignore decode errors */ }
  }

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

  // Validate required parameters (only after payment is verified)
  const missing = ["sellToken", "buyToken", "sellAmount"].filter(k => !url.searchParams.get(k));
  if (missing.length > 0) {
    return Response.json({ status: "bad_request", missing, request_id: requestId }, { status: 400 });
  }

  // Payment verified - fetch real quote from chain
  const now = Date.now();
  const expiresAt = now + (EXECUTION_TTL_SECONDS * 1000);
  const quoteStart = Date.now();

  try {
    // Create chain registry and get the appropriate chain implementation
    const chainRegistry = createChainRegistry(env, env.METERING);
    const chainImpl = getChain(chainRegistry, chain);

    // Determine tier from payment amount
    const tier = determineTier(verification.auth.value);

    // Fetch quote from the chain (calls appropriate tier-based venue fetchers)
    let quote: any;
    let routingMetadata: any = null;

    if (tier === "institutional" && "fetchQuoteInstitutional" in chainImpl) {
      const result = await (chainImpl as any).fetchQuoteInstitutional(
        sellToken!,
        buyToken!,
        sellAmount!,
        slippagePercentage ?? null
      );
      quote = result.quote;
      routingMetadata = result.metadata;
    } else if (tier === "resilient" && "fetchQuoteResilient" in chainImpl) {
      const result = await (chainImpl as any).fetchQuoteResilient(
        sellToken!,
        buyToken!,
        sellAmount!,
        slippagePercentage ?? null
      );
      quote = result.quote;
      routingMetadata = result.metadata;
    } else {
      // Default to basic tier for all chains
      quote = await chainImpl.fetchQuote({
        sellToken: sellToken!,
        buyToken: buyToken!,
        sellAmount: sellAmount!,
        slippagePercentage: slippagePercentage ?? undefined,
      });
    }

    const totalLatencyMs = Date.now() - quoteStart;
    const price = calculatePrice(quote.buyAmount, buyToken!, sellAmount!, sellToken!);
    const feeAtomic = Number(verification.auth.value);
    const winner = routingMetadata?.winner ?? quote.sources[0]?.name ?? "0x";

    // Trigger settlement + metrics async (non-blocking)
    ctx.waitUntil(
      (async () => {
        let settlementResult = { txHash: null as string | null, status: "failed" as const, errorCode: "not_attempted" };
        try {
          settlementResult = await chainImpl.settle(verification.auth, verification.sig, (verification as any).rawPayload) as any;
        } catch (settlementErr) {
          console.error(
            `[async-settlement] failed: ${settlementErr instanceof Error ? settlementErr.message : settlementErr}`
          );
        }

        // Record metrics to KV (ETL pipeline reads these nightly)
        try {
          await chainImpl.recordMetrics({
            requestId,
            timestamp: now,
            chain,
            payer,
            tier,
            feeCollected: {
              atomic: feeAtomic,
              usdValue: `$${(feeAtomic / 1_000_000).toFixed(6)}`,
            },
            execution: {
              mode: routingMetadata?.execution_mode ?? "direct",
              winner,
              buyAmount: quote.buyAmount,
            },
            venues: quote.sources.map((s: any) => ({
              name: s.name,
              latencyMs: totalLatencyMs,
              buyAmount: quote.buyAmount,
              success: true,
            })),
            edgeBps: 0,
            totalLatencyMs,
            auth: { verificationStatus: "valid" },
            settlement: {
              attempted: true,
              status: settlementResult.status ?? "failed",
              txHash: settlementResult.txHash ?? undefined,
              errorCode: settlementResult.errorCode,
            },
            rateLimitStatus: { category: "paid", allowed: true },
            fallbackUsed: false,
          });
        } catch (metricsErr) {
          console.error(`[metrics] failed: ${metricsErr instanceof Error ? metricsErr.message : metricsErr}`);
        }
      })()
    );

    // Bazaar discovery metadata (indexed by CDP Facilitator)
    const discoveryMetadata = {
      endpoint: "https://ezpath.myezverse.xyz/api/v1/quote",
      method: "GET",
      input: {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,
      },
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain network (base, arbitrum, optimism, polygon, solana)",
            enum: ["base", "arbitrum", "optimism", "polygon", "solana"],
          },
          sellToken: {
            type: "string",
            description: "ERC-20 token address to sell (must be on specified chain)",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          buyToken: {
            type: "string",
            description: "ERC-20 token address to buy (must be on specified chain)",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          sellAmount: {
            type: "string",
            description: "Amount in atomic units (e.g., 1000000 for 1 USDC on 6-decimal chain)",
          },
          slippagePercentage: {
            type: "string",
            description: "Max slippage tolerance as percentage (optional, default 0.5%)",
          },
        },
        required: ["sellToken", "buyToken", "sellAmount"],
      },
      output: {
        example: {
          status: "ok",
          request_id: requestId,
          sellToken: quote.sellToken,
          buyToken: quote.buyToken,
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          price: price,
          sources: quote.sources.map(s => s.name),
          routingEngine: routingMetadata?.winner ?? "0x",
          tier: tier,
          expiresAt: expiresAt,
        },
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["ok"],
              description: "Quote status",
            },
            request_id: {
              type: "string",
              description: "Unique request identifier",
            },
            buyAmount: {
              type: "string",
              description: "Expected output amount in atomic units",
            },
            price: {
              type: "string",
              description: "Human-readable price (buyToken per sellToken)",
            },
            sources: {
              type: "array",
              items: { type: "string" },
              description: "DEX venues used for this quote (0x, Aerodrome, Uniswap, etc.)",
            },
            routingEngine: {
              type: "string",
              description: "Best-performing DEX for this swap",
            },
            tier: {
              type: "string",
              enum: ["basic", "resilient", "institutional"],
              description: "Payment tier used",
            },
            expiresAt: {
              type: "number",
              description: "Unix timestamp when quote expires (15 seconds from request)",
            },
          },
          required: ["status", "buyAmount", "price", "routingEngine"],
        },
      },
    };

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
        routingEngine: routingMetadata?.winner ?? quote.sources[0]?.name ?? "unknown",
        tier,
        simulate: false,
        expiresAt,
      },
      {
        status: 200,
        headers: {
          "X-Routing-Engine": routingMetadata?.winner ?? quote.sources[0]?.name ?? "0x",
          "EXTENSION-RESPONSES": btoa(JSON.stringify({ bazaar: { acknowledged: true, settled: true } })),
          "X-Bazaar-Discovery": btoa(JSON.stringify(discoveryMetadata)),
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
  if (sellAmount === "0" || buyAmount === "0") return "0";
  // Decimal-adjust: express as (buyToken human units) / (sellToken human units)
  // = (buyAmount / 10^buyDec) / (sellAmount / 10^sellDec)
  // = (buyAmount * 10^sellDec) / (sellAmount * 10^buyDec)
  const buyDec = tokenDecimals(buyAddr);
  const sellDec = tokenDecimals(sellAddr);
  const scale = 10n ** 18n; // keep 18 decimal precision in integer math
  const numerator = BigInt(buyAmount) * (10n ** BigInt(sellDec)) * scale;
  const denominator = BigInt(sellAmount) * (10n ** BigInt(buyDec));
  if (denominator === 0n) return "0";
  const result = numerator / denominator;
  // Format as decimal string with 18 decimal places
  const intPart = result / scale;
  const fracPart = result % scale;
  return `${intPart}.${fracPart.toString().padStart(18, "0")}`;
}
