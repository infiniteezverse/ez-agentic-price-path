/**
 * EZ-Path Composio Tool — TypeScript
 * Best DEX swap quote on Base mainnet. Pays $0.03 USDC per call via X402 automatically.
 *
 * Requirements:
 *   npm install @composio/core viem zod
 *
 * Usage:
 *   import { ezpathQuoteTool } from './ezpath_tool'
 */

import { Composio } from "@composio/core";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";
const EZPATH_URL   = "https://ezpath.myezverse.xyz/api/v1/quote";

const TIER_ATOMIC: Record<string, bigint> = {
  basic:         30_000n,
  resilient:     100_000n,
  institutional: 500_000n,
};

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

async function buildPaymentHeader(privateKey: string, value: bigint): Promise<string> {
  const key     = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const account = privateKeyToAccount(key);
  const nonceBytes  = crypto.getRandomValues(new Uint8Array(32));
  const nonce       = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

  const signature = await account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE as `0x${string}` },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to: TOLL_ADDRESS as `0x${string}`, value, validAfter: 0n, validBefore, nonce },
  });

  const payload = {
    payload: {
      authorization: {
        from: account.address, to: TOLL_ADDRESS,
        value: value.toString(), validAfter: "0",
        validBefore: validBefore.toString(), nonce,
      },
      signature,
    },
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

// ── Composio tool definition ──────────────────────────────────────────────────

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

export const ezpathQuoteTool = await composio.tools.createCustomTool({
  slug:        "EZPATH_QUOTE",
  name:        "EZ-Path DEX Quote",
  description: "Get the best DEX swap quote on Base mainnet. Races 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returns the highest buyAmount. Costs $0.03 USDC per call, paid automatically. Common tokens — USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, WETH: 0x4200000000000000000000000000000000000006",

  inputParams: z.object({
    sell_token:          z.string().describe("ERC-20 token address to sell on Base mainnet"),
    buy_token:           z.string().describe("ERC-20 token address to buy on Base mainnet"),
    sell_amount:         z.string().describe("Amount in base decimals, e.g. 1000000 = 1 USDC"),
    tier:                z.enum(["basic", "resilient", "institutional"]).default("basic").describe("basic=$0.03, resilient=$0.10, institutional=$0.50"),
    slippage_percentage: z.number().optional().describe("Max slippage as decimal, e.g. 0.01 = 1%"),
  }),

  execute: async (input) => {
    const walletKey = process.env.EZPATH_WALLET_KEY;
    if (!walletKey) {
      return { data: { error: "EZPATH_WALLET_KEY environment variable not set" }, error: "missing key", successful: false };
    }

    const atomic = TIER_ATOMIC[input.tier ?? "basic"] ?? TIER_ATOMIC.basic;
    const header = await buildPaymentHeader(walletKey, atomic);

    const params = new URLSearchParams({
      sellToken:  input.sell_token,
      buyToken:   input.buy_token,
      sellAmount: input.sell_amount,
    });
    if (input.slippage_percentage) {
      params.set("slippagePercentage", String(input.slippage_percentage));
    }

    const res  = await fetch(`${EZPATH_URL}?${params}`, { headers: { "X-Payment": header } });
    const data = await res.json();
    return { data, error: null, successful: res.ok };
  },
});

// ── Example ───────────────────────────────────────────────────────────────────
//
// const result = await composio.tools.execute("EZPATH_QUOTE", {
//   arguments: {
//     sell_token:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
//     buy_token:   "0x4200000000000000000000000000000000000006",
//     sell_amount: "1000000",
//     tier:        "basic",
//   },
//   userId: "default",
// });
