export const LLMS_MD = `# EZ-Path

> Pay-per-request DEX meta-router on Base mainnet.
> Built for agents. Priced per call. No API key. No subscription.

## What It Does

EZ-Path races multiple liquidity sources in parallel and returns the best swap quote for any ERC-20 pair on Base. Agents pay exactly what they use — nothing more.

## Payment

Powered by the X402 protocol. Agents sign an EIP-3009 TransferWithAuthorization for USDC on Base and include it in the request header. Settlement happens on-chain. No custody, no pre-approval.

| Tier | Cost | Execution |
|---|---|---|
| basic | $0.03 | Direct execution |
| resilient | $0.10 | Dual-lane concurrent race |
| institutional | $0.50 | Race + on-chain safety net |

## Integrations

- MCP server — npx mcp-ezpath (registry.modelcontextprotocol.io)
- elizaOS plugin — pnpm add plugin-ezpath
- CDP AgentKit — PR open at coinbase/agentkit
- Agentverse — registered proxy agent on Fetch.ai

## Endpoints

    GET  https://ezpath.myezverse.xyz/api/v1/quote
    GET  https://ezpath.myezverse.xyz/openapi.json
    GET  https://ezpath.myezverse.xyz/.well-known/agent.json
    GET  https://ezpath.myezverse.xyz/.well-known/ai-plugin.json
    GET  https://ezpath.myezverse.xyz/llms.md

## Live on Base

Chain ID 8453
USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
Toll 0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad

First agent-to-agent transaction confirmed on-chain. An AI agent called EZ-Path autonomously, signed the X402 payment, and received the best DEX quote — zero human intervention in the payment loop.

---

EZ-Path · https://ezpath.myezverse.xyz · contact@ezsecuretech.com
`;
