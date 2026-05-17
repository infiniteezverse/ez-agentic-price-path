import { createPublicClient, createWalletClient, http, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { AGENT_JSON, BITTE_AI_PLUGIN_JSON, OPENAPI_JSON, WELL_KNOWN_AGENT_JSON } from "./discovery";
import { LLMS_MD } from "./llms";
import { LANDING_HTML } from "./landing";
import { OG_WEBP_B64 } from "./og";

interface Env {
  ZERO_EX_API_KEY: string;
  PARASWAP_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  METERING: KVNamespace;
  RELAYER_PRIVATE_KEY?: string;
  ADMIN_API_KEY?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";
const PRICE_ATOMIC = "30000"; // 0.03 USDC minimum (6 decimals)

const TIER_ATOMIC_RESILIENT     = 100000n; // 0.10 USDC
const TIER_ATOMIC_INSTITUTIONAL = 500000n; // 0.50 USDC

const ZERO_EX_BASE_URL   = "https://api.0x.org/swap/allowance-holder/price";
const ZERO_EX_CHAIN_ID   = "8453";
const PARASWAP_BASE_URL  = "https://apiv5.paraswap.io/prices";
const PARASWAP_NETWORK   = "8453";

// On-chain venues (Base mainnet)
const AERODROME_ROUTER   = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as const;
const AERODROME_FACTORY  = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as const; // v1 pool factory
const UNISWAP_V3_QUOTER  = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" as const; // QuoterV2
const V3_FEE_TIERS       = [500, 3000, 10000] as const;

const BASE_RPC = "https://mainnet.base.org";

// FiatToken v2.2 transferWithAuthorization (v/r/s form used by Base USDC)
const TRANSFER_WITH_AUTH_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
      { name: "v",           type: "uint8"   },
      { name: "r",           type: "bytes32" },
      { name: "s",           type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const AERODROME_ROUTER_ABI = [
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from",    type: "address" },
          { name: "to",      type: "address" },
          { name: "stable",  type: "bool"    },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

const UNISWAP_V3_QUOTER_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "view", // declared view so readContract works; actually nonpayable on-chain, eth_call handles it
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn",           type: "address" },
          { name: "tokenOut",          type: "address" },
          { name: "amountIn",          type: "uint256" },
          { name: "fee",               type: "uint24"  },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut",               type: "uint256" },
      { name: "sqrtPriceX96After",       type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32"  },
      { name: "gasEstimate",             type: "uint256" },
    ],
  },
] as const;

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from",        type: "address" },
    { name: "to",          type: "address" },
    { name: "value",       type: "uint256" },
    { name: "validAfter",  type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce",       type: "bytes32" },
  ],
} as const;

// ─── Rate limiting ────────────────────────────────────────────────────────────

const RL_PROBE_LIMIT   = 20;  // unauthenticated probe requests per IP per minute
const RL_INVALID_LIMIT = 10;  // invalid payment attempts per IP per minute
const RL_PAID_LIMIT    = 120; // paid requests per payer address per minute

async function checkRateLimit(
  category: string, identifier: string, limit: number, kv: KVNamespace,
): Promise<boolean> {
  try {
    const window = Math.floor(Date.now() / 60_000);
    const key    = `rl:${category}:${identifier}:${window}`;
    const count  = parseInt(await kv.get(key) ?? "0");
    if (count >= limit) return false;
    await kv.put(key, String(count + 1), { expirationTtl: 120 });
    return true;
  } catch {
    return true; // fail open — never block a request due to KV unavailability
  }
}

// ─── Token decimals ───────────────────────────────────────────────────────────

const TOKEN_DECIMALS: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,  // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 6,  // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18, // DAI
  "0x4200000000000000000000000000000000000006": 18, // WETH
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 18, // cbETH
  "0x0555e30da8f98308edb960aa94c0db47230d2b9c": 8,  // WBTC
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 6,  // EURC
};

function tokenDecimals(address: string): number {
  return TOKEN_DECIMALS[address.toLowerCase()] ?? 18;
}

