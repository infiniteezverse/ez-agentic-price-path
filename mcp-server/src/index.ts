import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { buildXPaymentHeader } from "./signer.js";

const EZPATH_BASE = "https://ezpath.myezverse.xyz";

const TIER_ATOMIC: Record<string, bigint> = {
  basic:         30000n,
  resilient:     100000n,
  institutional: 500000n,
};

const server = new Server(
  { name: "mcp-ezpath", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ezpath_probe",
      description:
        "Check EZ-Path pricing without paying. Returns the toll address, per-request USDC cost, and available execution tiers. Use this first to inform the agent about costs before calling ezpath_quote.",
      inputSchema: {
        type: "object",
        properties: {
          sellToken:  { type: "string", description: "ERC-20 address to sell on Base mainnet. USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
          buyToken:   { type: "string", description: "ERC-20 address to buy on Base mainnet. WETH=0x4200000000000000000000000000000000000006" },
          sellAmount: { type: "string", description: "Amount to sell in base decimals (e.g. 1000000 = 1 USDC)" },
        },
        required: ["sellToken", "buyToken", "sellAmount"],
      },
    },
    {
      name: "ezpath_quote",
      description:
        "Get the best DEX swap quote on Base mainnet by racing 10 venues (0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, Synthetix) and returning the highest buyAmount. Payment of $0.03 USDC per request via X402. Two payment paths: (1) set EZPATH_WALLET_KEY env var to a Base wallet private key with USDC balance for EIP-3009 signing; (2) use Base MCP's initiate_x402_request + complete_x402_request pointing at https://ezpath.myezverse.xyz/api/v1/quote — no wallet key required.",
      inputSchema: {
        type: "object",
        properties: {
          sellToken:  {
            type: "string",
            description: "ERC-20 address to sell on Base. USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, WETH=0x4200000000000000000000000000000000000006",
          },
          buyToken:   {
            type: "string",
            description: "ERC-20 address to buy on Base",
          },
          sellAmount: {
            type: "string",
            description: "Amount to sell in base decimals. For USDC (6 decimals): 1000000 = 1 USDC. For WETH (18 decimals): 1000000000000000000 = 1 WETH.",
          },
          tier: {
            type: "string",
            enum: ["basic", "resilient", "institutional"],
            description: "Execution tier. basic=$0.03 direct 0x | resilient=$0.10 dual-lane race | institutional=$0.50 race + Uniswap V3 safety net. Defaults to basic.",
          },
          slippagePercentage: {
            type: "number",
            description: "Max acceptable slippage as decimal. 0.01 = 1%. Optional.",
          },
        },
        required: ["sellToken", "buyToken", "sellAmount"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "ezpath_probe") {
    const params = new URLSearchParams({
      sellToken:  args!.sellToken as string,
      buyToken:   args!.buyToken  as string,
      sellAmount: args!.sellAmount as string,
    });
    const res  = await fetch(`${EZPATH_BASE}/api/v1/quote?${params}`);
    const data = await res.json() as unknown;
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  if (name === "ezpath_quote") {
    const walletKey = process.env.EZPATH_WALLET_KEY;
    if (!walletKey) {
      return {
        content: [{
          type: "text",
          text: "EZPATH_WALLET_KEY not set. Add it to your MCP config:\n\n" +
                '{ "env": { "EZPATH_WALLET_KEY": "0x<your-base-wallet-private-key>" } }\n\n' +
                "The wallet must hold USDC on Base (chain 8453). Get USDC at https://app.uniswap.org",
        }],
        isError: true,
      };
    }

    const tier     = (args!.tier as string | undefined) ?? "basic";
    const payValue = TIER_ATOMIC[tier] ?? TIER_ATOMIC.basic!;

    let xPayment: string;
    try {
      xPayment = await buildXPaymentHeader(walletKey, payValue);
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Failed to sign payment: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }

    const params = new URLSearchParams({
      sellToken:  args!.sellToken as string,
      buyToken:   args!.buyToken  as string,
      sellAmount: args!.sellAmount as string,
    });
    if (args!.slippagePercentage) {
      params.set("slippagePercentage", String(args!.slippagePercentage));
    }

    const res  = await fetch(`${EZPATH_BASE}/api/v1/quote?${params}`, {
      headers: { "X-Payment": xPayment },
    });
    const data = await res.json() as unknown;

    if (!res.ok) {
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
