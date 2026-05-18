/**
 * EZ Path Hunter Agent
 *
 * Autonomous agent that:
 *   1. Scans token pairs for the best swap opportunities
 *   2. Pays EZ Path via X402 EIP-3009 (no human approval)
 *   3. Captures race telemetry (which lane won, by how much, latency)
 *   4. Prints tweet-ready output
 *
 * Supports multiple chains: Base (default) and Solana
 *
 * Usage:
 *   TEST_WALLET_PRIVATE_KEY=0x... npx tsx scripts/hunter-agent.ts
 *   TEST_WALLET_PRIVATE_KEY=0x... npx tsx scripts/hunter-agent.ts --chain base --tier resilient --loops 3
 *   TEST_WALLET_PRIVATE_KEY=... npx tsx scripts/hunter-agent.ts --chain solana --network devnet --loops 1
 */

import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad" as const;
const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const API_URL      = "https://ezpath.myezverse.xyz/api/v1/quote";

// Per-chain pairs configuration
const CHAIN_PAIRS: Record<string, Array<{ name: string; sellToken: string; buyToken: string; sellAmount: string }>> = {
  base: [
    { name: "USDC→WETH",  sellToken: USDC_BASE, buyToken: "0x4200000000000000000000000000000000000006", sellAmount: "10000000"  }, // $10 USDC
    { name: "USDC→cbBTC", sellToken: USDC_BASE, buyToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", sellAmount: "10000000"  }, // $10 USDC
    { name: "USDC→AERO",  sellToken: USDC_BASE, buyToken: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", sellAmount: "5000000"   }, // $5  USDC
    { name: "USDC→cbETH", sellToken: USDC_BASE, buyToken: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", sellAmount: "10000000"  }, // $10 USDC
  ],
  solana: [
    // Solana pairs (devnet/mainnet) — placeholders for now
    { name: "SOL→USDC",   sellToken: "So11111111111111111111111111111111111111112", buyToken: "EPjFWaLb3odcccccccccccccccccccccccccccccc", sellAmount: "1000000000" }, // 1 SOL
  ],
} as const;

const TIERS = {
  basic:         { atomic: 30000n,  usd: "0.03" },
  resilient:     { atomic: 100000n, usd: "0.10" },
  institutional: { atomic: 500000n, usd: "0.50" },
} as const;

type Tier = keyof typeof TIERS;

// Parse CLI args
const chainArg = (process.argv.find((_, i, a) => a[i - 1] === "--chain") ?? "base") as string;
const tierArg = (process.argv.find((_, i, a) => a[i - 1] === "--tier") ?? "resilient") as Tier;
const loops    = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--loops") ?? "1");
const network  = process.argv.find((_, i, a) => a[i - 1] === "--network") ?? "mainnet";
const tier     = TIERS[tierArg] ?? TIERS.resilient;

if (!Object.keys(CHAIN_PAIRS).includes(chainArg)) {
  console.error(`Unsupported chain: ${chainArg}. Supported chains: ${Object.keys(CHAIN_PAIRS).join(", ")}`);
  process.exit(1);
}
const pairs = CHAIN_PAIRS[chainArg] as typeof CHAIN_PAIRS.base;

interface HuntResult {
  pair:         string;
  winner:       string;
  executionMode: string;
  buyAmount:    string;
  price:        string;
  sources:      unknown[];
  lane1Out?:    string;
  lane2Out?:    string;
  edgeBps?:     number;  // basis points advantage of winner over loser
  settlementTx: string | null;
  latencyMs:    number;
  tierUsed:     string;
}

async function signPayment(
  account: Awaited<ReturnType<typeof privateKeyToAccount>>,
  valueAtomic: bigint,
): Promise<string> {
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
  const nonce       = toHex(crypto.getRandomValues(new Uint8Array(32)));

  const client    = createWalletClient({ account, chain: base, transport: http() });
  const signature = await client.signTypedData({
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
      to:          TOLL_ADDRESS,
      value:       valueAtomic,
      validAfter:  0n,
      validBefore,
      nonce:       nonce as `0x${string}`,
    },
  });

  return btoa(JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature,
      authorization: {
        from:        account.address,
        to:          TOLL_ADDRESS,
        value:       valueAtomic.toString(),
        validAfter:  "0",
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  }));
}

async function hunt(
  pair: (typeof CHAIN_PAIRS)[keyof typeof CHAIN_PAIRS][number],
  account: Awaited<ReturnType<typeof privateKeyToAccount>>,
  chain: string,
): Promise<HuntResult> {
  const payment = await signPayment(account, tier.atomic);

  const url = new URL(API_URL);
  url.searchParams.set("chain",      chain);
  url.searchParams.set("sellToken",  pair.sellToken);
  url.searchParams.set("buyToken",   pair.buyToken);
  url.searchParams.set("sellAmount", pair.sellAmount);

  const t0  = Date.now();
  const res = await fetch(url.toString(), {
    headers: { "X-Payment": payment },
  });
  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const err = await res.json() as Record<string, unknown>;
    throw new Error(`${res.status}: ${JSON.stringify(err)}`);
  }

  const body = await res.json() as Record<string, unknown>;
  const meta = body.routing_metadata as Record<string, unknown> | undefined;
  const rc   = meta?.race_comparison as Record<string, unknown> | undefined;

  let edgeBps: number | undefined;
  if (rc?.lane_1_aggregator_out && rc?.lane_2_aerodrome_out) {
    const l1 = parseFloat(rc.lane_1_aggregator_out as string);
    const l2 = parseFloat(rc.lane_2_aerodrome_out as string);
    const winner = l1 > l2 ? l1 : l2;
    const loser  = l1 > l2 ? l2 : l1;
    if (loser > 0) edgeBps = Math.round(((winner - loser) / loser) * 10000);
  }

  return {
    pair:          pair.name,
    winner:        (meta?.winner ?? body.routingEngine ?? "unknown") as string,
    executionMode: (meta?.execution_mode ?? "direct") as string,
    buyAmount:     body.buyAmount as string,
    price:         body.price as string,
    sources:       body.sources as unknown[],
    lane1Out:      rc?.lane_1_aggregator_out as string | undefined,
    lane2Out:      rc?.lane_2_aerodrome_out  as string | undefined,
    edgeBps,
    settlementTx:  res.headers.get("X-Settlement-Tx"),
    latencyMs,
    tierUsed:      `${tierArg} ($${tier.usd})`,
  };
}

