// Server-side helpers shared by /api routes and server fns
// 0x v2 uses a single host for all chains; chain is selected via the `chainId` query param.
const ZEROX_HOST = "https://api.0x.org";

// Common token addresses by chain
export const TOKENS: Record<number, Record<string, { address: string; decimals: number; symbol: string }>> = {
  1: {
    ETH:  { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, symbol: "ETH" },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, symbol: "WETH" },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, symbol: "USDC" },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, symbol: "USDT" },
    DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, symbol: "DAI" },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, symbol: "WBTC" },
  },
  8453: {
    ETH:  { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, symbol: "ETH" },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18, symbol: "WETH" },
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" },
    DAI:  { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, symbol: "DAI" },
  },
};

export function resolveToken(chainId: number, input: string) {
  const t = TOKENS[chainId];
  if (!t) return null;
  if (input.startsWith("0x") && input.length === 42) {
    const found = Object.values(t).find(x => x.address.toLowerCase() === input.toLowerCase());
    return found ?? { address: input, decimals: 18, symbol: input.slice(0, 6) };
  }
  return t[input.toUpperCase()] ?? null;
}

export interface QuoteResult {
  chainId: number;
  buyToken: string;
  sellToken: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  guaranteedPrice?: string;
  estimatedGas?: string;
  sources?: Array<{ name: string; proportion: string }>;
  priceImpactPct: number | null;
  estimatedSavingsUsd: number;
  raw?: unknown;
}

export async function fetch0xQuote(params: {
  chainId: number;
  buyToken: string;
  sellToken: string;
  sellAmount: string;
}): Promise<QuoteResult> {
  const apiKey = process.env.ZEROX_API_KEY;
  if (![1, 8453].includes(params.chainId)) {
    throw new Error(`Unsupported chainId ${params.chainId}`);
  }

  // Use the indicative `price` endpoint — does not require a real taker address
  // and is the right choice for read-only quotes / dashboard previews.
  const url = new URL(`${ZEROX_HOST}/swap/permit2/price`);
  url.searchParams.set("chainId", String(params.chainId));
  url.searchParams.set("buyToken", params.buyToken);
  url.searchParams.set("sellToken", params.sellToken);
  url.searchParams.set("sellAmount", params.sellAmount);

  const headers: Record<string, string> = { "0x-version": "v2" };
  if (apiKey) headers["0x-api-key"] = apiKey;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    const reqId = res.headers.get("x-request-id") ?? "";
    console.error(`[0x] ${res.status} on ${url.pathname} reqId=${reqId} body=${text.slice(0, 300)}`);
    throw new Error(`0x API error [${res.status}]${reqId ? ` reqId=${reqId}` : ""}: ${text.slice(0, 200)}`);
  }

  const data: any = await res.json();
  // Resolve token decimals so we can derive a human-readable price for v2 responses
  // (the v2 `price` endpoint returns buyAmount/sellAmount/minBuyAmount but no top-level `price`).
  const sellTokenInfo = resolveToken(params.chainId, params.sellToken);
  const buyTokenInfo = resolveToken(params.chainId, params.buyToken);
  const sellDecimals = sellTokenInfo?.decimals ?? 18;
  const buyDecimals = buyTokenInfo?.decimals ?? 18;

  const buyAmount = String(data.buyAmount ?? "0");
  const sellAmount = String(data.sellAmount ?? params.sellAmount);

  // price = buy/sell normalized by decimals (matches v1's price field)
  const sellHuman = Number(sellAmount) / Math.pow(10, sellDecimals);
  const buyHuman = Number(buyAmount) / Math.pow(10, buyDecimals);
  const derivedPrice = sellHuman > 0 ? buyHuman / sellHuman : 0;
  const price = data.price != null ? String(data.price) : derivedPrice.toString();

  const priceImpactPct = data.estimatedPriceImpact != null
    ? Number(data.estimatedPriceImpact)
    : data.totalNetworkFee != null && buyHuman > 0
      ? null
      : null;

  // Heuristic savings vs single-venue baseline (~0.3% worse execution)
  const naiveOut = sellHuman * derivedPrice * 0.997;
  const estimatedSavingsUsd = Math.max(0, (buyHuman - naiveOut));

  const sources: Array<{ name: string; proportion: string }> =
    Array.isArray(data.sources)
      ? data.sources.filter((s: any) => Number(s.proportion) > 0).map((s: any) => ({ name: s.name, proportion: s.proportion }))
      : Array.isArray(data.route?.fills)
        ? data.route.fills.map((f: any) => ({ name: f.source, proportion: String(Number(f.proportionBps ?? 0) / 10000) }))
        : [];

  return {
    chainId: params.chainId,
    buyToken: params.buyToken,
    sellToken: params.sellToken,
    sellAmount,
    buyAmount,
    price,
    guaranteedPrice: data.guaranteedPrice ?? data.minBuyAmount,
    estimatedGas: data.gas ?? data.estimatedGas,
    sources,
    priceImpactPct,
    estimatedSavingsUsd: Number(estimatedSavingsUsd.toFixed(2)),
    raw: data,
  };
}

// Dashboard telemetry
export async function fetchGasPrices() {
  // Use public RPCs via blocknative-style alternative: ethgasstation alternatives
  const [eth, base] = await Promise.allSettled([
    fetchChainGas("https://ethereum-rpc.publicnode.com"),
    fetchChainGas("https://base-rpc.publicnode.com"),
  ]);
  return {
    ethereum: eth.status === "fulfilled" ? eth.value : null,
    base: base.status === "fulfilled" ? base.value : null,
  };
}

async function fetchChainGas(rpc: string): Promise<{ gwei: number; blockNumber: number }> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
    ]),
  });
  const data: any = await res.json();
  const gasHex = data[0]?.result ?? "0x0";
  const blockHex = data[1]?.result ?? "0x0";
  const gwei = Number(BigInt(gasHex)) / 1e9;
  return { gwei: Number(gwei.toFixed(3)), blockNumber: Number(BigInt(blockHex)) };
}

export async function fetchTopRoutes() {
  // Sample popular pairs to surface "top liquidity routes"
  const pairs = [
    { chainId: 1, sell: "WETH", buy: "USDC", amount: "1000000000000000000" },
    { chainId: 1, sell: "USDC", buy: "WETH", amount: "5000000000" },
    { chainId: 8453, sell: "WETH", buy: "USDC", amount: "1000000000000000000" },
    { chainId: 8453, sell: "USDC", buy: "WETH", amount: "5000000000" },
  ];
  const results = await Promise.allSettled(
    pairs.map(async (p) => {
      const sellTok = TOKENS[p.chainId][p.sell];
      const buyTok = TOKENS[p.chainId][p.buy];
      const q = await fetch0xQuote({
        chainId: p.chainId,
        sellToken: sellTok.address,
        buyToken: buyTok.address,
        sellAmount: p.amount,
      });
      return {
        chainId: p.chainId,
        chain: p.chainId === 1 ? "Ethereum" : "Base",
        pair: `${p.sell}/${p.buy}`,
        price: q.price,
        topSource: q.sources?.[0]?.name ?? "—",
        sources: q.sources?.slice(0, 3) ?? [],
      };
    })
  );
  return results.map((r) => (r.status === "fulfilled" ? r.value : null)).filter(Boolean);
}
