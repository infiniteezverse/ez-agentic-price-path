import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad" as const;
const USDC_BASE    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const WETH_BASE    = "0x4200000000000000000000000000000000000006" as const;
const API_URL      = "https://ezpath.myezverse.xyz/api/v1/quote";

const TIERS: Record<string, { label: string; usd: string }> = {
  "30000":  { label: "basic",         usd: "0.03" },
  "100000": { label: "resilient",     usd: "0.10" },
  "500000": { label: "institutional", usd: "0.50" },
};

// Parse --value N from argv (default: 30000)
const valueArg = process.argv.find((_, i, a) => a[i - 1] === "--value");
const valueAtomic = BigInt(valueArg ?? "30000");

async function testNegotiation() {
  console.log("\n── 402 Negotiation Probe ─────────────────────────────");
  console.log("→ Sending request with no payment header...\n");

  const url = new URL(API_URL);
  url.searchParams.set("sellToken",  USDC_BASE);
  url.searchParams.set("buyToken",   WETH_BASE);
  url.searchParams.set("sellAmount", "1000000");

  const res  = await fetch(url.toString());
  const body = await res.json() as Record<string, unknown>;

  console.log(`Status: ${res.status}`);
  console.log("\nResponse headers:");
  for (const key of ["X-402-Price", "X-402-Price-Resilient", "X-402-Price-Institutional", "X-402-Asset", "X-402-Address", "X-402-Chain"]) {
    const val = res.headers.get(key);
    if (val) console.log(`  ${key}: ${val}`);
  }
  console.log("\nTiers matrix:");
  const tiers = body.tiers as Record<string, unknown> | undefined;
  if (tiers) {
    for (const [name, info] of Object.entries(tiers)) {
      const t = info as Record<string, unknown>;
      console.log(`  ${name.padEnd(13)} min_atomic=${t.min_atomic}  min_usdc=$${t.min_usdc}`);
      console.log(`               ${t.description}`);
    }
  }
  console.log();
}

async function testWithPayment(account: Awaited<ReturnType<typeof privateKeyToAccount>>) {
  const tierInfo = TIERS[valueAtomic.toString()];
  const tierLabel = tierInfo ? `${tierInfo.label} ($${tierInfo.usd} USDC)` : `custom (${valueAtomic} atomic)`;

  console.log(`\n── Paid Quote Test ───────────────────────────────────`);
  console.log(`Payer:  ${account.address}`);
  console.log(`Toll:   ${TOLL_ADDRESS}`);
  console.log(`Value:  ${valueAtomic} atomic  →  tier: ${tierLabel}\n`);

  const validAfter  = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
  const nonce       = toHex(crypto.getRandomValues(new Uint8Array(32)));

  const client = createWalletClient({ account, chain: base, transport: http() });

  console.log("→ Signing EIP-3009 authorization...");
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
      validAfter,
      validBefore,
      nonce:       nonce as `0x${string}`,
    },
  });

  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature,
      authorization: {
        from:        account.address,
        to:          TOLL_ADDRESS,
        value:       valueAtomic.toString(),
        validAfter:  validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };

  const url = new URL(API_URL);
  url.searchParams.set("sellToken",  USDC_BASE);
  url.searchParams.set("buyToken",   WETH_BASE);
  url.searchParams.set("sellAmount", "1000000");

  console.log(`→ GET ${url.toString()}`);
  const res  = await fetch(url.toString(), {
    headers: { "X-Payment": btoa(JSON.stringify(paymentPayload)) },
  });
  const body = await res.json() as Record<string, unknown>;

  console.log(`\nStatus: ${res.status}`);

  if (res.status === 200) {
    const settlementTx = res.headers.get("X-Settlement-Tx");
    const meta = body.routing_metadata as Record<string, unknown> | undefined;
    console.log(`\n✓ End-to-end test passed.`);
    console.log(`  request_id:      ${body.request_id}`);
    console.log(`  tier:            ${body.tier}`);
    console.log(`  price:           ${body.price}  (buyToken per sellToken)`);
    console.log(`  buyAmount:       ${body.buyAmount}`);
    console.log(`  sources:         ${JSON.stringify(body.sources)}`);
    console.log(`  routingEngine:   ${body.routingEngine}`);
    if (meta) {
      console.log(`  execution_mode:  ${meta.execution_mode}`);
      console.log(`  winner:          ${meta.winner}`);
      const rc = meta.race_comparison as Record<string, unknown> | undefined;
      if (rc) {
        console.log(`  lane_1_agg_out:  ${rc.lane_1_aggregator_out}`);
        console.log(`  lane_2_aero_out: ${rc.lane_2_aerodrome_out}`);
      }
    }
    if (settlementTx) console.log(`  settlementTx:    ${settlementTx}`);
    console.log();
  } else {
    console.log(`\n✗ Test failed.`);
    console.log(JSON.stringify(body, null, 2));
    process.exit(1);
  }
}

async function main() {
  // Always show the 402 negotiation probe first
  await testNegotiation();

  // Only run paid test if a wallet key is available
  const rawKey = process.env.TEST_WALLET_PRIVATE_KEY;
  if (!rawKey) {
    console.log("TEST_WALLET_PRIVATE_KEY not set — skipping paid test.\n");
    return;
  }

  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account    = privateKeyToAccount(privateKey);
  await testWithPayment(account);
}

main().catch((err) => { console.error(err); process.exit(1); });
