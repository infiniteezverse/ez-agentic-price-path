# EZ Path: Multi-Chain DEX Meta-Router

EZ Path is a payment-gated multi-chain DEX meta-router that races 10+ liquidity venues simultaneously to find the best execution across Base, Arbitrum, Optimism, Polygon, and Solana. Built on the x402 v2 payment protocol with EIP-712 signature verification, it enables agents to access institutional-grade routing without on-chain liquidity constraints. Every quote is backed by deterministic settlement via CDP facilitator or Uniswap V3 safety nets, with <350ms latency even under load. The endpoint is discoverable via CDP Bazaar and Agentic Market, requiring only a small USDC unlock fee (starting at $0.03) to access best-execution routing.

---

## EZ Path Today

✅ **x402 v2 Protocol Compliant** — Fully implements HTTP 402 Payment Required with EIP-712 signature verification and Bazaar discovery metadata, enabling seamless integration with agent frameworks.

✅ **15-Second Unified Execution Window** — Enforces coherent timeout across quote issuance, payment validity, and execution, preventing stale quotes and replay attacks while giving agents a clear action window.

✅ **Multi-Venue Concurrent Racing** — Routes simultaneously through 0x, ParaSwap, Aerodrome, Uniswap V3, Curve, Balancer, Uniswap V2, 1Inch, CoW, and Synthetix with per-venue timeouts and early termination logic.

✅ **Tiered Execution Models** — Offers basic ($0.03 USDC) direct routing, resilient ($0.10) dual-lane concurrent race, and institutional ($0.50) with Uniswap V3 safety net fallback.

✅ **Deterministic Settlement** — Transactions settle on-chain via CDP facilitator or relayer-owned USDC authorization, with nonce deduplication and automatic settlement success tracking in responses.

✅ **Live on Base, Ready for Multi-Chain** — Currently operational on Base mainnet with architectural foundation for Arbitrum, Optimism, Polygon, and Solana; can onboard new chains in <30 minutes.

✅ **Agent-Native & Discovery-Ready** — Discoverable in CDP Bazaar and Agentic Market, with payment metadata, schema documentation, and tiered pricing embedded in every 402 response.

✅ **Rate-Limited for Health** — Enforces per-IP probe limits (20/min), per-agent invalid attempt limits (10/min), and per-payer execution limits (120/min) to prevent abuse and maintain network stability.
