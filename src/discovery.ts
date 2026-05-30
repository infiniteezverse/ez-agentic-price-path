export const WELL_KNOWN_AGENT_JSON = {
  schema_version: "v2.0",
  name: "EZ-Path",
  description: "Pay-per-request DEX meta-router on Base, Arbitrum, Optimism, and Polygon. Races 10 DEX venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) across all four chains and returns the highest buyAmount for any ERC-20 swap. Three execution tiers: basic ($0.03 direct), resilient ($0.10 4-venue race), institutional ($0.50 all-10-venue race + MEV protection). Payment via X402 EIP-3009 USDC — no API key, no subscription.",
  url: "https://ezpath.myezverse.xyz",
  x402_version: 1,
  capabilities: [
    {
      id: "price_quote",
      name: "DEX Price Quote",
      description: "Returns the best available swap quote for any ERC-20 pair across Base, Arbitrum, Optimism, and Polygon by racing 10 DEX venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix). Includes price, buyAmount, sources, execution_mode, winner, and on-chain settlement_tx. Institutional tier includes MEV protection.",
      endpoint: "https://ezpath.myezverse.xyz/api/v1/quote",
      method: "GET",
      parameters: [
        { name: "chain",              type: "string",  required: false, description: "Target chain: base, arbitrum, optimism, polygon (default: base)" },
        { name: "sellToken",          type: "string",  required: true,  description: "Token address to sell" },
        { name: "buyToken",           type: "string",  required: true,  description: "Token address to buy" },
        { name: "sellAmount",         type: "string",  required: true,  description: "Amount to sell in base decimals" },
        { name: "slippagePercentage", type: "number",  required: false, description: "Max slippage as decimal, e.g. 0.01 = 1%" },
      ],
      response_ref: "/openapi.json#/paths/~1api~1v1~1quote/get/responses/200",
    },
  ],
  payment: {
    scheme: "x402",
    asset: "USDC",
    asset_decimals: 6,
    chain: "base",
    chain_id: 8453,
    address: "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad",
    price_usd: 0.03,
    price_atomic: "30000",
    asset_contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payment_header: "X-Payment",
    tiers: {
      basic:         { price_usd: 0.03, price_atomic: "30000",  description: "Direct 0x execution — fast, simple routing" },
      resilient:     { price_usd: 0.10, price_atomic: "100000", description: "4-venue concurrent race (0x, ParaSwap, Aerodrome, Curve) — best of mid-tier liquidity" },
      institutional: { price_usd: 0.50, price_atomic: "500000", description: "All 10 venues in parallel (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) with early-termination — maximum execution quality" },
    },
  },
  contact: "contact@ezsecuretech.com",
  license: "BSD-2-Clause",
};

export const AGENT_JSON = {
  schema_version: "v2.0",
  name_for_model: "ezpath",
  name_for_human: "EZ-Path",
  description_for_model:
    "EZ-Path is a pay-per-request DEX meta-router on Base with three pricing tiers. Basic (0.03 USDC): direct 0x routing. Resilient (0.10 USDC): races 4 venues concurrently (0x, ParaSwap, Curve, Aerodrome) and returns highest buyAmount. Institutional (0.50 USDC): races all 10 venues in parallel (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) with early-termination when a clear winner emerges. Call GET /api/v1/quote with sellToken, buyToken, sellAmount. 402 response lists tier minimums. Fund EIP-3009 auth to tier level, include signed payload in X-Payment header, retry. Response includes routingEngine (winner), tier, and price.",
  description_for_human:
    "DEX meta-router racing 10 venues on Base with X402 payment. Get best execution: basic ($0.03), resilient ($0.10, 4-venue race), or institutional ($0.50, all 10 venues).",
  auth: {
    type: "x402",
    asset: "USDC",
    chain: "base",
    toll_address: "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad",
  },
  api: {
    type: "openapi",
    url: "/openapi.json",
  },
  pricing_tiers: [
    {
      tier: "basic",
      min_atomic: "30000",
      price_usd: 0.03,
      execution_mode: "direct",
      description: "Direct 0x execution. Reliable baseline for micro-transactions and price discovery.",
    },
    {
      tier: "resilient",
      min_atomic: "100000",
      price_usd: 0.10,
      execution_mode: "concurrent_race",
      description: "4-venue concurrent race: 0x, ParaSwap, Curve, and Aerodrome fire simultaneously. Highest buyAmount wins with early-termination at >150bps lead. Recommended for trades $50–$1,000.",
    },
    {
      tier: "institutional",
      min_atomic: "500000",
      price_usd: 0.50,
      execution_mode: "concurrent_race",
      description: "All 10 venues in parallel (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) with early-termination at >75bps lead. Maximum execution quality for heavy capital operations ($1,000+).",
    },
  ],
  "x-why-agents-choose-us": [
    "Fallback reliability across 3 liquidity sources",
    "Slippage protection with configurable tolerance",
    "Meta-aggregation returning the best available price",
    "Clear per-request economics via X402",
    "Normalized response shape regardless of upstream source",
  ],
};