function formatResult(r: HuntResult, index: number): string {
  const edge  = r.edgeBps !== undefined ? `+${r.edgeBps}bps edge` : "";
  const lines = [
    `\n━━━ Hunt #${index + 1} · ${r.pair} ━━━`,
    `  Winner:    ${r.winner}  [${r.executionMode}]  ${edge}`,
    `  buyAmount: ${r.buyAmount}`,
    `  price:     ${r.price}`,
    `  latency:   ${r.latencyMs}ms`,
    `  tier:      ${r.tierUsed}`,
  ];

  if (r.lane1Out && r.lane2Out) {
    lines.push(`  lane 1 (agg):  ${r.lane1Out}`);
    lines.push(`  lane 2 (dex):  ${r.lane2Out}`);
  }

  if (r.settlementTx) {
    lines.push(`  tx:        https://basescan.org/tx/${r.settlementTx}`);
  }

  return lines.join("\n");
}

function tweetSummary(results: HuntResult[]): string {
  const raceResults = results.filter(r => r.executionMode !== "direct" && r.edgeBps !== undefined);
  const bestEdge    = raceResults.sort((a, b) => (b.edgeBps ?? 0) - (a.edgeBps ?? 0))[0];
  const winners     = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.winner] = (acc[r.winner] ?? 0) + 1;
    return acc;
  }, {});
  const topWinner   = Object.entries(winners).sort((a, b) => b[1] - a[1])[0];

  const lines = [
    `🤖 EZ Path hunter agent ran ${results.length} autonomous swap${results.length > 1 ? "s" : ""}.`,
    ``,
    `No human approval. No API key. Payment signed + settled on-chain via x402.`,
    ``,
  ];

  if (bestEdge?.edgeBps) {
    lines.push(`Best race result: ${bestEdge.pair}`);
    lines.push(`  ${bestEdge.winner} won by +${bestEdge.edgeBps}bps over the losing lane`);
    lines.push(`  ${bestEdge.latencyMs}ms total latency`);
    lines.push(``);
  }

  if (topWinner) {
    lines.push(`Top router across all hunts: ${topWinner[0]} (${topWinner[1]}/${results.length} wins)`);
    lines.push(``);
  }

  const txs = results.filter(r => r.settlementTx).map(r => `  • ${r.pair}: basescan.org/tx/${r.settlementTx}`);
  if (txs.length) {
    lines.push(`On-chain settlements:`);
    lines.push(...txs);
  }

  lines.push(``, `ezpath.myezverse.xyz · x402 · Base mainnet`);
  return lines.join("\n");
}

