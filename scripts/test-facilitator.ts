import { createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const TOLL = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function testFacilitator() {
  const rawKey = process.env.TEST_WALLET_PRIVATE_KEY!;
  const pk = rawKey.startsWith("0x") ? rawKey : "0x" + rawKey;
  const account = privateKeyToAccount(pk as `0x${string}`);
  const client = createWalletClient({ account, chain: base, transport: http() });

  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

  const sig = await client.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC as `0x${string}` },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ]},
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to: TOLL as `0x${string}`, value: 30000n, validAfter: 0n, validBefore, nonce: nonce as `0x${string}` },
  });

  const auth = {
    from: account.address, to: TOLL, value: "30000",
    validAfter: "0", validBefore: validBefore.toString(), nonce,
  };

  const paymentRequirements = {
    scheme: "exact",
    network: "base",
    maxAmountRequired: "30000",
    resource: "https://ezpath.myezverse.xyz/api/v1/quote",
    description: "Best-execution DEX quote on Base",
    mimeType: "application/json",
    payTo: TOLL,
    maxTimeoutSeconds: 300,
    asset: USDC,
  };

  // Try v1 format with CAIP-2 network
  const variants = [
    { label: "v1+base",         x402Version: 1, network: "base" },
    { label: "v1+eip155:8453",  x402Version: 1, network: "eip155:8453" },
    { label: "v2+eip155:8453",  x402Version: 2, network: "eip155:8453" },
  ];

  for (const v of variants) {
    const payload = {
      x402Version: v.x402Version,
      scheme: "exact",
      network: v.network,
      payload: { signature: sig, authorization: auth },
    };
    const body = {
      x402Version: v.x402Version,
      paymentPayload: payload,
      paymentRequirements: { ...paymentRequirements, network: v.network },
    };
    const res = await fetch("https://x402.org/facilitator/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`\n${v.label} → ${res.status}: ${text.slice(0, 200)}`);
  }
}

testFacilitator().catch(err => { console.error(err); process.exit(1); });
