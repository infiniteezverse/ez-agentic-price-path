import { createPublicClient, http } from "viem";

// ─── Shared EVM Venue Fetchers ───────────────────────────────────────────────
// These fetchers are chain-agnostic; they accept chainId/network as parameters.

interface NormalizedQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  sources: Array<{ name: string; proportion: string }>;
}

// Token decimals registry (shared across EVM chains)
const TOKEN_DECIMALS: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,  // USDC (Base)
  "0xff970a61a04b1ca14834a43f5de4533ebddb5f86": 6,  // USDC (Arbitrum)
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 6,  // USDC (Arbitrum One - different)
  "0x0b2c639c533813f4aa9d7837caf62653d08d5b82": 6,  // USDC (Optimism)
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": 6,  // USDC (Polygon)
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": 6,  // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18, // DAI
  "0x4200000000000000000000000000000000000006": 18, // WETH
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 18, // cbETH
  "0x0555e30da8f98308edb960aa94c0db47230d2b9c": 8,  // WBTC
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 6,  // EURC
};

export function tokenDecimals(address: string): number {
  return TOKEN_DECIMALS[address.toLowerCase()] ?? 18;
}

// ─── 0x Aggregator (Parameterized by Chain) ──────────────────────────────────

interface ZeroExQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  sellToken: string;
  route: { fills: Array<{ source: string; proportionBps: string }> };
  liquidityAvailable: boolean;
}

export async function fetchZeroExQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  chainId: number,
  slippagePercentage: string | null,
  apiKey: string,
): Promise<NormalizedQuote> {
  const params = new URLSearchParams({ chainId: String(chainId), sellToken, buyToken, sellAmount });
  if (slippagePercentage) {
    params.set("slippageBps", String(Math.round(parseFloat(slippagePercentage) * 10000)));
  }
  const res = await fetch(`https://api.0x.org/swap/allowance-holder/price?${params}`, {
    headers: { "0x-api-key": apiKey, "0x-version": "v2" },
  });
  if (!res.ok) throw new Error(`0x_http_${res.status}: ${await res.text()}`);
  const data = await res.json() as ZeroExQuoteResponse;
  return {
    sellToken: data.sellToken,
    buyToken: data.buyToken,
    sellAmount: data.sellAmount,
    buyAmount: data.buyAmount,
    sources: data.route.fills.map(f => ({
      name: f.source,
      proportion: (parseInt(f.proportionBps) / 10000).toString(),
    })),
  };
}

// ─── ParaSwap Aggregator (Parameterized by Chain) ───────────────────────────

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

export async function fetchParaSwapQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  network: string,
  slippagePercentage: string | null,
  apiKey?: string,
): Promise<NormalizedQuote> {
  const params = new URLSearchParams({
    srcToken: sellToken,
    destToken: buyToken,
    amount: sellAmount,
    network,
    side: "SELL",
    srcDecimals: String(tokenDecimals(sellToken)),
    destDecimals: String(tokenDecimals(buyToken)),
    partner: "ezpath",
  });
  if (slippagePercentage) {
    params.set("maxImpact", String(parseFloat(slippagePercentage) * 100));
  }
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`https://apiv5.paraswap.io/prices?${params}`, { headers });
  if (!res.ok) throw new Error(`paraswap_http_${res.status}: ${await res.text()}`);
  const data = await res.json() as { priceRoute: ParaSwapPriceRoute };
  const route = data.priceRoute;
  const sources = route.bestRoute.flatMap(r =>
    r.swaps.flatMap(swap =>
      swap.swapExchanges.map(ex => ({
        name: ex.exchange,
        proportion: (ex.percent / 100).toString(),
      }))
    )
  );
  return {
    sellToken: route.srcToken,
    buyToken: route.destToken,
    sellAmount: route.srcAmount,
    buyAmount: route.destAmount,
    sources,
  };
}

// ─── Aerodrome On-Chain Quote (Parameterized by RPC) ─────────────────────────

export async function fetchAerodromeQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  aerodromeRouter: string,
  aerodromeFactory: string,
  rpcUrl: string,
): Promise<NormalizedQuote> {
  const client = createPublicClient({ transport: http(rpcUrl) });

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
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "stable", type: "bool" },
            { name: "factory", type: "address" },
          ],
        },
      ],
      outputs: [{ name: "amounts", type: "uint256[]" }],
    },
  ] as const;

  const amounts = await client.readContract({
    address: aerodromeRouter as `0x${string}`,
    abi: AERODROME_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [
      BigInt(sellAmount),
      [{ from: sellToken as `0x${string}`, to: buyToken as `0x${string}`, stable: false, factory: aerodromeFactory as `0x${string}` }],
    ],
  });

  const buyAmount = (amounts as readonly bigint[])[1];
  if (!buyAmount || buyAmount === 0n) throw new Error("aerodrome: zero output amount");
  return { sellToken, buyToken, sellAmount, buyAmount: buyAmount.toString(), sources: [{ name: "Aerodrome", proportion: "1" }] };
}

// ─── Uniswap V3 On-Chain Quote (Parameterized by RPC) ────────────────────────

const V3_FEE_TIERS = [500, 3000, 10000] as const;