export const BITTE_AI_PLUGIN_JSON = {
  openapi: "3.1.0",
  info: {
    title: "EZ-Path DEX Router",
    description: "Pay-per-request DEX meta-router on Base mainnet. Races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix). Best swap quote for any ERC-20 pair. Pay 0.03 USDC per request via X402.",
    version: "1.0.0",
  },
  servers: [{ url: "https://ezpath.myezverse.xyz" }],
  "x-mb": {
    "account-id": "92f6ac4fff24ebf39dbc0759fc84e018f8f84bcb020c7ded12500e01e11fa938",
    assistant: {
      name: "EZ-Path",
      description: "DEX meta-router on Base. Races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix). Returns best swap quote. Pay 0.03 USDC per request via X402 — no API key needed.",
      instructions: "You are EZ-Path, a DEX meta-router on Base mainnet. When a user wants a swap quote, call getQuote with sellToken, buyToken, and sellAmount in base decimals. USDC address: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals). WETH address: 0x4200000000000000000000000000000000000006 (18 decimals). Each call requires 0.03 USDC payment via X402 EIP-3009.",
      tools: [{ type: "function" }],
      image: "https://ezpath.myezverse.xyz/og.webp",
      categories: ["defi", "swap", "base"],
      chainIds: [8453],
      version: "1.0.0",
    },
  },
};

