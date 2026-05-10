import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { createMcpServer } from "mcp-tanstack-start";
import { quoteTool } from "@/lib/mcp/tools/quote";

const mcp = createMcpServer({
  name: "agentic-liquidity",
  version: "0.1.0",
  instructions: [
    "Agentic Liquidity exposes a DEX aggregator quote tool for autonomous agents.",
    "Use `get_dex_quote` to find the best route for swapping any ERC-20 pair on Ethereum or Base.",
    "The underlying HTTP endpoint is X402-gated (0.05 USDC unlock fee). Without a payment receipt the tool returns a locked preview plus payment instructions; pass a valid USDC transfer tx hash as `receipt` to unlock the full quote.",
  ].join(" "),
  tools: [quoteTool],
});

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => mcp.handleRequest(request),
      POST: async ({ request }) => mcp.handleRequest(request),
      DELETE: async ({ request }) => mcp.handleRequest(request),
    },
  },
});