export async function fetchUniswapV3Quote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  uniswapV3Quoter: string,
  rpcUrl: string,
): Promise<NormalizedQuote> {
  const client = createPublicClient({ transport: http(rpcUrl) });

  const UNISWAP_V3_QUOTER_ABI = [
    {
      name: "quoteExactInputSingle",
      type: "function",
      stateMutability: "view",
      inputs: [
        {
          name: "params",
          type: "tuple",
          components: [
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
            { name: "amountIn", type: "uint256" },
            { name: "fee", type: "uint24" },
            { name: "sqrtPriceLimitX96", type: "uint160" },
          ],
        },
      ],
      outputs: [
        { name: "amountOut", type: "uint256" },
        { name: "sqrtPriceX96After", type: "uint160" },
        { name: "initializedTicksCrossed", type: "uint32" },
        { name: "gasEstimate", type: "uint256" },
      ],
    },
  ] as const;

  const results = await Promise.allSettled(
    V3_FEE_TIERS.map(fee =>
      client.readContract({
        address: uniswapV3Quoter as `0x${string}`,
        abi: UNISWAP_V3_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [{
          tokenIn: sellToken as `0x${string}`,
          tokenOut: buyToken as `0x${string}`,
          amountIn: BigInt(sellAmount),
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

// ─── Curve (Stablecoin optimized) ────────────────────────────────────

export async function fetchCurveQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  rpcUrl: string,
): Promise<NormalizedQuote> {
  try {
    const res = await fetch(`https://api.curve.fi/v1/get_best_trade/${sellToken}/${buyToken}/${sellAmount}`, {
      headers: { "accept": "application/json" }
    });
    if (!res.ok) throw new Error(`curve_http_${res.status}`);
    const data = await res.json() as any;
    return {
      sellToken, buyToken, sellAmount,
      buyAmount: data.best_trade?.amount_out?.toString() || "0",
      sources: [{ name: "curve", proportion: "1" }],
    };
  } catch (e) {
    throw new Error(`curve_quote_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Balancer (Multi-pool DEX) ───────────────────────────────────────

export async function fetchBalancerQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  rpcUrl: string,
): Promise<NormalizedQuote> {
  try {
    const res = await fetch("https://api.balancer.fi/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query {
            swaps(first: 1, where: { tokenIn: "${sellToken}" tokenOut: "${buyToken}" amountIn: "${sellAmount}" }) {
              amountOut
            }
          }
        `
      })
    });
    const data = await res.json() as any;
    const amountOut = data?.data?.swaps?.[0]?.amountOut || "0";
    return {
      sellToken, buyToken, sellAmount, buyAmount: amountOut,
      sources: [{ name: "balancer", proportion: "1" }],
    };
  } catch (e) {
    throw new Error(`balancer_quote_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Uniswap V2 (Legacy but deep liquidity) ──────────────────────────

export async function fetchUniswapV2Quote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  rpcUrl: string,
): Promise<NormalizedQuote> {
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const UNISWAP_V2_ROUTER = "0x8909Dc15e40953b386FA8f445ea5F6a3d2313a1d"; // Base Uniswap V2

    const res = await fetch(`https://api.uniswap.org/v1/quote?tokenInAddress=${sellToken}&tokenOutAddress=${buyToken}&amount=${sellAmount}&type=exactIn`, {
      headers: { "x-api-key": "uniswap" }
    });

    if (!res.ok) throw new Error(`uniswap_v2_http_${res.status}`);
    const data = await res.json() as any;

    return {
      sellToken, buyToken, sellAmount,
      buyAmount: data?.quote || "0",
      sources: [{ name: "uniswap_v2", proportion: "1" }],
    };
  } catch (e) {
    throw new Error(`uniswap_v2_quote_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── 1Inch Aggregator (50+ DEX sources) ──────────────────────────────

export async function fetchOneInchQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  chainId: number,
): Promise<NormalizedQuote> {
  try {
    const res = await fetch(
      `https://api.1inch.io/v5.0/${chainId}/quote?fromTokenAddress=${sellToken}&toTokenAddress=${buyToken}&amount=${sellAmount}`,
      { headers: { "accept": "application/json" } }
    );
    if (!res.ok) throw new Error(`1inch_http_${res.status}`);
    const data = await res.json() as any;

    return {
      sellToken, buyToken, sellAmount,
      buyAmount: data?.toTokenAmount || "0",
      sources: data?.protocols?.map((p: any) => ({ name: p[0]?.[0]?.name || "unknown", proportion: "auto" })) || [{ name: "1inch", proportion: "1" }],
    };
  } catch (e) {
    throw new Error(`1inch_quote_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── CoW Swap (Batch auction AMM) ────────────────────────────────────

export async function fetchCowSwapQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  chainId: number,
): Promise<NormalizedQuote> {
  try {
    const res = await fetch(`https://api.cow.fi/mainnet/api/v1/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sellToken, buyToken, sellAmount,
        kind: "sell",
        chainId: String(chainId),
      })
    });
    if (!res.ok) throw new Error(`cow_http_${res.status}`);
    const data = await res.json() as any;

    return {
      sellToken, buyToken, sellAmount,
      buyAmount: data?.quote?.buyAmount || "0",
      sources: [{ name: "cow_swap", proportion: "1" }],
    };
  } catch (e) {
    throw new Error(`cow_swap_quote_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Synthetix (Synthetic asset swaps) ───────────────────────────────

export async function fetchSynthetixQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  rpcUrl: string,
): Promise<NormalizedQuote> {
  try {
    const res = await fetch(`https://api.synthetix.io/v1/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fromToken: sellToken,
        toToken: buyToken,
        amount: sellAmount,
      })
    });
    if (!res.ok) throw new Error(`synthetix_http_${res.status}`);
    const data = await res.json() as any;

    return {
      sellToken, buyToken, sellAmount,
      buyAmount: data?.outputAmount || "0",
      sources: [{ name: "synthetix", proportion: "1" }],
    };
  } catch (e) {
    throw new Error(`synthetix_quote_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