export const OPENAPI_JSON = {
  openapi: "3.1.0",
  info: {
    title: "EZ-Path DEX Router",
    version: "1.0.0",
    description:
      "X402-gated DEX meta-router on Base. Races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returns the highest buyAmount. Payment: 0.03 USDC per request via X402, sent in the X-Payment header.",
  },
  servers: [{ url: "https://ezpath.myezverse.xyz" }],
  paths: {
    "/api/v1/quote": {
      get: {
        operationId: "getQuote",
        summary: "Get a normalized DEX price quote",
        description:
          "Returns the best available price for a token swap on Base by racing 10 venues simultaneously and returning the highest buyAmount. Requires a valid X402 USDC payment in the X-Payment header (falls back to payment-signature for legacy clients). Returns 402 with payment instructions if the header is absent.",
        parameters: [
          {
            name: "sellToken",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "ERC-20 contract address of the token to sell (Base mainnet)",
            example: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          },
          {
            name: "buyToken",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "ERC-20 contract address of the token to buy (Base mainnet)",
            example: "0x4200000000000000000000000000000000000006",
          },
          {
            name: "sellAmount",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Amount to sell expressed in the token's smallest unit (base decimals)",
            example: "1000000",
          },
          {
            name: "slippagePercentage",
            in: "query",
            required: false,
            schema: { type: "number", minimum: 0, maximum: 1 },
            description: "Maximum acceptable slippage as a decimal fraction (e.g. 0.01 = 1%)",
            example: 0.01,
          },
        ],
        security: [{ x402: [] }],
        responses: {
          "200": {
            description: "Normalized quote returned successfully",
            headers: {
              "X-Routing-Engine": {
                schema: { type: "string", example: "0x" },
                description: "Liquidity source that fulfilled the quote",
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "request_id", "sellToken", "buyToken", "sellAmount", "buyAmount", "price", "sources", "routingEngine", "tier"],
                  properties: {
                    status:       { type: "string", enum: ["ok"], example: "ok" },
                    request_id:   { type: "string", format: "uuid", description: "Unique identifier for this request" },
                    sellToken:    { type: "string", description: "Checksummed address of the token sold" },
                    buyToken:     { type: "string", description: "Checksummed address of the token bought" },
                    sellAmount:   { type: "string", description: "Actual sell amount in base decimals" },
                    buyAmount:    { type: "string", description: "Expected buy amount in base decimals" },
                    price: {
                      type: "string",
                      description: "Human-readable price: buyToken units per 1 sellToken unit, decimal-adjusted. E.g. '0.000443' for USDC→WETH means 1 USDC buys 0.000443 WETH.",
                      example: "0.000442989247533316",
                    },
                    sources: {
                      type: "array",
                      description: "Liquidity sources used to fill the swap",
                      items: {
                        type: "object",
                        required: ["name", "proportion"],
                        properties: {
                          name:       { type: "string", description: "DEX or AMM name", example: "PancakeSwap_Infinity_CL" },
                          proportion: { type: "string", description: "Share of fill as a decimal (1 = 100%)", example: "1" },
                        },
                      },
                    },
                    routingEngine: { type: "string", enum: ["0x", "paraswap"], example: "0x", description: "Upstream aggregator that fulfilled the quote" },
                    tier:          { type: "string", enum: ["basic", "resilient", "institutional"], example: "basic", description: "Tier resolved from payment amount" },
                    simulate:      { type: "boolean", description: "True if the request was flagged as a simulation" },
                    routing_metadata: {
                      type: "object",
                      description: "Routing execution trace. Always present.",
                      required: ["execution_mode", "winner"],
                      properties: {
                        execution_mode: { type: "string", enum: ["direct", "concurrent_race", "emergency_onchain_fallback"], description: "How the quote was fulfilled" },
                        winner:         { type: "string", enum: ["0x", "paraswap", "aerodrome", "uniswap_v3_onchain"], description: "Engine that produced the winning quote" },
                        race_comparison: {
                          type: "object",
                          description: "Raw buyAmount outputs from both lanes. Present on concurrent_race and emergency_onchain_fallback.",
                          required: ["lane_1_aggregator_out", "lane_2_aerodrome_out"],
                          properties: {
                            lane_1_aggregator_out: { type: "string", description: "buyAmount from 0x/paraswap aggregator stack, in base decimals" },
                            lane_2_aerodrome_out:  { type: "string", description: "buyAmount from Aerodrome on-chain read, in base decimals" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing or malformed query parameters",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "missing", "request_id"],
                  properties: {
                    status:     { type: "string", enum: ["bad_request"] },
                    missing:    { type: "array", items: { type: "string" }, description: "Names of missing required parameters" },
                    request_id: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Payment header present but signature is invalid",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "reason", "request_id"],
                  properties: {
                    status:     { type: "string", enum: ["invalid_payment"] },
                    reason:     { type: "string", description: "Machine-readable rejection reason", example: "payment_expired" },
                    request_id: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          "402": {
            description: "No payment header supplied. Retry with a valid X402 USDC signature in X-Payment. Fund your authorization payload to the tier that matches your execution needs.",
            headers: {
              "X-402-Price":                { schema: { type: "string" }, description: "Minimum toll (basic tier)", example: "0.03" },
              "X-402-Price-Resilient":      { schema: { type: "string" }, description: "Toll for resilient tier", example: "0.10" },
              "X-402-Price-Institutional":  { schema: { type: "string" }, description: "Toll for institutional tier", example: "0.50" },
              "X-402-Asset":                { schema: { type: "string" }, description: "Payment asset symbol", example: "USDC" },
              "X-402-Address":              { schema: { type: "string" }, description: "Payee address on Base" },
              "X-402-Chain":                { schema: { type: "string" }, description: "Chain identifier", example: "base" },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "unlock_fee_usd", "request_id", "tiers"],
                  properties: {
                    status:         { type: "string", enum: ["payment_required"] },
                    unlock_fee_usd: { type: "number", example: 0.03 },
                    request_id:     { type: "string", format: "uuid" },
                    tiers: {
                      type: "object",
                      description: "Full pricing matrix. Set authorization.value to the desired tier's min_atomic to unlock that execution quality.",
                      properties: {
                        basic:         { type: "object", properties: { min_atomic: { type: "string", example: "30000"  }, min_usdc: { type: "number", example: 0.03 }, description: { type: "string" } } },
                        resilient:     { type: "object", properties: { min_atomic: { type: "string", example: "100000" }, min_usdc: { type: "number", example: 0.10 }, description: { type: "string" } } },
                        institutional: { type: "object", properties: { min_atomic: { type: "string", example: "500000" }, min_usdc: { type: "number", example: 0.50 }, description: { type: "string" } } },
                      },
                    },
                  },
                },
              },
            },
          },
          "502": {
            description: "Upstream liquidity source returned an error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status", "engine", "request_id"],
                  properties: {
                    status:     { type: "string", enum: ["upstream_error"] },
                    engine:     { type: "string", example: "0x" },
                    detail:     { type: "string", description: "Raw error message from the upstream API" },
                    request_id: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      x402: {
        type: "apiKey",
        in: "header",
        name: "X-Payment",
        description:
          "X402 payment authorization. Three paths supported: (1) EIP-3009 — base64-encode a signed TransferWithAuthorization JSON payload; (2) Base MCP — use initiate_x402_request pointing at this endpoint with maxPayment='0.03', then complete_x402_request; (3) Coinbase Smart Wallet — x402Version:1, scheme:exact, network:base format natively accepted. Legacy header name 'payment-signature' also accepted.",
      },
    },
  },
};

export const EZPATH_MANIFEST_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "EZ-Path",
  description: "Pay-per-request DEX meta-router on Base. Races 10 DEX venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) in parallel to return the highest buyAmount for any ERC-20 swap. Three execution tiers with guaranteed latency SLAs.",
  url: "https://ezpath.myezverse.xyz",
  applicationCategory: "FinanceApplication",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    offers: [
      {
        "@type": "Offer",
        name: "Basic Tier",
        price: "0.03",
        description: "Direct 0x execution. Latency: <150ms. Single venue routing.",
      },
      {
        "@type": "Offer",
        name: "Resilient Tier",
        price: "0.10",
        description: "10-venue concurrent race (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix). Latency: <300ms. Higher quality execution.",
      },
      {
        "@type": "Offer",
        name: "Institutional Tier",
        price: "0.50",
        description: "All 10 venues in parallel with early-termination. Latency: <350ms. Maximum execution quality.",
      },
    ],
  },
  supportedChains: [
    {
      name: "Base",
      chainId: 8453,
      chainString: "eip155:8453",
      rpcEndpoint: "https://mainnet.base.org",
    },
    {
      name: "Arbitrum",
      chainId: 42161,
      chainString: "eip155:42161",
      rpcEndpoint: "https://arb1.arbitrum.io/rpc",
    },
    {
      name: "Optimism",
      chainId: 10,
      chainString: "eip155:10",
      rpcEndpoint: "https://mainnet.optimism.io",
    },
    {
      name: "Polygon",
      chainId: 137,
      chainString: "eip155:137",
      rpcEndpoint: "https://polygon-rpc.com",
    },
  ],
  supportedTokens: [
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "DAI", address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", decimals: 18 },
    { symbol: "cbETH", address: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", decimals: 18 },
    { symbol: "WBTC", address: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", decimals: 8 },
    { symbol: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", decimals: 6 },
  ],
  venues: [
    { name: "0x", priority: 1, timeout: 100 },
    { name: "ParaSwap", priority: 2, timeout: 100 },
    { name: "Curve", priority: 3, timeout: 150 },
    { name: "Balancer", priority: 4, timeout: 150 },
    { name: "1Inch", priority: 5, timeout: 180 },
    { name: "CoW Swap", priority: 6, timeout: 180 },
    { name: "Uniswap V2", priority: 7, timeout: 200 },
    { name: "Aerodrome", priority: 8, timeout: 250 },
    { name: "Uniswap V3", priority: 9, timeout: 250 },
    { name: "Synthetix", priority: 10, timeout: 300 },
  ],
  paymentMethod: {
    "@type": "PaymentMethod",
    name: "X402 EIP-3009",
    asset: "USDC",
    chain: "Base",
    tollAddress: "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad",
  },
  latencySLA: {
    basic: { max: 150, unit: "ms" },
    resilient: { max: 300, unit: "ms" },
    institutional: { max: 350, unit: "ms" },
  },
  availability: "24/7",
  contact: "contact@ezsecuretech.com",
};
