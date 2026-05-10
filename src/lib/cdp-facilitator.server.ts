// CDP Facilitator integration for x402 verify/settle + Bazaar discovery metadata.
import { useFacilitator } from "x402/verify";
import { decodePayment } from "x402/schemes";
import { facilitator } from "@coinbase/x402";
import type { PaymentPayload, PaymentRequirements } from "x402/types";

const UNLOCK_FEE_USDC_DOLLARS = 0.05;
const USDC_DECIMALS = 6;
const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// 0.05 USDC -> 50000 atomic units (6 decimals)
export const UNLOCK_FEE_ATOMIC = String(Math.round(UNLOCK_FEE_USDC_DOLLARS * 10 ** USDC_DECIMALS));
export const UNLOCK_FEE_DOLLARS = UNLOCK_FEE_USDC_DOLLARS;

// Bazaar discovery extension. Indexed by CDP only on a successful settle that
// passes this schema. Keep `input` valid against `inputSchema`.
export const bazaarExtension = {
  bazaar: {
    discoverable: true,
    category: "defi",
    tags: ["dex", "router", "best-execution", "savings", "0x", "aggregator", "agent-native"],
    description:
      "X402-gated DEX router. 0.05 USDC unlocks the best route across 70+ liquidity sources on Ethereum and Base via 0x.",
    info: {
      input: {
        method: "GET",
        type: "http",
        discoverable: true,
        queryParams: {
          chainId: 8453,
          sellToken: "WETH",
          buyToken: "USDC",
          sellAmount: "1000000000000000000",
        },
      },
      output: {
        example: {
          status: "Unlocked",
          chainId: 8453,
          buyAmount: "3421750000",
          price: "3421.75",
          priceImpactPct: 0.08,
          estimatedSavingsUsd: 1.42,
          sources: [{ name: "Uniswap_V3", proportion: "0.62" }],
        },
      },
    },
    inputSchema: {
      type: "object",
      required: ["sellToken", "buyToken", "sellAmount"],
      properties: {
        chainId: { type: "integer", enum: [1, 8453], default: 1, description: "1 = Ethereum, 8453 = Base" },
        sellToken: { type: "string", description: "Symbol (ETH/WETH/USDC/USDT/DAI/WBTC) or 0x address" },
        buyToken: { type: "string", description: "Symbol or 0x address" },
        sellAmount: { type: "string", pattern: "^\\d{1,40}$", description: "Atomic units (wei / 6-dec for USDC)" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["Unlocked"] },
        chainId: { type: "integer" },
        buyAmount: { type: "string" },
        price: { type: "string" },
        priceImpactPct: { type: ["number", "null"] },
        estimatedSavingsUsd: { type: "number" },
        sources: { type: "array" },
      },
    },
  },
};

export function paymentRequirements(origin: string): PaymentRequirements {
  const payTo = (process.env.PAYMENT_WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
  return {
    scheme: "exact",
    network: "base",
    maxAmountRequired: UNLOCK_FEE_ATOMIC,
    resource: `${origin}/api/v1/quote` as `${string}://${string}`,
    description: bazaarExtension.bazaar.description,
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 60,
    asset: USDC_BASE_ADDRESS,
    extra: { name: "USD Coin", version: "2" },
    outputSchema: bazaarExtension.bazaar.outputSchema as never,
    extensions: bazaarExtension as never,
  } as PaymentRequirements;
}

const { verify, settle } = useFacilitator(facilitator as never);

export type DecodedPayment = PaymentPayload;

export function tryDecodePayment(header: string | null): DecodedPayment | null {
  if (!header) return null;
  try {
    return decodePayment(header);
  } catch {
    return null;
  }
}

export async function verifyWithCdp(payload: DecodedPayment, requirements: PaymentRequirements) {
  return verify(payload, requirements);
}

export async function settleWithCdp(payload: DecodedPayment, requirements: PaymentRequirements) {
  return settle(payload, requirements);
}
