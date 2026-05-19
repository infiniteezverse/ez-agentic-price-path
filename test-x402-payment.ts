import { createWalletClient, http, recoverTypedDataAddress } from "viem";
import { base } from "viem/chains";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";
const TEST_WALLET = "0xDE331946DeDb6318FAe10BDD566C48ad4c623F65";
const API_BASE = "https://ez-agentic-price-path.myezverse.workers.dev";

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

async function makePaymentVerifiedRequest() {
  const now = Math.floor(Date.now() / 1000);
  const validBefore = now + 300; // Valid for 5 minutes
  const nonce = `0x${crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '')}`;

  const message = {
    from: TEST_WALLET,
    to: TOLL_ADDRESS,
    value: "30000", // 0.03 USDC
    validAfter: "0",
    validBefore: validBefore.toString(),
    nonce,
  };

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: 8453,
    verifyingContract: USDC_BASE,
  };

  console.log("EIP-712 Message to sign:");
  console.log(JSON.stringify({ domain, types: EIP3009_TYPES, primaryType: "TransferWithAuthorization", message }, null, 2));
  console.log("\nTo complete the test:");
  console.log("1. Use a wallet/signing tool to sign this EIP-712 message");
  console.log("2. Get the signature (0x... format)");
  console.log("3. Run with: SIGNATURE=0x... npm run test-x402");

  // For actual signing, you'd use:
  // const signature = await walletClient.signTypedData({
  //   account: TEST_WALLET,
  //   domain,
  //   types: EIP3009_TYPES,
  //   primaryType: "TransferWithAuthorization",
  //   message,
  // });

  const exampleSignature = process.env.SIGNATURE;
  if (!exampleSignature) {
    console.log("\n⚠️  No SIGNATURE env var provided. This is what you need to sign above.");
    return;
  }

  // Build payment header
  const authData = {
    from: TEST_WALLET,
    to: TOLL_ADDRESS,
    value: "30000",
    validAfter: "0",
    validBefore: validBefore.toString(),
    nonce,
  };

  const payload = {
    payload: {
      signature: exampleSignature,
      authorization: authData,
      quote_issued_at: now,
    },
  };

  const paymentHeader = btoa(JSON.stringify(payload));

  // Make the request
  console.log("\nMaking request with payment header...");
  const response = await fetch(
    `${API_BASE}/api/v1/quote?chain=base&sellToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&buyToken=0xd7eaed3cdef4e8e9f334e0fbe9d0b0e0c1a8e5f9&sellAmount=1000000`,
    {
      method: "GET",
      headers: {
        "X-Payment": paymentHeader,
      },
    }
  );

  console.log(`Status: ${response.status}`);
  const data = await response.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

makePaymentVerifiedRequest().catch(console.error);
