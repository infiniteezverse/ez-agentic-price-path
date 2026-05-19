import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOLL_ADDRESS = "0x13dDE704389b1118B20d2BCc6D3Ace749600e2ad";
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

async function signAndTest() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: PRIVATE_KEY environment variable not set");
    process.exit(1);
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log("Signing with account:", account.address);

  // Create wallet client
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  // Prepare message
  const now = Math.floor(Date.now() / 1000);
  const validBefore = now + 300; // Valid for 5 minutes
  const nonce = `0x${crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '')}`;

  const message = {
    from: account.address,
    to: TOLL_ADDRESS,
    value: "30000",
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

  // Sign the message
  console.log("\nSigning EIP-712 message...");
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: message as any,
  });

  console.log("✓ Signed:", signature);

  // Build payment header (update timestamp right before request)
  const authData = {
    from: account.address,
    to: TOLL_ADDRESS,
    value: "30000",
    validAfter: "0",
    validBefore: validBefore.toString(),
    nonce,
  };

  // Update quote_issued_at to current time in milliseconds (right before request)
  const nowBeforeRequest = Date.now();

  const payload = {
    payload: {
      signature,
      authorization: authData,
      quote_issued_at: nowBeforeRequest,
    },
  };

  const paymentHeader = btoa(JSON.stringify(payload));

  // Make the payment-verified request
  console.log("\nMaking payment-verified quote request...");
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

  let data: any;
  try {
    data = await response.clone().json();
  } catch (e) {
    try {
      const text = await response.clone().text();
      console.log("Response body:", text);
    } catch {
      console.log("Could not read response body");
    }
    process.exit(1);
  }

  console.log("\n=== RESPONSE ===");
  console.log(JSON.stringify(data, null, 2));

  if (response.ok) {
    console.log("\n✓ Payment-verified request successful!");
    console.log("✓ Settlement should be triggered");
    console.log("✓ Check Agentic Market in a few minutes for Bazaar indexing");
  } else {
    console.log("\n✗ Request failed");
    console.log("Status:", response.status);
    console.log("Error details:", data);
    process.exit(1);
  }
}

signAndTest().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
