import { z } from "zod";
import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// ─── Constants ────────────────────────────────────────────────────────────────

const EZPATH_API   = "https://ezpath.myezverse.xyz/api/v1/quote";
const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const TIER_ATOMIC = {
  basic:         30000n,
  resilient:     100000n,
  institutional: 500000n,
} as const;

// ─── Input schema ─────────────────────────────────────────────────────────────

export const EzPathInputSchema = z.object({
  sellToken: z
    .string()
    .describe("ERC-20 contract address of the token to sell on Base mainnet (e.g. USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)"),
  buyToken: z
    .string()
    .describe("ERC-20 contract address of the token to buy on Base mainnet (e.g. WETH: 0x4200000000000000000000000000000000000006)"),
  sellAmount: z
    .string()
    .describe("Amount to sell expressed in the token's smallest unit — base decimals. E.g. '1000000' = 1 USDC (6 decimals), '1000000000000000000' = 1 WETH (18 decimals)."),
  tier: z
    .enum(["basic", "resilient", "institutional"])
    .default("basic")
    .describe("Execution tier. basic = $0.03 direct 0x route. resilient = $0.10 dual-lane race (0x/ParaSwap vs Aerodrome). institutional = $0.50 race + Uniswap V3 safety net."),
  slippagePercentage: z
    .number()
    .min(0).max(1)
    .optional()
    .describe("Maximum acceptable slippage as a decimal fraction. E.g. 0.01 = 1%. Optional."),
});

export type EzPathInput = z.infer<typeof EzPathInputSchema>;

// ─── Action ───────────────────────────────────────────────────────────────────

export const ezPathGetQuoteAction = {
  name: "ez_path_get_quote",
  description:
    "Fetches an optimized DEX swap price quote on Base mainnet via EZ-Path. " +
    "Races aggregators (0x, ParaSwap) against native Base liquidity (Aerodrome) and returns the highest buyAmount. " +
    "Automatically handles X402 payment negotiation — reads the toll address and tier pricing from the 402 response, " +
    "signs an EIP-3009 USDC authorization, and retries with the X-Payment header. " +
    "Use this when you need the best available swap rate on Base before executing a transaction.",
  argsSchema: EzPathInputSchema,

  func: async (
    args: EzPathInput,
    privateKey: string,    // EZPATH_WALLET_PRIVATE_KEY from agent config
  ): Promise<string> => {
    const url = new URL(EZPATH_API);
    url.searchParams.set("sellToken",  args.sellToken);
    url.searchParams.set("buyToken",   args.buyToken);
    url.searchParams.set("sellAmount", args.sellAmount);
    if (args.slippagePercentage !== undefined) {
      url.searchParams.set("slippagePercentage", String(args.slippagePercentage));
    }

    // ── Step 1: probe — read live toll address and tier pricing
    let probe: Response;
    try {
      probe = await fetch(url.toString());
    } catch (err) {
      return `EZ-Path unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (probe.status === 429) {
      const retryAfter = probe.headers.get("Retry-After") ?? "60";
      return `Rate limited by EZ-Path gateway. Retry after ${retryAfter} seconds.`;
    }
    if (probe.status !== 402) {
      return `Unexpected response from EZ-Path during negotiation: HTTP ${probe.status}`;
    }

    const probeBody   = await probe.json() as { tiers?: Record<string, { min_atomic: string }> };
    const tollAddress = probe.headers.get("X-402-Address");
    if (!tollAddress) return "EZ-Path 402 response missing X-402-Address header.";

    const tierConfig  = probeBody.tiers?.[args.tier];
    const valueAtomic = tierConfig ? BigInt(tierConfig.min_atomic) : TIER_ATOMIC[args.tier];

    // ── Step 2: sign EIP-3009 TransferWithAuthorization
    const key      = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
    const account  = privateKeyToAccount(key);
    const client   = createWalletClient({ account, chain: base, transport: http() });

    const validAfter  = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
    const nonce       = toHex(crypto.getRandomValues(new Uint8Array(32)));

    let signature: `0x${string}`;
    try {
      signature = await client.signTypedData({
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
          from:        account.address,
          to:          tollAddress as `0x${string}`,
          value:       valueAtomic,
          validAfter,
          validBefore,
          nonce:       nonce as `0x${string}`,
        },
      });
    } catch (err) {
      return `EIP-3009 signing failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    const paymentPayload = btoa(JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      payload: {
        signature,
        authorization: {
          from:        account.address,
          to:          tollAddress,
          value:       valueAtomic.toString(),
          validAfter:  validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    }));

    // ── Step 3: retry with payment
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { "X-Payment": paymentPayload },
      });
    } catch (err) {
      return `EZ-Path request failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After") ?? "60";
      return `Rate limited by EZ-Path gateway. Retry after ${retryAfter} seconds.`;
    }
    if (res.status === 402) {
      return "Payment rejected by EZ-Path — authorization value may be below the selected tier minimum.";
    }
    if (res.status === 401) {
      const body = await res.json() as { reason?: string };
      return `EZ-Path rejected payment signature: ${body.reason ?? "unknown reason"}`;
    }
    if (!res.ok) {
      const body = await res.json() as { status?: string; detail?: string };
      return `EZ-Path error ${res.status}: ${body.detail ?? body.status ?? "unknown error"}`;
    }

    const data = await res.json() as {
      buyAmount: string;
      price: string;
      sources: Array<{ name: string; proportion: string }>;
      tier: string;
      routing_metadata: { execution_mode: string; winner: string; race_comparison?: { lane_1_aggregator_out: string; lane_2_aerodrome_out: string } };
    };

    const settlementTx = res.headers.get("X-Settlement-Tx");
    const meta         = data.routing_metadata;
    const sources      = data.sources.map(s => `${s.name} (${(parseFloat(s.proportion) * 100).toFixed(0)}%)`).join(", ");
    const raceInfo     = meta.race_comparison
      ? ` | lane_1=${meta.race_comparison.lane_1_aggregator_out} lane_2=${meta.race_comparison.lane_2_aerodrome_out}`
      : "";

    return [
      `EZ-Path quote received.`,
      `tier=${data.tier} | winner=${meta.winner} | mode=${meta.execution_mode}${raceInfo}`,
      `price=${data.price} buyToken per sellToken`,
      `buyAmount=${data.buyAmount}`,
      `sources=${sources}`,
      settlementTx ? `settlement_tx=${settlementTx}` : null,
    ].filter(Boolean).join("\n");
  },
};