function normalizedPrice(buyAmount: string, buyAddr: string, sellAmount: string, sellAddr: string): string {
  if (sellAmount === "0") return "0";
  const buyDec  = tokenDecimals(buyAddr);
  const sellDec = tokenDecimals(sellAddr);
  const decimalDiff = sellDec - buyDec;
  const num = BigInt(buyAmount) * (decimalDiff >= 0 ? 10n ** BigInt(decimalDiff) : 1n);
  const den = BigInt(sellAmount) * (decimalDiff < 0 ? 10n ** BigInt(-decimalDiff) : 1n);
  const whole     = num / den;
  const remainder = num % den;
  const fracDigits = 18;
  const frac = (remainder * 10n ** BigInt(fracDigits) / den)
    .toString().padStart(fracDigits, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function corsify(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthData {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

type VerifyResult =
  | { isValid: false;  invalidReason: string; invalidMessage?: string }
  | { isValid: true;   payer: string; auth: AuthData; sig: string };

interface NormalizedQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  sources: Array<{ name: string; proportion: string }>;
}

interface RoutingMetadata {
  execution_mode: "direct" | "concurrent_race" | "emergency_onchain_fallback";
  winner: "0x" | "paraswap" | "aerodrome" | "uniswap_v3_onchain";
  race_comparison?: {
    lane_1_aggregator_out: string;
    lane_2_aerodrome_out: string;
  };
}

// Raw upstream response shapes (internal use only)
interface ZeroExQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  sellToken: string;
  route: { fills: Array<{ source: string; proportionBps: string }> };
  liquidityAvailable: boolean;
}

interface ParaSwapPriceRoute {
  srcToken: string;
  srcAmount: string;
  destToken: string;
  destAmount: string;
  bestRoute: Array<{
    swaps: Array<{
      swapExchanges: Array<{ exchange: string; percent: number }>;
    }>;
  }>;
}

interface QuoteLog {
  request_id: string;
  payer_address: string;
  sell_token: string;
  buy_token: string;
  sell_amount: string;
  buy_amount: string;
  price: string;
  routing_engine: string;
  execution_mode: string;
  tier: string;
  simulate: boolean;
  settlement_tx?: string;
  lane_1_out?: string;
  lane_2_out?: string;
}

// ─── Payment verification ─────────────────────────────────────────────────────

async function verifyPayment(paymentHeader: string, kv: KVNamespace): Promise<VerifyResult> {
  let payload: { payload?: { signature?: string; authorization?: Partial<AuthData> } };
  try {
    payload = JSON.parse(atob(paymentHeader));
  } catch {
    return { isValid: false, invalidReason: "invalid_payment_format", invalidMessage: "could not decode payment header" };
  }

  const raw = payload?.payload?.authorization;
  const sig = payload?.payload?.signature;

  if (!raw || !sig) {
    return { isValid: false, invalidReason: "invalid_payment_format", invalidMessage: "missing authorization or signature" };
  }

  const auth: AuthData = {
    from:        raw.from        ?? "",
    to:          raw.to          ?? "",
    value:       raw.value       ?? "0",
    validAfter:  raw.validAfter  ?? "0",
    validBefore: raw.validBefore ?? "0",
    nonce:       raw.nonce       ?? "0x",
  };

  const now         = BigInt(Math.floor(Date.now() / 1000));
  const validBefore = BigInt(auth.validBefore);
  const validAfter  = BigInt(auth.validAfter);
  const value       = BigInt(auth.value);

  if (now >= validBefore)
    return { isValid: false, invalidReason: "payment_expired",        invalidMessage: "authorization validBefore has passed" };
  if (now < validAfter)
    return { isValid: false, invalidReason: "payment_not_yet_valid",  invalidMessage: "authorization validAfter is in the future" };
  if (value < BigInt(PRICE_ATOMIC))
    return { isValid: false, invalidReason: "insufficient_funds",     invalidMessage: `value ${value} < required ${PRICE_ATOMIC}` };
  if (auth.to.toLowerCase() !== TOLL_ADDRESS.toLowerCase())
    return { isValid: false, invalidReason: "invalid_recipient",      invalidMessage: "recipient does not match toll address" };

  // Nonce deduplication — check only; write happens after successful settlement
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
        from:        auth.from        as `0x${string}`,
        to:          auth.to          as `0x${string}`,
        value,
        validAfter,
        validBefore,
        nonce:       auth.nonce       as `0x${string}`,
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

// ─── On-chain settlement ──────────────────────────────────────────────────────
//
// Calls transferWithAuthorization on the Base USDC contract via a relayer wallet.
// The relayer only pays gas — the USDC moves from `auth.from` to TOLL_ADDRESS.
// Requires RELAYER_PRIVATE_KEY secret to be set; a no-op otherwise.
// The relayer wallet must hold a small amount of ETH on Base (~0.001 ETH covers
// hundreds of settlements at current gas prices).

async function settlePayment(auth: AuthData, sig: string, env: Env, kv: KVNamespace): Promise<string | null> {
  if (!env.RELAYER_PRIVATE_KEY) return null;

  const r = sig.slice(0, 66) as `0x${string}`;
  const s = `0x${sig.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);

  const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY as `0x${string}`);
  const client  = createWalletClient({ account, chain: base, transport: http(BASE_RPC) });

  const hash = await client.writeContract({
    address:      USDC_BASE as `0x${string}`,
    abi:          TRANSFER_WITH_AUTH_ABI,
    functionName: "transferWithAuthorization",
    args: [
      auth.from        as `0x${string}`,
      auth.to          as `0x${string}`,
      BigInt(auth.value),
      BigInt(auth.validAfter),
      BigInt(auth.validBefore),
      auth.nonce       as `0x${string}`,
      v,
      r,
      s,
    ],
  });

  // Mark nonce used only after the tx is submitted — prevents double-spend
  const ttl = Math.max(1, Number(BigInt(auth.validBefore) - BigInt(Math.floor(Date.now() / 1000))));
  await kv.put(`nonce:${auth.nonce}`, hash, { expirationTtl: ttl });

  console.log(`[settlement] submitted tx=${hash} payer=${auth.from} nonce=${auth.nonce}`);
  return hash;
}

async function fetchAerodromeQuote(
  sellToken: string, buyToken: string, sellAmount: string,
): Promise<NormalizedQuote> {
  const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const amounts = await client.readContract({
    address: AERODROME_ROUTER,
    abi:     AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [
      BigInt(sellAmount),
      [{ from: sellToken as `0x${string}`, to: buyToken as `0x${string}`, stable: false, factory: AERODROME_FACTORY }],
    ],
  });
  const buyAmount = (amounts as readonly bigint[])[1];
  if (!buyAmount || buyAmount === 0n) throw new Error("aerodrome: zero output amount");
  return { sellToken, buyToken, sellAmount, buyAmount: buyAmount.toString(), sources: [{ name: "Aerodrome", proportion: "1" }] };
}

async function fetchUniswapV3Quote(
  sellToken: string, buyToken: string, sellAmount: string,
): Promise<NormalizedQuote> {
  const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
  const results = await Promise.allSettled(
    V3_FEE_TIERS.map(fee =>
      client.readContract({
        address: UNISWAP_V3_QUOTER,
        abi:     UNISWAP_V3_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [{
          tokenIn:           sellToken as `0x${string}`,
          tokenOut:          buyToken  as `0x${string}`,
          amountIn:          BigInt(sellAmount),
          fee,
          sqrtPriceLimitX96: 0n,
        }],
      }).then(r => ({ amountOut: (r as readonly [bigint, bigint, number, bigint])[0], fee }))
    )
  );
  let bestAmountOut = 0n;
  let bestFee = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.amountOut > bestAmountOut) {
      bestAmountOut = r.value.amountOut;
      bestFee = r.value.fee;
    }
  }
  if (bestAmountOut === 0n) throw new Error("uniswap_v3: no pool found for any fee tier");
  return {
    sellToken, buyToken, sellAmount, buyAmount: bestAmountOut.toString(),
    sources: [{ name: `UniswapV3_${bestFee}bps`, proportion: "1" }],
  };
}

// ─── Metering & logging ───────────────────────────────────────────────────────

async function meterRequest(payerAddress: string, revenueAtomic: number, kv: KVNamespace): Promise<void> {
  const date       = new Date().toISOString().split("T")[0];
  const usageKey   = `usage:${payerAddress}:${date}`;
  const revenueKey = `revenue:${payerAddress}:${date}`;
  const [u, r]     = await Promise.all([kv.get(usageKey), kv.get(revenueKey)]);
  await Promise.all([
    kv.put(usageKey,   String(parseInt(u ?? "0") + 1)),
    kv.put(revenueKey, String(parseInt(r ?? "0") + revenueAtomic)),
  ]);
}

async function logQuote(log: QuoteLog, env: Env): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/quote_calls`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey":        env.SUPABASE_SERVICE_ROLE_KEY,
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify(log),
  });
}

// ─── Routing engines ──────────────────────────────────────────────────────────

async function fetchZeroExQuote(
  sellToken: string, buyToken: string, sellAmount: string,
  slippagePercentage: string | null, env: Env,
): Promise<NormalizedQuote> {
  const params = new URLSearchParams({ chainId: ZERO_EX_CHAIN_ID, sellToken, buyToken, sellAmount });
  if (slippagePercentage) {
    params.set("slippageBps", String(Math.round(parseFloat(slippagePercentage) * 10000)));
  }
  const res = await fetch(`${ZERO_EX_BASE_URL}?${params}`, {
    headers: { "0x-api-key": env.ZERO_EX_API_KEY, "0x-version": "v2" },
  });
  if (!res.ok) throw new Error(`0x_http_${res.status}: ${await res.text()}`);
  const data = await res.json() as ZeroExQuoteResponse;
  return {
    sellToken: data.sellToken,
    buyToken:  data.buyToken,
    sellAmount: data.sellAmount,
    buyAmount:  data.buyAmount,
    sources: data.route.fills.map(f => ({
      name:       f.source,
      proportion: (parseInt(f.proportionBps) / 10000).toString(),
    })),
  };
}

async function fetchParaSwapQuote(
  sellToken: string, buyToken: string, sellAmount: string,
  slippagePercentage: string | null, env: Env,
): Promise<NormalizedQuote> {
  const params = new URLSearchParams({
    srcToken:     sellToken,
    destToken:    buyToken,
    amount:       sellAmount,
    network:      PARASWAP_NETWORK,
    side:         "SELL",
    srcDecimals:  String(tokenDecimals(sellToken)),
    destDecimals: String(tokenDecimals(buyToken)),
    partner:      "ezpath",
  });
  if (slippagePercentage) {
    params.set("maxImpact", String(parseFloat(slippagePercentage) * 100));
  }
  const headers: Record<string, string> = {};
  if (env.PARASWAP_API_KEY) headers["Authorization"] = `Bearer ${env.PARASWAP_API_KEY}`;
  const res = await fetch(`${PARASWAP_BASE_URL}?${params}`, { headers });
  if (!res.ok) throw new Error(`paraswap_http_${res.status}: ${await res.text()}`);
  const data = await res.json() as { priceRoute: ParaSwapPriceRoute };
  const route = data.priceRoute;
  const sources = route.bestRoute.flatMap(r =>
    r.swaps.flatMap(swap =>
      swap.swapExchanges.map(ex => ({
        name:       ex.exchange,
        proportion: (ex.percent / 100).toString(),
      }))
    )
  );
  return {
    sellToken:  route.srcToken,
    buyToken:   route.destToken,
    sellAmount: route.srcAmount,
    buyAmount:  route.destAmount,
    sources,
  };
}

// ─── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // OPTIONS preflight — answer immediately before any routing
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url       = new URL(request.url);
    const requestId = crypto.randomUUID();

    // ── GET / — human landing page
    if (url.pathname === "/" && request.method === "GET") {
      return corsify(new Response(LANDING_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }));
    }

    // ── GET /api/v1/quote
    if (url.pathname === "/api/v1/quote" && request.method === "GET") {
      const paymentHeader = request.headers.get("X-Payment") ?? request.headers.get("payment-signature");
      const clientIp      = request.headers.get("CF-Connecting-IP") ?? "unknown";

      if (!paymentHeader) {
        if (!await checkRateLimit("probe", clientIp, RL_PROBE_LIMIT, env.METERING)) {
          return corsify(Response.json(
            { status: "rate_limited", retry_after: 60, request_id: requestId },
            { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Limit": String(RL_PROBE_LIMIT) } },
          ));
        }
        return corsify(Response.json(
          {
            status: "payment_required",
            unlock_fee_usd: 0.03,
            request_id: requestId,
            tiers: {
              basic:         { min_atomic: "30000",  min_usdc: 0.03, description: "Direct 0x execution" },
              resilient:     { min_atomic: "100000", min_usdc: 0.10, description: "Dual-lane concurrent race: 0x/ParaSwap vs Aerodrome" },
              institutional: { min_atomic: "500000", min_usdc: 0.50, description: "Dual-lane race + Uniswap V3 on-chain safety net" },
            },
          },
          {
            status: 402,
            headers: {
              "X-402-Price": "0.03", "X-402-Asset": "USDC", "X-402-Address": TOLL_ADDRESS, "X-402-Chain": "base",
              "X-402-Price-Resilient": "0.10", "X-402-Price-Institutional": "0.50",
            },
          },
        ));
      }

      const verification = await verifyPayment(paymentHeader, env.METERING);

      if (!verification.isValid) {
        if (!await checkRateLimit("invalid", clientIp, RL_INVALID_LIMIT, env.METERING)) {
          return corsify(Response.json(
            { status: "rate_limited", retry_after: 60, request_id: requestId },
            { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Limit": String(RL_INVALID_LIMIT) } },
          ));
        }
        return corsify(Response.json(
          { status: "invalid_payment", reason: verification.invalidReason, request_id: requestId },
          { status: 401 },
        ));
      }

      const { payer, auth, sig } = verification;

      if (!await checkRateLimit("paid", payer, RL_PAID_LIMIT, env.METERING)) {
        return corsify(Response.json(
          { status: "rate_limited", retry_after: 60, request_id: requestId },
          { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Limit": String(RL_PAID_LIMIT) } },
        ));
      }

      const sellToken         = url.searchParams.get("sellToken");
      const buyToken          = url.searchParams.get("buyToken");
      const sellAmount        = url.searchParams.get("sellAmount");
      const slippagePercentage = url.searchParams.get("slippagePercentage");
      const simulate          = url.searchParams.get("simulate") === "true";

      const missing = ["sellToken", "buyToken", "sellAmount"].filter(k => !url.searchParams.get(k));
      if (missing.length > 0) {
        return corsify(Response.json({ status: "bad_request", missing, request_id: requestId }, { status: 400 }));
      }

      // Settle synchronously — captures tx hash and prevents nonce reuse on failure
      let settlementTx: string | null = null;
      try {
        settlementTx = await settlePayment(auth, sig, env, env.METERING);
      } catch (err) {
        console.error(`[settlement] FAILED payer=${auth.from} nonce=${auth.nonce} error=${err instanceof Error ? err.message : err}`);
        return corsify(Response.json(
          { status: "settlement_failed", detail: err instanceof Error ? err.message : "unknown", request_id: requestId },
          { status: 402 },
        ));
      }

      const paymentValue = BigInt(auth.value);
      const tier =
        paymentValue >= TIER_ATOMIC_INSTITUTIONAL ? "institutional" :
        paymentValue >= TIER_ATOMIC_RESILIENT     ? "resilient"     : "basic";

      let quote: NormalizedQuote;
      let routingMetadata: RoutingMetadata;

      if (tier === "basic") {
        // ── Direct: single 0x call
        try {
          quote = await fetchZeroExQuote(sellToken!, buyToken!, sellAmount!, slippagePercentage, env);
          routingMetadata = { execution_mode: "direct", winner: "0x" };
        } catch (err) {
          return corsify(Response.json(
            { status: "upstream_error", engine: "0x", detail: err instanceof Error ? err.message : "unknown", request_id: requestId },
            { status: 502 },
          ));
        }
      } else {
        // ── Resilient / Institutional: dual-lane concurrent race
        type LaneResult = { quote: NormalizedQuote; engine: string };

        const [lane1Result, lane2Result] = await Promise.allSettled<LaneResult>([
          // Lane 1 — Aggregator stack: 0x → ParaSwap fallback
          (async (): Promise<LaneResult> => {
            try {
              const q = await fetchZeroExQuote(sellToken!, buyToken!, sellAmount!, slippagePercentage, env);
              return { quote: q, engine: "0x" };
            } catch (zeroExErr) {
              const reason = zeroExErr instanceof Error ? zeroExErr.message : String(zeroExErr);
              console.error(`[lane1] 0x failed (${reason}), trying paraswap`);
              const q = await fetchParaSwapQuote(sellToken!, buyToken!, sellAmount!, slippagePercentage, env);
              return { quote: q, engine: "paraswap" };
            }
          })(),
          // Lane 2 — Native Base liquidity: Aerodrome on-chain read
          (async (): Promise<LaneResult> => {
            const q = await fetchAerodromeQuote(sellToken!, buyToken!, sellAmount!);
            return { quote: q, engine: "aerodrome" };
          })(),
        ]);

        if (lane1Result.status === "rejected") console.error(`[lane1] failed: ${lane1Result.reason}`);
        if (lane2Result.status === "rejected") console.error(`[lane2] aerodrome failed: ${lane2Result.reason}`);

        const lane1 = lane1Result.status === "fulfilled" ? lane1Result.value : null;
        const lane2 = lane2Result.status === "fulfilled" ? lane2Result.value : null;

        if (!lane1 && !lane2) {
          if (tier === "institutional") {
            // ── Institutional safety net: Uniswap V3 triple-fee-tier quoter
            console.error("[routing] both lanes failed — activating institutional uniswap v3 safety net");
            try {
              quote = await fetchUniswapV3Quote(sellToken!, buyToken!, sellAmount!);
              routingMetadata = {
                execution_mode: "emergency_onchain_fallback",
                winner: "uniswap_v3_onchain",
                race_comparison: { lane_1_aggregator_out: "0", lane_2_aerodrome_out: "0" },
              };
            } catch (emergencyErr) {
              return corsify(Response.json(
                { status: "upstream_error", engine: "0x+paraswap+aerodrome+uniswap_v3", detail: "all routing engines failed", request_id: requestId },
                { status: 502 },
              ));
            }
          } else {
            // ── Resilient: no safety net beyond the dual-lane race
            return corsify(Response.json(
              { status: "upstream_error", engine: "0x+paraswap+aerodrome", detail: "all routing engines failed", request_id: requestId },
              { status: 502 },
            ));
          }
        } else {
          // ── Spread optimisation: pick highest buyAmount
          let winner: LaneResult;
          if (!lane1)       winner = lane2!;
          else if (!lane2)  winner = lane1;
          else              winner = BigInt(lane1.quote.buyAmount) >= BigInt(lane2.quote.buyAmount) ? lane1 : lane2;

          quote = winner.quote;
          routingMetadata = {
            execution_mode: "concurrent_race",
            winner: winner.engine as RoutingMetadata["winner"],
            race_comparison: {
              lane_1_aggregator_out: lane1?.quote.buyAmount ?? "0",
              lane_2_aerodrome_out:  lane2?.quote.buyAmount ?? "0",
            },
          };
        }
      }

      const price = normalizedPrice(quote.buyAmount, quote.buyToken, quote.sellAmount, quote.sellToken);

      ctx.waitUntil(meterRequest(payer, parseInt(PRICE_ATOMIC), env.METERING));
      ctx.waitUntil(logQuote({
        request_id: requestId, payer_address: payer,
        sell_token: sellToken!, buy_token: buyToken!, sell_amount: sellAmount!,
        buy_amount: quote.buyAmount, price,
        routing_engine: routingMetadata.winner,
        execution_mode: routingMetadata.execution_mode,
        tier, simulate,
        ...(settlementTx ? { settlement_tx: settlementTx } : {}),
        ...(routingMetadata.race_comparison ? {
          lane_1_out: routingMetadata.race_comparison.lane_1_aggregator_out,
          lane_2_out: routingMetadata.race_comparison.lane_2_aerodrome_out,
        } : {}),
      }, env));

      const responseHeaders: Record<string, string> = { "X-Routing-Engine": routingMetadata.winner };
      if (settlementTx) responseHeaders["X-Settlement-Tx"] = settlementTx;

      return corsify(Response.json(
        {
          status: "ok", request_id: requestId,
          sellToken: quote.sellToken, buyToken: quote.buyToken,
          sellAmount: quote.sellAmount, buyAmount: quote.buyAmount,
          price, sources: quote.sources, routingEngine: routingMetadata.winner, tier, simulate,
          routing_metadata: routingMetadata,
        },
        { status: 200, headers: responseHeaders },
      ));
    }

    // ── Discovery endpoints
    if (url.pathname === "/.well-known/agent.json" && request.method === "GET")
      return corsify(Response.json(WELL_KNOWN_AGENT_JSON));

    if (url.pathname === "/agent.json" && request.method === "GET")
      return corsify(Response.json(AGENT_JSON));

    if (url.pathname === "/openapi.json" && request.method === "GET")
      return corsify(Response.json(OPENAPI_JSON));

    if (url.pathname === "/.well-known/ai-plugin.json" && request.method === "GET")
      return corsify(Response.json(BITTE_AI_PLUGIN_JSON));

    if (url.pathname === "/llms.md" && request.method === "GET")
      return corsify(new Response(LLMS_MD, { headers: { "Content-Type": "text/markdown; charset=utf-8" } }));

    // ── Crawler / browser housekeeping
    if (url.pathname === "/robots.txt")
      return new Response(
        "User-agent: *\nAllow: /\nSitemap: https://ezpath.myezverse.xyz/sitemap.xml\n",
        { headers: { "Content-Type": "text/plain" } },
      );

    if (url.pathname === "/sitemap.xml")
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://ezpath.myezverse.xyz/</loc></url>
  <url><loc>https://ezpath.myezverse.xyz/.well-known/agent.json</loc></url>
  <url><loc>https://ezpath.myezverse.xyz/openapi.json</loc></url>
</urlset>`,
        { headers: { "Content-Type": "application/xml" } },
      );

    // ── Fetch.ai uAgents chat protocol endpoint
    if (url.pathname === "/submit" && request.method === "POST") {
      try {
        const envelope = await request.json() as {
          version: number;
          sender: string;
          target: string;
          session: string;
          schema_digest: string;
          payload?: string;
        };

        // Decode the ChatMessage payload
        let messageText = "";
        if (envelope.payload) {
          try {
            const decoded = JSON.parse(atob(envelope.payload)) as {
              content?: Array<{ type: string; text?: string }>;
              msg_id?: string;
            };
            messageText = decoded.content
              ?.filter(c => c.type === "text")
              .map(c => c.text ?? "")
              .join(" ") ?? "";
          } catch {
            messageText = "";
          }
        }

        const msgId = crypto.randomUUID();
        const now   = new Date().toISOString();

        // Build response text
        const responseText = messageText.trim()
          ? [
              "EZ-Path DEX Meta-Router on Base mainnet.",
              "",
              "I race 0x, ParaSwap, Aerodrome, and Uniswap V3 to return the best swap quote.",
              "Payment is per-request via X402 USDC (no API key, no subscription).",
              "",
              "Execution tiers:",
              "  basic         $0.03 - direct 0x route",
              "  resilient     $0.10 - dual-lane race (0x/ParaSwap vs Aerodrome)",
              "  institutional $0.50 - race + Uniswap V3 safety net",
              "",
              "To get a quote, call GET https://ezpath.myezverse.xyz/api/v1/quote",
              "  ?sellToken=<address>&buyToken=<address>&sellAmount=<atomic>",
              "",
              "Full docs: https://ezpath.myezverse.xyz",
            ].join("\n")
          : "EZ-Path ready. Send a swap query to get started.";

        const responseJson = JSON.stringify({
          timestamp: now,
          msg_id:    msgId,
          content: [
            { type: "text", text: responseText },
            { type: "end-session" },
          ],
        });
        const responsePayload = btoa(
          String.fromCharCode(...new TextEncoder().encode(responseJson)),
        );

        const responseEnvelope = {
          version:       1,
          sender:        "agent1qdwrzdmt8kfhenk38u00wsg897ztm8mgwg68wn3d2gsqw0ftp04222e47wt",
          target:        envelope.sender,
          session:       envelope.session,
          schema_digest: envelope.schema_digest,
          payload:       responsePayload,
          expires:       Math.floor(Date.now() / 1000) + 300,
        };

        return corsify(Response.json(responseEnvelope));
      } catch (err) {
        return corsify(Response.json({ error: "invalid envelope", detail: err instanceof Error ? err.message : String(err) }, { status: 400 }));
      }
    }

    if (url.pathname === "/og.png" || url.pathname === "/og.webp") {
      const bytes = Uint8Array.from(atob(OG_WEBP_B64), c => c.charCodeAt(0));
      return new Response(bytes, {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=2592000" },
      });
    }

    if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg")
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0d1117"/>
  <text x="4" y="23" font-family="monospace" font-size="18" font-weight="bold" fill="#3fb950">EZ</text>
</svg>`,
        { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } },
      );

    // ── Admin analytics
    if (url.pathname === "/admin/analytics" && request.method === "GET") {
      const authHeader = request.headers.get("Authorization") ?? "";
      const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!env.ADMIN_API_KEY || token !== env.ADMIN_API_KEY) {
        return new Response(JSON.stringify({ status: "unauthorized" }), {
          status: 401, headers: { "Content-Type": "application/json" },
        });
      }

      // Date window: ?from=YYYY-MM-DD&to=YYYY-MM-DD  (default: today only)
      const today    = new Date().toISOString().split("T")[0];
      const fromDate = url.searchParams.get("from") ?? today;
      const toDate   = url.searchParams.get("to")   ?? today;

      // Build date range array
      const dates: string[] = [];
      const cursor = new Date(fromDate);
      const end    = new Date(toDate);
      while (cursor <= end) {
        dates.push(cursor.toISOString().split("T")[0]);
        cursor.setDate(cursor.getDate() + 1);
      }

      // Scan KV for all usage/revenue keys in the date range
      const perDay: Record<string, { requests: number; revenue_atomic: number; payers: Record<string, { requests: number; revenue_atomic: number }> }> = {};
      let totalRequests    = 0;
      let totalRevenueAtomic = 0;

      await Promise.all(dates.map(async date => {
        // List all keys for this date: "usage:<payer>:<date>"
        const { keys } = await env.METERING.list({ prefix: `usage:` });
        const dayKeys  = keys.filter(k => k.name.endsWith(`:${date}`));

        const dayRequests = perDay[date] ?? { requests: 0, revenue_atomic: 0, payers: {} };

        await Promise.all(dayKeys.map(async kv => {
          const payer    = kv.name.split(":")[1];
          const usageVal = parseInt(await env.METERING.get(kv.name) ?? "0");
          const revVal   = parseInt(await env.METERING.get(`revenue:${payer}:${date}`) ?? "0");

          dayRequests.requests        += usageVal;
          dayRequests.revenue_atomic  += revVal;
          dayRequests.payers[payer]    = {
            requests:       (dayRequests.payers[payer]?.requests ?? 0) + usageVal,
            revenue_atomic: (dayRequests.payers[payer]?.revenue_atomic ?? 0) + revVal,
          };
          totalRequests     += usageVal;
          totalRevenueAtomic += revVal;
        }));

        perDay[date] = dayRequests;
      }));

      const summary = {
        from:  fromDate,
        to:    toDate,
        total: {
          requests:        totalRequests,
          revenue_atomic:  totalRevenueAtomic,
          revenue_usdc:    (totalRevenueAtomic / 1_000_000).toFixed(6),
        },
        by_day: Object.fromEntries(
          Object.entries(perDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, d]) => [date, {
              requests:       d.requests,
              revenue_atomic: d.revenue_atomic,
              revenue_usdc:   (d.revenue_atomic / 1_000_000).toFixed(6),
              top_payers: Object.entries(d.payers)
                .sort(([, a], [, b]) => b.revenue_atomic - a.revenue_atomic)
                .slice(0, 10)
                .map(([payer, s]) => ({
                  payer,
                  requests:       s.requests,
                  revenue_usdc:   (s.revenue_atomic / 1_000_000).toFixed(6),
                })),
            }])
        ),
      };

      return new Response(JSON.stringify(summary, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return corsify(new Response("Not Found", { status: 404 }));
  },
};
