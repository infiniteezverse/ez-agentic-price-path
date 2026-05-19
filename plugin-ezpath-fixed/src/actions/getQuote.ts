import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { z } from "zod";
import { EZPathClient, type EZPathQuoteResponse } from "../client";

// ─── FIX 2: Strict command triggers (no accidental wallet drain)
const COMMAND_TRIGGERS = [
  "/ezpath",
  "ezpath quote",
  "swap rate",
  "ezpath swap",
  "get quote",
  "price quote",
];

function looksLikeQuoteRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return COMMAND_TRIGGERS.some((trigger) => lower.includes(trigger));
}

// ─── FIX 1: Tier is optional (not default), allows runtime setting to work
const QuoteParamsSchema = z.object({
  sellToken: z
    .string()
    .describe("Token to sell (contract address or symbol like USDC, WETH, DAI)"),
  buyToken: z
    .string()
    .describe("Token to buy (contract address or symbol like USDC, WETH, DAI)"),
  sellAmount: z.string().describe("Amount to sell (in atomic units or decimal)"),
  slippagePercentage: z.string().optional().describe("Maximum slippage percentage (e.g. '0.5')"),
  tier: z
    .enum(["basic", "resilient", "institutional"])
    .optional() // ← FIX: .optional() not .default("basic")
    .describe(
      "Execution tier: basic ($0.03 USDC, 0x only), " +
        "resilient ($0.10 USDC, 0x+ParaSwap race), " +
        "institutional ($0.50 USDC, all 10 venues)"
    ),
});

type QuoteParams = z.infer<typeof QuoteParamsSchema>;

export const getQuoteAction: Action = {
  name: "GET_SWAP_QUOTE",
  similes: ["FETCH_QUOTE", "GET_PRICE", "QUOTE_SWAP"],
  description:
    "Fetch a best-execution DEX swap quote on Base mainnet using EZ-Path. " +
    "Races 0x, ParaSwap, Aerodrome, Uniswap V3 and returns the highest buyAmount. " +
    "Pays via x402 USDC micropayment (EIP-3009 signature, no allowance needed).",

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text;

    // Only proceed if message contains explicit command trigger
    if (!looksLikeQuoteRequest(text)) {
      return false;
    }

    // Basic sanity check: contains token references
    const hasTokenRef =
      /\b(usdc|weth|dai|eth|base|swap|exchange|convert)\b/i.test(text);
    return hasTokenRef;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback?: (response: { text: string }) => void
  ): Promise<boolean> => {
    const walletPrivateKey = runtime.getSetting("EZPATH_WALLET_PRIVATE_KEY");
    if (!walletPrivateKey) {
      await callback?.({
        text: "EZ-Path not configured. Set EZPATH_WALLET_PRIVATE_KEY in runtime environment.",
      });
      return false;
    }

    const text = message.content.text.toLowerCase();

    // Extract tokens and amount from message (basic parsing)
    const tokenMatch = text.match(
      /(\w+|\d+\.?\d*)\s+(?:to|for|into|exchange|swap|convert)\s+(\w+)/i
    );
    if (!tokenMatch) {
      await callback?.({
        text: "Could not parse token pair. Format: 'swap 100 USDC for WETH' or 'convert DAI to USDC'",
      });
      return false;
    }

    const sellAmount = tokenMatch[1];
    const buyTokenSymbol = tokenMatch[2];
    const sellTokenSymbol = "USDC"; // Default to USDC if not specified

    // Map symbols to Base mainnet addresses (minimal set)
    const tokenMap: Record<string, string> = {
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      weth: "0x4200000000000000000000000000000000000006",
      dai: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
      eth: "0x4200000000000000000000000000000000000006",
    };

    const sellToken = tokenMap[sellTokenSymbol.toLowerCase()];
    const buyToken = tokenMap[buyTokenSymbol.toLowerCase()];

    if (!sellToken || !buyToken) {
      await callback?.({
        text: `Unsupported tokens. Supported: ${Object.keys(tokenMap).join(", ")}`,
      });
      return false;
    }

    // ─── FIX 1 in action: Use runtime tier setting if not specified
    const defaultTier = runtime.getSetting("EZPATH_TIER") ?? "basic";
    const tier = (defaultTier || "basic") as "basic" | "resilient" | "institutional";

    try {
      const client = new EZPathClient(walletPrivateKey);
      const quote = await client.getQuote({
        sellToken,
        buyToken,
        sellAmount,
        tier,
      });

      if (quote.status !== "ok") {
        await callback?.({
          text: `Quote failed: ${quote.status}`,
        });
        return false;
      }

      const response = `
✅ EZ-Path Quote Received
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tier: ${tier.toUpperCase()}
Routing Engine: ${quote.routingEngine}
Buy Amount: ${quote.buyAmount}
Price: ${quote.price}
Sources: ${quote.sources.join(", ")}
Expires At: ${new Date(quote.expiresAt).toISOString()}
Request ID: ${quote.requestId}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Settlement initiated. Check Base block explorer for tx confirmation.
      `.trim();

      await callback?.({ text: response });
      return true;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error occurred";
      await callback?.({
        text: `❌ EZ-Path Error: ${errorMsg}`,
      });
      return false;
    }
  },

  examples: [
    [
      {
        user: "user",
        content: {
          text: "ezpath quote 100 USDC to WETH",
          action: "GET_SWAP_QUOTE",
        },
      },
      {
        user: "assistant",
        content: {
          text: "I'll fetch the best DEX quote for you using EZ-Path...",
          action: "GET_SWAP_QUOTE",
        },
      },
    ],
    [
      {
        user: "user",
        content: {
          text: "/ezpath swap 50 DAI for USDC",
          action: "GET_SWAP_QUOTE",
        },
      },
      {
        user: "assistant",
        content: {
          text: "Getting institutional tier quote with 10-venue racing...",
          action: "GET_SWAP_QUOTE",
        },
      },
    ],
  ],
};