const USDC_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view",
  inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

async function getUsdcBalance(address: string): Promise<bigint> {
  const client = createPublicClient({ chain: base, transport: http() });
  return client.readContract({
    address: USDC_BASE, abi: USDC_ABI, functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
}

async function main() {
  const rawKey = process.env.TEST_WALLET_PRIVATE_KEY;
  if (!rawKey) {
    console.error("TEST_WALLET_PRIVATE_KEY not set");
    process.exit(1);
  }

  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account    = privateKeyToAccount(privateKey);

  // Preflight balance check
  const balance     = await getUsdcBalance(account.address);
  const costPerRun  = tier.atomic * BigInt(PAIRS.length) * BigInt(loops);
  const balanceUsd  = (Number(balance) / 1e6).toFixed(2);

  console.log(`\n🎯 EZ Path Hunter Agent`);
  console.log(`   Chain:   ${chainArg}${chainArg === "solana" ? ` (${network})` : ""}`);
  console.log(`   Payer:   ${account.address}`);
  console.log(`   Balance: ${balanceUsd} USDC (${balance} atomic)`);
  console.log(`   Tier:    ${tierArg} ($${tier.usd} USDC per hunt)`);
  console.log(`   Loops:   ${loops}`);
  console.log(`   Pairs:   ${pairs.map(p => p.name).join(", ")}`);
  console.log(`   Est cost: $${(Number(costPerRun) / 1e6).toFixed(2)} USDC`);

  if (balance < tier.atomic) {
    console.error(`\n⚠️  Insufficient USDC — need at least $${tier.usd}, have $${balanceUsd}. Top up ${account.address} on Base.`);
    process.exit(1);
  }

  if (balance < costPerRun) {
    const affordableLoops = Math.floor(Number(balance) / Number(tier.atomic * BigInt(PAIRS.length)));
    console.warn(`\n⚠️  Balance covers ~${affordableLoops} loop(s) — will stop when funds run out.`);
  }

  const allResults: HuntResult[] = [];

  for (let loop = 0; loop < loops; loop++) {
    if (loops > 1) console.log(`\n── Loop ${loop + 1}/${loops} ─────────────────────────`);

    for (const pair of pairs) {
      // Check balance before each hunt to avoid wasted signing + failed txs
      const currentBalance = await getUsdcBalance(account.address);
      if (currentBalance < tier.atomic) {
        console.log(`\n⚠️  Wallet drained ($${(Number(currentBalance)/1e6).toFixed(4)} USDC left, need $${tier.usd}). Stopping.`);
        break;
      }

      try {
        process.stdout.write(`  hunting ${pair.name}...`);
        const result = await hunt(pair, account, chainArg);
        allResults.push(result);
        console.log(` ✓ ${result.winner} ${result.edgeBps ? `+${result.edgeBps}bps` : ""}`);
        console.log(formatResult(result, allResults.length - 1));
      } catch (err) {
        console.log(` ✗ ${err instanceof Error ? err.message : String(err)}`);
      }

      // Brief pause between calls to avoid nonce collisions
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (allResults.length === 0) {
    console.log("\nNo successful hunts.");
    return;
  }

  console.log("\n\n" + "═".repeat(55));
  console.log("📣 TWEET-READY OUTPUT");
  console.log("═".repeat(55));
  const tweet = tweetSummary(allResults);
  console.log(tweet);
  console.log("\n" + "═".repeat(55));
  console.log(`Chain: ${chainArg}${chainArg === "solana" ? ` (${network})` : ""} | Tier: ${tierArg} | Loops: ${loops}`);
}

main().catch(err => { console.error(err); process.exit(1); });
