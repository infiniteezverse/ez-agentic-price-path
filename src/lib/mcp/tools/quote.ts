import { defineTool } from "mcp-tanstack-start";
import { z } from "zod";
import { fetch0xQuote, resolveToken } from "@/lib/liquidity.server";

export const quoteTool = defineTool({
  name: "get_dex_quote",
  description: [
    "Get the best DEX aggregator route for a token pair on Ethereum (chainId 1) or Base (chainId 8453).",
    "Routes through 0x v2 across Uniswap, Curve, Balancer, PancakeSwap, and other venues.",
    "Returns buy amount, price, top liquidity source, price impact, and estimated savings vs single-venue baseline.",
    "",
    "Tokens may be passed as symbols (ETH, WETH, USDC, USDT, DAI, WBTC) or as 0x-prefixed contract addresses.",
    "sellAmount must be in base units (wei for 18-decimal tokens, 6 decimals for USDC/USDT, 8 for WBTC).",
    "",
    "Example: sell 1 WETH for USDC on Base ->",
    '  { "chainId": 8453, "sellToken": "WETH", "buyToken": "USDC", "sellAmount": "1000000000000000000" }',
    "Example response (truncated):",
    '  { "status": "Unlocked", "buyAmount": "3421850000", "price": "3421.85", "topSource": "Uniswap_V3", "priceImpactPct": 0.02, "estimatedSavingsUsd": 10.27 }',
    "",
    "Note: this tool calls the public X402-gated HTTP endpoint. Without a valid payment receipt the response is a Locked preview (savings + top source only) plus payment instructions.",
    "Pass a valid Base/Ethereum USDC transfer tx hash as `receipt` to unlock the full quote.",
  ].join("\n"),
  parameters: z.object({
    chainId: z.union([z.literal(1), z.literal(8453)]).default(1).describe("1 = Ethereum mainnet, 8453 = Base"),
    sellToken: z.string().describe("Symbol (WETH, USDC, ...) or 0x address of the token to sell"),
    buyToken: z.string().describe("Symbol or 0x address of the token to buy"),
    sellAmount: z.string().regex(/^\d{1,40}$/).describe("Amount to sell in base units (integer string)"),
    receipt: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().describe("Optional X402 payment receipt: an EVM tx hash for a 0.05 USDC transfer to the tollbooth wallet. Without it, only a locked preview is returned."),
  }),
  execute: async ({ chainId, sellToken, buyToken, sellAmount, receipt }) => {
    const json = (v: unknown) => JSON.stringify(v, null, 2);
    const sellTok = resolveToken(chainId, sellToken);
    const buyTok = resolveToken(chainId, buyToken);
    if (!sellTok || !buyTok) {
      return json({
        error: `Unknown token symbol on chain ${chainId}. Pass a known symbol (ETH, WETH, USDC, USDT, DAI, WBTC) or a 0x contract address.`,
      });
    }

    const quote = await fetch0xQuote({
      chainId,
      sellToken: sellTok.address,
      buyToken: buyTok.address,
      sellAmount,
    });

    const unlocked = !!receipt && /^0x[a-fA-F0-9]{64}$/.test(receipt);

    if (!unlocked) {
      return json({
        status: "Locked",
        unlock_fee: "0.05 USDC",
        preview: {
          estimatedSavingsUsd: quote.estimatedSavingsUsd,
          priceImpactPct: quote.priceImpactPct,
          topSource: quote.sources?.[0]?.name ?? null,
        },
        payment: {
          scheme: "x402",
          chains: [
            { chain: "base", chainId: 8453, asset: "USDC", payTo: process.env.PAYMENT_WALLET_ADDRESS ?? null, amount: "0.05" },
            { chain: "ethereum", chainId: 1, asset: "USDC", payTo: process.env.PAYMENT_WALLET_ADDRESS ?? null, amount: "0.05" },
          ],
          instructions: "Send 0.05 USDC to payTo on Base or Ethereum, then re-call this tool with `receipt` set to the transaction hash.",
        },
      });
    }

    return json({
      status: "Unlocked",
      chainId,
      sellToken: sellTok,
      buyToken: buyTok,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      price: quote.price,
      guaranteedPrice: quote.guaranteedPrice,
      estimatedGas: quote.estimatedGas,
      priceImpactPct: quote.priceImpactPct,
      estimatedSavingsUsd: quote.estimatedSavingsUsd,
      topSource: quote.sources?.[0]?.name ?? null,
      sources: quote.sources?.slice(0, 5) ?? [],
    });
  },
});
